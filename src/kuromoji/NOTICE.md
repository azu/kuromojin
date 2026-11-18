This directory is derived from kuromoji.js 0.1.2
https://github.com/takuyaa/kuromoji.js
Copyright 2014 Takuya Asano
Copyright 2010-2014 Atilika Inc. and contributors
Licensed under the Apache License, Version 2.0 (see LICENSE-2.0.txt in this directory).

The double-array trie is derived from doublearray 0.0.2
https://github.com/takuyaa/doublearray
Copyright (c) 2014 Takuya Asano (MIT License)

Changes from the original: ported to TypeScript, removed the dictionary builder,
replaced the trie lookup so that it walks the input in place, and stored the
token-info map in typed arrays. See the git history of azu/kuromojin.
