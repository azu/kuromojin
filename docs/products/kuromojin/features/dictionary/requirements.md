# Dictionary

[日本語](requirements.ja.md)

## About this document

The dictionary feature finds the dictionary that the analysis uses and loads it once for all callers.
In Node.js, a caller does not have to do anything: the dictionary that is part of the kuromojin package is used.
In a browser, the page tells kuromojin the URL of the dictionary.
The parent Product is [kuromojin](../../product.md).

### Scope

- Which dictionary is used when the caller gives none
- How a caller or a page chooses another place for the dictionary
- Which formats of dictionary can be loaded, and where
- Loading the dictionary once per process
- What happens when the dictionary cannot be loaded
- The size of the dictionary of the package

### Out of scope

- The tokens that the analysis returns. See [Tokenization](../tokenization/requirements.md)
- Choosing a newer dictionary within a major version. The [Product](../../product.md) lists it as a feature that is not written yet
- A tool for users to build a dictionary or to add words to it
- A dictionary without readings. See the open questions

## User stories

### Use Japanese rules without setting up a dictionary

As a writer who runs Japanese rules in Node.js, I want the dictionary to be found without any setting so that installing a rule is enough.

**Acceptance criteria:**

Scenario: When no dictionary path is given in Node.js, the dictionary of the package is used

- Given: kuromojin installed with npm, and no `dicPath` option, no `KUROMOJIN_DIC_PATH`, and no `window.kuromojin`
- When: `getTokenizer` is called
- Then: The Promise resolves with a tokenizer that uses the dictionary in the `dict` directory of the kuromojin package

Scenario: When the first call has options without a dictionary path, the dictionary of the package is used

- Given: The same installation, and the dictionary not loaded yet
- When: `tokenize` is called with a text and `{ noCacheTokenize: true }`
- Then: The Promise resolves with the tokens of the text, analyzed with the dictionary of the package

### Load the dictionary once for all rules

As a writer who runs many Japanese rules, I want the dictionary to be loaded once so that a run does not pay its time and memory for every rule.

**Acceptance criteria:**

Scenario: When many callers ask for the tokenizer at the same time, the dictionary is loaded once

- Given: The dictionary is not loaded yet
- When: `getTokenizer` is called ten times before the first call resolves
- Then: The dictionary files are read once, and all ten Promises resolve with the same tokenizer

Scenario: When the dictionary is already loaded, a later dictionary path is not used

- Given: `getTokenizer` has resolved with a tokenizer
- When: `getTokenizer` is called with another `dicPath`
- Then: The Promise resolves with the same tokenizer, and no file is read from the other path

### Choose where the dictionary comes from

As a developer who uses kuromojin in a browser or in a special environment, I want to tell kuromojin where the dictionary is so that it can be loaded from a URL or from another directory.

**Acceptance criteria:**

Scenario: When a page sets the dictionary URL globally, every module uses it

- Given: A page that sets `window.kuromojin = { dicPath: "https://example.com/dict" }` before the dictionary is loaded
- When: Any module of the page calls `getTokenizer` or `tokenize` without options
- Then: The dictionary files are requested from `https://example.com/dict/`

Scenario: When the first call has a dictionary path, the dictionary is loaded from it

- Given: The dictionary is not loaded yet
- When: `getTokenizer({ dicPath })` is called with the path of a directory that has the dictionary files
- Then: The dictionary is loaded from that directory, even when `KUROMOJIN_DIC_PATH` names another one

Scenario: When the environment variable is set, the dictionary is loaded from it

- Given: `KUROMOJIN_DIC_PATH` set to the path of a directory that has the dictionary files, and the dictionary not loaded yet
- When: `getTokenizer` is called without options
- Then: The dictionary is loaded from that directory

### Keep using a dictionary of kuromoji.js

As a developer whose page or project points kuromojin at a dictionary of kuromoji.js, I want that dictionary to keep working so that I can update kuromojin without changing my setup.

**Acceptance criteria:**

Scenario: When the dictionary path has a dictionary of kuromoji.js, it is loaded

- Given: A dictionary path with the twelve `*.dat.gz` files of the `dict` directory of kuromoji.js 0.1.2, and the dictionary not loaded yet
- When: `tokenize` is called with the text `黒文字`
- Then: The Promise resolves with the same token as with the dictionary of the package

### Notice a dictionary that cannot be loaded

As a developer, I want a clear failure when the dictionary cannot be loaded so that I can fix the path.

**Acceptance criteria:**

Scenario: When a dictionary file cannot be read, the Promise is rejected with the error of the read

- Given: `KUROMOJIN_DIC_PATH` set to a directory that does not exist
- When: `getTokenizer` is called
- Then: The Promise is rejected with an error that names the file that could not be opened

## KPIs

### Size of the dictionary of the package

- **Target value:** No larger than in the previous release. Smaller is preferred.
- **Measurement method:** Add up the sizes of the files in the `dict` directory of the package, as they are published.
- **Measurement period:** When the dictionary or its format changes.

### Time to load the dictionary

- **Target value:** No slower than the previous release on the same machine. Faster is preferred.
- **Measurement method:** Measure the time from the first call of `getTokenizer` to its result in a new process, several times, and compare medians between the previous release and the change.
- **Measurement period:** When the dictionary, its format, or the loading changes.

## Functional requirements

### Choose the dictionary path

**Overview:** kuromojin decides the dictionary path when the first call of `getTokenizer` or `tokenize` starts loading.

**Input:** The `options` of that call, the environment variable `KUROMOJIN_DIC_PATH`, and `window.kuromojin.dicPath`.

**Output:** The directory or URL that the dictionary files are loaded from.

#### Applicable conditions

The first of these that exists is used.

1. `dicPath` of the `options` of the call
2. The environment variable `KUROMOJIN_DIC_PATH`
3. `window.kuromojin.dicPath`
4. The `dict` directory of the kuromojin package

A source that is not set is skipped. So `options` without `dicPath`, for example with only `noCacheTokenize`, leave the choice to the other three.

The fourth one needs the file system of Node.js.
In a browser, the dictionary path has to be given by `options` or by `window.kuromojin.dicPath`.
The `dict` directory is published in the npm package, so a server that serves the files of the package can be that path.

#### Exceptional behavior

##### No dictionary path in a browser

When a browser has none of the first three, the load fails as described under [Dictionary that cannot be loaded](#dictionary-that-cannot-be-loaded).

### Load the dictionary

**Overview:** The first call of `getTokenizer` or `tokenize` loads the dictionary, and every later call uses the loaded one.

**Input:** The dictionary path.

**Output:** A tokenizer that every caller of the same installed copy of kuromojin shares.

#### Applicable conditions

##### Dictionary of the package

The dictionary of the package has the words of the IPADIC dictionary of kuromoji.js 0.1.2, with the same parts of speech, readings, and costs.
It is stored in the format of kuromojin, which is made to be small to download and quick to load.
A dictionary in this format is a directory with a file named `kuromojin-dict.json`, which tells the version of the format, and data files compressed with gzip.

##### Dictionary of kuromoji.js

A dictionary path can also have a dictionary in the format of kuromoji.js: the twelve files `base.dat.gz`, `check.dat.gz`, `tid.dat.gz`, `tid_pos.dat.gz`, `tid_map.dat.gz`, `cc.dat.gz`, `unk.dat.gz`, `unk_pos.dat.gz`, `unk_map.dat.gz`, `unk_char.dat.gz`, `unk_compat.dat.gz`, and `unk_invoke.dat.gz`.
kuromojin tells the two formats apart by itself, and the caller does not name the format.
Such a dictionary can have other words than the dictionary of the package, for example when a user built it with the tools of kuromoji.js. The tokens then follow that dictionary.

##### Node.js and browsers

In Node.js, the files are read from the dictionary path with the file system.
In a browser, they are requested with HTTP and decompressed by the browser, so the browser needs `fetch` and [`DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream).

##### One dictionary per installed copy

The loaded dictionary is kept until the process ends.
It is shared by the callers of one installed copy of kuromojin.
When `node_modules` has several copies of kuromojin, each copy loads its own dictionary.

#### Exceptional behavior

##### Dictionary that cannot be loaded

When a file cannot be read, the Promise of the call is rejected with the error of the read.
When `kuromojin-dict.json` tells a version of the format that the installed kuromojin does not know, the Promise is rejected with an error that names the version.
kuromojin does not try again: every later call in the process is rejected with the same error, even with another dictionary path.

## Data requirements

### Required data

- **Dictionary files:** The words of IPADIC with their parts of speech, readings, and costs. kuromojin only reads them.
- **Notices:** The copyright and license notices of mecab-ipadic and of kuromoji.js. They are published in the `dict` directory together with the dictionary files.

### Relationships

One installed copy of kuromojin has at most one loaded dictionary.

### Personal information

None. The dictionary does not contain data about the users of kuromojin.

## External service dependencies

None. In Node.js the dictionary is read from the installed package.
In a browser the page chooses the server that has the dictionary files, and kuromojin does not name one.

## Security considerations

The dictionary decides the result of the analysis, so it has to come from a place that the caller trusts.
In a browser, the request for the dictionary shows the server that a page uses kuromojin, but the text to analyze is not sent.

## Open questions

- **Dictionary without readings:** A dictionary without `reading` and `pronunciation` would be smaller, but a rule whose patterns name a reading would stop detecting without any error. Until this is decided, the dictionary of the package has both fields for every word. Revisit when the rules of textlint-rule-preset-ja-technical-writing no longer name readings in their patterns. azu decides.
