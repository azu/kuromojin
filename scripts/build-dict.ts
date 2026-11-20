// LICENSE : MIT
// Build dict/kuromojin.dict and dict/DICTIONARY_VERSIONS.md.
//
// usage:
//   ts-node scripts/build-dict.ts                    build the dictionary of the package
//   ts-node scripts/build-dict.ts --entries <word>   print the entries of a word of the base dictionary
//   ts-node scripts/build-dict.ts --rewrite-versions build even when a version of the existing file is changed.
//                                                    Use it only for versions that are not released yet.
import fs from "fs";
import path from "path";
import {
    buildDictionary,
    checkReleasedVersions,
    parseVersions,
    readBaseEntries,
    readKuromojiFiles,
    readDictionaryTable,
    renderVersionList,
    toIpadicLine
} from "./buildDictionary";

/** The date of the IPADIC data of kuromoji.js 0.1.2: mecab-ipadic-2.7.0-20070801 */
const BASE_VERSION = "2007-08-01";
const root = path.join(__dirname, "..");
const kuromojiDirectory = path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict");
const dictionaryFile = path.join(root, "dict", "kuromojin.dict");
const versionListFile = path.join(root, "dict", "DICTIONARY_VERSIONS.md");
const versionsSource = path.join(root, "dict-source", "versions.csv");

const args = process.argv.slice(2);
const files = readKuromojiFiles(kuromojiDirectory);
const baseEntries = readBaseEntries(files);

const entriesIndex = args.indexOf("--entries");
if (entriesIndex !== -1) {
    const word = args[entriesIndex + 1];
    for (const entry of baseEntries) {
        if (entry.surface_form === word) console.log(`${entry.number},${toIpadicLine(entry)}`);
    }
} else {
    const versions = parseVersions(
        fs.readFileSync(versionsSource, "utf8"),
        BASE_VERSION,
        baseEntries,
        files["cc.dat.gz"]
    );
    const dictionary = buildDictionary(files, { baseVersion: BASE_VERSION, versions });
    if (fs.existsSync(dictionaryFile) && !args.includes("--rewrite-versions")) {
        checkReleasedVersions(
            readDictionaryTable(fs.readFileSync(dictionaryFile)).versions,
            readDictionaryTable(dictionary).versions
        );
    }
    fs.writeFileSync(dictionaryFile, dictionary);
    fs.writeFileSync(versionListFile, renderVersionList(BASE_VERSION, versions, baseEntries));
    console.log(
        `${path.relative(root, dictionaryFile)}: ${dictionary.length} bytes, ` +
            `versions: ${[BASE_VERSION, ...versions.map((version) => version.date)].join(", ")}`
    );
}
