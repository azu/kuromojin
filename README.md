# kuromojin [![Actions Status: test](https://github.com/azu/kuromojin/workflows/test/badge.svg)](https://github.com/azu/kuromojin/actions?query=workflow%3A"test")

Japanese morphological analyzer for JavaScript, used mainly by [textlint](https://github.com/textlint/textlint) rules.

kuromojin returns the same tokens as [kuromoji.js](https://github.com/takuyaa/kuromoji.js "kuromoji.js") 0.1.2 with its IPADIC dictionary.
It has its own analyzer and its own dictionary file, so it does not depend on kuromoji.js.

## Features

- Promise based API
- Works in Node.js and in browsers
- Cache Layer
    - Loads the dictionary once
    - Returns the same tokens for the same text
- One dictionary file in the package
    - It also loads a dictionary of kuromoji.js
- [Dictionary versions](#dictionary-versions): the dictionary gets new words without changing the tokens of a caller that did not ask for them

## Installation

    npm install kuromojin

## Online Playground

- <https://kuromojin.netlify.app/>

## Usage

kuromojin exports two functions.

- `tokenize(text, options?)` returns a `Promise` that is resolved with the tokens of the text.
- `getTokenizer(options?)` returns a `Promise` that is resolved with a tokenizer.
    - `tokenizer.tokenizeForSentence(text)` analyzes the whole text as one piece.
    - `tokenizer.tokenize(text)` splits the text after each `、` and `。`, analyzes each piece, and returns the tokens of all pieces.

The array and the objects that `tokenize()` and the tokenizer return are read-only, because the same array is returned for the same text.
`tokenizer.tokenizeForSentence(text)` shares the remembered tokens with `tokenize(text)`.
`getTokenizer({ noCacheTokenize: true })` resolves with a tokenizer that analyzes every text again and returns a new array.

```js
import { tokenize, getTokenizer } from "kuromojin";

getTokenizer().then((tokenizer) => {
    const tokens = tokenizer.tokenizeForSentence(text);
});

tokenize(text).then((tokens) => {
    console.log(tokens);
    /*
    [ {
        word_id: 1084020,         // 辞書内での単語ID
        word_type: 'KNOWN',       // 単語タイプ(辞書に登録されている単語ならKNOWN, 未知語ならUNKNOWN)
        word_position: 1,         // 単語の開始位置
        surface_form: '黒文字',    // 表層形
        pos: '名詞',               // 品詞
        pos_detail_1: '一般',      // 品詞細分類1
        pos_detail_2: '*',        // 品詞細分類2
        pos_detail_3: '*',        // 品詞細分類3
        conjugated_type: '*',     // 活用型
        conjugated_form: '*',     // 活用形
        basic_form: '黒文字',      // 基本形
        reading: 'クロモジ',       // 読み
        pronunciation: 'クロモジ'  // 発音
      } ]
    */
});
```

### Options

- `dicPath?: string`: the [dictionary path](#dictionary). It is used only by the call that starts loading the dictionary.
- `dictionaryVersion?: DictionaryVersion`: the [dictionary version](#dictionary-versions) of the call, as a date written as `YYYY-MM-DD`. The type `DictionaryVersion` is the union of the dates of the versions.
- `noCacheTokenize?: boolean`: `tokenize()` analyzes the text again and does not remember the tokens, and `getTokenizer()` resolves with a tokenizer that analyzes every text again. Default: `false`

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
import { getTokenizer } from "kuromojin";
import dictionaryUrl from "kuromojin/dict/kuromojin.dict?url";

const tokenizer = await getTokenizer({ dicPath: dictionaryUrl });
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
import { getTokenizer } from "kuromojin";
import dictionaryUrl from "kuromojin/dict/kuromojin.dict";

const tokenizer = await getTokenizer({ dicPath: dictionaryUrl });
```

`globalThis.kuromojin.dicPath` sets the dictionary path for every module that uses kuromojin in the page, such as textlint rules.

```js
import { getTokenizer } from "kuromojin";
// Affects all modules that use kuromojin.
globalThis.kuromojin = {
    dicPath: "https://kuromojin.netlify.app/dict/kuromojin.dict"
};
// this `getTokenizer` loads "https://kuromojin.netlify.app/dict/kuromojin.dict"
getTokenizer();
```

:memo: Dictionary URLs for trials

The website of kuromojin serves these files to pages of any origin.
They are for trials: they change when the website is built from a newer kuromojin, so serve the dictionary from your own site in production.

- `https://kuromojin.netlify.app/dict/kuromojin.dict`
    - the dictionary of kuromojin
- `https://kuromojin.netlify.app/dict`
    - the dictionary of kuromoji.js 0.1.2
    - example: https://kuromojin.netlify.app/dict/base.dat.gz

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
- The tokenizer of `getTokenizer()` has only `tokenize` and `tokenizeForSentence`.

### Note: backward compatibility for <= 1.1.0

kuromojin v1.1.0 export `tokenize` as default function.

kuromojin v2.0.0 remove the default function.

```js
import kuromojin from "kuromojin";
// kuromojin === tokenize
```

Recommended: use `import {tokenize} from "kuromojin"` instead of it

```js
import {tokenize} from "kuromojin";
```

## FAQ: textlint is slow / kuromoji dictionary is loaded many times

kuromojin keeps the loaded dictionary and the tokenize cache per installed copy of kuromojin.
If your `node_modules` contains multiple copies of kuromojin, each copy loads the dictionary and tokenizes the same text again.

Check how many copies are installed:

```sh
npm ls kuromojin --all
```

This often happens when one old rule depends on an older major version of kuromojin (for example `kuromojin@^2`) and the other rules depend on `kuromojin@^3`.
npm can not merge different major versions, so each `^3` rule gets its own nested copy.

### Solution 1: update your rules

Update the textlint rules to the latest version so that all of them depend on `kuromojin@^3`.
npm then installs a single copy.

### Solution 2: use `overrides`

If some rules can not be updated, force a single version with [`overrides`](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides) in your `package.json`:

```json
{
  "overrides": {
    "kuromojin": "^3.0.1"
  }
}
```

Run `npm install` again and check `npm ls kuromojin --all`.

- Yarn: use [`resolutions`](https://yarnpkg.com/configuration/manifest#resolutions)
- pnpm: use [`pnpm.overrides`](https://pnpm.io/package_json#pnpmoverrides)

Note: kuromojin 3 returns the tokens of kuromoji@0.1.2, which tokenizes some unknown words differently from kuromoji@0.1.1 used by kuromojin 2 ([takuyaa/kuromoji.js#37](https://github.com/takuyaa/kuromoji.js/issues/37)).
The dictionary is the same.

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
