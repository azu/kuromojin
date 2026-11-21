// LICENSE : MIT
import assert from "node:assert";
import { describe, it } from "vitest";
import { getTokenizer, tokenize } from "../src";

// The scenarios of docs/products/kuromojin/features/tokenization/requirements.md
describe("tokenize", function () {
    it("returns each word as a token with its fields", async function () {
        const tokens = await tokenize("黒文字");
        assert.deepStrictEqual(tokens, [
            {
                word_id: 1084020,
                word_type: "KNOWN",
                word_position: 1,
                surface_form: "黒文字",
                pos: "名詞",
                pos_detail_1: "一般",
                pos_detail_2: "*",
                pos_detail_3: "*",
                conjugated_type: "*",
                conjugated_form: "*",
                basic_form: "黒文字",
                reading: "クロモジ",
                pronunciation: "クロモジ"
            }
        ]);
    });
    it("counts positions from the start of the text when the text has several sentences", async function () {
        const tokens = await tokenize("これは1文。これは2文。");
        assert.strictEqual(tokens[0].word_position, 1);
        assert.strictEqual(tokens[tokens.length - 1].surface_form, "。");
        assert.strictEqual(tokens[tokens.length - 1].word_position, 12);
    });
    it("returns a word that is not in the dictionary as a token of an unknown word", async function () {
        const [first] = await tokenize("Fooをする");
        assert.strictEqual(first.surface_form, "Foo");
        assert.strictEqual(first.word_type, "UNKNOWN");
        assert.strictEqual(first.pos, "名詞");
        assert.strictEqual(first.basic_form, "*");
        assert.ok(!("reading" in first));
        assert.ok(!("pronunciation" in first));
    });
    it("returns no tokens for an empty text", async function () {
        assert.deepStrictEqual(await tokenize(""), []);
    });
    it("puts every character outside the Basic Multilingual Plane into a token", async function () {
        // kuromoji.js loses "を食" here: it counts an unknown word by its UTF-16 length in a lattice of characters
        const tokens = await tokenize("𩸽𩸽を食べた");
        assert.deepStrictEqual(
            tokens.map((token) => token.surface_form),
            ["𩸽𩸽", "を", "食べ", "た"]
        );
        assert.deepStrictEqual(
            tokens.map((token) => token.word_position),
            [1, 3, 4, 6]
        );
    });
    it("returns a NUL character as an unknown word", async function () {
        const tokens = await tokenize("a\u0000b");
        assert.strictEqual(tokens.length, 3);
        assert.strictEqual(tokens[1].surface_form, "\u0000");
        assert.strictEqual(tokens[1].word_type, "UNKNOWN");
    });
    it("returns a surrogate without its pair as an unknown word", async function () {
        const tokens = await tokenize("あ\uD83Dい");
        assert.strictEqual(tokens.length, 3);
        assert.strictEqual(tokens[1].surface_form, "\uD83D");
        assert.strictEqual(tokens[1].word_type, "UNKNOWN");
    });
    it("returns tokens whose surface forms are the text when they are joined", async function () {
        const texts = [
            "すもももももももものうち",
            "吾輩は猫である。名前はまだ無い。",
            "🍣と🍺 を𠮷野家で\uDC00食べる\uD83D",
            " \t\n",
            "\u0000"
        ];
        for (const text of texts) {
            const tokens = await tokenize(text, { noCacheTokenize: true });
            assert.strictEqual(tokens.map((token) => token.surface_form).join(""), text);
        }
    });

    describe("reuse of tokens", function () {
        it("returns the same array when the same text is tokenized again", async function () {
            const first = await tokenize("同じテキストを二度解析する");
            const second = await tokenize("同じテキストを二度解析する");
            assert.strictEqual(first, second);
        });
        it("analyzes the text again with noCacheTokenize, and does not change the remembered tokens", async function () {
            const first = await tokenize("キャッシュを使わない解析");
            const second = await tokenize("キャッシュを使わない解析", { noCacheTokenize: true });
            assert.notStrictEqual(first, second);
            assert.deepStrictEqual(first, second);
            assert.strictEqual(await tokenize("キャッシュを使わない解析"), first);
        });
        it("remembers the tokens of the 1,000 most recently used texts", async function () {
            const first = await tokenize("最初のテキスト");
            for (let i = 0; i < 999; i++) await tokenize(`${i}番目のテキスト`);
            assert.strictEqual(await tokenize("最初のテキスト"), first);
            for (let i = 0; i < 1000; i++) await tokenize(`${i}番目の別のテキスト`);
            const again = await tokenize("最初のテキスト");
            assert.notStrictEqual(again, first);
            assert.deepStrictEqual(again, first);
        });
    });
});

describe("getTokenizer", function () {
    it("resolves with the same tokenizer for many calls at the same time", async function () {
        const tokenizers = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => getTokenizer()));
        tokenizers.forEach((tokenizer) => assert.strictEqual(tokenizer, tokenizers[0]));
    });
    it("resolves with a tokenizer that has only tokenize and tokenizeForSentence", async function () {
        const tokenizer = await getTokenizer();
        assert.deepStrictEqual(Object.keys(tokenizer).sort(), ["tokenize", "tokenizeForSentence"]);
    });
    it("tokenizeForSentence returns the tokens of tokenize, and the same array for the same text", async function () {
        const tokenizer = await getTokenizer();
        const first = tokenizer.tokenizeForSentence("黒文字");
        assert.deepStrictEqual(first, await tokenize("黒文字"));
        assert.strictEqual(tokenizer.tokenizeForSentence("黒文字"), first);
    });
    it("tokenizeForSentence shares the remembered tokens with tokenize", async function () {
        const tokenizer = await getTokenizer();
        const text = "トークナイザーのキャッシュを共有する文";
        const remembered = await tokenize(text);
        assert.strictEqual(tokenizer.tokenizeForSentence(text), remembered);
        const other = "トークナイザーが先に解析する文";
        assert.strictEqual(await tokenize(other), tokenizer.tokenizeForSentence(other));
    });
    it("tokenize of the tokenizer remembers its own tokens, apart from tokenizeForSentence", async function () {
        const tokenizer = await getTokenizer();
        const text = "句読点で区切る、キャッシュのある文。";
        const first = tokenizer.tokenize(text);
        assert.strictEqual(tokenizer.tokenize(text), first);
        assert.notStrictEqual(tokenizer.tokenizeForSentence(text), first);
    });
    it("resolves with a tokenizer that analyzes every text again with noCacheTokenize", async function () {
        const tokenizer = await getTokenizer({ noCacheTokenize: true });
        assert.notStrictEqual(tokenizer, await getTokenizer());
        assert.strictEqual(await getTokenizer({ noCacheTokenize: true }), tokenizer);
        const text = "キャッシュを使わないトークナイザー";
        const remembered = await tokenize(text);
        const first = tokenizer.tokenizeForSentence(text);
        assert.notStrictEqual(first, remembered);
        assert.deepStrictEqual(first, remembered);
        assert.notStrictEqual(tokenizer.tokenizeForSentence(text), first);
        assert.notStrictEqual(tokenizer.tokenize(text), tokenizer.tokenize(text));
        // the remembered tokens are not changed
        assert.strictEqual(await tokenize(text), remembered);
    });
    it("returns the same tokens before and after a text that needs a large table of candidates", async function () {
        const tokenizer = await getTokenizer();
        const sentence = "吾輩は猫である。名前はまだ無い。";
        const before = tokenizer.tokenizeForSentence(sentence);
        const long = sentence.repeat(20000);
        const tokens = tokenizer.tokenizeForSentence(long);
        assert.strictEqual(tokens.length, before.length * 20000);
        assert.strictEqual(tokens.map((token) => token.surface_form).join(""), long);
        // long texts in a row use the same large table
        assert.deepStrictEqual(tokenizer.tokenizeForSentence(long), tokens);
        // the large table is released after 100 analyses in a row that did not need it
        for (let i = 0; i < 150; i++) {
            assert.deepStrictEqual(tokenizer.tokenizeForSentence(sentence), before);
        }
        assert.deepStrictEqual(tokenizer.tokenizeForSentence(long), tokens);
    });
    it("tokenize of the tokenizer splits the text after 、 and 。 and continues the positions", async function () {
        const tokenizer = await getTokenizer();
        const tokens = tokenizer.tokenize("これは1文。これは2文。");
        assert.deepStrictEqual(
            tokens.map((token) => [token.surface_form, token.word_position]),
            [
                ["これ", 1],
                ["は", 3],
                ["1", 4],
                ["文", 5],
                ["。", 6],
                ["これ", 7],
                ["は", 9],
                ["2", 10],
                ["文", 11],
                ["。", 12]
            ]
        );
        assert.deepStrictEqual(tokenizer.tokenize(""), []);
    });
});
