// LICENSE : MIT
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
    checkReleasedVersions,
    parseVersions,
    readBaseEntries,
    readKuromojiFiles,
    readDictionaryTable,
    renderVersionList,
    renderVersionType,
    toIpadicLine
} from "../scripts/buildDictionary";
import {
    BASE_VERSION,
    kuromojiDictionaryDirectory,
    packageDictionaryFile,
    testVersions,
    writeTestDictionary
} from "./helpers";

describe("build of the dictionary", function () {
    this.timeout(120000);
    const files = readKuromojiFiles(kuromojiDictionaryDirectory);
    const baseEntries = readBaseEntries(files);
    const parse = (text: string) => parseVersions(text, BASE_VERSION, baseEntries, files["cc.dat.gz"]);
    const reiwa = "令和,1288,1288,5904,名詞,固有名詞,一般,*,*,*,令和,レイワ,レイワ";
    const heisei = baseEntries.find((entry) => entry.surface_form === "平成");
    if (!heisei) throw new Error("the base dictionary has 平成");

    context("dictionary of the package", function () {
        it("has the versions of dict-source/versions.csv", function () {
            const source = fs.readFileSync(path.join(__dirname, "..", "dict-source", "versions.csv"), "utf8");
            const versions = parse(source);
            const stored = readDictionaryTable(fs.readFileSync(packageDictionaryFile)).versions;
            const built = readDictionaryTable(fs.readFileSync(writeTestDictionary("package.dict", versions))).versions;
            // the versions of the file are the versions of the source: the same dates, entries, and changes
            assert.deepStrictEqual(stored, built);
            assert.strictEqual(stored[0].date, BASE_VERSION);
            assert.strictEqual(stored[0].entries, baseEntries.length);
        });
        it("has a list of versions for readers that is written from the same source", function () {
            const source = fs.readFileSync(path.join(__dirname, "..", "dict-source", "versions.csv"), "utf8");
            const list = fs.readFileSync(path.join(__dirname, "..", "dict", "DICTIONARY_VERSIONS.md"), "utf8");
            assert.strictEqual(list, renderVersionList(BASE_VERSION, parse(source), baseEntries));
        });
        it("has a type of the dates of its versions that is written from the same source", function () {
            const source = fs.readFileSync(path.join(__dirname, "..", "dict-source", "versions.csv"), "utf8");
            const type = fs.readFileSync(path.join(__dirname, "..", "src", "analyzer", "DictionaryVersion.ts"), "utf8");
            assert.strictEqual(type, renderVersionType(BASE_VERSION, parse(source)));
            const stored = readDictionaryTable(fs.readFileSync(packageDictionaryFile)).versions;
            for (const { date } of stored) assert.ok(type.includes(JSON.stringify(date)), date);
        });
        it("is smaller than the dictionary of kuromoji.js", function () {
            const kuromojiSize = fs
                .readdirSync(kuromojiDictionaryDirectory)
                .reduce((sum, file) => sum + fs.statSync(path.join(kuromojiDictionaryDirectory, file)).size, 0);
            assert.ok(fs.statSync(packageDictionaryFile).size < kuromojiSize / 2);
        });
    });

    context("changes of versions", function () {
        it("reads added and removed entries with the date of their version", function () {
            const versions = parse(
                [
                    "# comment",
                    "",
                    `2027-04-01,add,${reiwa}`,
                    `2027-04-01,remove,${heisei.number},${toIpadicLine(heisei)}`,
                    `2027-10-01,remove,${baseEntries.length},${reiwa}`
                ].join("\n")
            );
            assert.deepStrictEqual(
                versions.map((version) => [version.date, version.added.length, version.removed]),
                [
                    ["2027-04-01", 1, [heisei.number]],
                    ["2027-10-01", 0, [baseEntries.length]]
                ]
            );
            assert.strictEqual(toIpadicLine(versions[0].added[0]), reiwa);
        });
        it("rejects a line that is not a change", function () {
            assert.throws(() => parse(`2027-4-1,add,${reiwa}`), /Line 1: "2027-4-1" is not a date/);
            // a caller names a version by its date, so a date that no calendar has is not a version
            assert.throws(() => parse(`2027-02-30,add,${reiwa}`), /Line 1: "2027-02-30" is not a date/);
            assert.throws(() => parse(`2027-04-31,add,${reiwa}`), /Line 1: "2027-04-31" is not a date/);
            assert.strictEqual(parse(`2028-02-29,add,${reiwa}`)[0].date, "2028-02-29");
            assert.throws(() => parse(`2027-04-01,change,${reiwa}`), /Line 1: the second field is "add" or "remove"/);
            assert.throws(() => parse(`2027-04-01,add,令和,1288,1288`), /Line 1: an entry has 13 fields/);
            assert.throws(
                () => parse(`2027-04-01,add,令和,x,1288,5904,名詞,固有名詞,一般,*,*,*,令和,レイワ,レイワ`),
                /integers/
            );
        });
        it("rejects ids that are not in the connection costs", function () {
            assert.throws(
                () => parse(`2027-04-01,add,令和,9999,1288,5904,名詞,固有名詞,一般,*,*,*,令和,レイワ,レイワ`),
                /Line 1: the left id or the right id is not in the connection costs/
            );
        });
        it("rejects dates that are not later than the dates before", function () {
            assert.throws(() => parse(`${BASE_VERSION},add,${reiwa}`), /has to be later than 2007-08-01/);
            assert.throws(
                () => parse([`2027-10-01,add,${reiwa}`, `2027-04-01,add,${reiwa}`].join("\n")),
                /Line 2: the date 2027-04-01 has to be later than 2027-10-01/
            );
        });
        it("rejects the removal of an entry that does not exist or is not the entry of the line", function () {
            assert.throws(
                () => parse(`2027-04-01,remove,99999999,${reiwa}`),
                /there is no entry with the number 99999999/
            );
            assert.throws(
                () => parse(`2027-04-01,remove,${heisei.number},${reiwa}`),
                new RegExp(`the entry ${heisei.number} is not the entry of the line. It is: 平成,1288,1288,5904`)
            );
            const twice = `2027-04-01,remove,${heisei.number},${toIpadicLine(heisei)}`;
            assert.throws(() => parse([twice, twice].join("\n")), /Line 2: there is no entry/);
        });
        it("writes the number of entries up to each version into the table", function () {
            const table = readDictionaryTable(
                fs.readFileSync(
                    writeTestDictionary("table.dict", [
                        ...testVersions,
                        { date: "2028-04-01", added: [], removed: [heisei.number, baseEntries.length] }
                    ])
                )
            );
            assert.deepStrictEqual(
                table.versions.map((version) => [version.date, version.entries, version.removed]),
                [
                    [BASE_VERSION, baseEntries.length, []],
                    ["2027-04-01", baseEntries.length + 1, []],
                    ["2027-10-01", baseEntries.length + 2, []],
                    ["2028-04-01", baseEntries.length + 2, [heisei.number, baseEntries.length]]
                ]
            );
        });
        it("rejects a change to a version of the existing dictionary file", function () {
            const versionsOf = (name: string, versions: typeof testVersions) =>
                readDictionaryTable(fs.readFileSync(writeTestDictionary(name, versions))).versions;
            const released = versionsOf("released.dict", testVersions);
            checkReleasedVersions(released, released);
            checkReleasedVersions(
                released,
                versionsOf("later.dict", [...testVersions, { date: "2028-04-01", added: [], removed: [1] }])
            );
            assert.throws(
                () => checkReleasedVersions(released, versionsOf("missing.dict", testVersions.slice(0, 1))),
                /2027-10-01.*is changed or missing/
            );
            const changed = [
                { ...testVersions[0], added: [{ ...testVersions[0].added[0], reading: "レーワ" }] },
                testVersions[1]
            ];
            assert.throws(
                () => checkReleasedVersions(released, versionsOf("changed.dict", changed)),
                /2027-04-01.*is changed or missing/
            );
            const removedMore = [testVersions[0], { ...testVersions[1], removed: [1] }];
            assert.throws(
                () => checkReleasedVersions(released, versionsOf("removed.dict", removedMore)),
                /2027-10-01.*is changed or missing/
            );
        });
        it("writes the type as the union of the dates of the versions", function () {
            const versions = parse(
                [`2027-04-01,add,${reiwa}`, `2027-10-01,remove,${heisei.number},${toIpadicLine(heisei)}`].join("\n")
            );
            assert.ok(
                renderVersionType(BASE_VERSION, versions).includes(
                    'export type DictionaryVersion = "2007-08-01" | "2027-04-01" | "2027-10-01";\n'
                )
            );
            const many = Array.from({ length: 12 }, (_, month) => ({
                date: `2028-${String(month + 1).padStart(2, "0")}-01`,
                added: [],
                removed: []
            }));
            assert.ok(
                renderVersionType(BASE_VERSION, many).includes(
                    'export type DictionaryVersion =\n    | "2007-08-01"\n    | "2028-01-01"\n'
                )
            );
        });
        it("writes the list of versions with every added and removed word", function () {
            const versions = parse(
                [`2027-04-01,add,${reiwa}`, `2027-10-01,remove,${heisei.number},${toIpadicLine(heisei)}`].join("\n")
            );
            const list = renderVersionList(BASE_VERSION, versions, baseEntries);
            assert.ok(list.includes("## 2007-08-01"));
            assert.ok(
                list.includes(
                    "## 2027-04-01\n\nAdded:\n\n| Word | Part of speech | Reading |\n| --- | --- | --- |\n| 令和 | 名詞-固有名詞-一般 | レイワ |"
                )
            );
            assert.ok(
                list.includes(
                    "## 2027-10-01\n\nRemoved:\n\n| Word | Part of speech | Reading |\n| --- | --- | --- |\n| 平成 | 名詞-固有名詞-一般 | ヘイセイ |"
                )
            );
        });
    });
});
