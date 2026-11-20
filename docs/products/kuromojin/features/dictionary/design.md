# Dictionary design

[日本語](design.ja.md)

## About this document

This design explains how kuromojin meets the [Dictionary Requirements](requirements.md) of the [kuromojin Product](../../product.md).

### Audience

People and agents who change how kuromojin finds, loads, or stores the dictionary.

### Prerequisites

- The [Dictionary Requirements](requirements.md)
- The [Tokenization Requirements](../tokenization/requirements.md), for the reference result that the dictionary has to keep

### Outside this document

How the tokenizer analyzes a text with the loaded dictionary, and how tokens are reused.

## Implementation approach

kuromojin loads the dictionary by itself.
It decides the dictionary path, reads the files from it, turns them into the tables that the tokenizer reads, and keeps the tokenizer in the module.
The dictionary of the package is stored in a format of kuromojin, whose goal is a small download and a quick load with the same words and costs as the dictionary of kuromoji.js.

### Dictionary path

The path is decided only when a load starts, not on every call.
kuromojin looks at `dicPath` of the `options` of the first call, then at `KUROMOJIN_DIC_PATH`, then at `window.kuromojin.dicPath`.
When none of them is set, it uses the `dict` directory next to its own code, which it finds from the location of its module in Node.js.

### Loading once

The module keeps three values: the tokenizer, a flag that tells that a load has started, and one Promise for the result of the load.
`getTokenizer` returns the tokenizer when it is there.
Otherwise, when the flag is set, it returns the Promise.
Otherwise it sets the flag, starts the load, and returns the Promise.
The load resolves the Promise with the tokenizer or rejects it with the error.

The flag is never cleared.
So a failed load leaves the rejected Promise in place, and every later call gets it.

### Reading the files

One function hides the difference between Node.js and browsers: it takes the path or URL of a file and returns its decompressed bytes.
In Node.js it reads the file with the file system and decompresses it with the `zlib` module.
In a browser it requests the file with `fetch` and decompresses it with `DecompressionStream`.
A server can remove the gzip compression before the browser sees the file, so the browser function decompresses only when the bytes start with the gzip signature.
kuromojin chooses between the two when a load starts, by whether it runs in Node.js.

The files of a dictionary do not depend on each other, so they are requested at the same time.

### Format of the dictionary

The load first asks for `kuromojin-dict.json` in the dictionary path.
When the file is there, the dictionary is in the format of kuromojin, and the file tells the version of the format and the compression of the data files.
A version that the code does not know ends the load with an error.
When the file is not there, the dictionary is read as the twelve files of kuromoji.js.

Both formats are turned into the same tables, so the tokenizer does not know which one was loaded.
The lookup of the words that start at a position is the only part with two implementations: the trie of kuromojin for its own format, and the double-array trie of kuromoji.js for the other.

### Format of kuromojin

The format stores the same data as the dictionary of kuromoji.js, arranged so that gzip can compress it well and that loading is a few passes over arrays.

- **Words:** A trie of the UTF-16 code units of the words. The nodes are written in breadth-first order, each with its character, the number of its children, and one bit that tells whether a word ends there. The children of a node are next to each other, so no node stores a position.
- **Entries of a word:** For each word, the number of its entries and the numbers of the entries. Each number is written as the difference from the one before, in as few bytes as it needs.
- **Costs and ids:** The left id and the word cost of every entry, each in a column of its own. The right id has a column only when it differs from the left id in some entry.
- **Connection costs:** The matrix of costs, where each cell is written as the difference from the cell on its left.
- **Features:** For every entry, four numbers: its combination of part of speech and conjugation, its base form, its reading, and its pronunciation. Each number points into a list of distinct strings. A marker replaces the number when the base form equals the word as written, or the pronunciation equals the reading.
- **Unknown words:** The classes of characters and the entries of unknown words, as in the dictionary of kuromoji.js.

Numbers of two or four bytes are written as planes: first the lowest byte of every number, then the next byte of every number, and so on.
Neighboring numbers are often close to each other, so the planes of the higher bytes are long runs of the same value, which gzip makes small.

The number of an entry is its position in the dictionary of kuromoji.js.
`word_id` is computed from it, so it has the same value as in the reference result.

When the dictionary is loaded, kuromojin joins the planes, adds up the differences, and builds a hash table from a node of the trie and a character to the child node.
The strings of the features stay in one buffer and are decoded only for the tokens that an analysis returns.

### Building the dictionary of the package

A script of the repository converts the dictionary files of kuromoji.js 0.1.2 into the format of kuromojin.
It converts the built files instead of the sources of mecab-ipadic, so that the entries, their order, and their numbers are the ones of the reference result.
The converted files are kept in the repository in the `dict` directory, together with the notices of mecab-ipadic and kuromoji.js, and they are published with the package.

## Architecture and sequence diagrams

No diagram is needed. A load is one sequence behind one Promise: decide the path, read the description of the format, read the data files, and build the tables.

## Data model and ER diagrams

The dictionary in memory is four tables.

- The trie, from a text position to the words that start there
- The entries, from a word to the left id, the right id, the word cost, and the features of each entry
- The connection costs, from a right id and a left id to a cost
- The unknown words, from a character to its class, and from a class to its entries

One word has one or more entries, and the entries have no other relation to each other, so a diagram adds nothing.

## APIs and interfaces

- `getTokenizerOption.dicPath?: string` is the dictionary path of a call.
- The environment variable `KUROMOJIN_DIC_PATH` is read in Node.js.
- `window.kuromojin.dicPath` is read in a browser.
- `kuromojin-dict.json` in a dictionary directory has `format`, the version of the format as a number, and `compression`, the compression of the data files.
- The npm package publishes the `dict` directory with the dictionary of the package.

## External service integration

None. The dictionary and the code that loads it are part of the kuromojin package.

## Data handling

The dictionary files are read and never written.
The decompressed dictionary stays in memory until the process ends.

## Authentication and authorization notes

None. kuromojin sends no credentials with the requests for the dictionary files.

## Security considerations

None beyond the [security considerations of the Requirements](requirements.md#security-considerations).

## Deployment notes

A page or a project that points the dictionary path at a dictionary of kuromoji.js keeps working without a change.
It gets the smaller download only after the path is changed to the `dict` directory of the kuromojin package.

The dictionary files change the tokens of a text when their words or costs change, so such a change is released as a major version.

## Alternatives considered

### Keep the format of kuromoji.js for the dictionary of the package

The package could publish the twelve files of kuromoji.js as they are.
It was not chosen, because that format stores a double-array trie and fixed-width records, which stay large after gzip, and the dictionary is the largest part of what a writer installs and a browser downloads.

### Compress with Brotli

Brotli makes the files smaller than gzip does.
It was not chosen, because `DecompressionStream` does not decompress Brotli in every browser that has it, and a decompressor written in JavaScript would have to be added for those browsers.
The [format list of `DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream) shows which browsers support each format.

### Build the dictionary from the sources of mecab-ipadic

The dictionary could be built from the CSV files of mecab-ipadic.
It was not chosen, because the order and the numbers of the entries decide `word_id` and the result for splits with equal costs, and the built files of kuromoji.js are the only place that has them as the reference result needs.

### Other decisions

There is no record of alternatives for the order of the sources of the dictionary path, or for keeping a failed load.
The reasons for them are unknown.

## Open questions

None.
