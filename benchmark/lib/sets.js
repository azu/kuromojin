// The sets of texts that the builds analyze
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { HEAD_ROOT, ProfileError, git, log } = require("./command");

const SETS = JSON.parse(fs.readFileSync(path.join(__dirname, "../sets.json"), "utf-8"));
const SET_NAMES = Object.keys(SETS);

const listFiles = (dir, ending) => {
    const files = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(entryPath);
            } else if (entry.isFile() && entry.name.endsWith(ending)) {
                files.push(entryPath);
            }
        }
    };
    walk(dir);
    // readdir gives no order
    return files.sort();
};

/**
 * The lines and the files of documents.
 * A line is a line that is not empty. It stands for a sentence that a rule passes to kuromojin.
 * @param {{ path: string, text: string }[]} documents
 */
const createTexts = (documents) => {
    const lines = [];
    let characters = 0;
    for (const document of documents) {
        for (const line of document.text.split(/\r?\n/)) {
            if (line.trim() !== "") {
                lines.push(line);
                characters += line.length;
            }
        }
    }
    return { lines, files: documents, characters };
};

/** Download the documents of a set at its commit, once for a machine */
const downloadSet = (name, set, cacheDir) => {
    const dir = path.join(cacheDir, "sets", `${name}-${set.commit}`);
    const marker = path.join(dir, ".profile-ready");
    if (!fs.existsSync(marker)) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        log(`downloading ${set.repository} ${set.commit.slice(0, 12)} (${set.path})`);
        try {
            git(["init", "--quiet"], dir);
            git(["remote", "add", "origin", set.repository], dir);
            git(["sparse-checkout", "set", "--no-cone", `/${set.path}/**`], dir);
            git(["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", set.commit], dir);
            git(["checkout", "--quiet", "FETCH_HEAD"], dir);
        } catch (error) {
            throw new ProfileError(
                `The set ${name} cannot be downloaded from ${set.repository} at ${set.commit}.\n${error.message}`
            );
        }
        fs.writeFileSync(marker, set.commit);
    }
    return path.join(dir, set.path);
};

const checkSetNames = (names) => {
    for (const name of names) {
        if (!SET_NAMES.includes(name)) {
            throw new ProfileError(`Unknown set: ${name}. The sets are ${SET_NAMES.join(", ")}.`);
        }
    }
};

/**
 * @param {string} name
 * @param {string} cacheDir
 */
const prepareSet = (name, cacheDir) => {
    const set = SETS[name];
    const dir = set.repository ? downloadSet(name, set, cacheDir) : path.join(HEAD_ROOT, set.path);
    const documents = listFiles(dir, set.ending).map((file) => ({
        path: path.relative(dir, file).split(path.sep).join("/"),
        text: fs.readFileSync(file, "utf-8")
    }));
    if (documents.length === 0) {
        throw new ProfileError(`The set ${name} has no document: no file that ends with ${set.ending} in ${dir}.`);
    }
    return {
        name,
        label: set.label,
        repository: set.repository ?? null,
        commit: set.commit ?? null,
        texts: createTexts(documents)
    };
};

module.exports = { SET_NAMES, checkSetNames, prepareSet, createTexts };
