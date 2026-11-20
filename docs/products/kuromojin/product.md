# kuromojin

[日本語](product.ja.md)

## Overview

kuromojin is a Japanese morphological analyzer for JavaScript.
It splits Japanese text into tokens. Each token has the word as written, its part of speech, its base form, and its reading.
kuromojin has its own analyzer and its own dictionary data. Both are derived from [kuromoji.js](https://github.com/takuyaa/kuromoji.js), and the tokens are the ones that kuromoji.js returns, because existing rules are written against them.
A caller gets the tokens of a text with one function call that returns a Promise.
kuromojin loads the dictionary once and remembers the tokens of each text, so callers in the same process share both.

Most callers are textlint rules for Japanese.
One textlint run uses many rules, and each rule asks for the tokens of the same sentences.

## Background and problems

### Background

Japanese is written without spaces between words.
A check such as "the same particle appears twice in one sentence" first needs to know where each word starts and what its part of speech is.
Morphological analysis answers this with a dictionary of words, and the dictionary is large.

kuromoji.js is a morphological analyzer written in JavaScript, and Japanese textlint rules are written against its tokens.
Its API builds a tokenizer with a callback, and every build loads the dictionary.

### Problems to solve

Rule authors want the tokens of a text without handling the dictionary and the callback themselves.

When each rule loads its own dictionary and analyzes the same sentence again, a textlint run gets slow and uses much memory.
The work has to be shared between the rules of one run.

Rules compare tokens with patterns, such as a particle followed by a certain verb.
When the tokens of a text change, a rule stops detecting without any error.
So rules depend on the exact result of the analysis, and it has to stay stable.

Writers pay for the analysis on every run without choosing it.
Every sentence of every document is analyzed, and the dictionary is installed with every project and loaded on every run.
Unless the analysis is fast and the dictionary is small, they become the main cost of running Japanese rules.
This matters even more in a browser, where the dictionary is downloaded.

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
- **Offering:** The dictionary is loaded once per process, and the tokens of a text are reused when another rule asks for the same text with the same dictionary version.
- **Reason:** Loading the dictionary and analyzing text are the expensive parts, and the rules of one run ask for the same sentences.

### Tokens that rules can rely on

- **Recipient:** Rule authors
- **Offering:** The same tokens for the same text in every release of a major version, equal to the tokens that kuromoji.js returns. A rule that needs newer words names a dictionary version, and the tokens of that version stay the same in the same way.
- **Reason:** A rule that compares tokens with patterns stops detecting without any error when the tokens change.

### Analysis that is a small part of a run

- **Recipient:** Writers who run Japanese rules
- **Offering:** An analyzer and a dictionary format that are made for this use: the analysis is fast, and the dictionary is small to install and download and quick to load, in Node.js and in browsers.
- **Reason:** The time of a run should go to the rules that the writer chose, not to the analysis under them.

## Key concepts

- **Token:** One word in the result of the analysis, with its fields such as `surface_form`, `pos`, `basic_form`, and `reading`.
- **Known word and unknown word:** A known word is a word found in the dictionary. An unknown word is a part of the text that is not in the dictionary, such as a new name. A token tells which one it is with `word_type`.
- **Dictionary:** The data that the analysis needs: the words with their parts of speech and readings, and the costs that decide which split of a text is the most natural. It is built from [mecab-ipadic](https://taku910.github.io/mecab/) (IPADIC) and is part of the kuromojin package.
- **Tokenizer:** The object that analyzes a text synchronously once the dictionary is loaded.
- **Dictionary path:** The file, directory, or URL that the dictionary is loaded from.
- **Dictionary version:** The dictionary as of a date. A change to the words of the dictionary belongs to a version, and a caller that names a date gets the changes up to that date.

## Feature list

| Feature | Description | Specification |
| --- | --- | --- |
| Tokenization | Returns the tokens of a Japanese text, and reuses the tokens of a text analyzed before | [Requirements](features/tokenization/requirements.md) |
| Dictionary | Finds the dictionary and loads it once for all callers | [Requirements](features/dictionary/requirements.md) |
| Dictionary versions | Lets a caller choose a newer dictionary by a date without changing the default one | [Requirements](features/dictionary-versions/requirements.md) |
| Online playground | Shows the tokens of a text typed in a browser | Not written |

## Definition of success

Not defined. See the open questions.

## Development principles

- **One copy for all callers.** The dictionary and the cache are kept per installed copy of kuromojin, so kuromojin is built to be installed once. The analyzer and the dictionary are part of the package, and a rule needs kuromojin alone.
- **Runs in Node.js and in browsers.** The same API works in both. Only the place of the dictionary differs.
- **The tokens of a text change only with a major version.** Rules depend on the exact tokens, so the analyzer and the default dictionary give the same result in every release of a major version. New words come as dictionary versions, and only the callers that name a version see them. The fix of a defect of the analysis, such as characters that are missing from the tokens, is released as a bug fix.
- **The analyzer and the dictionary format belong to kuromojin.** The analysis does not depend on another analyzer package, so both can be changed for speed and size as long as the tokens stay the same.

## SLA, SLI, and SLO

### SLA

None. kuromojin is an open source library without service guarantees.

### SLI and SLO

None, for the same reason.

## Open questions

- **Definition of success:** No product-wide outcome is defined. Decisions are made from the development principles instead. Revisit when a product-wide decision cannot be made from the principles. azu decides.
