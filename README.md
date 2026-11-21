# kuromojin [![Actions Status: test](https://github.com/azu/kuromojin/workflows/test/badge.svg)](https://github.com/azu/kuromojin/actions?query=workflow%3A"test")

Japanese morphological analyzer for JavaScript, used mainly by [textlint](https://github.com/textlint/textlint) rules.

kuromojin returns the same tokens as [kuromoji.js](https://github.com/takuyaa/kuromoji.js "kuromoji.js") 0.1.2 with its IPADIC dictionary.
It has its own analyzer and its own dictionary file, so it does not depend on kuromoji.js.

## Features

- One call returns the tokens: `tokenize(text)` returns a `Promise` of the tokens
- Works in Node.js and in browsers
- Shares the work between callers in the same process, such as the textlint rules of one run
    - Loads the dictionary once
    - Analyzes a text once, and returns the same tokens for the same text
- One dictionary file in the package
    - It also loads a dictionary of kuromoji.js
- [Dictionary versions](#dictionary-versions): the dictionary gets new words without changing the tokens of a caller that did not ask for them

## Installation

    npm install kuromojin

## Online Playground

- <https://kuromojin.netlify.app/>

## Usage

Use `tokenize(text)`. It loads the dictionary on the first call, and resolves with the tokens of the text.

```js
import { tokenize } from "kuromojin";

const tokens = await tokenize("黒文字");
console.log(tokens);
/*
[ {
    word_id: 1084020,
    word_type: 'KNOWN',
    word_position: 1,
    surface_form: '黒文字',
    pos: '名詞',
    pos_detail_1: '一般',
    pos_detail_2: '*',
    pos_detail_3: '*',
    conjugated_type: '*',
    conjugated_form: '*',
    basic_form: '黒文字',
    reading: 'クロモジ',
    pronunciation: 'クロモジ'
} ]
*/
```

## API

### `tokenize(text, options?): Promise<Readonly<Readonly<KuromojiToken>[]>>`

Returns a `Promise` that is resolved with the tokens of the text.
It analyzes the whole text as one piece.

```js
import { tokenize } from "kuromojin";

const tokens = await tokenize("すもももももももものうち");
const nouns = tokens.filter((token) => token.pos === "名詞");
```

This is the function to use, also in textlint rules. kuromojin has one more function, `getTokenizer`, for the rare code that can not use a `Promise` at each text.

<details>
<summary><code>getTokenizer(options?)</code>: analyze without a <code>Promise</code> for each text</summary>

`getTokenizer(options?): Promise<Tokenizer>` returns a `Promise` that is resolved with a tokenizer after the dictionary is loaded.
The functions of the tokenizer are synchronous.

Use it only when the code that needs the tokens can not `await`, for example a synchronous callback. Wait for the tokenizer once before it, and call the tokenizer in it.
It gives the same tokens as `tokenize(text)`, and it is not faster: once the dictionary is loaded, `tokenize(text)` does not load anything again.

```js
import { getTokenizer } from "kuromojin";

const tokenizer = await getTokenizer();
const nounCounts = sentences.map((sentence) => {
    // a synchronous callback: no `await` here
    const tokens = tokenizer.tokenizeForSentence(sentence);
    return tokens.filter((token) => token.pos === "名詞").length;
});
```

The tokenizer has two functions and nothing else.

| Function | Status | What it does |
| --- | --- | --- |
| `tokenizer.tokenizeForSentence(text)` | Use this | Analyzes the whole text as one piece. It returns the same array as `tokenize(text)` of kuromojin, because the two share the remembered tokens. |
| `tokenizer.tokenize(text)` | **Deprecated** | Splits the text after each `、` and `。`, analyzes each piece, and returns the tokens of all pieces. `word_position` still counts from the start of the text. |

#### Deprecated: `tokenizer.tokenize(text)`

`tokenizer.tokenize(text)` exists only for compatibility with `tokenize` of the tokenizer of kuromoji.js. Do not use it in new code.

- **Why:** Its tokens differ from the tokens of `tokenize(text)` of kuromojin for some texts, because of the split. Rules are written against the tokens of the whole text.
- **The name is a trap:** `tokenize` of kuromojin is the same as `tokenizeForSentence` of the tokenizer, not as `tokenize` of the tokenizer.
- **What to use:** `tokenizer.tokenizeForSentence(text)`, or `await tokenize(text)`.

```diff
- const tokens = tokenizer.tokenize(text);
+ const tokens = tokenizer.tokenizeForSentence(text);
```

For example, the two functions give different tokens for `なぜなら` in this text.

```js
const text = "あります。なぜならJavaScriptは";
tokenizer.tokenizeForSentence(text); // あり, ます, 。, なぜ, なら, JavaScript, は
tokenizer.tokenize(text); // あり, ます, 。, なぜなら, JavaScript, は
```

`getTokenizer` takes the same options as `tokenize`. With `noCacheTokenize: true`, it resolves with a tokenizer that analyzes every text again.
`tokenizer.tokenize(text)` remembers its tokens apart from the ones of `tokenize(text)`, because its tokens differ.

</details>

### Options

- `dicPath?: string`: the [dictionary path](#dictionary). It is used only by the call that starts loading the dictionary.
- `dictionaryVersion?: DictionaryVersion`: the [dictionary version](#dictionary-versions) of the call, as a date written as `YYYY-MM-DD`. The type `DictionaryVersion` is the union of the dates of the versions.
- `noCacheTokenize?: boolean`: turns off the [reuse of tokens](#returned-tokens-are-shared-and-read-only). `tokenize()` analyzes the text again and does not remember the tokens. Default: `false`

### Token

A token is one word of the text, with what the dictionary says about it.
`tokenize("黒文字を買った")` resolves with four tokens: `黒文字`, `を`, `買っ`, and `た`. This is the token of `買っ`.

```json
{
    "word_id": 3262940,
    "word_type": "KNOWN",
    "word_position": 5,
    "surface_form": "買っ",
    "pos": "動詞",
    "pos_detail_1": "自立",
    "pos_detail_2": "*",
    "pos_detail_3": "*",
    "conjugated_type": "五段・ワ行促音便",
    "conjugated_form": "連用タ接続",
    "basic_form": "買う",
    "reading": "カッ",
    "pronunciation": "カッ"
}
```

To see the tokens of any text, type it in the [online playground](https://kuromojin.netlify.app/#%E9%BB%92%E6%96%87%E5%AD%97%E3%82%92%E8%B2%B7%E3%81%A3%E3%81%9F). It is the quickest way to find which values a word gets before you write a condition on them.

#### Fields

| Field | Meaning | Example (`買っ`) |
| --- | --- | --- |
| `surface_form` | The word as written in the text (表層形) | `買っ` |
| `basic_form` | The base form (基本形). `*` for an unknown word | `買う` |
| `pos` | The [part of speech](#parts-of-speech) (品詞) | `動詞` |
| `pos_detail_1`, `pos_detail_2`, `pos_detail_3` | The subcategories of the part of speech (品詞細分類), from general to specific. `*` when there is none | `自立`, `*`, `*` |
| `conjugated_type` | The conjugation type (活用型). `*` when the word does not conjugate | `五段・ワ行促音便` |
| `conjugated_form` | The conjugation form (活用形). `*` when the word does not conjugate | `連用タ接続` |
| `reading` | The reading in katakana (読み). A token of an unknown word does not have this field | `カッ` |
| `pronunciation` | The pronunciation in katakana (発音). A token of an unknown word does not have this field | `カッ` |
| `word_position` | The position of the first character of the word in the text. The first character of the text is 1 | `5` |
| `word_type` | `KNOWN` for a word in the dictionary, `UNKNOWN` for an unknown word | `KNOWN` |
| `word_id` | The identifier of the word in the dictionary | `3262940` |

`word_position` counts characters, and a character outside the Basic Multilingual Plane, such as `𩸽` or an emoji, is one character.
So `word_position - 1` is the index in the JavaScript string only when no such character comes before the word.

A word that is not in the dictionary, such as `kuromojin` or `🍣`, is an unknown word: `word_type` is `UNKNOWN`, `basic_form` is `*`, and the token has no `reading` and no `pronunciation`. Its part of speech is a guess from the kind of its characters, mostly `名詞` or `記号`.

The TypeScript type of a token is `KuromojiToken`.

#### Parts of speech

The values are the ones of the IPADIC dictionary, in Japanese. `pos` is one of these 13 values, and `pos_detail_1` is one of the values in its row.

| `pos` | English | `pos_detail_1` | Example |
| --- | --- | --- | --- |
| `名詞` | Noun | `一般`, `固有名詞`, `サ変接続`, `形容動詞語幹`, `副詞可能`, `代名詞`, `数`, `接尾`, `非自立`, `ナイ形容詞語幹`, `接続詞的`, `動詞非自立的`, `特殊`, `引用文字列` | `辞書`, `東京`, `解析` |
| `動詞` | Verb | `自立`, `非自立`, `接尾` | `買う`, `いる` |
| `形容詞` | Adjective | `自立`, `非自立`, `接尾` | `速い` |
| `副詞` | Adverb | `一般`, `助詞類接続` | `とても` |
| `連体詞` | Adnominal | `*` | `この`, `大きな` |
| `接続詞` | Conjunction | `*` | `しかし` |
| `助詞` | Particle | `格助詞`, `係助詞`, `副助詞`, `接続助詞`, `終助詞`, `並立助詞`, `連体化`, `副詞化`, `特殊`, `副助詞／並立助詞／終助詞` | `を`, `は`, `の` |
| `助動詞` | Auxiliary verb | `*` | `た`, `です` |
| `接頭詞` | Prefix | `名詞接続`, `数接続`, `動詞接続`, `形容詞接続` | `第` |
| `感動詞` | Interjection | `*` | `はい` |
| `フィラー` | Filler | `*` | `えーと` |
| `記号` | Symbol | `一般`, `句点`, `読点`, `括弧開`, `括弧閉`, `空白`, `アルファベット` | `。`, `、`, `「` |
| `その他` | Other | `間投` | `ァ` |

`pos_detail_2` and `pos_detail_3` have a value mostly for proper nouns, for example `人名` and `姓` for a family name, or `地域` and `国` for a country.
`conjugated_type` has 58 values and `conjugated_form` has 28, so they are not listed here. Type a word in the [online playground](https://kuromojin.netlify.app/) to see its values.

### Returned tokens are shared and read-only

kuromojin remembers the tokens of the 1,000 most recently used texts, and returns the same array for the same text and the same dictionary version.
When many textlint rules ask for the tokens of the same sentence, the sentence is analyzed once.

All callers get the same array and the same objects, so do not change them. Their types are read-only for this reason.
Copy the array when you need to change it, for example `tokens.slice()` or `tokens.map((token) => ({ ...token }))`.

`noCacheTokenize: true` gives a new array on every call. It neither reads nor changes the remembered tokens.

```js
const tokens = await tokenize(text, { noCacheTokenize: true });
```

## Dictionary

In Node.js, kuromojin loads the dictionary of the package, `kuromojin/dict/kuromojin.dict`, and needs no setting.

The dictionary path tells kuromojin another dictionary. Its ending tells the format.

- A path or URL that ends with `.dict` is one file in the format of kuromojin.
- Any other path or URL is a directory with the twelve `*.dat.gz` files of a dictionary of kuromoji.js.

kuromojin decides the dictionary path when the first call starts loading. It uses the first of these that is set.

1. `dicPath` of the options of that call
2. The environment variable `KUROMOJIN_DIC_PATH`
3. `globalThis.kuromojin.dicPath`
4. The dictionary of the package (Node.js only)

The dictionary is loaded once, and every later call uses the loaded one.

### Browser

A browser needs the URL of a dictionary, and it needs [DecompressionStream](https://developer.mozilla.org/docs/Web/API/DecompressionStream).

With a bundler, let the bundler copy the dictionary of the package and give its URL. The URL has to keep the ending `.dict`.

[Vite](https://vite.dev/): import the file with `?url`. The [online playground](web/index.ts) is built in this way.

```js
import { tokenize } from "kuromojin";
import dictionaryUrl from "kuromojin/dict/kuromojin.dict?url";

const tokens = await tokenize(text, { dicPath: dictionaryUrl });
```

[webpack](https://webpack.js.org/): handle `.dict` files as [asset modules](https://webpack.js.org/guides/asset-modules/).

```js
// webpack.config.js
module.exports = {
    module: {
        rules: [{ test: /\.dict$/, type: "asset/resource" }]
    }
};
```

```js
import { tokenize } from "kuromojin";
import dictionaryUrl from "kuromojin/dict/kuromojin.dict";

const tokens = await tokenize(text, { dicPath: dictionaryUrl });
```

Without a bundler, give the URL of the file on a CDN that serves the files of npm packages, such as [jsDelivr](https://www.jsdelivr.com/).
Replace `<version>` with the exact version of kuromojin that your page uses, 3.1.0 or later: the dictionary is in the package since 3.1.0. The file of a version never changes, so the tokens do not change until you change the URL.

```js
import { tokenize } from "kuromojin";

const tokens = await tokenize(text, {
    dicPath: "https://cdn.jsdelivr.net/npm/kuromojin@<version>/dict/kuromojin.dict"
});
```

`globalThis.kuromojin.dicPath` sets the dictionary path for every module that uses kuromojin in the page, such as textlint rules.

```js
import { getTokenizer } from "kuromojin";
// Affects all modules that use kuromojin.
globalThis.kuromojin = {
    dicPath: "https://cdn.jsdelivr.net/npm/kuromojin@<version>/dict/kuromojin.dict"
};
// this `tokenize` loads the dictionary of `globalThis.kuromojin.dicPath`
const tokens = await tokenize(text);
```

For compatibility, a URL of the `dict` directory of kuromoji.js also works as the dictionary path, as described under [Dictionary](#dictionary). The dictionary of kuromojin gives the same tokens with a smaller download.

:memo: `https://kuromojin.netlify.app/dict/kuromojin.dict` and `https://kuromojin.netlify.app/dict` still work for the pages that already load them.
Do not use them in a new page: the website of kuromojin is not a CDN, and its dictionary changes when the website is built from a newer kuromojin.

## Dictionary versions

The words of the dictionary change in dictionary versions. A dictionary version is the dictionary as of a date.

- A call with `dictionaryVersion` names a version by its date, and gets the dictionary with the changes of every version up to that one.
- A call without `dictionaryVersion` gets the default dictionary, which does not change within a major version of kuromojin.

So an update of kuromojin does not change the tokens of your code, and you choose when your code gets newer words.

```js
import { tokenize } from "kuromojin";

const tokens = await tokenize(text, { dictionaryVersion: "2007-08-01" });
```

[dict/DICTIONARY_VERSIONS.md](dict/DICTIONARY_VERSIONS.md) lists the versions and their changes.

- The type `DictionaryVersion` has the dates of the versions of the dictionary of the package, so TypeScript takes only these dates.
- A date that is not the date of a version is rejected, also when it is between the dates of two versions.
- A date later than the newest version of the installed kuromojin is rejected, because the installed kuromojin does not have the words that the caller expects.
- `dictionaryVersion` is rejected with a dictionary of kuromoji.js, which has no versions.
- Callers with different versions share one loaded dictionary.

## Compatibility with kuromoji.js

kuromojin returns the tokens of kuromoji.js 0.1.2 for the same text and the same dictionary, with these differences.

- A text with a character outside the Basic Multilingual Plane, such as `𩸽` or an emoji: kuromoji.js loses characters after such a character. kuromojin keeps every character of the text in a token.
- The tokenizer of `getTokenizer()` has only `tokenize` and `tokenizeForSentence`, not the other members of the tokenizer of kuromoji.js.

### Why kuromojin has its own analyzer

Up to 3.0, kuromojin was a wrapper of kuromoji.js. Since 3.1.0, it analyzes with its own analyzer and its own dictionary file, because the analysis was the largest cost of a textlint run with Japanese rules.
The tokens stay the same, and these get smaller. The numbers are rough directions from the measurement of [#27](https://github.com/azu/kuromojin/pull/27), not promises.

| | Compared with kuromojin 3.0 (kuromoji.js 0.1.2) |
| --- | --- |
| Time of the analysis of a text | 90%+ less |
| Time of the load of the dictionary | 70%+ less |
| Memory after the load | 70%+ less |
| Installed size with dependencies | 85%+ less (about 48 MB to about 5 MB) |
| Time of a textlint run with [textlint-rule-preset-ja-technical-writing](https://github.com/textlint-ja/textlint-rule-preset-ja-technical-writing) | 60%+ less |

`yarn run compare` measures these for a change, and CI runs it for each pull request, so that kuromojin does not get slower again.

### Moving from kuromoji.js

Code that moves from kuromoji.js to kuromojin replaces the functions in this way.

| kuromoji.js | kuromojin |
| --- | --- |
| `kuromoji.builder({ dicPath }).build(callback)` | Nothing: `tokenize` of kuromojin loads the dictionary. `await getTokenizer({ dicPath })` when the code needs the tokenizer |
| `tokenizer.tokenizeForSentence(text)` | `await tokenize(text)` or `tokenizer.tokenizeForSentence(text)` |
| `tokenizer.tokenize(text)` | `tokenizer.tokenize(text)` (deprecated) |

kuromojin has no default export. Import the functions by name: `import { tokenize } from "kuromojin"`.

## Troubleshooting: use one copy of kuromojin

kuromojin shares the loaded dictionary and the remembered tokens only inside one installed copy of kuromojin.
If your `node_modules` contains several copies of kuromojin, each copy loads its own dictionary and analyzes the same text again, so a textlint run takes more time and more memory.
An older copy is also slower by itself, because kuromojin 3.0 and earlier analyze with kuromoji.js.

Check which copies are installed. One version in the output without nested copies is the goal.

```sh
npm ls kuromojin --all
```

Several copies come from textlint rules that depend on different versions of kuromojin.
For example, when one old rule depends on `kuromojin@^2` and the other rules depend on `kuromojin@^3`, npm can not merge the two major versions, and each `^3` rule can get its own nested copy.

### Solution 1: update kuromojin and your rules

Update kuromojin to the latest version, and update the textlint rules so that all of them depend on `kuromojin@^3`.
npm then installs a single copy.

```sh
npm update kuromojin
npm dedupe
```

### Solution 2: use `overrides`

If a rule can not be updated, force a single version with [`overrides`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides) in your `package.json`.

```json
{
  "overrides": {
    "kuromojin": "^3.1.0"
  }
}
```

Run `npm install` again and check `npm ls kuromojin --all`.

- Yarn: use [`resolutions`](https://yarnpkg.com/configuration/manifest#resolutions)
- pnpm: use [`pnpm.overrides`](https://pnpm.io/package_json#pnpmoverrides)

An override changes the tokens that a rule for `kuromojin@^2` gets in a few texts: kuromojin 3 returns the tokens of kuromoji.js 0.1.2, which analyzes some unknown words differently from kuromoji.js 0.1.1 of kuromojin 2 ([takuyaa/kuromoji.js#37](https://github.com/takuyaa/kuromoji.js/issues/37)).
The words of the dictionary are the same.

## Related

- [azu/morpheme-match: match function that match token(形態素解析) with sentence.](https://github.com/azu/morpheme-match/tree/master)

## Development

    yarn install
    yarn test

- `yarn run build:dict` converts the dictionary of kuromoji.js 0.1.2 and the changes of `dict-source/versions.csv` into `dict/kuromojin.dict`.
- `yarn run profile` measures the working tree on fixed sets of texts: the load of the dictionary, the analysis, the memory, the allocation, the installed size, and the functions with the most CPU time. `yarn run compare` measures `master` too and prints each number with its ratio and the texts whose tokens differ. CI runs the comparison for each pull request and puts it in the job summary.
- The specifications are in [docs/products/kuromojin](docs/products/kuromojin/product.md).

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## License

kuromojin is licensed under the MIT License. See [LICENSE](LICENSE).

The package includes parts that are derived from other works.

- **Analyzer:** Some files of `src/analyzer` are derived from [kuromoji.js](https://github.com/takuyaa/kuromoji.js) (Apache License 2.0) and [doublearray](https://github.com/takuyaa/doublearray) (MIT License). [src/analyzer/NOTICE.md](src/analyzer/NOTICE.md) names the files and the changes, and [src/analyzer/LICENSE-2.0.txt](src/analyzer/LICENSE-2.0.txt) is the text of the Apache License 2.0.
- **Dictionary:** `dict/kuromojin.dict` is converted from the dictionary of kuromoji.js, which is built from mecab-ipadic-2.7.0-20070801. [dict/NOTICE.md](dict/NOTICE.md) has its copyright notice and conditions.
