# Notice

The source files in this directory are part of kuromojin, which is licensed under the MIT License.
Some of them are derived from other works. Each of those files names its origin in its first lines.

## kuromoji.js

`Analyzer.ts`, `loader/kuromojiFormat.ts`, and `loader/unknownWords.ts` are derived from [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2.

    Copyright 2014 Takuya Asano
    Copyright 2010-2014 Atilika Inc. and contributors

kuromoji.js is licensed under the Apache License, Version 2.0. The text of the license is in [LICENSE-2.0.txt](LICENSE-2.0.txt).

Changes to the source of kuromoji.js:

- It is ported to TypeScript, and only the parts for tokenizing with a built dictionary are kept.
- The candidates of an analysis are rows of typed arrays that are kept between calls, and the best split is chosen while the candidates are added.
- Positions are UTF-16 indexes, and a surrogate pair is handled as one character.
- A dictionary version chooses the entries that an analysis sees.
- The files of a dictionary are turned into arrays of numbers when they are loaded.

## doublearray

`DoubleArrayTrie.ts` is derived from [doublearray](https://github.com/takuyaa/doublearray) 0.0.2.

    Copyright (c) 2014 Takuya Asano All Rights Reserved.

doublearray is licensed under the MIT License:

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

Changes to the source of doublearray: it is ported to TypeScript, only the lookup is kept, and the lookup walks the text in place.
