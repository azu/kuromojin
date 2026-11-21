// LICENSE : MIT
import assert from "node:assert";
import type { DictionaryVersion, getTokenizerOption, KuromojiToken } from "../src";
import {
    BASE_VERSION,
    baseEntriesOf,
    freshKuromojin,
    kuromojiDictionaryDirectory,
    recordReads,
    testVersions,
    withSettings,
    writeTestDictionary
} from "./helpers";

const surfaces = (tokens: readonly KuromojiToken[]) => tokens.map((token) => token.surface_form);
/**
 * A version of the dictionary for tests.
 * The type DictionaryVersion has only the versions of the dictionary of the package.
 */
const version = (date: string) => date as DictionaryVersion;

// The scenarios of docs/products/kuromojin/features/dictionary-versions/requirements.md
describe("dictionary versions", function () {
    this.timeout(120000);
    /** the dictionary for tests: 2027-04-01 adds 令和, 2027-10-01 adds スマホ */
    let dicPath: string;
    let kuromojin: ReturnType<typeof freshKuromojin>;
    before(function () {
        dicPath = writeTestDictionary("versions.dict", testVersions);
    });
    beforeEach(function () {
        kuromojin = freshKuromojin();
    });
    const withTestDictionary = <T>(callback: () => Promise<T>) => withSettings({ env: dicPath }, callback);

    context("use newer words in a rule", function () {
        it("has the words of the version in the tokens when a call names a version", async function () {
            await withTestDictionary(async () => {
                const tokens = await kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-04-01") });
                assert.deepStrictEqual(surfaces(tokens), ["令和", "元年"]);
                assert.strictEqual(tokens[0].word_type, "KNOWN");
                assert.strictEqual(tokens[0].reading, "レイワ");
                assert.strictEqual(tokens[0].word_position, 1);
                assert.strictEqual(tokens[1].word_position, 3);
            });
        });
        it("returns the tokens of the default dictionary when a call names no version", async function () {
            await withTestDictionary(async () => {
                assert.deepStrictEqual(surfaces(await kuromojin.tokenize("令和元年")), ["令", "和", "元年"]);
            });
        });
        it("does not give the changes of a later version when a call names a version", async function () {
            await withTestDictionary(async () => {
                const tokens = await kuromojin.tokenize("令和にスマホを使う", {
                    dictionaryVersion: version("2027-04-01")
                });
                const defaultTokens = await kuromojin.tokenize("スマホを使う");
                const reiwa = tokens.find((token) => token.surface_form === "令和");
                const sumaho = tokens.find((token) => token.surface_form === "スマホ");
                assert.strictEqual(reiwa?.word_type, "KNOWN");
                assert.strictEqual(sumaho?.word_type, "UNKNOWN");
                assert.strictEqual(defaultTokens[0].surface_form, "スマホ");
                assert.strictEqual(defaultTokens[0].word_type, "UNKNOWN");
            });
        });
        it("gives the changes of all versions when a call names the newest version", async function () {
            await withTestDictionary(async () => {
                const tokens = await kuromojin.tokenize("令和にスマホを使う", {
                    dictionaryVersion: version("2027-10-01")
                });
                assert.deepStrictEqual(surfaces(tokens), ["令和", "に", "スマホ", "を", "使う"]);
                assert.deepStrictEqual(
                    tokens.map((token) => token.word_type),
                    ["KNOWN", "KNOWN", "KNOWN", "KNOWN", "KNOWN"]
                );
            });
        });
        it("gives the tokens of the default dictionary when a call names the date of the base dictionary", async function () {
            await withTestDictionary(async () => {
                const tokens = await kuromojin.tokenize("令和元年", { dictionaryVersion: BASE_VERSION });
                assert.strictEqual(tokens, await kuromojin.tokenize("令和元年"));
                assert.strictEqual(
                    await kuromojin.getTokenizer({ dictionaryVersion: BASE_VERSION }),
                    await kuromojin.getTokenizer()
                );
            });
        });
    });

    context("keep the tokens of a rule when kuromojin is updated", function () {
        it("does not change the tokens of an older version when the dictionary gets a newer version", async function () {
            const text = "令和にスマホを使う。令和元年は平成31年である。";
            const older = writeTestDictionary("older.dict", testVersions.slice(0, 1));
            const before = await withSettings({ env: older }, () =>
                freshKuromojin().tokenize(text, { dictionaryVersion: version("2027-04-01") })
            );
            const after = await withTestDictionary(() =>
                kuromojin.tokenize(text, { dictionaryVersion: version("2027-04-01") })
            );
            assert.deepStrictEqual(after, before);
            assert.ok(before.some((token) => token.surface_form === "令和" && token.word_id > 0));
        });
        it("gives every added entry a word_id that no other entry has", async function () {
            await withTestDictionary(async () => {
                const tokens = await kuromojin.tokenize("令和にスマホを使う", {
                    dictionaryVersion: version("2027-10-01")
                });
                const ids = tokens.map((token) => token.word_id);
                assert.strictEqual(new Set(ids).size, ids.length);
                // the numbers of added entries come after the numbers of the base dictionary: 392,126 entries
                assert.strictEqual(ids[0], 3921260);
                assert.strictEqual(ids[2], 3921270);
            });
        });
    });

    context("run rules with different versions together", function () {
        it("gives each caller the tokens of its own version, and reads the dictionary file once", async function () {
            await withTestDictionary(async () => {
                let results: (readonly KuromojiToken[])[] = [];
                const reads = await recordReads(async () => {
                    results = await Promise.all([
                        kuromojin.tokenize("令和元年"),
                        kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-04-01") }),
                        kuromojin.tokenize("令和元年")
                    ]);
                });
                assert.deepStrictEqual(reads, [dicPath]);
                assert.deepStrictEqual(surfaces(results[0]), ["令", "和", "元年"]);
                assert.deepStrictEqual(surfaces(results[1]), ["令和", "元年"]);
                assert.deepStrictEqual(surfaces(results[2]), ["令", "和", "元年"]);
            });
        });
        it("returns the same array for the same text and the same version", async function () {
            await withTestDictionary(async () => {
                const first = await kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-04-01") });
                const second = await kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-04-01") });
                assert.strictEqual(second, first);
                const other = await kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-10-01") });
                assert.notStrictEqual(other, first);
                assert.deepStrictEqual(other, first);
            });
        });
        it("resolves with one tokenizer for each version", async function () {
            await withTestDictionary(async () => {
                const first = await kuromojin.getTokenizer({ dictionaryVersion: version("2027-04-01") });
                const second = await kuromojin.getTokenizer({ dictionaryVersion: version("2027-04-01") });
                const otherVersion = await kuromojin.getTokenizer({ dictionaryVersion: version("2027-10-01") });
                const withoutVersion = await kuromojin.getTokenizer();
                assert.strictEqual(second, first);
                assert.notStrictEqual(otherVersion, first);
                assert.notStrictEqual(withoutVersion, first);
                assert.deepStrictEqual(surfaces(first.tokenizeForSentence("令和元年")), ["令和", "元年"]);
                assert.deepStrictEqual(surfaces(first.tokenize("令和元年。")), ["令和", "元年", "。"]);
                assert.deepStrictEqual(surfaces(withoutVersion.tokenizeForSentence("令和元年")), ["令", "和", "元年"]);
            });
        });
    });

    context("notice a version that cannot be used", function () {
        it("rejects a date later than the newest version, and names both dates", async function () {
            await withTestDictionary(async () => {
                await assert.rejects(
                    kuromojin.tokenize("令和元年", { dictionaryVersion: version("2028-01-01") }),
                    /"2028-01-01" is later than the newest version "2027-10-01"/
                );
                const later = await kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-10-01") });
                assert.deepStrictEqual(surfaces(later), ["令和", "元年"]);
            });
        });
        it("rejects a value that is not a date", async function () {
            await withTestDictionary(async () => {
                const values: unknown[] = ["latest", "2027-4-1", "20270401", " 2027-04-01", 20270401, null, ""];
                for (const value of values) {
                    await assert.rejects(
                        kuromojin.tokenize("令和元年", { dictionaryVersion: value as DictionaryVersion }),
                        /must be a date written as YYYY-MM-DD/,
                        String(value)
                    );
                    await assert.rejects(
                        kuromojin.getTokenizer({ dictionaryVersion: value as DictionaryVersion }),
                        /must be a date written as YYYY-MM-DD/
                    );
                }
            });
        });
        it("has a type with the dates of the versions of the dictionary of the package", function () {
            const base: getTokenizerOption = { dictionaryVersion: "2007-08-01" };
            // @ts-expect-error the dictionary of the package has no version with this date
            const between: getTokenizerOption = { dictionaryVersion: "2007-08-02" };
            // @ts-expect-error
            const word: getTokenizerOption = { dictionaryVersion: "latest" };
            assert.deepStrictEqual(
                [base, between, word].map((option) => typeof option.dictionaryVersion),
                ["string", "string", "string"]
            );
        });
        it("rejects a date that is not the date of a version, and names the versions", async function () {
            await withTestDictionary(async () => {
                // a date between two versions, a date before the base dictionary, and a date that no calendar has
                for (const date of ["2027-06-15", "2007-07-31", "2027-02-30"]) {
                    const expected = {
                        message: `dictionaryVersion "${date}" is not a version of the loaded dictionary. Its versions are "2007-08-01", "2027-04-01", "2027-10-01".`
                    };
                    await assert.rejects(
                        kuromojin.tokenize("令和元年", { dictionaryVersion: version(date) }),
                        expected
                    );
                    await assert.rejects(kuromojin.getTokenizer({ dictionaryVersion: version(date) }), expected);
                }
                // the error does not affect the versions of the dictionary
                const tokens = await kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-04-01") });
                assert.deepStrictEqual(surfaces(tokens), ["令和", "元年"]);
            });
        });
        it("rejects a version with a dictionary of kuromoji.js, and a call without a version resolves", async function () {
            await withSettings({ env: kuromojiDictionaryDirectory }, async () => {
                await assert.rejects(
                    kuromojin.tokenize("令和元年", { dictionaryVersion: version("2027-04-01") }),
                    /a dictionary of kuromoji\.js has no versions/
                );
                assert.deepStrictEqual(surfaces(await kuromojin.tokenize("令和元年")), ["令", "和", "元年"]);
            });
        });
    });

    context("changes of a version", function () {
        it("removes an entry of the base dictionary, adds an entry, and removes the added entry", async function () {
            const base = await withTestDictionary(() => kuromojin.tokenize("仕様について書く"));
            const entry = base.find((token) => token.surface_form === "について");
            assert.ok(entry);
            const [number] = baseEntriesOf("について").map((baseEntry) => baseEntry.number);
            assert.strictEqual(entry.word_id, number * 10);
            const file = writeTestDictionary("remove.dict", [
                { date: "2027-04-01", added: [], removed: [number] },
                { date: "2027-10-01", added: [{ ...baseEntriesOf("について")[0], reading: "ニツキ" }], removed: [] },
                // the number of the first added entry is the number of entries of the base dictionary
                { date: "2028-04-01", added: [], removed: [392126] }
            ]);
            await withSettings({ env: file }, async () => {
                const fresh = freshKuromojin();
                const removed = await fresh.tokenize("仕様について書く", { dictionaryVersion: version("2027-04-01") });
                assert.deepStrictEqual(surfaces(removed), ["仕様", "に", "つい", "て", "書く"]);
                // a changed word is a removed entry and an added entry
                const changed = await fresh.tokenize("仕様について書く", { dictionaryVersion: version("2027-10-01") });
                assert.deepStrictEqual(surfaces(changed), surfaces(base));
                assert.deepStrictEqual(changed[1], { ...entry, word_id: 3921260, reading: "ニツキ" });
                const removedAgain = await fresh.tokenize("仕様について書く", {
                    dictionaryVersion: version("2028-04-01")
                });
                assert.deepStrictEqual(removedAgain, removed);
                assert.deepStrictEqual(await fresh.tokenize("仕様について書く"), base);
            });
        });
        it("adds an entry after the entries of the base dictionary for the same word", async function () {
            // an added entry with the same ids and cost as an entry of the base dictionary never wins against it
            const [entry] = baseEntriesOf("黒文字");
            const file = writeTestDictionary("same-word.dict", [
                { date: "2027-04-01", added: [{ ...entry, reading: "コクモジ" }], removed: [] },
                {
                    date: "2027-10-01",
                    added: [{ ...entry, word_cost: entry.word_cost - 1, reading: "クロモンジ" }],
                    removed: []
                }
            ]);
            await withSettings({ env: file }, async () => {
                const fresh = freshKuromojin();
                const [same] = await fresh.tokenize("黒文字", { dictionaryVersion: version("2027-04-01") });
                assert.strictEqual(same.reading, "クロモジ");
                const [cheaper] = await fresh.tokenize("黒文字", { dictionaryVersion: version("2027-10-01") });
                assert.strictEqual(cheaper.reading, "クロモンジ");
            });
        });
        it("makes an unknown word when every entry of the only word at a position is removed", async function () {
            const entries = baseEntriesOf("鱚");
            assert.ok(entries.length > 0);
            const file = writeTestDictionary("unknown.dict", [
                { date: "2027-04-01", added: [], removed: entries.map((entry) => entry.number) }
            ]);
            await withSettings({ env: file }, async () => {
                const fresh = freshKuromojin();
                const [base] = await fresh.tokenize("鱚");
                assert.strictEqual(base.word_type, "KNOWN");
                const tokens = await fresh.tokenize("鱚", { dictionaryVersion: version("2027-04-01") });
                assert.strictEqual(tokens.length, 1);
                assert.strictEqual(tokens[0].surface_form, "鱚");
                assert.strictEqual(tokens[0].word_type, "UNKNOWN");
            });
        });
        it("adds a word with a character outside the Basic Multilingual Plane", async function () {
            const file = writeTestDictionary("emoji.dict", [
                {
                    date: "2027-04-01",
                    added: [{ ...baseEntriesOf("寿司")[0], surface_form: "🍣", basic_form: "🍣" }],
                    removed: []
                }
            ]);
            await withSettings({ env: file }, async () => {
                const fresh = freshKuromojin();
                const tokens = await fresh.tokenize("🍣を食べる", { dictionaryVersion: version("2027-04-01") });
                assert.deepStrictEqual(surfaces(tokens), ["🍣", "を", "食べる"]);
                assert.strictEqual(tokens[0].word_type, "KNOWN");
                assert.deepStrictEqual(
                    tokens.map((token) => token.word_position),
                    [1, 2, 3]
                );
            });
        });
    });
});
