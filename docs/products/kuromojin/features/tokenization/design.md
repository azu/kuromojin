# Tokenization design

[日本語](design.ja.md)

## About this document

This design explains how kuromojin meets the [Tokenization Requirements](requirements.md) of the [kuromojin Product](../../product.md).

### Audience

People and agents who change the analysis or the reuse of tokens in kuromojin.

### Prerequisites

- The [Tokenization Requirements](requirements.md), especially the fields of a token
- The [Dictionary Requirements](../dictionary/requirements.md), for what the tokenizer is built from

### Outside this document

How the dictionary is found and loaded, and the online playground.

## Implementation approach

kuromojin does not analyze text by itself.
It asks kuromoji.js for a tokenizer once, and adds a cache of tokens in front of it.

### Analysis

The tokenizer that `getTokenizer` resolves with is the tokenizer object of kuromoji.js, without a wrapper.
So its `tokenize` and `tokenizeForSentence` are the functions of kuromoji.js, and the tokens are the objects that kuromoji.js creates.
kuromojin depends on the exact version 0.1.2 of kuromoji.js, so the tokens of a text change only when kuromojin changes this version.

### Reuse of tokens

`tokenize(text, options)` first waits for the tokenizer.
Then it looks up the text in a map from text to tokens.
When the text is there, it returns the stored array.
When it is not, it calls `tokenizeForSentence(text)`, stores the returned array under the text, and returns it.
With `noCacheTokenize: true`, it calls `tokenizeForSentence(text)` and returns the result without reading or writing the map.

The map keeps the 10,000 most recently used texts and removes the least recently used one when it is full.
It is a variable of the module, so each installed copy of kuromojin has its own map, and all callers of one copy share it.
The stored arrays are not copied or frozen. The read-only type of the result is what keeps callers from changing them.

## Architecture and sequence diagrams

No diagram is needed. `tokenize` is one lookup in a map followed by one call of the tokenizer.

## Data model and ER diagrams

The token is the object described in the [fields of a token](requirements.md#fields-of-a-token).
The cache is one map whose key is the text and whose value is the array of tokens.

## APIs and interfaces

kuromojin exports two functions and three types.

- `tokenize(text: string, options?: getTokenizerOption): Promise<Readonly<Readonly<KuromojiToken>[]>>`
- `getTokenizer(options?: getTokenizerOption): Promise<Tokenizer>`
- `KuromojiToken` is the type of a token. It declares `reading` and `pronunciation` as `string`, although a token of an unknown word does not have them.
- `Tokenizer` has `tokenize(text: string): KuromojiToken[]` and `tokenizeForSentence(text: string): KuromojiToken[]`.
- `getTokenizerOption` has `dicPath: string` and the optional `noCacheTokenize?: boolean`.

## External service integration

None. The analysis depends on the npm packages `kuromoji` for the analyzer and `lru_map` for the cache, and it does not use a network service.

## Data handling

The texts and their tokens are kept only in the map described above, in the memory of the process.
Nothing is written to a file.

## Authentication and authorization notes

None. The analysis has no access control.

## Security considerations

None beyond the [security considerations of the Requirements](requirements.md#security-considerations). The design adds no protection against a caller that changes the shared tokens.

## Deployment notes

A change of the kuromoji.js version can change the tokens of a text, and rules that compare tokens with patterns depend on them.
The change from 0.1.1 to 0.1.2 was released as a major version of kuromojin for this reason.

## Alternatives considered

### Split the text at punctuation before the analysis

`tokenize` of the kuromoji.js tokenizer splits the text at `、` and `。` and analyzes each piece.
kuromojin used it at first and changed to `tokenizeForSentence`, because the forced split at `。` gave wrong results.

### Other decisions

There is no record of alternatives for the size of the cache or for the choice of `lru_map`, and the reasons for them are unknown.

## Open questions

None.
