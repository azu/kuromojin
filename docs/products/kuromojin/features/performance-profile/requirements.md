# Performance profile

[日本語](requirements.ja.md)

## About this document

The performance profile measures one build of kuromojin on fixed sets of Japanese texts: the time to load the dictionary, the time of the analysis, the memory, the allocations, the installed size, and where the CPU time goes.
The comparison takes the profile of two builds, the base (such as `master`) and the head (a pull request), in turns, and shows them side by side with their ratio and with the texts whose tokens differ.
It lets the author, an AI agent, and a reviewer see what a change does to the performance before the change is merged, so that kuromojin does not get slower or larger without anyone noticing.
A developer and an AI agent run the profile and the comparison locally, and CI runs the comparison for each pull request and puts its output in the job summary.
The parent Product is [kuromojin](../../product.md). This feature keeps its value "Analysis that is a small part of a run" for the writers who run Japanese rules; the people who use the feature are the people and the AI agents who change kuromojin.

### Scope

- The profile of one build: what is measured, the sets of texts, and the output as Markdown, JSON, and CPU profiles
- The comparison of two builds
- The CI job that runs the comparison for a pull request, including a pull request from a fork
- The instruction for AI agents to run the comparison and to put its output in the pull request

### Out of scope

- Deciding if a change is acceptable. The comparison shows differences, and a person decides
- Failing CI because of a difference. CI shows the result and does not fail on it
- A comment on the pull request
- A profile that a caller of kuromojin takes of its own run. The package gets no API for profiling; the profile measures a build from outside, through the functions that every caller uses
- A history of the profiles of `master`
- The time of a textlint run. The rules of a run belong to their repositories

## User stories

### See what a change does before opening a pull request

As a developer or an AI agent that changes the analyzer, the loading of the dictionary, the dictionary, or the reuse of tokens, I want one command that compares my branch with `master` so that I can put the differences in the description of the pull request.

**Acceptance criteria:**

Scenario: When the head makes the analysis faster, the output shows it for the analysis

- Given: The head changes the analyzer to analyze a text faster, and the base is `master`.
- When: The developer runs the comparison.
- Then: The Markdown output shows the time of the analysis for the base and the head with their ratio, marks the ratio as faster, and shows the functions that take the most CPU time in each build.

Scenario: When the head changes the tokens of a text, the output lists the text

- Given: The head changes the analyzer so that one line of a set gets other tokens.
- When: The developer runs the comparison.
- Then: The output says that the tokens differ for one line, and shows the line with the first token that differs in each build.

Scenario: When the head keeps more memory, the output marks the memory

- Given: The head changes the analyzer so that it keeps the working memory of the longest text, and the times change less than their noise.
- When: The developer runs the comparison.
- Then: The output marks the memory after the analysis as larger, and shows the memory of the base and the head with their ratio.

Scenario: When the head does not change the build, the output says that nothing changed

- Given: The head changes only documentation.
- When: The developer runs the comparison.
- Then: The output says that the tokens are the same, and shows the numbers of the base and the head without a mark.

Scenario: When the base analyzes with other code, every item is still compared

- Given: The base is a commit whose analysis is done by another package, and the head has its own analyzer.
- When: The developer runs the comparison.
- Then: The output has every item for both builds, because each item is measured through `getTokenizer` and `tokenize` and from the files of the build.

### Find where the time goes in one build

As a developer who looks for something to make faster, I want the profile of my working tree alone so that I can see the numbers and the slow functions without building another commit.

**Acceptance criteria:**

Scenario: When the profile runs, it shows every item of the working tree

- Given: The working tree is built.
- When: The developer runs the profile.
- Then: The Markdown output shows every item of the profile for each selected set, and the functions that take the most CPU time.

Scenario: When the profile or the comparison finishes, the CPU profiles are kept

- Given: The profile or the comparison has run.
- When: The developer opens the output directory or the artifact of CI.
- Then: It has a CPU profile of each build for each set, in the format that Chrome DevTools opens.

### Notice a change in a pull request from someone else

As a maintainer who reviews a pull request, I want CI to run the comparison so that I do not need to build and measure the pull request locally.

**Acceptance criteria:**

Scenario: When a pull request changes the source, CI puts the comparison in the job summary

- Given: A pull request from a fork changes a file under `src/`.
- When: CI runs for the pull request.
- Then: The job summary has the Markdown output of the comparison of the base commit of the pull request and its head, and the run has the JSON output and the CPU profiles as an artifact. A difference does not fail the job.

Scenario: When the code of a pull request is malicious, it gets no secret and no write access

- Given: A pull request from a fork changes the scripts of the profile to print the environment and to push to the repository.
- When: CI runs the comparison for the pull request.
- Then: The job has no secret of the repository and a token that can only read. The push fails, and nothing outside the run is changed.

Scenario: When a pull request changes only documents, the comparison does not run

- Given: A pull request changes only Markdown files under `docs/`.
- When: CI runs for the pull request.
- Then: The comparison workflow does not run.

### Read the result from an AI agent

As an AI agent that reviews a pull request or investigates a slowdown, I want the result as JSON so that I can read the numbers without parsing a table.

**Acceptance criteria:**

Scenario: When the comparison finishes, the JSON has both builds and what changed

- Given: The comparison has run.
- When: The agent reads the JSON output.
- Then: The JSON has the commits of the base and the head, the sets of texts, every item of both builds with its ratio and its mark, the texts whose tokens differ, and the CPU time of each function.

## KPIs

None. No metric is defined for this feature.

## Functional requirements

### Profile

**Overview:** Measures one build of kuromojin on sets of texts.

**Input:** The sets of texts. The build is the working tree.

**Output:** Markdown on the standard output, and Markdown, JSON, and CPU profiles in an output directory.

#### Applicable conditions

##### What is measured

Every item is measured through `getTokenizer` and `tokenize` of the build, or from the files of the build. The profile does not read or call anything inside the package, so two builds with different insides are measured in the same way.

| Item | How | Why |
| --- | --- | --- |
| Tokens | The tokens of every line and of every file of the set | The tokens of a text change only with a major version. The comparison shows the texts whose tokens differ |
| Load of the dictionary | The time from loading the module to the tokenizer, in a process that has loaded nothing. Several processes | A writer pays it once in every run |
| Memory after the load | The memory that the process uses after the load, after a garbage collection | The dictionary stays in memory for the whole run |
| Analysis of each line | The time to analyze every line of the set with the tokenizer, without reusing tokens. The analysis is repeated, and the fastest pass counts | Rules ask for the tokens of sentences, so this is the main work of kuromojin in a run |
| Analysis of each file | The time to analyze each file of the set as one text | A long text needs a large working memory, which short lines do not show |
| `tokenize` of a remembered text | The time of one `tokenize` call for a text whose tokens are remembered | In a run with many rules, most calls end here |
| Allocation of the analysis | The bytes that the analysis of every line allocates, and the number and the pause of the garbage collections | Allocation becomes pauses of garbage collection in the run of the caller |
| Memory after the analysis | The memory that the process uses after `tokenize` of every line and the analysis of every file, after a garbage collection | It shows what kuromojin keeps: the remembered tokens and the working memory |
| Installed size | The size of the files of the package and of the files of its dependencies | A writer installs them with every project |
| CPU time | A CPU profile of the load and the analysis, summed by package and by function | It tells which function to look at |

A build whose analysis is slow is measured with fewer passes, so that a profile ends in a time that does not grow with the slowness of the build.

##### Sets of texts

| Set | Texts |
| --- | --- |
| small | The Japanese documents of this repository |
| medium | The Japanese documents of a public repository at a commit that the profile fixes |

A set has lines and files. A line is a line of a document that is not empty; it stands for the sentences that rules pass. A file is the whole text of a document.
The medium set is downloaded on its first use and kept on the machine. Both builds of a comparison always get the same texts.
Without a selection, every set is used.

##### Output

The Markdown output shows, for each set, the number of files, lines, and characters, and a table of the items.
After the sets, it shows the installed size, and the packages and the functions with the most CPU time.
The output directory gets the same Markdown, the JSON with every number, and the CPU profiles.

#### Exceptional behavior

##### The working tree is not built

The profile builds the working tree first. When the developer tells it not to build and there is no build, it stops with a message that tells how to build, and writes no result.

##### An unknown set

The profile stops with a message that names the sets, before it measures anything.

##### The medium set cannot be downloaded

The profile stops with a message that names the repository and the commit, and writes no result. The small set needs no download.

##### A measurement fails

When a measurement of a build fails, for example because the build throws for a text, the profile stops with a message that names the build, the set, and the measurement, with the error of the build. It writes no result.

### Comparison

**Overview:** Takes the profile of two builds on the same sets and shows the differences.

**Input:** The base (a Git ref, `master` by default) and the sets of texts. The head is the working tree.

**Output:** The output of the profile with the numbers of both builds, their ratio, and what changed.

#### Applicable conditions

##### Builds

The base is built from its commit in a directory outside the working tree, and the build is kept for the next comparison with the same commit.
The dependencies of the base are the ones that its commit locks.
The measurements of the two builds run in turns, so that a change of the load of the machine reaches both.
Both builds do the same work for their CPU profiles, so the times of a function in the two profiles can be compared.

##### What changed

The output starts with what changed for each set, so that a reader sees at a glance whether anything changed.
The ratio of an item is the number of the head divided by the number of the base.
An item is marked when its ratio is outside the range of the table. A difference that is too small to measure is not marked.
Of the installed size, the sum is marked and its two parts are not, because files move between the package and its dependencies.

| Items | Marked as slower or larger from | Marked as faster or smaller up to |
| --- | --- | --- |
| Analysis of each line, analysis of each file, `tokenize` of a remembered text | 1.1x | 0.91x |
| Load of the dictionary | 1.2x | 0.83x |
| Memory, allocated bytes, installed size | 1.1x | 0.91x |
| Pause of garbage collection | 1.3x | 0.77x |

When the tokens of a line or a file differ, the output shows the number of such lines and files, and the first ten of them with the first token that differs in each build.

#### Exceptional behavior

##### The base does not exist or cannot be built

The comparison stops with a message that names the ref or the step that failed, and measures nothing.

### CI job

**Overview:** Runs the comparison for a pull request.

**Input:** A pull request that changes the source, the dictionary, the scripts of the profile, the files that decide the build and the dependencies, or the workflow.

**Output:** The Markdown output in the job summary, and the output directory as an artifact.

#### Applicable conditions

The base is the base commit of the pull request, and the head is the pull request.
The job uses every set.
The job fails only when the comparison cannot finish. A difference between the builds does not fail it.
The job runs the code of the pull request, so it has no secret and a token that can only read.

### Instruction for AI agents

**Overview:** Tells an AI agent that works in the repository when to run the profile and the comparison.

**Input:** A change to the analyzer, the loading of the dictionary, the dictionary, or the reuse of tokens.

**Output:** The output of the comparison in the description of the pull request.

#### Applicable conditions

The instructions of the repository for AI agents name the two commands, and say to put the Markdown output in the description of the pull request for such a change.

## Data requirements

### Required data

- **Sets of texts:** The documents that the builds analyze. They are public documents, and the medium set is kept on the machine after the download
- **Build of the base:** The files of the base commit and its dependencies, kept on the machine for the next comparison
- **Result:** The numbers of each build, the differences of the tokens, and the CPU profiles. They are files in the output directory, and an artifact of the run in CI

### Relationships

A result belongs to one or two builds and to the sets that were selected.

### Personal information

None. The sets are public documents, and a result has no information about a person. A CPU profile has the paths of the files of the build on the machine that ran it.

## External service dependencies

- **GitHub**
  - **Related user stories:** All, for the medium set. "Notice a change in a pull request from someone else", for the CI job
  - **Reason for dependency:** The medium set is a public repository on GitHub, and the CI job runs on GitHub Actions
  - **Contractual and usage decisions:** The download needs no account. The CI job uses the free minutes of a public repository

## Security considerations

The CI job runs the code of a pull request, also from a fork.
It must not have a secret of the repository or a token that can write.

## Open questions

- **Ranges of the marks:** The ranges of the table are a first choice. Revisit when CI marks a pull request that changes nothing, or misses a change that a person notices. azu decides.
