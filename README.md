# kuromojin [![Actions Status: test](https://github.com/azu/kuromojin/workflows/test/badge.svg)](https://github.com/azu/kuromojin/actions?query=workflow%3A"test")

Provide a high level wrapper for [kuromoji.js](https://github.com/takuyaa/kuromoji.js "kuromoji.js").

## Features

- Promise based API
- Cache Layer
    - Fetch the dictionary at once
    - Return same tokens for same text

## Installation

    npm install kuromojin

## Online Playground

📝 Require [DecompressionStream](https://developer.mozilla.org/ja/docs/Web/API/DecompressionStream) supported browser

- <https://kuromojin.netlify.app/>

## Usage

Export two API.

- `getTokenizer()` return `Promise` that is resolved with kuromoji.js's `tokenizer` instance.
- `tokenize()` return `Promise` that is resolved with analyzed tokens. 
- The array and objects returned by `tokenize()` are read-only to ensure immutability and prevent modification of cached data.

```js
import {tokenize, getTokenizer} from "kuromojin";

getTokenizer().then(tokenizer => {
    // kuromoji.js's `tokenizer` instance
});

tokenize(text).then(tokens => {
    console.log(tokens)
    /*
    [ {
        word_id: 509800,          // 辞書内での単語ID
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

### For browser/global options

If `window.kuromojin.dicPath` is defined, kuromojin use it as default dict path.

```js
import {getTokenizer} from "kuromojin";
// Affect all module that are used kuromojin.
window.kuromojin = {
    dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict"
};
// this `getTokenizer` function use "https://kuromojin.netlify.com/dict" 
getTokenizer();
// === 
getTokenizer({dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict"})
```

:memo: Test dictionary URL

- "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict"
    - cdn dict for kuromoji.js
- https://kuromojin.netlify.com/dict/*.dat.gz
    - example: https://kuromojin.netlify.com/dict/base.dat.gz

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

### Note: kuromoji version is pinned

kuromojin pin kuromoji's version.

It aim to dedupe kuromoji's dictionary.
The dictionary is large and avoid to duplicated dictionary. 

## FAQ: textlint is slow / kuromoji dictionary is loaded many times

kuromojin keeps the loaded dictionary and the tokenize cache per installed copy of kuromojin.
If your `node_modules` contains multiple copies of kuromojin, each copy loads the dictionary (about 18 MB) and tokenizes the same text again.

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

Note: kuromojin 3 uses kuromoji@0.1.2, which tokenizes some unknown words differently from kuromoji@0.1.1 used by kuromojin 2 ([takuyaa/kuromoji.js#37](https://github.com/takuyaa/kuromoji.js/issues/37)).
The dictionary files are the same.

## Related

- [azu/morpheme-match: match function that match token(形態素解析) with sentence.](https://github.com/azu/morpheme-match/tree/master)

## Tests

    npm test

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## License

MIT
