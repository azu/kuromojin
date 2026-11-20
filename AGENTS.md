# kuromojin Development Guide

This file provides guidance for AI agents working on the kuromojin codebase.

kuromojin is a Japanese morphological analyzer for JavaScript, used mainly by textlint rules.
It is a TypeScript package managed with Yarn.

- Install and build: `yarn install` and `yarn run build`
- Test: `yarn test`
- Write code, comments, commit messages, issues, and pull requests in English

## Specification placement

Specifications live under `docs/products/`, using sdev's default layout.
They are not included in the npm package.
CI runs `./bin/sdev lint` on every pull request and on every push to `master`.

<!-- sdev:begin -->
## Specifications-first development

Before creating or changing specifications, design, implementation, or verification, run `./bin/sdev help` and choose the guide for the task.
Tasks include defining product purpose, specifying feature requirements, designing an implementation, and updating documents.

Treat an idea such as 'I want to build this' as a starting point for discussing purpose and scope, rather than permission to implement.
When only a document is requested, present the document and its key points, then stop. When implementation is requested, present requirement and design decisions along the way.
Ask the user about unresolved decisions affecting purpose, scope, or observable behavior.
Ask instead of inventing purposes or constraints; prefer available question tools and follow up according to the answers.
Read `./bin/sdev help workflow` for the full workflow.

Prioritize the consuming project's instructions, conventions, and existing specifications.
If no template is designated for a new document, choose one from `./bin/sdev template`. Respect an existing document's structure when editing it.

Use this project's Product, Requirements, and Design. Without another placement rule, put specifications under `docs/products/`.
Use the default language and translations configured in sdev.toml. Default-language documents use `.md`; other language versions use `.<language>.md`.
Keep language versions equivalent and update them in the same change.
<!-- sdev:end -->
