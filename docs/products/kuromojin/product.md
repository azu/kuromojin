# kuromojin

[日本語](product.ja.md)

## Overview

kuromojin is a Japanese morphological analyzer for JavaScript.
It splits Japanese text into tokens. Each token has the word as written, its part of speech, its base form, and its reading.
The analysis itself is done by [kuromoji.js](https://github.com/takuyaa/kuromoji.js), and kuromojin is a wrapper that makes it easy to use from many callers.
A caller gets the tokens of a text with one function call that returns a Promise.
kuromojin loads the dictionary once and remembers the tokens of each text, so callers in the same process share both.

Most callers are textlint rules for Japanese.
One textlint run uses many rules, and each rule asks for the tokens of the same sentences.

## Background and problems

### Background

Japanese is written without spaces between words.
A check such as "the same particle appears twice in one sentence" first needs to know where each word starts and what its part of speech is.
Morphological analysis answers this with a dictionary of words, and the dictionary is large.

kuromoji.js is a morphological analyzer written in JavaScript.
Its API builds a tokenizer with a callback, and every build loads the dictionary.

### Problems to solve

Rule authors want the tokens of a text without handling the dictionary and the callback themselves.

When each rule loads its own dictionary and analyzes the same sentence again, a textlint run gets slow and uses much memory.
The work has to be shared between the rules of one run.

Rules compare tokens with patterns, such as a particle followed by a certain verb.
When the tokens of a text change, a rule stops detecting without any error.
So rules depend on the exact result of the analysis, and it has to stay stable.

## Target users

### Rule authors

- **Characteristics:** Developers who publish textlint rules for Japanese as npm packages.
- **Problems:** A rule needs the tokens of a sentence, and it runs together with many other rules that need the same tokens.
- **Usage context:** They call kuromojin in a rule and compare the tokens with patterns, for example with [morpheme-match](https://github.com/azu/morpheme-match).

### Writers who run Japanese rules

- **Characteristics:** People who check Japanese documents with textlint. They do not call kuromojin themselves.
- **Problems:** The time, the memory, and the install size of a textlint run include those of kuromojin.
- **Usage context:** They run textlint from the command line, in CI, in an editor, or in a browser.

### Developers of other tools

- **Characteristics:** Developers who need the words of Japanese text in Node.js or in a browser, for example for text analysis or a command line tool.
- **Problems:** They want tokens without building a tokenizer by themselves.
- **Usage context:** They call kuromojin as a module.

## Value provided

### Tokens with one call

- **Recipient:** Rule authors and developers of other tools
- **Offering:** A function that takes a text and returns a Promise of its tokens. The caller does not build a tokenizer or pass a callback.
- **Reason:** A rule only needs the tokens, not the life cycle of the analyzer.

### One dictionary and one analysis for all rules

- **Recipient:** Writers who run Japanese rules
- **Offering:** The dictionary is loaded once per process, and the tokens of a text are reused when another rule asks for the same text.
- **Reason:** Loading the dictionary and analyzing text are the expensive parts, and the rules of one run ask for the same sentences.

## Key concepts

- **Token:** One word in the result of the analysis, with its fields such as `surface_form`, `pos`, `basic_form`, and `reading`.
- **Known word and unknown word:** A known word is a word found in the dictionary. An unknown word is a part of the text that is not in the dictionary, such as a new name. A token tells which one it is with `word_type`.
- **Dictionary:** The data that the analysis needs: the words with their parts of speech and readings, and the costs that decide which split of a text is the most natural. It is built from [mecab-ipadic](https://taku910.github.io/mecab/) (IPADIC).
- **Tokenizer:** The object that analyzes a text synchronously once the dictionary is loaded.
- **Dictionary path:** The directory or URL that the dictionary files are loaded from.

## Feature list

| Feature | Description | Specification |
| --- | --- | --- |
| Tokenization | Returns the tokens of a Japanese text, and reuses the tokens of a text analyzed before | [Requirements](features/tokenization/requirements.md) |
| Dictionary | Finds the dictionary and loads it once for all callers | [Requirements](features/dictionary/requirements.md) |
| Online playground | Shows the tokens of a text typed in a browser | Not written |

## Definition of success

Not defined. See the open questions.

## Development principles

- **One copy for all callers.** The dictionary and the cache are kept per installed copy of kuromojin, so kuromojin is built to be installed once: it pins the analyzer to an exact version, and the dictionary comes with that version.
- **Runs in Node.js and in browsers.** The same API works in both. Only the place of the dictionary differs.

## SLA, SLI, and SLO

### SLA

None. kuromojin is an open source library without service guarantees.

### SLI and SLO

None, for the same reason.

## Open questions

- **Definition of success:** No product-wide outcome is defined. Decisions are made from the development principles instead. Revisit when a product-wide decision cannot be made from the principles. azu decides.
