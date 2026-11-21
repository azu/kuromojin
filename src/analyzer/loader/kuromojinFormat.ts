// LICENSE : MIT
import { BitSet } from "../BitSet";
import { CharTrie } from "../CharTrie";
import type { Dictionary, KnownFeatures } from "../Dictionary";
import type { DictionaryVersions } from "../DictionaryVersions";
import type { Token } from "../Token";
import { readDifferences, toInt16Array, toUint16Array } from "./bytes";
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

/** The first character that a string of the features has as one byte: the byte is the character - STRING_BASE */
export const STRING_BASE = 0x30a0;
/** The byte before a character of a string of the features that is written as two bytes */
export const STRING_ESCAPE = 0xff;

/** The number of decoded strings that the features keep: 2 ** DECODED_BITS */
const DECODED_BITS = 14;
const DECODED_STRINGS = 1 << DECODED_BITS;
const DECODED_SHIFT = 32 - DECODED_BITS;

/**
 * The features of the entries of a dictionary of kuromojin.
 * An entry has its combination of part of speech and conjugation, and its reading.
 * It has a base form only when that differs from the word as written,
 * and a pronunciation only when that differs from the reading.
 * The three strings are positions in one buffer, and they are decoded when they are first used.
 */
class KuromojinFeatures implements KnownFeatures {
    /** pos, pos_detail_1, pos_detail_2, pos_detail_3, conjugated_type, conjugated_form */
    private readonly combinations: string[][];
    /**
     * The strings that were decoded last: the slot of a position has the position and its string.
     * A position replaces another position with the same slot, so the number of kept strings has a limit.
     */
    private readonly decodedPositions = new Int32Array(DECODED_STRINGS).fill(-1);
    private readonly decoded: string[] = new Array<string>(DECODED_STRINGS).fill("");

    /**
     * @param combinationOf entry -> its combination
     * @param readings entry -> position of its reading in `strings`
     * @param withBaseForm the entries whose base form differs from the word as written
     * @param baseForms position of the base form in `strings`, for the entries of `withBaseForm` in their order
     * @param withPronunciation the entries whose pronunciation differs from the reading
     * @param pronunciations position of the pronunciation in `strings`, for the entries of `withPronunciation`
     * @param combinationStrings the combinations as UTF-8, each ended by NUL
     * @param strings the strings. A character is one byte for the katakana block and the characters after it,
     *   or STRING_ESCAPE and its two bytes. NUL ends a string.
     */
    constructor(
        private readonly combinationOf: Uint16Array,
        private readonly readings: Int32Array,
        private readonly withBaseForm: BitSet,
        private readonly baseForms: Int32Array,
        private readonly withPronunciation: BitSet,
        private readonly pronunciations: Int32Array,
        combinationStrings: Uint8Array,
        private readonly strings: Uint8Array
    ) {
        this.combinations = new TextDecoder("utf-8")
            .decode(combinationStrings)
            .split("\0")
            .map((combination) => combination.split(","));
    }

    private string(position: number): string {
        const slot = Math.imul(position, 0x9e3779b1) >>> DECODED_SHIFT;
        if (this.decodedPositions[slot] === position) return this.decoded[slot];
        const strings = this.strings;
        const codes: number[] = [];
        for (let p = position, byte = strings[p]; byte !== 0; byte = strings[++p]) {
            if (byte === STRING_ESCAPE) {
                codes.push(strings[p + 1] | (strings[p + 2] << 8));
                p += 2;
            } else {
                codes.push(STRING_BASE + byte);
            }
        }
        const value = String.fromCharCode.apply(null, codes);
        this.decodedPositions[slot] = position;
        this.decoded[slot] = value;
        return value;
    }

    token(entry: number, position: number, surface: string): Token {
        const combination = this.combinations[this.combinationOf[entry]];
        const reading = this.string(this.readings[entry]);
        const { withBaseForm, withPronunciation } = this;
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
            basic_form: withBaseForm.has(entry) ? this.string(this.baseForms[withBaseForm.countBelow(entry)]) : surface,
            reading: reading,
            pronunciation: withPronunciation.has(entry)
                ? this.string(this.pronunciations[withPronunciation.countBelow(entry)])
                : reading
        };
    }
}

/**
 * Join the connection costs, which are written as planes.
 * The first two numbers are the sizes, and each cell is written as the difference from the cell on its left.
 */
function readConnectionCosts(planes: Uint8Array): Int16Array {
    const count = planes.length >> 1;
    const output = new Int16Array(count);
    const first = Math.min(3, count);
    for (let i = 0; i < first; i++) output[i] = planes[i] | (planes[count + i] << 8);
    let cost = count > 2 ? output[2] : 0;
    for (let i = 3; i < count; i++) {
        // the array keeps the low 16 bits of the sum
        cost = (cost + (planes[i] | (planes[count + i] << 8))) | 0;
        output[i] = cost;
    }
    return output;
}

/**
 * Read a dictionary file in the format of kuromojin:
 * 1. the start: signature (4 bytes), version of the format (uint32), length of the table (uint32)
 * 2. the table (JSON): the dictionary versions, and the name, position, and lengths of each part
 * 3. the parts, each as its own gzip stream, so that they are decompressed at the same time.
 *    The parts that take the longest to decompress come first.
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
    // Every part starts to decompress now, in the order of the file, and the tables below are built in the order
    // that needs each part as late as its size asks for: the building runs while later parts are decompressed.
    const parts = new Map<string, Promise<Uint8Array>>();
    for (const { name, offset, length, rawLength } of table.parts) {
        const data = file.subarray(dataStart + offset, dataStart + offset + length);
        const part = platform.gunzip(data, rawLength);
        // An error of a part is thrown where the part is awaited. Until then it is not an unhandled rejection.
        part.catch(() => {});
        parts.set(name, part);
    }
    const part = (name: string): Promise<Uint8Array> => {
        const data = parts.get(name);
        if (!data) throw new Error(`${path} does not have the part "${name}" of a dictionary of kuromojin.`);
        return data;
    };

    const unknownWords = readUnknownWords(
        await part("unk"),
        await part("unk_pos"),
        await part("unk_map"),
        await part("unk_char"),
        await part("unk_invoke")
    );
    const trie = new CharTrie(
        toUint16Array(await part("trie_chars")),
        readDifferences(await part("trie_children")),
        await part("trie_ends")
    );
    const wordOffsets = readDifferences(await part("word_offsets"));
    const wordEntries = readDifferences(await part("word_entries"));
    const left = toInt16Array(await part("left_ids"));
    // the right id has a part only when it differs from the left id in some entry
    const right = parts.has("right_ids") ? toInt16Array(await part("right_ids")) : left;
    const cost = toInt16Array(await part("word_costs"));
    const entryCount = left.length;
    const withBaseForm = new BitSet(await part("with_base_form"), entryCount);
    const withPronunciation = new BitSet(await part("with_pronunciation"), entryCount);
    const features = new KuromojinFeatures(
        toUint16Array(await part("combinations")),
        readDifferences(await part("readings")),
        withBaseForm,
        readDifferences(await part("base_forms")),
        withPronunciation,
        readDifferences(await part("pronunciations")),
        await part("combination_strings"),
        await part("strings")
    );
    const connectionCosts = readConnectionCosts(await part("connection_costs"));

    const versions: DictionaryVersions = table.versions.map((version) => ({
        date: version.date,
        entryCount: version.entries,
        removed: version.removed
    }));

    return {
        trie,
        wordOffsets,
        wordEntries,
        known: { left, right, cost },
        knownFeatures: features,
        connectionCosts,
        ...unknownWords,
        versions
    };
}
