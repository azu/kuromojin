# kuromojin [![Actions Status: test](https://github.com/azu/kuromojin/workflows/test/badge.svg)](https://github.com/azu/kuromojin/actions?query=workflow%3A"test")

Provide a high level wrapper for [kuromoji.js](https://github.com/takuyaa/kuromoji.js "kuromoji.js").

## Features

- Promise based API
- Cache Layer
    - Fetch the dictionary at once
    - Return same tokens for same text

## Installation

    npm install kuromojin

## Usage

Export two API.

- `getTokenizer()` return `Promise` that is resolved with kuromoji.js's `tokenizer` instance.
- `tokenize()` return `Promise` that is resolved with analyzed tokens.

```js
import {tokenize, getTokenizer} from "kuromojin";

getTokenizer().then(tokenizer => {
    // kuromoji.js's `tokenizer` instance
});

tokenize(text).then(results => {
    console.log(results)
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
