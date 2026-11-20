# Dictionary versions

[日本語](requirements.ja.md)

## About this document

A dictionary version lets a caller choose the dictionary as of a date.
Every change to the words of the dictionary belongs to a version, and a version is named by a date.
A caller that names a date gets the dictionary with all the changes up to that date. A caller that names none gets the default dictionary, which does not change within a major version.
So the dictionary can get new words without changing the tokens of any caller that did not ask for them.
The parent Product is [kuromojin](../../product.md).

### Scope

- How a version is named, and what the dictionary of a version contains
- How a caller chooses a version for a call
- Which version is used when the caller names none
- How long the tokens of a version stay the same
- Callers with different versions in one process
- What happens when a version cannot be used
- The list of versions that tells what each one changes

### Out of scope

- Choosing one version for a whole project, for example by an environment variable. The caller that compares the tokens with patterns chooses the version, not the writer who runs it
- Turning single changes on or off. A version is chosen as a whole
- Changes to the analysis itself. A version changes the words of the dictionary only
- Words that a user adds for their own project
- Which words are added or removed. See the open questions

## User stories

### Use newer words in a rule

As a rule author, I want the tokens of a newer dictionary for my rule so that its patterns can use words that the default dictionary does not have.

**Acceptance criteria:**

The scenarios use a dictionary for tests with two versions: `2027-04-01` adds the noun `令和` with the reading `レイワ`, and `2027-10-01` adds the noun `スマホ` with the reading `スマホ`.

Scenario: When a call names a version, the words of that version are in the tokens

- Given: The dictionary for tests
- When: `tokenize` is called with the text `令和元年` and `{ dictionaryVersion: "2027-04-01" }`
- Then: The Promise resolves with the tokens `令和` and `元年`, and the first one has `KNOWN` as `word_type` and `レイワ` as `reading`

Scenario: When a call names no version, the tokens are those of the default dictionary

- Given: The dictionary for tests
- When: `tokenize` is called with the text `令和元年` and no `dictionaryVersion`
- Then: The Promise resolves with the tokens `令`, `和`, and `元年`

Scenario: When a call names a date between two versions, it gets the changes up to that date

- Given: The dictionary for tests
- When: `tokenize` is called with the text `令和にスマホを使う` and `{ dictionaryVersion: "2027-06-15" }`
- Then: The tokens have `令和` as a known word, and `スマホ` is an unknown word as with the default dictionary

Scenario: When a call names the newest version, it gets the changes of all versions

- Given: The dictionary for tests
- When: `tokenize` is called with the text `令和にスマホを使う` and `{ dictionaryVersion: "2027-10-01" }`
- Then: The tokens have `令和` and `スマホ` as known words

### Keep the tokens of a rule when kuromojin is updated

As a rule author, I want the tokens of the version that I chose to stay the same so that my rule keeps detecting after kuromojin gets newer versions.

**Acceptance criteria:**

Scenario: When the dictionary gets a newer version, the tokens of an older version do not change

- Given: A text and its tokens with `{ dictionaryVersion: "2027-04-01" }`, analyzed with a dictionary that has only that version
- When: The same call is made with the dictionary for tests, which also has `2027-10-01`
- Then: The Promise resolves with equal tokens, including `word_id`

### Run rules with different versions together

As a writer who runs many Japanese rules, I want rules with different dictionary versions to work in one run so that I do not have to care which version each rule chose.

**Acceptance criteria:**

Scenario: When two callers name different versions, each gets the tokens of its own version

- Given: The dictionary for tests, not loaded yet
- When: `tokenize` is called with the text `令和元年` three times: without a version, with `2027-04-01`, and again without a version
- Then: The first and the third call resolve with `令`, `和`, and `元年`, the second one resolves with `令和` and `元年`, and the dictionary file is read once

Scenario: When the same text is tokenized again with the same version, the same tokens are returned without analysis

- Given: A text that `tokenize` has already analyzed with `{ dictionaryVersion: "2027-04-01" }`
- When: `tokenize` is called with the same text and a date that means the same version, such as `2027-06-15`
- Then: The Promise resolves with the same array as the first call

Scenario: When the tokenizer of a version is asked for twice, it is the same tokenizer

- Given: The dictionary for tests
- When: `getTokenizer` is called twice with `{ dictionaryVersion: "2027-04-01" }` and once without a version
- Then: The first two Promises resolve with the same tokenizer, and the third one resolves with another tokenizer, whose `tokenizeForSentence` returns `令`, `和`, and `元年` for `令和元年`

### Notice a version that cannot be used

As a rule author, I want a clear failure when the installed kuromojin cannot give the version that my rule names so that the rule never runs silently with other tokens.

**Acceptance criteria:**

Scenario: When the date is later than the newest version of the dictionary, the call is rejected

- Given: The dictionary for tests
- When: `tokenize` is called with a text and `{ dictionaryVersion: "2028-01-01" }`
- Then: The Promise is rejected with an error that names `2028-01-01` and the newest version `2027-10-01`, and a later call with `2027-10-01` resolves with tokens

Scenario: When the value is not a date, the call is rejected

- Given: The dictionary for tests
- When: `tokenize` is called with a text and `{ dictionaryVersion: "latest" }`
- Then: The Promise is rejected with an error that says that the value has to be a date written as `YYYY-MM-DD`

Scenario: When the dictionary is a dictionary of kuromoji.js, a version cannot be named

- Given: A dictionary path that names a directory with a dictionary of kuromoji.js
- When: `tokenize` is called with a text and `{ dictionaryVersion: "2027-04-01" }`
- Then: The Promise is rejected with an error that says that this dictionary has no versions, and a call without a version resolves with tokens

### See what a version changes

As a rule author, I want to read what each version changes so that I can choose a version and know which of my patterns it affects.

**Acceptance criteria:**

Scenario: When a release has a new version, the list of versions tells its date and its changes

- Given: A release of kuromojin whose dictionary has a version that the release before did not have
- When: A rule author reads the list of dictionary versions of that release
- Then: The list has the date of the version and every word that the version adds or removes, with its part of speech and its reading

## KPIs

### Same tokens for a released version

- **Target value:** For every released version and every text of the comparison, the tokens are equal to those of the previous release in every field.
- **Measurement method:** Analyze the sentences of real Japanese documents with every version that the previous release has, with the previous release and with the change, and compare the tokens.
- **Measurement period:** When the dictionary, its format, or the analyzer changes.

### Speed of the analysis with a version

- **Target value:** No slower than the previous release with the same version on the same texts. Faster is preferred.
- **Measurement method:** Analyze the sentences of real Japanese documents in a loop with the newest version, without the reuse of tokens, and compare medians between the previous release and the change. The speed without a version is measured by the KPI of [Tokenization](../tokenization/requirements.md#speed-of-the-analysis).
- **Measurement period:** When the dictionary, its format, or the analyzer changes.

## Functional requirements

### Choose a dictionary version

**Overview:** The option `dictionaryVersion` of `tokenize` and `getTokenizer` names the dictionary version of the call.

**Input:** A date as a string in the form `YYYY-MM-DD`, for example `"2027-04-01"`.

**Output:** `tokenize` returns the tokens of the text with the dictionary of that version. `getTokenizer` returns a tokenizer that analyzes with the dictionary of that version.

#### Applicable conditions

##### Versions and dates

A version is a date and a set of changes to the words of the dictionary.
The dictionary of a version is the base dictionary with the changes of every version up to and including its date.
The base dictionary is the dictionary with the words of kuromoji.js 0.1.2, and it is a version too: `2007-08-01`, the date of the IPADIC data that it is built from.

A call can name any date from the date of the base dictionary to the date of the newest version of the loaded dictionary.
A date between two versions means the earlier one of them.

##### Default version

A call without `dictionaryVersion` uses the default version.
The default version is the same in every release of one major version of kuromojin. In this major version, it is the base dictionary.
A new major version can make a newer version the default. A caller that names a version, including the date of the base dictionary, keeps its tokens then.

##### Kinds of changes

A version adds entries of words and removes entries of words.
A changed word, for example with another reading or another cost, is a removed entry and an added entry in the same version.
A version does not change the costs between parts of speech, the handling of unknown words, or the analysis itself.

An added entry has the same fields as an entry of the base dictionary, and its token has `KNOWN` as `word_type`.
Its `word_id` differs from the `word_id` of every other entry, and it is the same in every release.

##### Same tokens in every release

A released version is never changed: later releases add versions with later dates, and they do not add, remove, or alter the changes of a released version.
So the tokens of a text with a version are the same in every later release of the same major version.
A version is removed from the dictionary only with a major version of kuromojin.

##### Versions in one process

The version belongs to the call. Callers with different versions get their own tokens in the same process, in any order of calls.
The dictionary is loaded once for all of them, as described in [Dictionary](../dictionary/requirements.md).

`tokenize` remembers tokens for a text and a version together, so the tokens of one version are never returned for another one.
`getTokenizer` resolves with one tokenizer for each version: every call with dates that mean the same version gets the same tokenizer.

##### Dictionary from a dictionary path

The versions come from the loaded dictionary.
A dictionary file in the format of kuromojin that is given by a dictionary path has its own versions.
A dictionary of kuromoji.js has no versions, and only calls without `dictionaryVersion` can use it.

#### Exceptional behavior

##### Version that cannot be used

The Promise of the call is rejected with an error that tells the reason in each of these cases.

- The value is not a string in the form `YYYY-MM-DD`, or is not a date of the calendar.
- The date is later than the newest version of the loaded dictionary. The error names that version, because the usual reason is an installed kuromojin that is older than the rule expects.
- The date is earlier than the date of the base dictionary.
- The loaded dictionary is a dictionary of kuromoji.js.

The error belongs to that call only. Other calls, with other versions or with none, are not affected.

### Publish the list of versions

**Overview:** kuromojin publishes a list of the dictionary versions.

**Input:** The changes of each version.

**Output:** A document, published with each release, that has for every version its date and the entries that it adds and removes, each with the word, its part of speech, and its reading.

#### Applicable conditions

The list is part of the npm package and of the repository, so a rule author can read it for the installed release.
A release note of kuromojin that adds a version names the date of the version.

#### Exceptional behavior

None.

## Data requirements

### Required data

- **Changes of a version:** The added entries, each with the word, its part of speech, its conjugation, its base form, its reading, its pronunciation, and its costs, and the removed entries. They are part of the dictionary file.
- **List of versions:** The same changes in a form for readers.

### Relationships

One dictionary has one base dictionary and any number of versions.
One version has one or more changes.

### Personal information

None. The changes are words of the Japanese language and do not contain data about the users of kuromojin.

## External service dependencies

None.

## Security considerations

None beyond the [security considerations of the dictionary](../dictionary/requirements.md#security-considerations).
A version changes the result of the analysis only for the callers that name it.

## Open questions

- **Which words a version changes:** There is no rule for which words are added to or removed from the dictionary, or for who proposes them. Until this is decided, each change is decided by azu in its pull request, and the dictionary has no version other than the base dictionary. Revisit when the first change is proposed. azu decides.
