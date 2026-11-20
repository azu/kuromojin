# Tokenization

[日本語](requirements.ja.md)

## About this document

Tokenization returns the tokens of a Japanese text.
A caller uses `tokenize(text)` to get the tokens with one call, or `getTokenizer()` to get the tokenizer and analyze texts synchronously.
`tokenize(text)` also remembers the tokens of each text, so that callers that ask for the same text share one analysis.
The parent Product is [kuromojin](../../product.md).

### Scope

- The `tokenize` function, and the tokenizer that `getTokenizer` returns
- The fields of a token
- Which result the tokens have to equal, and how long they stay the same
- The reuse of the tokens of a text
- The speed of the analysis

### Out of scope

- Where the dictionary is found and how it is loaded. See [Dictionary](../dictionary/requirements.md)
- Comparing tokens with patterns, and splitting a document into sentences. Rules do this with other packages
- Access to the inside of the analysis, such as the candidates that were not chosen. The tokenizer gives tokens only
- Dictionaries other than IPADIC, and words added by the user

## User stories

### Get the tokens of a text with one call

As a rule author, I want the tokens of a text from one function call so that my rule does not handle the dictionary or the tokenizer.

**Acceptance criteria:**

Scenario: When a text is tokenized, each word is a token with its fields

- Given: The text `黒文字`
- When: `tokenize` is called with the text
- Then: The Promise resolves with one token whose `surface_form` is `黒文字`, `pos` is `名詞`, `basic_form` is `黒文字`, `reading` is `クロモジ`, `word_type` is `KNOWN`, and `word_position` is 1

Scenario: When a text has several sentences, positions count from the start of the text

- Given: The text `これは1文。これは2文。`
- When: `tokenize` is called with the text
- Then: The first token has `word_position` 1, and the last token, the second `。`, has `word_position` 12

Scenario: When a word is not in the dictionary, it is a token of an unknown word

- Given: The text `Fooをする`
- When: `tokenize` is called with the text
- Then: The first token has `surface_form` `Foo`, `word_type` `UNKNOWN`, `pos` `名詞`, and `basic_form` `*`, and it has no `reading` and no `pronunciation`

Scenario: When the text is empty, there are no tokens

- Given: An empty text
- When: `tokenize` is called with the text
- Then: The Promise resolves with an empty array

Scenario: When a text has characters outside the Basic Multilingual Plane, every character is in a token

- Given: The text `𩸽𩸽を食べた`
- When: `tokenize` is called with the text
- Then: The tokens are `𩸽𩸽`, `を`, `食べ`, and `た`, and their `word_position` values are 1, 3, 4, and 6

### Analyze any text without a failure

As a writer who lints files that other people wrote, I want every text to be analyzed so that an unusual character does not stop a textlint run.

**Acceptance criteria:**

Scenario: When a text has a NUL character, the character is an unknown word

- Given: A text of three characters: `a`, U+0000, and `b`
- When: `tokenize` is called with the text
- Then: The Promise resolves with three tokens, and the second one has U+0000 as `surface_form` and `UNKNOWN` as `word_type`

Scenario: When a text has a surrogate without its pair, the surrogate is an unknown word

- Given: A text of three characters: `あ`, the lone high surrogate U+D83D, and `い`
- When: `tokenize` is called with the text
- Then: The Promise resolves with three tokens, and the second one has U+D83D as `surface_form` and `UNKNOWN` as `word_type`

### Share the analysis with other rules

As a writer who runs many Japanese rules, I want a sentence to be analyzed once so that a run does not repeat the same analysis for every rule.

**Acceptance criteria:**

Scenario: When the same text is tokenized again, the same tokens are returned without analysis

- Given: A text that `tokenize` has already analyzed
- When: `tokenize` is called with the same text
- Then: The Promise resolves with the same array as the first call

Scenario: When the cache is turned off, the text is analyzed again

- Given: A text that `tokenize` has already analyzed
- When: `tokenize` is called with the same text and `noCacheTokenize: true`
- Then: The Promise resolves with a new array that has equal tokens, and the remembered tokens are not changed

### Analyze texts synchronously

As a developer who analyzes many texts in a loop, I want the tokenizer itself so that each analysis does not go through a Promise.

**Acceptance criteria:**

Scenario: When the tokenizer analyzes a text, it returns the tokens directly

- Given: The tokenizer that `getTokenizer` resolved with
- When: `tokenizeForSentence` is called with the text `黒文字`
- Then: It returns an array with the same tokens as `tokenize` of kuromojin, and each call returns a new array

## KPIs

### Same tokens as the reference

- **Target value:** For every text of the comparison, the tokens equal the [reference result](#reference-result) in every field.
- **Measurement method:** Analyze the sentences of real Japanese documents and random strings with kuromojin and with kuromoji.js 0.1.2, and compare the tokens. Texts that the reference loses characters of, or fails on, are compared with the behavior described in this document instead.
- **Measurement period:** When the analyzer or the format of the dictionary changes.

### Speed of the analysis

- **Target value:** No slower than the previous release on the same texts. Faster is preferred.
- **Measurement method:** Analyze the sentences of real Japanese documents in a loop, without the reuse of tokens, and compare medians between the previous release and the change.
- **Measurement period:** When the analyzer or the format of the dictionary changes.

### Time of a textlint run with Japanese rules

- **Target value:** A textlint run with textlint-rule-preset-ja-technical-writing takes 20% or less of the time that the same run takes with kuromojin 3.0.2 and textlint 16.1.1.
- **Measurement method:** Lint a large set of Japanese documents with the release to measure and the latest textlint, and with the two baseline versions, on the same machine. Alternate the two and compare medians.
- **Measurement period:** Before a major version of kuromojin is released.

## Functional requirements

### Tokenize a text

**Overview:** `tokenize(text, options)` returns the tokens of the text.

**Input:** A string, and optionally `options`. `noCacheTokenize: true` turns off the reuse of tokens for the call. `dicPath` is described in [Dictionary](../dictionary/requirements.md).

**Output:** A Promise of a read-only array of tokens in the order of the text.

#### Applicable conditions

##### Fields of a token

| Field | Meaning |
| --- | --- |
| `word_id` | The identifier of the word in the dictionary |
| `word_type` | `KNOWN` for a word in the dictionary, `UNKNOWN` for an unknown word |
| `word_position` | The position of the first character of the word in the text. The first character of the text is 1 |
| `surface_form` | The word as written in the text |
| `pos` | The part of speech, such as `名詞` or `助詞` |
| `pos_detail_1`, `pos_detail_2`, `pos_detail_3` | The subcategories of the part of speech. `*` when there is none |
| `conjugated_type` | The conjugation type. `*` when the word does not conjugate |
| `conjugated_form` | The conjugation form. `*` when the word does not conjugate |
| `basic_form` | The base form. `*` for an unknown word |
| `reading` | The reading in katakana. A token of an unknown word does not have this field |
| `pronunciation` | The pronunciation in katakana. A token of an unknown word does not have this field |

`word_position` counts characters, and a surrogate pair is one character.
So `word_position - 1` is the index in the JavaScript string only when no surrogate pair comes before the word.

The `surface_form` values of the tokens, joined in order, are the text.

##### Reference result

The reference result of a text is what kuromoji.js 0.1.2 returns for it with the same dictionary.
It is the result that existing rules are written against.
kuromojin returns the same tokens as the reference, with the same value in every field.
The only differences are the texts that the reference loses characters of or fails on, which are described under [Characters outside the Basic Multilingual Plane](#characters-outside-the-basic-multilingual-plane) and [Characters that no word contains](#characters-that-no-word-contains).

`tokenize` analyzes the whole text as one piece.
It does not split the text at `、` or `。` before the analysis, because the split gave wrong results.

##### Stability

The tokens of a text are the same in every release of one major version of kuromojin, with the dictionary that is part of the package.

##### Characters outside the Basic Multilingual Plane

A character outside the Basic Multilingual Plane, such as `𩸽` or an emoji, is a surrogate pair in a JavaScript string.
kuromojin handles the pair as one character: it is never split into two tokens, and it counts as one in `word_position`.
Such characters become unknown words in the same way as other characters that the dictionary does not have, and the words after them are analyzed as usual.

##### Characters that no word contains

U+0000 and a surrogate without its pair are characters like any other.
No word of the dictionary contains them, so each becomes an unknown word or a part of one.
So every string has tokens, and no text makes `tokenize` reject.

##### Reuse of tokens

`tokenize` remembers the tokens of the 10,000 most recently used texts.
The key is the text only, and the remembered tokens are used whatever `dicPath` is.
The returned array and its tokens are shared by all callers, so a caller must not change them. The type of the result is read-only for this reason.

#### Exceptional behavior

##### Dictionary that cannot be loaded

The Promise is rejected. See [Dictionary](../dictionary/requirements.md).

### Get the tokenizer

**Overview:** `getTokenizer(options)` returns the tokenizer after the dictionary is loaded.

**Input:** Optionally `options` with `dicPath`. See [Dictionary](../dictionary/requirements.md).

**Output:** A Promise of the tokenizer. Every call resolves with the same tokenizer.

#### Applicable conditions

The tokenizer has two synchronous functions that take a text and return a new array of tokens.
They do not remember tokens, and the tokenizer has no other public member.

- `tokenizeForSentence(text)` analyzes the whole text as one piece. `tokenize` of kuromojin uses it.
- `tokenize(text)` splits the text after each `、` and `。`, analyzes each piece, and returns the tokens of all pieces in order.

#### Exceptional behavior

None. The tokenizer exists only after the dictionary is loaded, and its functions return tokens for every string.

## Data requirements

### Required data

- **Text:** The string to analyze. `tokenize` keeps it in memory as the key of the remembered tokens until the process ends or 10,000 newer texts replace it. It is not written to a file and not sent anywhere.
- **Tokens:** The result of the analysis. They are kept in memory together with the text.
- **Dictionary:** The data that the analysis uses. See [Dictionary](../dictionary/requirements.md).

### Relationships

One text has one array of tokens.

### Personal information

kuromojin does not collect personal information.
A text can contain personal information that the caller passes in, and it stays in the memory of the process as described above.

## External service dependencies

None. The analysis runs in the process of the caller.

## Security considerations

The text and the tokens stay in the process of the caller.
The remembered tokens are shared in the process, so a caller that changes them changes the result of every other caller.

## Open questions

- **Target of a textlint run on a small set of documents:** On a small set, the startup of textlint and the rules themselves take most of the time, so the target of 20% can be out of the reach of kuromojin alone. Until this is decided, the target applies to a set of thousands of documents, and a small set is measured and reported without a target. Revisit when the first release with the analyzer of kuromojin is measured. azu decides.
- **Value of `word_id`:** `word_id` has the same value as in the reference result. Giving the words new numbers would make the dictionary smaller, and no known rule reads `word_id`. Until this is decided, the value stays the same. Revisit when the size of the dictionary is to be reduced further. azu decides.
- **`word_position` after a surrogate pair:** `word_position` counts a surrogate pair as one character, as the reference result does, so it is not an index in the JavaScript string after such a character. Until this is decided, the count stays as it is, and a rule that needs an index adds up the lengths of the `surface_form` values. Revisit when a rule reports a wrong position in a text with emoji. azu decides.
