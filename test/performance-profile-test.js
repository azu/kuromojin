// LICENSE : MIT
// The scripts of the profile are JavaScript that Node.js runs as it is, so that they measure any commit.
// This test is JavaScript too, because the scripts have no types.
"use strict";
const assert = require("node:assert");
const { after, before, describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compareValues, createResult, renderMarkdown } = require("../benchmark/lib/report");
const { checkSetNames, createTexts } = require("../benchmark/lib/sets");
const { summarizeCpuProfile } = require("../benchmark/lib/cpuprofile");
const { listDependencies } = require("../benchmark/lib/size");
const { firstDifference } = require("../benchmark/lib/measure");

const TIME = { range: { worse: 1.1, better: 0.91 }, minDifference: 1 };
const machine = { node: "v22.0.0", platform: "linux x64", cpus: 4 };
const set = {
    name: "small",
    label: "the Japanese documents of this repository",
    repository: null,
    commit: null,
    texts: createTexts([{ path: "a.ja.md", text: "吾輩は猫である。\n\n名前はまだ無い。\n" }])
};
const measure = (changes = {}) => ({
    lineTokens: 12,
    fileTokens: 13,
    loadMs: 100,
    memoryAfterLoadMB: 40,
    linesMs: 200,
    filesMs: 220,
    rememberedNs: 120,
    memoryAfterAnalysisMB: 50,
    allocatedMB: 60,
    gcPauseMs: 2,
    minorGcs: 7,
    majorGcs: 0,
    cpuProfile: "cpuprofiles/small-head.cpuprofile",
    cpu: {
        totalMs: 1000,
        packages: [{ name: "kuromojin", ms: 990 }],
        functions: [{ name: "addTokens", package: "kuromojin", file: "lib/analyzer/Analyzer.js", ms: 900 }]
    },
    ...changes
});
const size = { packageMB: 5.4, dependenciesMB: 0.03, dependencies: [] };
const base = { name: "base", root: "/base", ref: "origin/master", commit: "a".repeat(40), dirty: false };
const head = { name: "head", root: "/head", ref: null, commit: "b".repeat(40), dirty: false };
const sameTokens = { lines: 0, files: 0, shown: [] };
const cpuPasses = { lines: 5, files: 4 };
const compare = (baseMeasure, headMeasure, tokens = sameTokens) =>
    renderMarkdown(
        createResult(
            { base, head },
            [{ set, measures: { base: baseMeasure, head: headMeasure }, tokens, cpuPasses }],
            { base: size, head: size },
            machine
        )
    );
const lineOf = (markdown, start) => markdown.split("\n").find((line) => line.startsWith(start)) ?? "";

// The scenarios of docs/products/kuromojin/features/performance-profile/requirements.md
describe("performance profile", function () {
    describe("comparison of two builds", function () {
        it("marks the analysis as faster when the head analyzes faster", function () {
            const markdown = compare(measure(), measure({ linesMs: 100 }));
            assert.strictEqual(
                lineOf(markdown, "| Analysis of each line"),
                "| Analysis of each line (ms) | 200 | 100 | 0.50x faster |"
            );
            assert.strictEqual(
                lineOf(markdown, "- **small:**"),
                "- **small:** the tokens are the same; Analysis of each line 0.50x faster"
            );
        });
        it("lists a text whose tokens differ, with the first token that differs", function () {
            const markdown = compare(measure(), measure(), {
                lines: 1,
                files: 0,
                shown: [
                    {
                        kind: "line",
                        text: "名前はまだ無い。",
                        token: 3,
                        base: { surface_form: "無い", pos: "形容詞", word_position: 6 },
                        head: { surface_form: "無", pos: "名詞", word_position: 6 }
                    }
                ]
            });
            assert.ok(
                lineOf(markdown, "- **small:**").startsWith("- **small:** ⚠️ the tokens differ for 1 of 2 lines")
            );
            assert.ok(markdown.includes("- line `名前はまだ無い。`, token 4"));
            // the field that is the same in both builds is left out
            assert.ok(markdown.includes('    - base: `{"surface_form":"無い","pos":"形容詞"}`'));
            assert.ok(markdown.includes('    - head: `{"surface_form":"無","pos":"名詞"}`'));
        });
        it("marks the memory as larger when the head keeps more memory", function () {
            const markdown = compare(measure(), measure({ memoryAfterAnalysisMB: 220 }));
            assert.strictEqual(
                lineOf(markdown, "| Memory after the analysis"),
                "| Memory after the analysis (MB) | 50.0 | 220 | 4.40x ⚠️ larger |"
            );
            assert.ok(lineOf(markdown, "- **small:**").includes("⚠️ Memory after the analysis 4.40x larger"));
        });
        it("says that nothing changed when the builds have the same numbers", function () {
            const markdown = compare(measure(), measure());
            assert.strictEqual(
                lineOf(markdown, "- **small:**"),
                "- **small:** the tokens are the same; no item is outside its range"
            );
            assert.strictEqual(
                lineOf(markdown, "- **Installed size:**"),
                "- **Installed size:** no item is outside its range"
            );
            assert.ok(!markdown.includes("⚠️"));
        });
        it("marks an item only when its ratio is outside the range and the difference can be measured", function () {
            assert.deepStrictEqual(compareValues(TIME, 100, 110), { ratio: 1.1, mark: "worse" });
            assert.strictEqual(compareValues(TIME, 100, 109).mark, null);
            assert.strictEqual(compareValues(TIME, 100, 91).mark, "better");
            assert.strictEqual(compareValues(TIME, 100, 92).mark, null);
            // 2x, but the difference is less than what can be measured
            assert.deepStrictEqual(compareValues(TIME, 0.5, 1), { ratio: 2, mark: null });
            assert.deepStrictEqual(compareValues(TIME, 0, 1), { ratio: null, mark: null });
        });
        it("finds the first token that differs", function () {
            const tokens = [{ surface_form: "a" }, { surface_form: "b" }];
            assert.strictEqual(firstDifference(tokens, tokens), -1);
            assert.strictEqual(firstDifference(tokens, [{ surface_form: "a" }, { surface_form: "c" }]), 1);
            assert.strictEqual(firstDifference(tokens, [{ surface_form: "a" }]), 1);
        });
    });

    describe("profile of one build", function () {
        it("shows every item of the working tree without a base", function () {
            const result = createResult(
                { head },
                [{ set, measures: { head: measure() }, tokens: null, cpuPasses }],
                { head: size },
                machine
            );
            const markdown = renderMarkdown(result);
            assert.deepStrictEqual(
                result.sets[0].items.map((item) => item.id),
                [
                    "loadMs",
                    "memoryAfterLoadMB",
                    "linesMs",
                    "filesMs",
                    "rememberedNs",
                    "allocatedMB",
                    "gcPauseMs",
                    "memoryAfterAnalysisMB"
                ]
            );
            assert.strictEqual(lineOf(markdown, "| Load of the dictionary"), "| Load of the dictionary (ms) | 100 |");
            assert.strictEqual(
                lineOf(markdown, "| Installed size"),
                "| Installed size: the package and its dependencies (MB) | 5.43 |"
            );
            assert.ok(markdown.includes("| `addTokens` | kuromojin | lib/analyzer/Analyzer.js | 900 |"));
            assert.ok(!markdown.includes("## What changed"));
        });
        it("stops for an unknown set with a message that names the sets", function () {
            assert.throws(() => checkSetNames(["small", "large"]), {
                message: "Unknown set: large. The sets are small, medium."
            });
        });
    });

    describe("sets of texts", function () {
        it("takes each line that is not empty as a line, and each document as a file", function () {
            const texts = createTexts([
                { path: "a.md", text: "一行目\r\n\r\n  \n二行目\n" },
                { path: "b.md", text: "三行目" }
            ]);
            assert.deepStrictEqual(texts.lines, ["一行目", "二行目", "三行目"]);
            assert.strictEqual(texts.characters, 9);
            assert.deepStrictEqual(
                texts.files.map((file) => file.path),
                ["a.md", "b.md"]
            );
        });
    });

    describe("CPU profile", function () {
        it("sums the self time by package and by function, without the time that the process waits", function () {
            const root = path.join(os.tmpdir(), "kuromojin-build");
            const frame = (functionName, url) => ({ functionName, url, lineNumber: 0 });
            const profile = {
                nodes: [
                    { id: 1, callFrame: frame("(root)", "") },
                    { id: 2, callFrame: frame("addTokens", `file://${root}/lib/analyzer/Analyzer.js`) },
                    { id: 3, callFrame: frame("get", `file://${root}/node_modules/lru_map/lru.js`) },
                    { id: 4, callFrame: frame("(garbage collector)", "") },
                    { id: 5, callFrame: frame("(idle)", "") },
                    { id: 6, callFrame: frame("readFileSync", "node:fs") },
                    { id: 7, callFrame: frame("pass", "file:///scripts/worker.js") }
                ],
                samples: [2, 2, 3, 4, 5, 6, 7],
                timeDeltas: [1000, 2000, 500, 300, 9000, 200, 100]
            };
            const summary = summarizeCpuProfile(profile, root, "/scripts/worker.js");
            assert.strictEqual(summary.totalMs, 4.1);
            assert.deepStrictEqual(summary.packages, [
                { name: "kuromojin", ms: 3 },
                { name: "lru_map", ms: 0.5 },
                { name: "(garbage collector)", ms: 0.3 },
                { name: "(node)", ms: 0.2 },
                { name: "(measurement)", ms: 0.1 }
            ]);
            assert.deepStrictEqual(summary.functions[0], {
                name: "addTokens",
                package: "kuromojin",
                file: "lib/analyzer/Analyzer.js",
                ms: 3
            });
        });
    });

    describe("installed size", function () {
        it("counts the dependencies of the package and theirs, without devDependencies", function () {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "kuromojin-size-"));
            const write = (file, content) => {
                fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
                fs.writeFileSync(path.join(root, file), content);
            };
            const manifest = (name, dependencies = {}) =>
                JSON.stringify({ name, version: "1.0.0", dependencies, devDependencies: { dev: "1.0.0" } });
            try {
                write("package.json", manifest("root", { a: "1.0.0" }));
                write("node_modules/a/package.json", manifest("a", { b: "1.0.0" }));
                write("node_modules/a/index.js", "x".repeat(1000));
                // a package that is installed inside another one
                write("node_modules/a/node_modules/b/package.json", manifest("b"));
                write("node_modules/a/node_modules/b/index.js", "x".repeat(500));
                write("node_modules/dev/package.json", manifest("dev"));
                const dependencies = listDependencies(root);
                assert.deepStrictEqual(
                    dependencies.map((dependency) => dependency.name),
                    ["a", "b"]
                );
                const sizeOf = (file) => fs.statSync(path.join(root, file)).size;
                assert.strictEqual(dependencies[0].bytes, 1000 + sizeOf("node_modules/a/package.json"));
                assert.strictEqual(dependencies[1].bytes, 500 + sizeOf("node_modules/a/node_modules/b/package.json"));
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    });

    describe("measurements of a build", function () {
        // The measurements run the source of the working tree as a build: test-build/src/, which `pnpm test` compiles
        const texts = createTexts([{ path: "a.md", text: "吾輩は猫である。\n名前はまだ無い。\n𩸽𩸽を食べた\n" }]);
        let directory;
        let setFile;
        const run = (measurement, argument) => {
            const result = spawnSync(
                process.execPath,
                [
                    "--expose-gc",
                    path.join(__dirname, "../benchmark/worker.js"),
                    measurement,
                    path.join(__dirname, "../test-build/src"),
                    setFile,
                    ...(argument === undefined ? [] : [argument])
                ],
                {
                    cwd: path.join(__dirname, ".."),
                    encoding: "utf-8"
                }
            );
            assert.strictEqual(result.status, 0, result.stderr);
            return JSON.parse(result.stdout);
        };
        before(function () {
            directory = fs.mkdtempSync(path.join(os.tmpdir(), "kuromojin-profile-test-"));
            setFile = path.join(directory, "set.json");
            fs.writeFileSync(setFile, JSON.stringify(texts));
        });
        after(function () {
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it("gives the same digest for the same tokens, and the tokens of a selected text", function () {
            const digests = run("digest");
            assert.strictEqual(digests.lines.length, 3);
            assert.strictEqual(digests.files.length, 1);
            assert.deepStrictEqual(run("digest"), digests);
            assert.notStrictEqual(digests.lines[0], digests.lines[1]);
            const tokens = run("tokens", JSON.stringify([0, 1, 2].map((index) => ({ kind: "line", index }))));
            assert.strictEqual(digests.lineTokens, tokens[0].length + tokens[1].length + tokens[2].length);
            assert.deepStrictEqual(
                tokens[2].map((token) => token.surface_form),
                ["𩸽𩸽", "を", "食べ", "た"]
            );
        });
        it("measures the load, the times, and the allocation", function () {
            // three processes that load the dictionary, and passes that are repeated for half a second
            const load = run("load");
            assert.ok(load.loadMs >= load.requireMs && load.requireMs > 0);
            assert.ok(load.memoryMB > 1);
            const time = run("time");
            assert.ok(time.linesMs.length >= 3 && time.filesMs.length >= 3);
            assert.ok([...time.linesMs, ...time.filesMs, ...time.rememberedNs].every((value) => value > 0));
            assert.ok(time.memoryMB > 1);
            const allocation = run("allocation");
            // Node.js 18 does not count the objects that a collection has freed, so the bytes can be 0 there
            assert.ok(allocation.passes >= 1 && allocation.allocatedMB >= 0);
            assert.ok(allocation.gcPauseMs >= 0 && allocation.minorGcs >= 0 && allocation.majorGcs >= 0);
        });
        it("fails with the error of the build when a measurement cannot run", function () {
            const result = spawnSync(
                process.execPath,
                [
                    "--expose-gc",
                    path.join(__dirname, "../benchmark/worker.js"),
                    "load",
                    path.join(directory, "none"),
                    setFile
                ],
                { encoding: "utf-8" }
            );
            assert.strictEqual(result.status, 1);
            assert.ok(result.stderr.includes("Cannot find module"));
        });
    });
});
