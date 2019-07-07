# kuromojin [![Build Status](https://travis-ci.org/azu/kuromojin.svg?branch=master)](https://travis-ci.org/azu/kuromojin)

Provide a high level wrapper for [kuromoji.js](https://github.com/takuyaa/kuromoji.js "kuromoji.js").

## Features

- Promise based API
- Cache Layer

## Installation

    npm install kuromojin

## Usage

Export two API.

- `getTokenizer()` return `Promise` that is resolved with kuromoji.js's `tokenizer` instance.
- `kuromojin as default` return `Promise` that is resolved with analyzed text.

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
import {tokenize} from "kuromojin";
// Affect all module that are used kuromojin.
window.kuromojin = {
    dicPath: "https://example.com/kuromoji/dict"
};
// this `getTokenizer` function use "https://example.com/kuromoji/dict" 
getTokenizer();
// === 
getTokenizer({dicPath: "https://example.com/kuromoji/dict"})
```

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
