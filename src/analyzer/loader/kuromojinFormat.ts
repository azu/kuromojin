// LICENSE : MIT
import { CharTrie } from "../CharTrie";
import type { Dictionary, KnownFeatures } from "../Dictionary";
import type { DictionaryVersions } from "../DictionaryVersions";
import type { Token } from "../Token";
import { joinPlanes, readInt32, toInt16Array, toInt32Array, Utf8Reader } from "./bytes";
import type { Platform } from "./platform";
import { readUnknownWords } from "./unknownWords";

/** The first four bytes of a dictionary file of kuromojin */
export const SIGNATURE = "KMJD";
/** The version of the format that this code reads */
export const FORMAT_VERSION = 1;
/** The length of the start of the file: signature, version of the format, length of the table */
export const START_LENGTH = 12;

/**
 * The table of a dictionary file. It is written as JSON after the start of the file.
 */
export type DictionaryTable = {
    /**
     * The dictionary versions of the file in the order of their dates. The first one is the base dictionary.
     * - `entries`: the number of entries of the dictionary up to the version.
     *   The entries that a version adds have the numbers from `entries` of the version before it.
     * - `removed`: the numbers of the entries that the version removes
     * - `digest`: a digest of the changes of the version. The build script uses it to check
     *   that a released version is unchanged.
     */
    versions: { date: string; entries: number; removed: number[]; digest: string }[];
    /** `offset` counts from the end of the table. `rawLength` is the length after decompression. */
    parts: { name: string; offset: number; length: number; rawLength: number }[];
};

/** The marker for a base form that equals the word as written, or a pronunciation that equals the reading */
const SAME = -1;

/**
 * The features of the entries of a dictionary of kuromojin.
 * An entry has four numbers: its combination of part of speech and conjugation, its base form, its reading,
 * and its pronunciation. The last three point into a list of strings, which are decoded when they are first used.
 */
class KuromojinFeatures implements KnownFeatures {
    /** pos, pos_detail_1, pos_detail_2, pos_detail_3, conjugated_type, conjugated_form */
    private readonly combinations: string[][];
    private readonly reader: Utf8Reader;
    /** start of each string in the buffer. The end is the start of the next one - 1 (NUL). */
    private readonly starts: Int32Array;
    private readonly decoded: (string | undefined)[] = [];

    constructor(
        private readonly numbers: Int32Array,
        strings: Uint8Array
    ) {
        // the number of combinations, the number of strings, and then all of them separated by NUL
        const combinationCount = readInt32(strings, 0);
        const stringCount = readInt32(strings, 4);
        this.reader = new Utf8Reader(strings);
        let position = 8;
        this.combinations = [];
        for (let i = 0; i < combinationCount; i++) {
            let end = strings.indexOf(0, position);
            if (end === -1) end = strings.length;
            this.combinations.push(this.reader.decode(position, end).split(","));
            position = end + 1;
        }
        const starts = new Int32Array(stringCount + 1);
        for (let i = 0; i < stringCount; i++) {
            starts[i] = position;
            const end = strings.indexOf(0, position);
            position = end === -1 ? strings.length + 1 : end + 1;
        }
        starts[stringCount] = position;
        this.starts = starts;
    }

    private string(id: number): string {
        let value = this.decoded[id];
        if (value === undefined) {
            value = this.reader.decode(this.starts[id], this.starts[id + 1] - 1);
            this.decoded[id] = value;
        }
        return value;
    }

    token(entry: number, position: number, surface: string): Token {
        const i = entry * 4;
        const numbers = this.numbers;
        const combination = this.combinations[numbers[i]];
        const basic = numbers[i + 1];
        const reading = this.string(numbers[i + 2]);
        const pronunciation = numbers[i + 3];
        return {
            word_id: entry * 10,
            word_type: "KNOWN",
            word_position: position,
            surface_form: surface,
            pos: combination[0],
            pos_detail_1: combination[1],
            pos_detail_2: combination[2],
            pos_detail_3: combination[3],
            conjugated_type: combination[4],
            conjugated_form: combination[5],
            basic_form: basic === SAME ? surface : this.string(basic),
            reading: reading,
            pronunciation: pronunciation === SAME ? reading : this.string(pronunciation)
        };
    }
}

/**
 * Read the entries of each word: the number of entries per word, and the numbers of the entries.
 * Each number is written as the difference from the one before, as a zigzag varint.
 */
function readWordEntries(counts: Uint8Array, varints: Uint8Array): { offsets: Int32Array; entries: Int32Array } {
    const offsets = new Int32Array(counts.length + 1);
    let total = 0;
    for (let i = 0; i < counts.length; i++) {
        offsets[i] = total;
        total += counts[i];
    }
    offsets[counts.length] = total;
    const entries = new Int32Array(total);
    let previous = 0;
    for (let i = 0, p = 0; i < total; i++) {
        let zigzag = 0;
        let scale = 1;
        let byte: number;
        do {
            byte = varints[p++];
            zigzag += (byte & 127) * scale;
            scale *= 128;
        } while (byte >= 128);
        previous += zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2;
        entries[i] = previous;
    }
    return { offsets, entries };
}

/**
 * Read a dictionary file in the format of kuromojin:
 * 1. the start: signature (4 bytes), version of the format (uint32), length of the table (uint32)
 * 2. the table (JSON): the dictionary versions, and the name, position, and lengths of each part
 * 3. the parts, each as its own gzip stream, so that they are decompressed at the same time
 * @param path the path of the file, for the messages of errors
 */
export async function readKuromojinDictionary(file: Uint8Array, path: string, platform: Platform): Promise<Dictionary> {
    if (file.length < START_LENGTH || String.fromCharCode(file[0], file[1], file[2], file[3]) !== SIGNATURE) {
        throw new Error(`${path} is not a dictionary of kuromojin.`);
    }
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const formatVersion = view.getUint32(4, true);
    if (formatVersion !== FORMAT_VERSION) {
        throw new Error(
            `${path} is a dictionary of kuromojin in the format version ${formatVersion}, ` +
                `but this kuromojin reads the format version ${FORMAT_VERSION}.`
        );
    }
    const dataStart = START_LENGTH + view.getUint32(8, true);
    const table = JSON.parse(new TextDecoder().decode(file.subarray(START_LENGTH, dataStart))) as DictionaryTable;
    const parts = new Map<string, Uint8Array>();
    await Promise.all(
        table.parts.map(async (part) => {
            const data = file.subarray(dataStart + part.offset, dataStart + part.offset + part.length);
            parts.set(part.name, await platform.gunzip(data, part.rawLength));
        })
    );
    const part = (name: string): Uint8Array => {
        const data = parts.get(name);
        if (!data) throw new Error(`${path} does not have the part "${name}" of a dictionary of kuromojin.`);
        return data;
    };
    const uint16Planes = (name: string) => new Uint16Array(joinPlanes(part(name), 2).buffer);
    const int16Planes = (name: string) => toInt16Array(joinPlanes(part(name), 2));

    const trie = new CharTrie(uint16Planes("trie_chars"), uint16Planes("trie_counts"), part("trie_ends"));
    const { offsets, entries } = readWordEntries(part("word_counts"), part("word_entries"));
    const left = int16Planes("left_ids");
    // the right id has a part only when it differs from the left id in some entry
    const right = parts.has("right_ids") ? int16Planes("right_ids") : left;
    const cost = int16Planes("word_costs");
    // each cell is written as the difference from the cell on its left
    const connectionCosts = int16Planes("connection_costs");
    for (let i = 3; i < connectionCosts.length; i++) connectionCosts[i] += connectionCosts[i - 1];
    const features = new KuromojinFeatures(toInt32Array(joinPlanes(part("features"), 16)), part("strings"));

    const versions: DictionaryVersions = table.versions.map((version) => ({
        date: version.date,
        entryCount: version.entries,
        removed: version.removed
    }));

    return {
        trie,
        wordOffsets: offsets,
        wordEntries: entries,
        known: { left, right, cost },
        knownFeatures: features,
        connectionCosts,
        ...readUnknownWords(part("unk"), part("unk_pos"), part("unk_map"), part("unk_char"), part("unk_invoke")),
        versions
    };
}
