// LICENSE : MIT
import assert from "node:assert";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import fs from "node:fs";
import http from "http";
import path from "node:path";
import type { AddressInfo } from "net";
import { Analyzer } from "../src/analyzer/Analyzer";
import { createDefaultView } from "../src/analyzer/DictionaryVersions";
import { loadDictionary } from "../src/analyzer/loader/loadDictionary";
import { browserPlatform } from "../src/analyzer/loader/platform";
import {
    allBaseEntries,
    freshKuromojin,
    kuromojiDictionaryDirectory,
    packageDictionaryFile,
    recordReads,
    withSettings,
    writeTemporaryFile
} from "./helpers";

// The scenarios of docs/products/kuromojin/features/dictionary/requirements.md
describe("dictionary", function () {
    describe("dictionary path", function () {
        it("uses the dictionary of the package when no dictionary path is given", async function () {
            await withSettings({}, async () => {
                const kuromojin = await freshKuromojin();
                const reads = await recordReads(() => kuromojin.getTokenizer());
                assert.deepStrictEqual(reads, [packageDictionaryFile]);
            });
        });
        it("uses the dictionary of the package when the first call has options without a dictionary path", async function () {
            await withSettings({}, async () => {
                const kuromojin = await freshKuromojin();
                let tokens: readonly { surface_form: string }[] = [];
                const reads = await recordReads(async () => {
                    tokens = await kuromojin.tokenize("黒文字", { noCacheTokenize: true });
                });
                assert.deepStrictEqual(reads, [packageDictionaryFile]);
                assert.deepStrictEqual(
                    tokens.map((token) => token.surface_form),
                    ["黒文字"]
                );
            });
        });
        it("loads the dictionary from dicPath of the first call, even when KUROMOJIN_DIC_PATH names another one", async function () {
            await withSettings({ env: "/not-found/kuromojin.dict" }, async () => {
                const kuromojin = await freshKuromojin();
                const reads = await recordReads(() => kuromojin.getTokenizer({ dicPath: packageDictionaryFile }));
                assert.deepStrictEqual(reads, [packageDictionaryFile]);
            });
        });
        it("loads the dictionary from KUROMOJIN_DIC_PATH", async function () {
            const copy = writeTemporaryFile("copy-for-env.dict", fs.readFileSync(packageDictionaryFile));
            await withSettings({ env: copy, global: { dicPath: "/not-found/kuromojin.dict" } }, async () => {
                const kuromojin = await freshKuromojin();
                const reads = await recordReads(() => kuromojin.getTokenizer());
                assert.deepStrictEqual(reads, [copy]);
            });
        });
        it("loads the dictionary from globalThis.kuromojin.dicPath", async function () {
            const copy = writeTemporaryFile("copy-for-global.dict", fs.readFileSync(packageDictionaryFile));
            await withSettings({ global: { dicPath: copy } }, async () => {
                const kuromojin = await freshKuromojin();
                const reads = await recordReads(() => kuromojin.tokenize("黒文字"));
                assert.deepStrictEqual(reads, [copy]);
            });
        });
    });

    describe("loading once", function () {
        it("reads the dictionary once when many callers ask for the tokenizer at the same time", async function () {
            await withSettings({}, async () => {
                const kuromojin = await freshKuromojin();
                let tokenizers: unknown[] = [];
                const reads = await recordReads(async () => {
                    tokenizers = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => kuromojin.getTokenizer()));
                });
                assert.strictEqual(reads.length, 1);
                tokenizers.forEach((tokenizer) => assert.strictEqual(tokenizer, tokenizers[0]));
            });
        });
        it("does not use a later dictionary path when the dictionary is already loaded", async function () {
            await withSettings({}, async () => {
                const kuromojin = await freshKuromojin();
                const first = await kuromojin.getTokenizer();
                let second: unknown;
                const reads = await recordReads(async () => {
                    second = await kuromojin.getTokenizer({ dicPath: kuromojiDictionaryDirectory });
                });
                assert.strictEqual(second, first);
                assert.deepStrictEqual(reads, []);
            });
        });
    });

    describe("dictionary of kuromoji.js", function () {
        it("loads a directory with the twelve files, and returns the same token as the dictionary of the package", async function () {
            await withSettings({}, async () => {
                const kuromojin = await freshKuromojin();
                let tokens: unknown;
                const reads = await recordReads(async () => {
                    tokens = await kuromojin.tokenize("黒文字", { dicPath: kuromojiDictionaryDirectory });
                });
                assert.strictEqual(reads.length, 12);
                assert.ok(reads.every((file) => file.endsWith(".dat.gz")));
                assert.deepStrictEqual(tokens, await (await freshKuromojin()).tokenize("黒文字"));
            });
        });
        it("loads a directory path that ends with a slash", async function () {
            const dictionary = await loadDictionary(kuromojiDictionaryDirectory + path.sep);
            assert.strictEqual(new Analyzer(dictionary).analyze("黒文字", [], createDefaultView(dictionary)).length, 1);
        });
    });

    describe("dictionary of the package", function () {
        it("has every entry of the dictionary of kuromoji.js with the same costs and features", async function () {
            const dictionary = await loadDictionary(packageDictionaryFile);
            const entries = allBaseEntries();
            assert.strictEqual(dictionary.known.left.length, entries.length);
            const matched = new Int32Array(512);
            for (const expected of entries) {
                const entry = expected.number;
                const word = expected.surface_form;
                const { word_id, word_type, word_position, ...features } = dictionary.knownFeatures.token(
                    entry,
                    1,
                    word
                );
                const actual = {
                    number: word_id / 10,
                    ...features,
                    left_id: dictionary.known.left[entry],
                    right_id: dictionary.known.right[entry],
                    word_cost: dictionary.known.cost[entry]
                };
                const same = (Object.keys(expected) as (keyof typeof expected)[]).every(
                    (key) => actual[key] === expected[key]
                );
                if (!same || word_type !== "KNOWN" || word_position !== 1) assert.deepStrictEqual(actual, expected);
                // the trie finds the word, and the entry is one of the entries of the word
                const matches = dictionary.trie.commonPrefixMatches(word + "\u3042", 0, matched);
                let found = false;
                for (let i = 0; i < matches && !found; i++) {
                    if (matched[i * 2 + 1] !== word.length) continue;
                    const from = dictionary.wordOffsets[matched[i * 2]];
                    const to = dictionary.wordOffsets[matched[i * 2] + 1];
                    found = dictionary.wordEntries.subarray(from, to).includes(entry);
                }
                if (!found) assert.fail(`the entry ${entry} is not an entry of the word ${word}`);
            }
        });
    });

    describe("dictionary that cannot be loaded", function () {
        it("rejects with the error of the read, which names the file", async function () {
            await withSettings({ env: "/not-found-directory" }, async () => {
                const kuromojin = await freshKuromojin();
                await assert.rejects(kuromojin.getTokenizer(), /ENOENT.*not-found-directory/);
            });
        });
        it("rejects when a .dict file is not a dictionary of kuromojin", async function () {
            const file = writeTemporaryFile("not-a-dictionary.dict", Buffer.from("<!DOCTYPE html><html></html>"));
            await assert.rejects(loadDictionary(file), /not-a-dictionary\.dict is not a dictionary of kuromojin/);
        });
        it("rejects when a .dict file has a version of the format that the code does not know", async function () {
            const bytes = Buffer.from(fs.readFileSync(packageDictionaryFile));
            bytes.writeUInt32LE(999, 4);
            const file = writeTemporaryFile("unknown-format.dict", bytes);
            await assert.rejects(loadDictionary(file), /format version 999/);
        });
        it("does not try again: every later call is rejected with the same error", async function () {
            await withSettings({}, async () => {
                const kuromojin = await freshKuromojin();
                const error = await kuromojin.getTokenizer({ dicPath: "/not-found/kuromojin.dict" }).catch((e) => e);
                assert.ok(error instanceof Error);
                const later = await kuromojin.tokenize("黒文字", { dicPath: packageDictionaryFile }).catch((e) => e);
                assert.strictEqual(later, error);
            });
        });
    });

    // Node.js has fetch and DecompressionStream, so the functions for a browser are tested with a local server.
    describe("in a browser", function () {
        let server: http.Server;
        let origin: string;
        let requests: string[];
        beforeAll(async function () {
            server = http.createServer((request, response) => {
                const url = String(request.url);
                requests.push(url);
                const file = url.startsWith("/kuromoji/")
                    ? path.join(kuromojiDictionaryDirectory, path.basename(url))
                    : url === "/dict/kuromojin.dict"
                      ? packageDictionaryFile
                      : undefined;
                if (!file || !fs.existsSync(file)) {
                    response.writeHead(404);
                    response.end("not found");
                    return;
                }
                response.writeHead(200, { "Content-Type": "application/octet-stream" });
                response.end(fs.readFileSync(file));
            });
            await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
            origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        });
        beforeEach(function () {
            requests = [];
        });
        afterAll(async function () {
            await new Promise((resolve) => server.close(resolve));
        });

        it("downloads one file for the dictionary of the package", async function () {
            const dictionary = await loadDictionary(`${origin}/dict/kuromojin.dict`, browserPlatform);
            assert.deepStrictEqual(requests, ["/dict/kuromojin.dict"]);
            const tokens = new Analyzer(dictionary).analyze("黒文字", [], createDefaultView(dictionary));
            assert.strictEqual(tokens[0].reading, "クロモジ");
        });
        it("requests only the twelve files for a dictionary of kuromoji.js", async function () {
            const dictionary = await loadDictionary(`${origin}/kuromoji`, browserPlatform);
            assert.strictEqual(requests.length, 12);
            assert.ok(requests.every((url) => /^\/kuromoji\/[a-z_]+\.dat\.gz$/.test(url)));
            const tokens = new Analyzer(dictionary).analyze("黒文字", [], createDefaultView(dictionary));
            assert.strictEqual(tokens[0].reading, "クロモジ");
        });
        it("rejects with an error that names the URL when the file cannot be requested", async function () {
            await assert.rejects(
                loadDictionary(`${origin}/missing/kuromojin.dict`, browserPlatform),
                /missing\/kuromojin\.dict: 404/
            );
        });
    });
});
