# Dictionary

[日本語](requirements.ja.md)

## About this document

The dictionary feature finds the dictionary that the analysis uses and loads it once for all callers.
In Node.js, a caller does not have to do anything: the dictionary that is installed with kuromojin is used.
In a browser, the page tells kuromojin the URL of the dictionary.
The parent Product is [kuromojin](../../product.md).

### Scope

- Which dictionary is used when the caller gives none
- How a caller or a page chooses another place for the dictionary
- Loading the dictionary once per process
- What happens when the dictionary cannot be loaded

### Out of scope

- The tokens that the analysis returns. See [Tokenization](../tokenization/requirements.md)
- Building a dictionary, and adding words to it
- Dictionaries other than IPADIC

## User stories

### Use Japanese rules without setting up a dictionary

As a writer who runs Japanese rules in Node.js, I want the dictionary to be found without any setting so that installing a rule is enough.

**Acceptance criteria:**

Scenario: When no dictionary path is given in Node.js, the installed dictionary is used

- Given: kuromojin installed with npm, and no `dicPath` option, no `KUROMOJIN_DIC_PATH`, and no `window.kuromojin`
- When: `getTokenizer` is called
- Then: The Promise resolves with a tokenizer that uses the dictionary of the kuromoji.js package installed with kuromojin

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

### Notice a dictionary that cannot be loaded

As a developer, I want a clear failure when the dictionary cannot be loaded so that I can fix the path.

**Acceptance criteria:**

Scenario: When a dictionary file cannot be read, the Promise is rejected with the error of the read

- Given: `KUROMOJIN_DIC_PATH` set to a directory that does not exist
- When: `getTokenizer` is called
- Then: The Promise is rejected with an error that names the file that could not be opened

## KPIs

None. No metric is defined for this feature.

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
4. The `dict` directory of the kuromoji.js package that is installed with kuromojin

The fourth one needs the file system of Node.js.
In a browser, the dictionary path has to be given by `options` or by `window.kuromojin.dicPath`.

#### Exceptional behavior

##### Options without a dictionary path

When the first call has `options` without `dicPath`, for example only `noCacheTokenize`, the other sources are not used.
The dictionary is looked up in `dict/` relative to the current directory, and the load usually fails.

### Load the dictionary

**Overview:** The first call of `getTokenizer` or `tokenize` loads the dictionary, and every later call uses the loaded one.

**Input:** The dictionary path.

**Output:** A tokenizer that every caller of the same installed copy of kuromojin shares.

#### Applicable conditions

##### Dictionary files

The dictionary is the twelve files of kuromoji.js 0.1.2, each compressed with gzip: `base.dat.gz`, `check.dat.gz`, `tid.dat.gz`, `tid_pos.dat.gz`, `tid_map.dat.gz`, `cc.dat.gz`, `unk.dat.gz`, `unk_pos.dat.gz`, `unk_map.dat.gz`, `unk_char.dat.gz`, `unk_compat.dat.gz`, and `unk_invoke.dat.gz`.
They are read from the dictionary path with the file system in Node.js and with HTTP requests in a browser.

##### One dictionary per installed copy

The loaded dictionary is kept until the process ends.
It is shared by the callers of one installed copy of kuromojin.
When `node_modules` has several copies of kuromojin, each copy loads its own dictionary.

#### Exceptional behavior

##### Dictionary that cannot be loaded

When a file cannot be read, the Promise of the call is rejected with the error of the read.
kuromojin does not try again: every later call in the process is rejected with the same error, even with another dictionary path.

## Data requirements

### Required data

- **Dictionary files:** The words of IPADIC with their parts of speech, readings, and costs, in the format of kuromoji.js. kuromojin only reads them.

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

None.
