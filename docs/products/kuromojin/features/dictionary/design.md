# Dictionary design

[日本語](design.ja.md)

## About this document

This design explains how kuromojin meets the [Dictionary Requirements](requirements.md) of the [kuromojin Product](../../product.md).

### Audience

People and agents who change how kuromojin finds or loads the dictionary.

### Prerequisites

- The [Dictionary Requirements](requirements.md)

### Outside this document

How the tokenizer analyzes a text, and how tokens are reused.

## Implementation approach

kuromojin leaves the loading to kuromoji.js.
It decides the dictionary path, asks kuromoji.js to build a tokenizer from it, and keeps the result in the module.

### Dictionary path

The path is decided only when a load starts, not on every call.
When the first call has `options`, kuromojin passes the whole object to kuromoji.js, which reads `dicPath` from it and falls back to `dict/` when it is missing.
When the first call has no `options`, kuromojin looks at `KUROMOJIN_DIC_PATH`, then at `window.kuromojin.dicPath`, and then asks Node.js where the `kuromoji` package is installed and uses the `dict` directory next to its main file.

### Loading once

The module keeps three values: the tokenizer, a flag that tells that a load has started, and one Promise for the result of the load.
`getTokenizer` returns the tokenizer when it is there.
Otherwise, when the flag is set, it returns the Promise.
Otherwise it sets the flag, starts the build of kuromoji.js, and returns the Promise.
The callback of the build resolves the Promise with the tokenizer or rejects it with the error.

The flag is never cleared.
So a failed load leaves the rejected Promise in place, and every later call gets it.

### Reading the files

kuromoji.js reads the twelve files and decompresses them.
In Node.js it reads them with the file system and decompresses them with the `zlib` module.
In a browser it requests each file with `XMLHttpRequest` and decompresses it with a gzip implementation written in JavaScript.
A bundler chooses the browser loader through the `browser` field of the `kuromoji` package.

## Architecture and sequence diagrams

No diagram is needed. The load is one build of kuromoji.js behind one Promise.

## Data model and ER diagrams

The dictionary is the data of kuromoji.js 0.1.2, and kuromojin does not define a model of its own.

## APIs and interfaces

- `getTokenizerOption.dicPath: string` is the dictionary path of a call.
- The environment variable `KUROMOJIN_DIC_PATH` is read in Node.js.
- `window.kuromojin.dicPath` is read in a browser.

## External service integration

None. kuromojin depends on the npm package `kuromoji` for the dictionary files and for the code that loads them.

## Data handling

The dictionary files are read and never written.
The decompressed dictionary stays in memory until the process ends.

## Authentication and authorization notes

None. kuromojin sends no credentials with the requests for the dictionary files.

## Security considerations

None beyond the [security considerations of the Requirements](requirements.md#security-considerations).

## Deployment notes

The dictionary is part of the `kuromoji` package, so its files change only when kuromojin changes the version of that package.

## Alternatives considered

There is no record of alternatives for the order of the sources of the dictionary path, or for keeping a failed load.
The reasons for them are unknown.

## Open questions

None.
