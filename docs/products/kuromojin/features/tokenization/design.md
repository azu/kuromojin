# Tokenization design

[日本語](design.ja.md)

## About this document

This design explains how kuromojin meets the [Tokenization Requirements](requirements.md) of the [kuromojin Product](../../product.md).

### Audience

People and agents who change the analysis or the reuse of tokens in kuromojin.

### Prerequisites

- The [Tokenization Requirements](requirements.md), especially the fields of a token and the reference result
- The [Dictionary Requirements](../dictionary/requirements.md), for what the tokenizer is built from

### Outside this document

How the dictionary is found, loaded, and stored in files, and the online playground.

## Implementation approach

kuromojin analyzes text with its own tokenizer, written in TypeScript and derived from kuromoji.js.
The tokenizer finds, among all the ways to split a text into words of the dictionary, the one with the lowest total cost.
`tokenize` puts a cache of tokens in front of it.

The parts below follow the order of one analysis: the data that the tokenizer takes from the dictionary, the candidates, the choice of the best split, and the tokens.
The reuse of tokens comes last.

### Data from the dictionary

The tokenizer needs four kinds of data, and it gets them from the loaded dictionary through a few lookups.

- **Words:** For a position in the text, the words of the dictionary that start there. A trie answers this in one walk along the text.
- **Entries:** For a word, its entries. One spelling can have several entries, for example a noun and a verb, and each entry has a left id, a right id, and a word cost.
- **Connection costs:** For the right id of one entry and the left id of the next, the cost of putting them side by side.
- **Unknown words:** For a character, its class, such as hiragana, alphabet, or numeral, and the entries that an unknown word of that class can use.

The tokenizer copies the ids and the costs into arrays of numbers when it is created, so the analysis reads only arrays.
The other fields of an entry, such as the part of speech and the reading, are read only for the words of the chosen split.

### Candidates

The tokenizer walks the text from the start and collects candidates, which are the words that can start at each position.
A position is used only when some candidate ends there, because a split cannot continue from any other position.

At a usable position, the candidates are the entries of every word of the dictionary that starts there.
An unknown word is added when no word of the dictionary starts there, or when the class of the character always asks for one.
Its length follows the class: a class that groups takes the whole run of characters of the same class, and the others take one character.

A candidate never starts or ends between the two halves of a surrogate pair.
The class of a pair is the default class, which groups, so a run of pairs becomes one unknown word.
A surrogate without its pair is one character. A high one has the default class, and a low one has the class that the dictionary gives to its code, which is what the reference result does.
U+0000 is a character with the class that the dictionary gives to it, and the lookup of words treats it as a character that no word contains.

### Choice of the best split

The cost of a split is the sum of the word costs of its entries and of the connection costs between neighbors, including the start and the end of the text.
The tokenizer keeps, for each candidate, the lowest cost of a split that ends with it and the candidate before it on that split.
It computes both when the candidate is added, from the candidates that end where the new one starts.
After the last position, it picks the best candidate that ends the text and follows the links back to the start.

When two splits have the same cost, the candidate that was added first wins.
Candidates are added in a fixed order: by start position, words of the dictionary before unknown words, shorter words before longer ones, and the entries of one word in the order of the dictionary.
This order is part of the result, because it decides the tokens of texts with equal costs.

### Memory of one analysis

The candidates are rows of a table, not objects.
Each column of the table is an array of numbers: the entry, the start, the end, the right id, the previous candidate, the lowest cost, and the next candidate that ends at the same position.
The tokenizer keeps the arrays between calls and makes them larger when a text needs more rows.
So an analysis creates objects only for the tokens that it returns.

The tokenizer is synchronous, and JavaScript runs one call at a time, so sharing the arrays between calls is safe.

### Tokens

The tokenizer creates one token for each candidate of the chosen split.
`surface_form` is the part of the text between the start and the end of the candidate.
The other fields come from the entry, and a token of an unknown word gets no `reading` and no `pronunciation`.
`word_position` is the start counted in characters plus one, where a surrogate pair before the word counts as one.

`tokenizeForSentence` runs these steps on the whole text.
`tokenize` of the tokenizer splits the text after each `、` and `。`, runs the steps on each piece, and continues `word_position` from one piece to the next.

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

No diagram is needed. An analysis is one pass over the text followed by one walk back along the chosen split, and `tokenize` adds one lookup in a map in front of it.

## Data model and ER diagrams

The token is the object described in the [fields of a token](requirements.md#fields-of-a-token).
The cache is one map whose key is the text and whose value is the array of tokens.
The table of candidates lives only during one analysis and is described under [Memory of one analysis](#memory-of-one-analysis).

## APIs and interfaces

kuromojin exports two functions and three types.

- `tokenize(text: string, options?: getTokenizerOption): Promise<Readonly<Readonly<KuromojiToken>[]>>`
- `getTokenizer(options?: getTokenizerOption): Promise<Tokenizer>`
- `KuromojiToken` is the type of a token. It declares `reading` and `pronunciation` as `string`, although a token of an unknown word does not have them.
- `Tokenizer` has `tokenize(text: string): KuromojiToken[]` and `tokenizeForSentence(text: string): KuromojiToken[]`.
- `getTokenizerOption` has the optional `dicPath?: string` and `noCacheTokenize?: boolean`.

## External service integration

None. The analysis is part of kuromojin and uses no network service. The cache depends on the npm package `lru_map`.

## Data handling

The texts and their tokens are kept only in the map described above, in the memory of the process.
The table of candidates holds numbers about the last analyzed text until the next analysis overwrites them.
Nothing is written to a file.

## Authentication and authorization notes

None. The analysis has no access control.

## Security considerations

None beyond the [security considerations of the Requirements](requirements.md#security-considerations). The design adds no protection against a caller that changes the shared tokens.

The time and the memory of an analysis grow with the length of the text, and the tokenizer sets no limit on the length.

## Deployment notes

A change that alters the tokens of any text is released as a major version of kuromojin, because rules that compare tokens with patterns depend on them.

The source of the tokenizer is derived from kuromoji.js, which is licensed under the Apache License 2.0.
The lookup of words in a dictionary of kuromoji.js is derived from doublearray, which is licensed under the MIT License.
The package shows the licenses in this way.

- The `LICENSE` file of the repository has only the MIT License of kuromojin, so that a tool that reads the license of a repository from this file finds one license.
- The `license` field of `package.json` is `MIT AND Apache-2.0`.
- The README has a section that names the parts of the package under each license.
- The package includes the text of the Apache License 2.0, and a notice with the copyright notices of kuromoji.js and doublearray and the changes to their source. The Apache License 2.0 requires both to be passed on with a derived work.

## Alternatives considered

### Use kuromoji.js as a dependency

kuromojin could keep calling the tokenizer of the `kuromoji` package.
It was not chosen, because the analysis and the format of the dictionary are where the time and the size are, and neither can be changed from outside the package.

### Keep candidates as objects

The candidates could be one object each, linked by references.
It was not chosen, because a text has many more candidates than tokens, and creating and collecting an object for each of them takes a large part of the time of an analysis.

### Use an analyzer compiled to WebAssembly

Another analyzer could replace the tokenizer.
It was not chosen, because its tokens differ from the reference result, and every rule that compares tokens with patterns would have to be rewritten.

### Split the text at punctuation before the analysis

`tokenize` could split the text at `、` and `。` and analyze each piece, as `tokenize` of the tokenizer does.
It was not chosen, because the forced split at `。` gave wrong results.

### Other decisions

There is no record of alternatives for the size of the cache or for the choice of `lru_map`, and the reasons for them are unknown.

## Open questions

None.
