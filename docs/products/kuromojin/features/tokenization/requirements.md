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
- Which analysis the tokens come from
- The reuse of the tokens of a text

### Out of scope

- Where the dictionary is found and how it is loaded. See [Dictionary](../dictionary/requirements.md)
- Comparing tokens with patterns, and splitting a document into sentences. Rules do this with other packages
- Members of the tokenizer other than `tokenize` and `tokenizeForSentence`. They are not part of the types that kuromojin exports
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

None. No metric is defined for this feature.

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

##### Analysis

The tokens are the result of kuromoji.js 0.1.2 with its IPADIC dictionary.
`tokenize` analyzes the whole text as one piece.
It does not split the text at `、` or `。` before the analysis, because the split gave wrong results.

##### Reuse of tokens

`tokenize` remembers the tokens of the 10,000 most recently used texts.
The key is the text only, and the remembered tokens are used whatever `dicPath` is.
The returned array and its tokens are shared by all callers, so a caller must not change them. The type of the result is read-only for this reason.

#### Exceptional behavior

##### Text with U+0000 or a lone high surrogate

The Promise is rejected with a `TypeError`.

##### Unknown word with surrogate pairs

When an unknown word contains surrogate pairs, such as two or more emoji in a row, characters after the word can be missing from the tokens.
For `𩸽𩸽を食べた`, the tokens are `𩸽𩸽` and `べた`.

##### Dictionary that cannot be loaded

The Promise is rejected. See [Dictionary](../dictionary/requirements.md).

### Get the tokenizer

**Overview:** `getTokenizer(options)` returns the tokenizer after the dictionary is loaded.

**Input:** Optionally `options` with `dicPath`. See [Dictionary](../dictionary/requirements.md).

**Output:** A Promise of the tokenizer. Every call resolves with the same tokenizer.

#### Applicable conditions

The tokenizer has two synchronous functions that take a text and return a new array of tokens.
They do not remember tokens.

- `tokenizeForSentence(text)` analyzes the whole text as one piece. `tokenize` of kuromojin uses it.
- `tokenize(text)` splits the text after each `、` and `。`, analyzes each piece, and returns the tokens of all pieces in order.

#### Exceptional behavior

The same as [Tokenize a text](#tokenize-a-text), except that the functions of the tokenizer throw instead of rejecting a Promise.

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

None.
