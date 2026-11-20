# Online playground

[日本語](requirements.ja.md)

## About this document

The online playground is a page of the website of kuromojin where a person types Japanese text and sees its tokens.
It lets a rule author look at the tokens of a text without setting up a project, and share a text and its tokens by a URL.
The page is also the working example of kuromojin in a browser: it is built with a bundler and loads the dictionary of the package from its own site.
The website also serves the dictionary files to other pages, so that a developer can try kuromojin in a browser.
The parent Product is [kuromojin](../../product.md).

### Scope

- Showing the tokens of a text that is typed into the page
- Keeping the text in the URL of the page
- Where the page gets the dictionary from
- The dictionary files that the website serves to other pages

### Out of scope

- Choosing a dictionary version on the page. See the open questions
- Analysis on a server. The text is analyzed in the browser
- How a page finds and loads the dictionary. See [Dictionary](../dictionary/requirements.md)

## User stories

### See the tokens of a text in a browser

As a rule author, I want to see the tokens of a text in a browser so that I can write the patterns of my rule without setting up a project.

**Acceptance criteria:**

Scenario: When a text is typed, its tokens are shown

- Given: The playground with the dictionary loaded
- When: `黒文字` is typed into the text field
- Then: The output shows a JSON array with one token, whose `surface_form` is `黒文字` and whose `reading` is `クロモジ`, with all the fields of a token

Scenario: When the text changes, the tokens follow it

- Given: The playground that shows the tokens of `黒文字`
- When: The text is changed to `すもももももももものうち`
- Then: The output shows the tokens of the new text

Scenario: While the dictionary is loading, the page says so

- Given: A browser that opens the playground
- When: The dictionary is not loaded yet
- Then: The page shows that the dictionary is loading, and it shows that a text can be typed when the load has ended

Scenario: When a text is typed before the dictionary is loaded, its tokens are shown after the load

- Given: The playground whose dictionary is not loaded yet
- When: `黒文字` is typed into the text field, and the load ends
- Then: The output shows the tokens of `黒文字`

Scenario: When the dictionary cannot be loaded, the page shows the reason

- Given: A browser in which the load of the dictionary fails
- When: The playground is opened
- Then: The page shows the message of the error instead of the message for loading

### Share a text and its tokens

As a rule author, I want a URL that shows a text and its tokens so that I can show them in an issue.

**Acceptance criteria:**

Scenario: When a text is typed, the URL of the page has the text

- Given: The playground with the dictionary loaded
- When: `黒文字` is typed into the text field
- Then: The fragment of the URL of the page is the text in percent-encoding

Scenario: When a URL with a text is opened, the text and its tokens are shown

- Given: The URL of the playground with the fragment of `黒文字` in percent-encoding
- When: A browser opens the URL
- Then: The text field has `黒文字`, and the output shows its tokens after the dictionary is loaded

### See how a page uses the dictionary of the package

As a developer who uses kuromojin in a page that is built with a bundler, I want a working page that loads the dictionary of the package from its own site so that I can build my page in the same way.

**Acceptance criteria:**

Scenario: When the playground is opened, it loads the dictionary from its own site

- Given: The website of kuromojin
- When: A browser opens the playground
- Then: The browser requests one dictionary file, from the origin of the page, and it requests nothing from another origin

### Try kuromojin from another page

As a developer who tries kuromojin in a browser, I want a URL of the dictionary that any page can load so that I can try kuromojin before I serve the dictionary myself.

**Acceptance criteria:**

Scenario: When a page of another origin names the dictionary of the website, it is loaded

- Given: A page of another origin than the website of kuromojin
- When: The page calls `getTokenizer` with `{ dicPath: "https://kuromojin.netlify.app/dict/kuromojin.dict" }`
- Then: The Promise resolves with a tokenizer

Scenario: When a page of another origin names the directory of the website, the dictionary of kuromoji.js is loaded

- Given: A page of another origin than the website of kuromojin
- When: The page calls `getTokenizer` with `{ dicPath: "https://kuromojin.netlify.app/dict" }`
- Then: The page requests the twelve files of a dictionary of kuromoji.js, and the Promise resolves with a tokenizer

## KPIs

None. The speed and the size that a visitor of the playground sees are measured by the KPIs of [Dictionary](../dictionary/requirements.md#kpis) and [Tokenization](../tokenization/requirements.md#kpis).

## Functional requirements

### Show the tokens of a text

**Overview:** The playground analyzes the text of its text field and shows the tokens.

**Input:** The text of the text field.

**Output:** The tokens of the text as JSON with indentation, with the fields that `tokenize` returns.

#### Applicable conditions

The text is analyzed whenever it changes, and when the load of the dictionary ends.
The analysis runs in the browser with the default dictionary version, and the text is not sent to a server.
The tokens are shown as text, so characters of the text are never read as HTML.

The page shows a message about the dictionary: that it is loading, and then that a text can be typed.

#### Exceptional behavior

##### Dictionary that cannot be loaded

When the load of the dictionary fails, the page shows the message of the error.
A reason can be a browser without [`DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream), which the load of the dictionary needs.

### Keep the text in the URL

**Overview:** The URL of the page has the text, so that the URL shows the same text and tokens to another person.

**Input:** The text of the text field, or the fragment of the URL that the browser opens.

**Output:** A URL whose fragment is the text in percent-encoding, and a text field with the text of the fragment.

#### Applicable conditions

The fragment follows every change of the text.
When the page is opened with a fragment, the text of the fragment is put into the text field and analyzed.

#### Exceptional behavior

A fragment that is not valid percent-encoding is ignored, and the text field stays empty.

### Load the dictionary from the website

**Overview:** The playground loads the dictionary of the package from the site that serves the page.

**Input:** The dictionary file `kuromojin.dict` of the package, at the time when the website is built.

**Output:** A page that requests the dictionary from its own origin.

#### Applicable conditions

The page is built with a bundler, and it gets the URL of the dictionary file from the bundler.
A page of another project does the same with the path `kuromojin/dict/kuromojin.dict` of the npm package, which [Dictionary](../dictionary/requirements.md) describes.

#### Exceptional behavior

None.

### Serve the dictionary files to other pages

**Overview:** The website serves dictionary files that a page of any origin can load, for trying kuromojin in a browser.

**Input:** A request of a browser for a URL under `https://kuromojin.netlify.app/dict/`.

**Output:** The file, with a header that allows every origin to read it.

#### Applicable conditions

The website serves these files.

- **Dictionary of the package:** `https://kuromojin.netlify.app/dict/kuromojin.dict`, the file of the version of kuromojin that the website is built from.
- **Dictionary of kuromoji.js:** The twelve files of the dictionary of kuromoji.js 0.1.2 under `https://kuromojin.netlify.app/dict/`, for example `https://kuromojin.netlify.app/dict/base.dat.gz`.

The file of the dictionary of the package changes when the website is built from a newer kuromojin.
So these URLs are for trials. A page that needs the dictionary of one release serves the file of that release itself.

#### Exceptional behavior

None.

## Data requirements

### Required data

- **Text:** The text that a visitor types. It stays in the browser and in the fragment of the URL.
- **Dictionary files:** The dictionary of the package, and the dictionary of kuromoji.js 0.1.2.

### Relationships

One page has one text and the tokens of that text.

### Personal information

The website does not store the text.
The text is in the fragment of the URL, and a browser does not send the fragment to the server.
A visitor who shares the URL shares the text with it.

## External service dependencies

- **Netlify:** It builds and serves the website. When it is not available, the playground and the dictionary files of the website cannot be reached. kuromojin in Node.js does not depend on it.

## Security considerations

The text of the fragment comes from a URL that another person can make.
The page puts it into the text field and shows the tokens as text only, so it cannot run a script on the page.

## Open questions

- **Dictionary version on the page:** The page has no way to choose a [dictionary version](../dictionary-versions/requirements.md). Until this is decided, it analyzes with the default version. Revisit when the dictionary gets its first version after the base dictionary. azu decides.
