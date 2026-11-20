# Dictionary versions

This file lists the dictionary versions of the `kuromojin.dict` file in this directory.
`scripts/build-dict.ts` writes it from `dict-source/versions.csv`, so do not edit it.

A caller of `tokenize` or `getTokenizer` chooses a version with the option `dictionaryVersion`,
a date written as `YYYY-MM-DD`. It gets the dictionary with the changes of every version up to that date.
A call without the option uses the default version.

## 2007-08-01

The base dictionary: mecab-ipadic-2.7.0-20070801 as it is built for kuromoji.js 0.1.2.
It is the default version.
