// LICENSE : MIT
// Converts the dictionary files of kuromoji.js into the one file of the format of kuromojin.
// The format is described in docs/products/kuromojin/features/dictionary/design.md.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { KUROMOJI_FILES } from "../src/analyzer/loader/kuromojiFormat";
import { DictionaryTable, FORMAT_VERSION, SIGNATURE, START_LENGTH } from "../src/analyzer/loader/kuromojinFormat";

export type KuromojiFileName = (typeof KUROMOJI_FILES)[number];
/** The decompressed files of a dictionary of kuromoji.js */
export type KuromojiFiles = Record<KuromojiFileName, Buffer>;

/** An entry of the dictionary, with the fields of the source files of IPADIC */
export type DictionaryEntry = {
    surface_form: string;
    left_id: number;
    right_id: number;
    word_cost: number;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    conjugated_type: string;
    conjugated_form: string;
    basic_form: string;
    reading: string;
    pronunciation: string;
};

/** An entry of the base dictionary with its number */
export type BaseEntry = DictionaryEntry & { number: number };

/**
 * The changes of one dictionary version.
 * The entries that versions add get the numbers after the entries of the base dictionary, in the order of the versions.
 */
export type VersionChanges = {
    /** YYYY-MM-DD */
    date: string;
    added: DictionaryEntry[];
    /** numbers of the removed entries */
    removed: number[];
};

export type BuildOptions = {
    /** date of the base dictionary */
    baseVersion: string;
    /** the versions after the base dictionary, in the order of their dates */
    versions: VersionChanges[];
};

export function readKuromojiFiles(directory: string): KuromojiFiles {
    const files = {} as KuromojiFiles;
    for (const name of KUROMOJI_FILES) {
        files[name] = zlib.gunzipSync(fs.readFileSync(path.join(directory, name)));
    }
    return files;
}

/** Remove the zeros at the end, and keep a multiple of `unit` bytes */
const trim = (buffer: Buffer, unit = 1): Buffer => {
    let end = buffer.length;
    while (end > 0 && buffer[end - 1] === 0) end--;
    return buffer.subarray(0, Math.min(buffer.length, Math.ceil(end / unit) * unit));
};
/** Write numbers of `width` bytes as planes: first the lowest byte of every number, then the next byte */
const toPlanes = (buffer: Buffer, width: number): Buffer => {
    const count = buffer.length / width;
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < count; i++) for (let b = 0; b < width; b++) result[b * count + i] = buffer[i * width + b];
    return result;
};
const bytesOf = (array: Int16Array | Uint16Array | Int32Array): Buffer =>
    Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const toInt32Array = (buffer: Buffer): Int32Array =>
    new Int32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + (buffer.length & ~3)));

/**
 * The entries of the dictionary of kuromoji.js in the order of their numbers.
 */
export function readBaseEntries(files: KuromojiFiles): BaseEntry[] {
    const tid = files["tid.dat.gz"];
    const tidPos = files["tid_pos.dat.gz"];
    const count = Math.ceil(trim(tid).length / 10);
    const entries: BaseEntry[] = [];
    for (let i = 0; i < count; i++) {
        const position = tid.readInt32LE(i * 10 + 6);
        const features = tidPos.toString("utf8", position, tidPos.indexOf(0, position)).split(",");
        if (features.length !== 10) throw new Error(`Unexpected features of the entry ${i}: ${features.join(",")}`);
        entries.push({
            number: i,
            surface_form: features[0],
            left_id: tid.readInt16LE(i * 10),
            right_id: tid.readInt16LE(i * 10 + 2),
            word_cost: tid.readInt16LE(i * 10 + 4),
            pos: features[1],
            pos_detail_1: features[2],
            pos_detail_2: features[3],
            pos_detail_3: features[4],
            conjugated_type: features[5],
            conjugated_form: features[6],
            basic_form: features[7],
            reading: features[8],
            pronunciation: features[9]
        });
    }
    return entries;
}

/** The words of the double-array trie of kuromoji.js: [word, value of the trie] sorted by UTF-16 code units */
function readWords(files: KuromojiFiles): [string, number][] {
    const base = toInt32Array(files["base.dat.gz"]);
    const check = toInt32Array(files["check.dat.gz"]);
    const words: [string, number][] = [];
    const bytes: number[] = [];
    const walk = (node: number) => {
        const from = base[node];
        for (let code = 0; code < 256; code++) {
            const child = from + code;
            if (child < 0 || child >= check.length || check[child] !== node) continue;
            if (code === 0) {
                // the code of the end of a key
                if (base[child] <= 0) words.push([Buffer.from(bytes).toString("utf8"), -base[child] - 1]);
            } else {
                bytes.push(code);
                walk(child);
                bytes.pop();
            }
        }
    };
    walk(0);
    words.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return words;
}

type Part = { name: string; rawLength: number; body: Buffer };
type Word = { word: string; entries: number[] };

/** The words of the base dictionary with the numbers of their entries, sorted by UTF-16 code units */
function readBaseWords(files: KuromojiFiles): Word[] {
    const tidMap = trim(files["tid_map.dat.gz"], 4);
    const entriesOfValue = new Map<number, number[]>();
    for (let position = 4; position + 8 <= tidMap.length; ) {
        const key = tidMap.readInt32LE(position);
        const size = tidMap.readInt32LE(position + 4);
        const values: number[] = [];
        for (let i = 0; i < size; i++) values.push(tidMap.readInt32LE(position + 8 + i * 4) / 10);
        entriesOfValue.set(key, values);
        position += 8 + size * 4;
    }
    return readWords(files).map(([word, value]) => ({ word, entries: entriesOfValue.get(value) ?? [] }));
}

/** The marker for a base form that equals the word as written, or a pronunciation that equals the reading */
const SAME = -1;
const combinationOf = (entry: DictionaryEntry) =>
    [
        entry.pos,
        entry.pos_detail_1,
        entry.pos_detail_2,
        entry.pos_detail_3,
        entry.conjugated_type,
        entry.conjugated_form
    ].join(",");

/** A digest of the changes of a version. A released version keeps its digest. */
const digestOf = (version: VersionChanges): string =>
    crypto
        .createHash("sha256")
        .update(
            [
                ...version.added.map((entry) => `add,${toIpadicLine(entry)}`),
                ...version.removed.map((number) => `remove,${number}`)
            ].join("\n")
        )
        .digest("hex");

/**
 * Builds dictionary files of kuromojin from the files of kuromoji.js.
 * It reads the base dictionary once, and each call of `build` writes a file with the given dictionary versions.
 *
 * A file has the entries of all its versions in the same parts.
 * The entries that versions add have the numbers after the entries of the base dictionary,
 * so the table of the file needs only the number of entries up to each version.
 */
export class DictionaryBuilder {
    private readonly baseWords: Word[];
    private readonly baseEntries: BaseEntry[];
    /** the parts that do not depend on the entries: connection costs and unknown words */
    private readonly fixedParts: Part[] = [];

    /**
     * @param gzipLevel level of gzip, 1 to 9
     */
    constructor(
        files: KuromojiFiles,
        private readonly gzipLevel = 9
    ) {
        this.baseWords = readBaseWords(files);
        this.baseEntries = readBaseEntries(files);

        // --- connection costs: each cell as the difference from the cell on its left
        const connection = new Int16Array(toInt32Array(files["cc.dat.gz"]).buffer);
        const differences = Int16Array.from(connection);
        for (let i = connection.length - 1; i >= 3; i--) differences[i] = connection[i] - connection[i - 1];
        this.fixedParts.push(this.part("connection_costs", toPlanes(bytesOf(differences), 2)));

        // --- unknown words: the layout of kuromoji.js without the zeros at the end
        this.fixedParts.push(
            this.part("unk", trim(files["unk.dat.gz"], 10)),
            this.part("unk_pos", Buffer.concat([trim(files["unk_pos.dat.gz"]), Buffer.from([0])])),
            this.part("unk_map", trim(files["unk_map.dat.gz"], 4)),
            this.part("unk_char", files["unk_char.dat.gz"]),
            this.part("unk_invoke", Buffer.concat([trim(files["unk_invoke.dat.gz"]), Buffer.from([0])]))
        );
    }

    private part(name: string, raw: Buffer): Part {
        return { name, rawLength: raw.length, body: zlib.gzipSync(raw, { level: this.gzipLevel }) };
    }

    /**
     * The parts of the entries: the words, the entries of each word, and the costs and features of the entries.
     */
    private entryParts(versions: VersionChanges[]): Part[] {
        const parts: Part[] = [];

        // --- all entries in the order of their numbers, and the entries of each word.
        // An added entry is the last entry of its word, so a word keeps the order of its earlier entries.
        const entries: DictionaryEntry[] = [...this.baseEntries];
        let words = this.baseWords;
        if (versions.some((version) => version.added.length > 0)) {
            const wordOf = new Map<string, Word>();
            words = this.baseWords.map((word) => {
                const copy = { word: word.word, entries: [...word.entries] };
                wordOf.set(copy.word, copy);
                return copy;
            });
            for (const version of versions) {
                for (const entry of version.added) {
                    let word = wordOf.get(entry.surface_form);
                    if (word === undefined) {
                        word = { word: entry.surface_form, entries: [] };
                        wordOf.set(word.word, word);
                        words.push(word);
                    }
                    word.entries.push(entries.length);
                    entries.push(entry);
                }
            }
            words.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
        }

        // --- words: a trie of UTF-16 code units, with the nodes in breadth-first order
        const chars = [0];
        const counts = [0];
        const ends = [0];
        /** the words in the order of the nodes where a word ends */
        const wordsOfNodes: Word[] = [];
        // from, to: range of `words` below the node. depth: length of the prefix of the node
        let ranges: [from: number, to: number, depth: number, node: number][] = [[0, words.length, 0, 0]];
        while (ranges.length > 0) {
            const next: typeof ranges = [];
            for (let [from, to, depth, node] of ranges) {
                if (from < to && words[from].word.length === depth) {
                    ends[node] = 1;
                    wordsOfNodes.push(words[from]);
                    from++;
                }
                let children = 0;
                while (from < to) {
                    const code = words[from].word.charCodeAt(depth);
                    let end = from + 1;
                    while (end < to && words[end].word.charCodeAt(depth) === code) end++;
                    next.push([from, end, depth + 1, chars.length]);
                    chars.push(code);
                    counts.push(0);
                    ends.push(0);
                    children++;
                    from = end;
                }
                if (children > 0xffff) throw new Error("A node of the trie has too many children");
                counts[node] = children;
            }
            ranges = next;
        }
        const endBits = Buffer.alloc(Math.ceil(ends.length / 8));
        ends.forEach((end, i) => {
            if (end) endBits[i >> 3] |= 1 << (i & 7);
        });
        parts.push(
            this.part("trie_chars", toPlanes(bytesOf(Uint16Array.from(chars)), 2)),
            this.part("trie_counts", toPlanes(bytesOf(Uint16Array.from(counts)), 2)),
            this.part("trie_ends", endBits)
        );

        // --- entries of each word, in the order of the nodes where a word ends
        const wordCounts: number[] = [];
        const varints: number[] = [];
        let previous = 0;
        for (const word of wordsOfNodes) {
            if (word.entries.length > 255) throw new Error(`The word ${word.word} has too many entries`);
            wordCounts.push(word.entries.length);
            for (const number of word.entries) {
                // the difference from the number before, as a zigzag varint
                const difference = number - previous;
                previous = number;
                let zigzag = difference >= 0 ? difference * 2 : -difference * 2 - 1;
                while (zigzag >= 128) {
                    varints.push((zigzag & 127) | 128);
                    zigzag = Math.floor(zigzag / 128);
                }
                varints.push(zigzag);
            }
        }
        parts.push(this.part("word_counts", Buffer.from(wordCounts)), this.part("word_entries", Buffer.from(varints)));

        // --- costs and ids of the entries, each in a column of its own
        const left = Int16Array.from(entries, (entry) => entry.left_id);
        const right = Int16Array.from(entries, (entry) => entry.right_id);
        const cost = Int16Array.from(entries, (entry) => entry.word_cost);
        parts.push(this.part("left_ids", toPlanes(bytesOf(left), 2)));
        // the right id has a part only when it differs from the left id in some entry
        if (entries.some((entry) => entry.left_id !== entry.right_id)) {
            parts.push(this.part("right_ids", toPlanes(bytesOf(right), 2)));
        }
        parts.push(this.part("word_costs", toPlanes(bytesOf(cost), 2)));

        // --- features: four numbers per entry, which point into lists of distinct strings
        const combinations = new Map<string, number>();
        const distinct = new Set<string>();
        for (const entry of entries) {
            const combination = combinationOf(entry);
            if (!combinations.has(combination)) combinations.set(combination, combinations.size);
            if (entry.basic_form !== entry.surface_form) distinct.add(entry.basic_form);
            distinct.add(entry.reading);
            if (entry.pronunciation !== entry.reading) distinct.add(entry.pronunciation);
        }
        const strings = [...distinct].sort();
        const stringId = new Map(strings.map((string, i) => [string, i]));
        const features = new Int32Array(entries.length * 4);
        entries.forEach((entry, i) => {
            features[i * 4] = combinations.get(combinationOf(entry)) as number;
            features[i * 4 + 1] =
                entry.basic_form === entry.surface_form ? SAME : (stringId.get(entry.basic_form) as number);
            features[i * 4 + 2] = stringId.get(entry.reading) as number;
            features[i * 4 + 3] =
                entry.pronunciation === entry.reading ? SAME : (stringId.get(entry.pronunciation) as number);
        });
        const stringCounts = Buffer.alloc(8);
        stringCounts.writeInt32LE(combinations.size, 0);
        stringCounts.writeInt32LE(strings.length, 4);
        parts.push(
            this.part("features", toPlanes(bytesOf(features), 16)),
            this.part(
                "strings",
                Buffer.concat([stringCounts, Buffer.from([...combinations.keys(), ...strings].join("\0"), "utf8")])
            )
        );
        return parts;
    }

    /**
     * The file: the start, the table, and the parts.
     */
    build(options: BuildOptions): Buffer {
        const parts = [...this.entryParts(options.versions), ...this.fixedParts];
        let entryCount = this.baseEntries.length;
        const versions: DictionaryTable["versions"] = [
            { date: options.baseVersion, entries: entryCount, removed: [], digest: digestOf(BASE_CHANGES) }
        ];
        for (const version of options.versions) {
            entryCount += version.added.length;
            versions.push({
                date: version.date,
                entries: entryCount,
                removed: version.removed,
                digest: digestOf(version)
            });
        }
        let offset = 0;
        const table: DictionaryTable = {
            versions,
            parts: parts.map(({ name, rawLength, body }) => {
                const part = { name, offset, length: body.length, rawLength };
                offset += body.length;
                return part;
            })
        };
        const tableBytes = Buffer.from(JSON.stringify(table), "utf8");
        const start = Buffer.alloc(START_LENGTH);
        start.write(SIGNATURE, 0, "latin1");
        start.writeUInt32LE(FORMAT_VERSION, 4);
        start.writeUInt32LE(tableBytes.length, 8);
        return Buffer.concat([start, tableBytes, ...parts.map((part) => part.body)]);
    }
}

/** The base dictionary has no changes */
const BASE_CHANGES: VersionChanges = { date: "", added: [], removed: [] };

/**
 * Build the dictionary file of kuromojin from the files of kuromoji.js and the dictionary versions.
 */
export function buildDictionary(files: KuromojiFiles, options: BuildOptions & { gzipLevel?: number }): Buffer {
    return new DictionaryBuilder(files, options.gzipLevel).build(options);
}

/**
 * Read the table of a dictionary file of kuromojin.
 */
export function readDictionaryTable(file: Buffer): DictionaryTable {
    if (file.toString("latin1", 0, 4) !== SIGNATURE || file.readUInt32LE(4) !== FORMAT_VERSION) {
        throw new Error("The file is not a dictionary of kuromojin in the format that this script writes.");
    }
    return JSON.parse(file.toString("utf8", START_LENGTH, START_LENGTH + file.readUInt32LE(8))) as DictionaryTable;
}

const ENTRY_FIELDS = 13;
const toEntry = (fields: string[], line: number): DictionaryEntry => {
    if (fields.length !== ENTRY_FIELDS) {
        throw new Error(`Line ${line}: an entry has ${ENTRY_FIELDS} fields, but the line has ${fields.length}.`);
    }
    const numbers = fields.slice(1, 4).map((field) => Number(field));
    if (numbers.some((number) => !Number.isInteger(number) || number < -32768 || number > 32767)) {
        throw new Error(`Line ${line}: the left id, the right id, and the cost are integers of 16 bits.`);
    }
    return {
        surface_form: fields[0],
        left_id: numbers[0],
        right_id: numbers[1],
        word_cost: numbers[2],
        pos: fields[4],
        pos_detail_1: fields[5],
        pos_detail_2: fields[6],
        pos_detail_3: fields[7],
        conjugated_type: fields[8],
        conjugated_form: fields[9],
        basic_form: fields[10],
        reading: fields[11],
        pronunciation: fields[12]
    };
};
/** An entry in the form of the source files of IPADIC */
export const toIpadicLine = (entry: DictionaryEntry): string =>
    [
        entry.surface_form,
        entry.left_id,
        entry.right_id,
        entry.word_cost,
        entry.pos,
        entry.pos_detail_1,
        entry.pos_detail_2,
        entry.pos_detail_3,
        entry.conjugated_type,
        entry.conjugated_form,
        entry.basic_form,
        entry.reading,
        entry.pronunciation
    ].join(",");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isWellFormed = (text: string) =>
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);

/**
 * Read the changes of the dictionary versions from the text file of the repository, and check them.
 *
 * A line is one change. Empty lines and lines that start with `#` are ignored.
 * - `<date>,add,<entry>`: the version of the date adds the entry
 * - `<date>,remove,<number>,<entry>`: the version of the date removes the entry with the number
 * `<entry>` is written as in the source files of IPADIC:
 * surface form, left id, right id, cost, pos, pos detail 1, pos detail 2, pos detail 3,
 * conjugated type, conjugated form, base form, reading, pronunciation.
 *
 * @param baseEntries the entries of the base dictionary, see readBaseEntries
 * @param connectionCosts cc.dat of the base dictionary, to check the ids
 */
export function parseVersions(
    text: string,
    baseVersion: string,
    baseEntries: BaseEntry[],
    connectionCosts: Buffer
): VersionChanges[] {
    const forwardSize = connectionCosts.readInt16LE(0);
    const backwardSize = connectionCosts.readInt16LE(2);
    const versions: VersionChanges[] = [];
    // number -> entry, for the entries that versions added and did not remove
    const added = new Map<number, DictionaryEntry>();
    const removed = new Set<number>();
    let nextNumber = baseEntries.length;
    text.split(/\r?\n/).forEach((raw, index) => {
        const line = index + 1;
        if (raw.trim() === "" || raw.startsWith("#")) return;
        const fields = raw.split(",");
        const [date, kind] = fields;
        if (!DATE.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
            throw new Error(`Line ${line}: "${date}" is not a date written as YYYY-MM-DD.`);
        }
        let version = versions[versions.length - 1];
        const lastDate = version ? version.date : baseVersion;
        if (date < lastDate || (!version && date === baseVersion)) {
            throw new Error(
                `Line ${line}: the date ${date} has to be later than ${lastDate}. Versions only get later.`
            );
        }
        if (!version || version.date !== date) {
            version = { date, added: [], removed: [] };
            versions.push(version);
        }
        if (kind === "add") {
            const entry = toEntry(fields.slice(2), line);
            if (entry.surface_form === "" || entry.surface_form.includes("\0") || !isWellFormed(entry.surface_form)) {
                throw new Error(`Line ${line}: the word is empty or has a character that a word cannot have.`);
            }
            if (
                entry.right_id < 0 ||
                entry.right_id >= forwardSize ||
                entry.left_id < 0 ||
                entry.left_id >= backwardSize
            ) {
                throw new Error(`Line ${line}: the left id or the right id is not in the connection costs.`);
            }
            version.added.push(entry);
            added.set(nextNumber++, entry);
        } else if (kind === "remove") {
            const number = Number(fields[2]);
            const entry = toEntry(fields.slice(3), line);
            const existing = number < baseEntries.length ? baseEntries[number] : added.get(number);
            if (!Number.isInteger(number) || !existing || removed.has(number)) {
                throw new Error(`Line ${line}: there is no entry with the number ${fields[2]} to remove.`);
            }
            if (toIpadicLine(existing) !== toIpadicLine(entry)) {
                throw new Error(
                    `Line ${line}: the entry ${number} is not the entry of the line. It is: ${toIpadicLine(existing)}`
                );
            }
            version.removed.push(number);
            removed.add(number);
            added.delete(number);
        } else {
            throw new Error(`Line ${line}: the second field is "add" or "remove", but it is "${kind}".`);
        }
    });
    return versions;
}

/**
 * Check that the versions of an earlier dictionary file are unchanged in the versions of a new file.
 * A released version is never changed: later releases only add versions with later dates.
 * @param released the versions in the table of the earlier file
 * @param versions the versions in the table of the new file
 */
export function checkReleasedVersions(
    released: DictionaryTable["versions"],
    versions: DictionaryTable["versions"]
): void {
    released.forEach((version, i) => {
        const current = versions[i];
        const same =
            current !== undefined &&
            current.date === version.date &&
            current.entries === version.entries &&
            current.digest === version.digest;
        if (!same) {
            throw new Error(
                `The version ${version.date} of the existing dictionary file is changed or missing. ` +
                    `A released version is never changed: add a later version instead.`
            );
        }
    });
}

/**
 * The list of the dictionary versions for readers, as Markdown.
 */
/**
 * The TypeScript source of the type of the dates that a caller can pass as `dictionaryVersion`:
 * the dates of the versions of the dictionary of the package.
 * The lines are as Prettier writes them.
 */
export function renderVersionType(baseVersion: string, versions: VersionChanges[]): string {
    const dates = [baseVersion, ...versions.map((version) => version.date)].map((date) => JSON.stringify(date));
    const oneLine = `export type DictionaryVersion = ${dates.join(" | ")};`;
    const declaration =
        oneLine.length <= 120
            ? oneLine
            : `export type DictionaryVersion =\n${dates.map((date) => `    | ${date}`).join("\n")};`;
    return [
        "// LICENSE : MIT",
        "// `scripts/build-dict.ts` writes this file from `dict-source/versions.csv`, so do not edit it.",
        "/**",
        " * A dictionary version of the dictionary of the package: the date of the version, written as YYYY-MM-DD.",
        " * `dict/DICTIONARY_VERSIONS.md` lists the changes of each version.",
        " */",
        declaration,
        ""
    ].join("\n");
}

export function renderVersionList(baseVersion: string, versions: VersionChanges[], baseEntries: BaseEntry[]): string {
    const lines = [
        "# Dictionary versions",
        "",
        "This file lists the dictionary versions of the `kuromojin.dict` file in this directory.",
        "`scripts/build-dict.ts` writes it from `dict-source/versions.csv`, so do not edit it.",
        "",
        "A caller of `tokenize` or `getTokenizer` chooses a version with the option `dictionaryVersion`,",
        "the date of a version written as `YYYY-MM-DD`. It gets the dictionary with the changes of every version up to that one.",
        "A date that is not the date of a version in this file is rejected.",
        "A call without the option uses the default version.",
        "",
        `## ${baseVersion}`,
        "",
        "The base dictionary: mecab-ipadic-2.7.0-20070801 as it is built for kuromoji.js 0.1.2.",
        "It is the default version.",
        ""
    ];
    const row = (entry: DictionaryEntry) =>
        `| ${[
            entry.surface_form,
            [entry.pos, entry.pos_detail_1, entry.pos_detail_2, entry.pos_detail_3]
                .filter((value) => value !== "*")
                .join("-"),
            entry.reading
        ].join(" | ")} |`;
    const added = new Map<number, DictionaryEntry>();
    let nextNumber = baseEntries.length;
    for (const version of versions) {
        lines.push(`## ${version.date}`, "");
        if (version.added.length > 0) {
            lines.push("Added:", "", "| Word | Part of speech | Reading |", "| --- | --- | --- |");
            for (const entry of version.added) {
                lines.push(row(entry));
                added.set(nextNumber++, entry);
            }
            lines.push("");
        }
        if (version.removed.length > 0) {
            lines.push("Removed:", "", "| Word | Part of speech | Reading |", "| --- | --- | --- |");
            for (const number of version.removed) {
                lines.push(
                    row(number < baseEntries.length ? baseEntries[number] : (added.get(number) as DictionaryEntry))
                );
            }
            lines.push("");
        }
    }
    return lines.join("\n");
}
