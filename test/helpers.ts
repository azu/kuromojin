// LICENSE : MIT
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import {
    BaseEntry,
    DictionaryBuilder,
    DictionaryEntry,
    KuromojiFiles,
    readBaseEntries,
    readKuromojiFiles,
    VersionChanges
} from "../scripts/buildDictionary";

export const kuromojiDictionaryDirectory = path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict");
export const packageDictionaryFile = path.join(__dirname, "..", "dict", "kuromojin.dict");
export const BASE_VERSION = "2007-08-01";

/**
 * Load kuromojin again as a new module, with no dictionary loaded.
 * kuromojin keeps the loaded dictionary in the module, so a test of loading needs its own copy.
 */
export async function freshKuromojin(): Promise<typeof import("../src")> {
    vi.resetModules();
    return import("../src");
}

/**
 * Run `callback` with environment variables and with `globalThis.kuromojin`, and restore them after it.
 */
export async function withSettings<T>(
    settings: { env?: string; global?: unknown },
    callback: () => Promise<T>
): Promise<T> {
    const global = globalThis as { kuromojin?: unknown };
    const originalEnv = process.env.KUROMOJIN_DIC_PATH;
    const originalGlobal = global.kuromojin;
    if (settings.env !== undefined) process.env.KUROMOJIN_DIC_PATH = settings.env;
    else delete process.env.KUROMOJIN_DIC_PATH;
    if (settings.global !== undefined) global.kuromojin = settings.global;
    else delete global.kuromojin;
    try {
        return await callback();
    } finally {
        if (originalEnv !== undefined) process.env.KUROMOJIN_DIC_PATH = originalEnv;
        else delete process.env.KUROMOJIN_DIC_PATH;
        if (originalGlobal !== undefined) global.kuromojin = originalGlobal;
        else delete global.kuromojin;
    }
}

/**
 * Count the reads of files while `callback` runs. Returns the paths of the files that were read.
 */
export async function recordReads(callback: () => Promise<unknown>): Promise<string[]> {
    const paths: string[] = [];
    const original = fs.promises.readFile;
    fs.promises.readFile = ((file: unknown, ...rest: unknown[]) => {
        paths.push(String(file));
        return (original as (...args: unknown[]) => unknown).call(fs.promises, file, ...rest);
    }) as typeof fs.promises.readFile;
    try {
        await callback();
    } finally {
        fs.promises.readFile = original;
    }
    return paths;
}

const noun = (surface: string, reading: string, ids: number, cost: number, detail: string[]): DictionaryEntry => ({
    surface_form: surface,
    left_id: ids,
    right_id: ids,
    word_cost: cost,
    pos: "名詞",
    pos_detail_1: detail[0],
    pos_detail_2: detail[1],
    pos_detail_3: "*",
    conjugated_type: "*",
    conjugated_form: "*",
    basic_form: surface,
    reading: reading,
    pronunciation: reading
});
/** The versions of the dictionary for tests of the Dictionary versions Requirements */
export const testVersions: VersionChanges[] = [
    // the ids and the cost of 平成
    { date: "2027-04-01", added: [noun("令和", "レイワ", 1288, 5904, ["固有名詞", "一般"])], removed: [] },
    // the ids and the cost of テレビ
    { date: "2027-10-01", added: [noun("スマホ", "スマホ", 1285, 3433, ["一般", "*"])], removed: [] }
];

let kuromojiFiles: KuromojiFiles | undefined;
const getKuromojiFiles = () => kuromojiFiles ?? (kuromojiFiles = readKuromojiFiles(kuromojiDictionaryDirectory));
let baseEntries: BaseEntry[] | undefined;
const getBaseEntries = () => baseEntries ?? (baseEntries = readBaseEntries(getKuromojiFiles()));
/** The entries of a word in the base dictionary */
export function baseEntriesOf(word: string): BaseEntry[] {
    return getBaseEntries().filter((entry) => entry.surface_form === word);
}
/** The words of every `step`-th entry of the base dictionary, in the order of the dictionary */
export function baseWordsAtEvery(step: number): string[] {
    return getBaseEntries()
        .filter((_, index) => index % step === 0)
        .map((entry) => entry.surface_form);
}

let builder: DictionaryBuilder | undefined;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kuromojin-test-"));
// the dictionary files for tests are several megabytes each, so they are removed when the tests end
process.on("exit", () => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
/**
 * Write a dictionary file of kuromojin with the given versions, and return its path.
 */
export function writeTestDictionary(name: string, versions: VersionChanges[]): string {
    // gzip level 1: the tests do not depend on the size of the file
    if (!builder) builder = new DictionaryBuilder(getKuromojiFiles(), 1);
    const file = path.join(temporaryDirectory, name);
    fs.writeFileSync(file, builder.build({ baseVersion: BASE_VERSION, versions }));
    return file;
}
export function writeTemporaryFile(name: string, content: Uint8Array): string {
    const file = path.join(temporaryDirectory, name);
    fs.writeFileSync(file, content);
    return file;
}
