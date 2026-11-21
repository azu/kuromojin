// Measure one build of kuromojin in this process, and print the result as JSON.
// See docs/products/kuromojin/features/performance-profile/
//
// Usage: node --expose-gc worker.js <measurement> <root of the build> <file of the set> [argument]
//
// It uses only `getTokenizer` and `tokenize` of the build, so it measures any commit of kuromojin.
// The analysis is measured with `getTokenizer({ noCacheTokenize: true })`, which analyzes every text again.
// A build whose tokenizer does not remember tokens ignores the option.
"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const inspector = require("node:inspector");
const { performance, PerformanceObserver, constants } = require("node:perf_hooks");

const [measurement, root, setFile, argument] = process.argv.slice(2);

// A pass is repeated at least MIN_PASSES times, and until the passes take MIN_TOTAL_MS.
// No pass starts after MAX_TOTAL_MS, so that a build with a slow analysis is measured in a bounded time.
const MIN_PASSES = 3;
const MAX_PASSES = 50;
const MIN_TOTAL_MS = 500;
const MAX_TOTAL_MS = 10000;
/** The option of `getTokenizer` for a tokenizer that analyzes every text again */
const ANALYZE_EVERY_TEXT = { noCacheTokenize: true };
// The number of remembered texts is less than any limit of the remembered tokens
const REMEMBERED_TEXTS = 100;
const REMEMBERED_CALLS = 200000;
const REMEMBERED_REPEATS = 5;
// The allocation of a small set is measured over several passes, so that it has enough samples
const MIN_ALLOCATION_CHARACTERS = 2000000;
const SAMPLING_INTERVAL_BYTES = 8192;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The memory that the process uses, after garbage collections: the heap and the buffers outside it */
const usedMemoryMB = async () => {
    for (let i = 0; i < 3; i++) {
        global.gc();
        await wait(10);
    }
    const usage = process.memoryUsage();
    return (usage.heapUsed + usage.external) / 1e6;
};

const timePasses = (pass) => {
    const times = [];
    let total = 0;
    while (total < MAX_TOTAL_MS && (times.length < MIN_PASSES || (total < MIN_TOTAL_MS && times.length < MAX_PASSES))) {
        const start = performance.now();
        pass();
        const time = performance.now() - start;
        times.push(time);
        total += time;
    }
    return times;
};

/** A token with its fields in a fixed order, so that two builds give the same text for the same token */
const normalizeToken = (token) =>
    Object.keys(token)
        .sort()
        .map((key) => [key, token[key]]);
const digest = (tokens) =>
    crypto
        .createHash("sha1")
        .update(JSON.stringify(tokens.map(normalizeToken)))
        .digest("hex")
        .slice(0, 16);

const post = (session, method, params) =>
    new Promise((resolve, reject) =>
        session.post(method, params, (error, result) => (error ? reject(error) : resolve(result)))
    );

const measurements = {
    /** The time from loading the module to the tokenizer, and the memory after it */
    async load() {
        const start = performance.now();
        const kuromojin = require(root);
        const required = performance.now();
        await kuromojin.getTokenizer();
        const loaded = performance.now();
        return { requireMs: required - start, loadMs: loaded - start, memoryMB: await usedMemoryMB() };
    },

    /** The digest of the tokens of every line and of every file */
    async digest(set) {
        const tokenizer = await require(root).getTokenizer(ANALYZE_EVERY_TEXT);
        let tokens = 0;
        const digestOf = (text) => {
            const result = tokenizer.tokenizeForSentence(text);
            tokens += result.length;
            return digest(result);
        };
        const lines = set.lines.map(digestOf);
        const lineTokens = tokens;
        const files = set.files.map((file) => digestOf(file.text));
        return { lines, files, lineTokens, fileTokens: tokens - lineTokens };
    },

    /** The tokens of the lines and the files that the argument selects: [{ kind, index }] */
    async tokens(set) {
        const tokenizer = await require(root).getTokenizer(ANALYZE_EVERY_TEXT);
        return JSON.parse(argument).map(({ kind, index }) => {
            const text = kind === "line" ? set.lines[index] : set.files[index].text;
            return tokenizer.tokenizeForSentence(text).map((token) => Object.fromEntries(normalizeToken(token)));
        });
    },

    /** The times of the analysis and of `tokenize` of a remembered text, and the memory after them */
    async time(set) {
        const kuromojin = require(root);
        const tokenizer = await kuromojin.getTokenizer(ANALYZE_EVERY_TEXT);
        const linesMs = timePasses(() => {
            for (let i = 0; i < set.lines.length; i++) tokenizer.tokenizeForSentence(set.lines[i]);
        });
        const filesMs = timePasses(() => {
            for (let i = 0; i < set.files.length; i++) tokenizer.tokenizeForSentence(set.files[i].text);
        });
        const remembered = [...new Set(set.lines)].slice(0, REMEMBERED_TEXTS);
        for (const text of remembered) await kuromojin.tokenize(text);
        const rememberedNs = [];
        for (let repeat = 0; repeat < REMEMBERED_REPEATS; repeat++) {
            const start = performance.now();
            for (let i = 0; i < REMEMBERED_CALLS; i++) await kuromojin.tokenize(remembered[i % remembered.length]);
            rememberedNs.push(((performance.now() - start) * 1e6) / REMEMBERED_CALLS);
        }
        // what stays after a run: the remembered tokens and the working memory of the analyzer
        for (const text of set.lines) await kuromojin.tokenize(text);
        return { linesMs, filesMs, rememberedNs, memoryMB: await usedMemoryMB() };
    },

    /** The bytes that the analysis of every line allocates, and its garbage collections. All numbers are for one pass. */
    async allocation(set) {
        const tokenizer = await require(root).getTokenizer(ANALYZE_EVERY_TEXT);
        const pass = () => {
            for (let i = 0; i < set.lines.length; i++) tokenizer.tokenizeForSentence(set.lines[i]);
        };
        const passes = Math.max(1, Math.ceil(MIN_ALLOCATION_CHARACTERS / set.characters));
        // the first pass compiles the code and fills what the build creates once
        pass();
        await usedMemoryMB();

        // The collections are counted without the sampling, because the sampling changes them
        const collections = [];
        const observer = new PerformanceObserver((list) => collections.push(...list.getEntries()));
        observer.observe({ entryTypes: ["gc"] });
        for (let i = 0; i < passes; i++) pass();
        await wait(50);
        observer.disconnect();
        const minor = collections.filter((entry) => entry.detail.kind === constants.NODE_PERFORMANCE_GC_MINOR);

        const session = new inspector.Session();
        session.connect();
        await post(session, "HeapProfiler.startSampling", {
            samplingInterval: SAMPLING_INTERVAL_BYTES,
            // count what a collection has freed too
            includeObjectsCollectedByMajorGC: true,
            includeObjectsCollectedByMinorGC: true
        });
        for (let i = 0; i < passes; i++) pass();
        const { profile } = await post(session, "HeapProfiler.stopSampling");
        session.disconnect();
        let bytes = 0;
        const walk = (node) => {
            bytes += node.selfSize;
            node.children.forEach(walk);
        };
        walk(profile.head);
        return {
            passes,
            allocatedMB: bytes / passes / 1e6,
            gcPauseMs: collections.reduce((sum, entry) => sum + entry.duration, 0) / passes,
            minorGcs: minor.length / passes,
            majorGcs: (collections.length - minor.length) / passes
        };
    },

    /** The load and the analysis, for a CPU profile of the process. The argument is the number of passes. */
    async cpu(set) {
        const passes = JSON.parse(argument);
        const tokenizer = await require(root).getTokenizer(ANALYZE_EVERY_TEXT);
        for (let pass = 0; pass < passes.lines; pass++) {
            for (let i = 0; i < set.lines.length; i++) tokenizer.tokenizeForSentence(set.lines[i]);
        }
        for (let pass = 0; pass < passes.files; pass++) {
            for (let i = 0; i < set.files.length; i++) tokenizer.tokenizeForSentence(set.files[i].text);
        }
        return passes;
    }
};

const main = async () => {
    if (!Object.prototype.hasOwnProperty.call(measurements, measurement)) {
        throw new Error(`Unknown measurement: ${measurement}`);
    }
    const set = JSON.parse(fs.readFileSync(setFile, "utf-8"));
    const result = await measurements[measurement](set);
    process.stdout.write(JSON.stringify(result));
};

main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
});
