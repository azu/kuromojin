// LICENSE : MIT
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { Analyzer, splitByPunctuation } from "../src/analyzer/Analyzer";
import { createDefaultView, DictionaryView } from "../src/analyzer/DictionaryVersions";
import { loadDictionary } from "../src/analyzer/loader/loadDictionary";
import type { Token } from "../src/analyzer/Token";
import {
    baseEntriesOf,
    baseWordsAtEvery,
    kuromojiDictionaryDirectory,
    packageDictionaryFile,
    writeTestDictionary
} from "./helpers";

// kuromoji.js has no type definitions
// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuromoji = require("kuromoji");
type Reference = { tokenize(text: string): Token[]; tokenizeForSentence(text: string): Token[] };

/** Japanese texts of real documents: the lines of the Japanese specifications of this repository */
const documentLines = (): string[] => {
    const lines = new Set<string>();
    const walk = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith(".ja.md")) {
                for (const line of fs.readFileSync(file, "utf8").split("\n")) {
                    // the reference loses characters of a text with a surrogate pair, which has tests of its own
                    if (line.trim() !== "" && !/[\uD800-\uDFFF]/.test(line)) lines.add(line);
                }
            }
        }
    };
    walk(path.join(__dirname, "..", "docs", "products"));
    return [...lines];
};

/** Texts for the parts of the analysis that documents rarely have */
const otherTexts = [
    "黒文字",
    "すもももももももものうち",
    "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。",
    "これは1文。これは2文。",
    "Fooをする",
    "ＡＢＣ　１２３、ｶﾀｶﾅ。",
    "2024年1月31日、午後3時45分に東京都千代田区で会議を行った。",
    "https://example.com/path?query=1#hash を開く",
    "    indent\tand\ttabs\n改行を含む\r\nテキスト",
    "、。、。",
    "。",
    " ",
    "　",
    "lone low surrogate \uDC00 in a text",
    "ーーー！！！？？？",
    "東京特許許可局局長今日急遽休暇許可拒否"
];

/** The reference test takes the word of every 20th entry of the dictionary */
const STEP = 20;

// The reference result is what kuromoji.js 0.1.2 returns with the same dictionary.
describe("reference result", function () {
    this.timeout(60000);
    let reference: Reference;
    const lines = documentLines();
    before(async function () {
        reference = await new Promise<Reference>((resolve, reject) => {
            kuromoji
                .builder({ dicPath: kuromojiDictionaryDirectory })
                .build((error: Error | null, tokenizer: Reference) => (error ? reject(error) : resolve(tokenizer)));
        });
    });

    /**
     * A dictionary with a later version that would change most results:
     * a cheaper entry for a common word, and a new word that is cheap and common in texts.
     * The default dictionary does not have the changes of later versions.
     */
    const withLaterVersion = (): string => {
        const [wo] = baseEntriesOf("を");
        const [noun] = baseEntriesOf("黒文字");
        return writeTestDictionary("reference.dict", [
            {
                date: "2027-04-01",
                added: [
                    { ...wo, word_cost: -30000, reading: "ウォ", pronunciation: "ウォ" },
                    { ...noun, surface_form: "は", basic_form: "は", word_cost: -30000 },
                    { ...noun, surface_form: "これは1", basic_form: "これは1", word_cost: -30000 }
                ],
                removed: [wo.number]
            }
        ]);
    };
    const formats: [string, () => string][] = [
        ["the dictionary of the package", () => packageDictionaryFile],
        ["a dictionary of kuromoji.js", () => kuromojiDictionaryDirectory],
        ["a dictionary of kuromojin with a later version", withLaterVersion]
    ];
    for (const [name, dictionaryPath] of formats) {
        context(`with ${name}`, function () {
            let analyzer: Analyzer;
            let view: DictionaryView;
            before(async function () {
                const dictionary = await loadDictionary(dictionaryPath());
                analyzer = new Analyzer(dictionary);
                view = createDefaultView(dictionary);
            });
            it("returns the same tokens as kuromoji.js for the lines of real documents", function () {
                assert.ok(lines.length > 500, `the documents have ${lines.length} lines`);
                for (const line of [...lines, ...otherTexts]) {
                    assert.deepStrictEqual(analyzer.analyze(line, [], view), reference.tokenizeForSentence(line), line);
                }
            });
            it("returns the same tokens as kuromoji.js for words from the whole dictionary", function () {
                // the reference loses characters of a text with a surrogate pair, which has tests of its own
                const words = baseWordsAtEvery(STEP).filter((word) => !/[\uD800-\uDFFF]/.test(word));
                assert.ok(words.length > 10000, `the dictionary gives ${words.length} words`);
                for (const word of words) {
                    assert.deepStrictEqual(analyzer.analyze(word, [], view), reference.tokenizeForSentence(word), word);
                }
                // texts of words that follow each other without a space, so that the costs between words decide
                for (let i = 0; i < words.length; i += 8) {
                    const text = words.slice(i, i + 8).join("");
                    assert.deepStrictEqual(analyzer.analyze(text, [], view), reference.tokenizeForSentence(text), text);
                }
            });
            it("returns the same tokens as kuromoji.js when the text is split after 、 and 。", function () {
                for (const line of [...lines.slice(0, 200), ...otherTexts]) {
                    const tokens: Token[] = [];
                    for (const sentence of splitByPunctuation(line)) analyzer.analyze(sentence, tokens, view);
                    assert.deepStrictEqual(tokens, reference.tokenize(line), line);
                }
            });
            it("keeps the characters that kuromoji.js loses after a surrogate pair", function () {
                const text = "𩸽𩸽を食べた";
                assert.notStrictEqual(
                    reference
                        .tokenizeForSentence(text)
                        .map((token) => token.surface_form)
                        .join(""),
                    text
                );
                assert.deepStrictEqual(
                    analyzer.analyze(text, [], view).map((token) => token.surface_form),
                    ["𩸽𩸽", "を", "食べ", "た"]
                );
            });
            it("returns U+0000 and a surrogate without its pair as unknown words", function () {
                for (const text of ["a\u0000b", "あ\uD83Dい", "\u0000", "\uD83D", "黒\u0000文字"]) {
                    const tokens = analyzer.analyze(text, [], view);
                    assert.strictEqual(tokens.map((token) => token.surface_form).join(""), text);
                    assert.ok(
                        tokens.some(
                            (token) => token.word_type === "UNKNOWN" && /[\u0000\uD83D]/.test(token.surface_form)
                        ),
                        JSON.stringify(text)
                    );
                }
            });
        });
    }
});
