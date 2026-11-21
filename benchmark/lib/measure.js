// Measure builds on a set: each measurement runs in a process of its own, and the builds run in turns
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ProfileError, log } = require("./command");
const { summarizeCpuProfile } = require("./cpuprofile");

const WORKER = path.join(__dirname, "../worker.js");
// The number of processes that load the dictionary, for each build
const LOAD_RUNS = 7;
// The number of processes that measure the times, for each build
const TIME_ROUNDS = 3;
const MAX_SHOWN_DIFFERENCES = 10;
// A CPU profile has about this much analysis of the slowest build, and at most this many passes
const CPU_PROFILE_MS = 1000;
const MAX_CPU_PROFILE_PASSES = 50;

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const runWorker = (build, set, setFile, measurement, options = {}) => {
    const args = ["--expose-gc", ...(options.nodeArgs ?? []), WORKER, measurement, build.root, setFile];
    if (options.argument !== undefined) args.push(options.argument);
    const result = spawnSync(process.execPath, args, {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.error || result.status !== 0) {
        const reason = result.error ? result.error.message : result.stderr;
        throw new ProfileError(
            `The measurement "${measurement}" of the ${build.name} (${build.commit.slice(0, 12)}) failed for the set ${
                set.name
            }.\n${reason}`
        );
    }
    return JSON.parse(result.stdout);
};

/** The index of the first token that is not the same in two lists of tokens */
const firstDifference = (baseTokens, headTokens) => {
    const length = Math.max(baseTokens.length, headTokens.length);
    for (let i = 0; i < length; i++) {
        if (JSON.stringify(baseTokens[i]) !== JSON.stringify(headTokens[i])) return i;
    }
    return -1;
};

/**
 * The lines and the files whose tokens differ between two builds.
 * @returns {{ lines: number, files: number, shown: object[] }}
 */
const diffTokens = (set, digests, tokensOf) => {
    const changed = [];
    for (const kind of ["line", "file"]) {
        const base = digests.base[`${kind}s`];
        const head = digests.head[`${kind}s`];
        for (let index = 0; index < base.length; index++) {
            if (base[index] !== head[index]) changed.push({ kind, index });
        }
    }
    const selected = changed.slice(0, MAX_SHOWN_DIFFERENCES);
    const shown = [];
    if (selected.length > 0) {
        const baseTokens = tokensOf("base", selected);
        const headTokens = tokensOf("head", selected);
        selected.forEach(({ kind, index }, i) => {
            const token = firstDifference(baseTokens[i], headTokens[i]);
            shown.push({
                kind,
                text: kind === "line" ? set.texts.lines[index] : set.texts.files[index].path,
                token,
                base: baseTokens[i][token] ?? null,
                head: headTokens[i][token] ?? null
            });
        });
    }
    return {
        lines: changed.filter((entry) => entry.kind === "line").length,
        files: changed.filter((entry) => entry.kind === "file").length,
        shown
    };
};

/**
 * @param {object} set a set of `prepareSet`
 * @param {object[]} builds the builds, the base first when there are two
 * @param {string} outDir the CPU profiles are written into its `cpuprofiles` directory
 * @param {string} tmpDir
 * @returns the numbers of each build by the name of the build, the differences of the tokens of two builds,
 *   and the number of passes of the CPU profiles
 */
const measureSet = (set, builds, outDir, tmpDir) => {
    const setFile = path.join(tmpDir, `set-${set.name}.json`);
    fs.writeFileSync(setFile, JSON.stringify(set.texts));
    const each = (measurement, options) =>
        Object.fromEntries(builds.map((build) => [build.name, runWorker(build, set, setFile, measurement, options)]));
    const rounds = (measurement, count) => {
        const results = Object.fromEntries(builds.map((build) => [build.name, []]));
        for (let round = 0; round < count; round++) {
            for (const build of builds) results[build.name].push(runWorker(build, set, setFile, measurement));
        }
        return results;
    };

    log(`${set.name}: tokens`);
    const digests = each("digest");
    const tokens =
        builds.length === 2
            ? diffTokens(set, digests, (name, selected) =>
                  runWorker(
                      builds.find((build) => build.name === name),
                      set,
                      setFile,
                      "tokens",
                      { argument: JSON.stringify(selected) }
                  )
              )
            : null;
    log(`${set.name}: load of the dictionary`);
    const loads = rounds("load", LOAD_RUNS);
    log(`${set.name}: times`);
    const times = rounds("time", TIME_ROUNDS);
    log(`${set.name}: allocation`);
    const allocations = each("allocation");
    log(`${set.name}: CPU profiles`);
    const cpuDir = path.join(outDir, "cpuprofiles");
    fs.mkdirSync(cpuDir, { recursive: true });

    // The fastest pass of all processes has the least noise of the machine
    const fastest = (name, key) => Math.min(...times[name].flatMap((result) => result[key]));
    // Every build does the same work in its CPU profile, so the times of the profiles can be compared
    const passesOf = (key) => {
        const slowest = Math.max(...builds.map((build) => fastest(build.name, key)));
        return Math.max(1, Math.min(MAX_CPU_PROFILE_PASSES, Math.ceil(CPU_PROFILE_MS / slowest)));
    };
    const cpuPasses = { lines: passesOf("linesMs"), files: passesOf("filesMs") };

    const measures = {};
    for (const build of builds) {
        const cpuProfile = `${set.name}-${build.name}.cpuprofile`;
        runWorker(build, set, setFile, "cpu", {
            nodeArgs: ["--cpu-prof", "--cpu-prof-dir", cpuDir, "--cpu-prof-name", cpuProfile],
            argument: JSON.stringify(cpuPasses)
        });
        const load = loads[build.name];
        const time = times[build.name];
        const allocation = allocations[build.name];
        measures[build.name] = {
            lineTokens: digests[build.name].lineTokens,
            fileTokens: digests[build.name].fileTokens,
            // A load is a process of its own, so there is no fastest pass: the median of the processes
            loadMs: median(load.map((result) => result.loadMs)),
            memoryAfterLoadMB: median(load.map((result) => result.memoryMB)),
            linesMs: fastest(build.name, "linesMs"),
            filesMs: fastest(build.name, "filesMs"),
            rememberedNs: fastest(build.name, "rememberedNs"),
            memoryAfterAnalysisMB: median(time.map((result) => result.memoryMB)),
            allocatedMB: allocation.allocatedMB,
            gcPauseMs: allocation.gcPauseMs,
            minorGcs: allocation.minorGcs,
            majorGcs: allocation.majorGcs,
            cpuProfile: `cpuprofiles/${cpuProfile}`,
            cpu: summarizeCpuProfile(
                JSON.parse(fs.readFileSync(path.join(cpuDir, cpuProfile), "utf-8")),
                build.root,
                WORKER
            )
        };
    }
    return { measures, tokens, cpuPasses };
};

module.exports = { measureSet, firstDifference, median };
