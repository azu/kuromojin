// The result of a profile or a comparison: the ratios, the marks, and the Markdown
"use strict";

const REPOSITORY = "https://github.com/azu/kuromojin";

// An item is marked when head / base is outside its range
const TIME_RANGE = { worse: 1.1, better: 0.91 };
const LOAD_RANGE = { worse: 1.2, better: 0.83 };
const SIZE_RANGE = { worse: 1.1, better: 0.91 };
const PAUSE_RANGE = { worse: 1.3, better: 0.77 };
const TIME_WORDS = { worse: "slower", better: "faster" };
const SIZE_WORDS = { worse: "larger", better: "smaller" };
const PAUSE_WORDS = { worse: "longer", better: "shorter" };

// `minDifference`: a difference below it is too small to measure, and is not marked
const SET_ITEMS = [
    {
        id: "loadMs",
        title: "Load of the dictionary",
        unit: "ms",
        range: LOAD_RANGE,
        words: TIME_WORDS,
        minDifference: 5
    },
    {
        id: "memoryAfterLoadMB",
        title: "Memory after the load",
        unit: "MB",
        range: SIZE_RANGE,
        words: SIZE_WORDS,
        minDifference: 1
    },
    {
        id: "linesMs",
        title: "Analysis of each line",
        unit: "ms",
        range: TIME_RANGE,
        words: TIME_WORDS,
        minDifference: 1
    },
    {
        id: "filesMs",
        title: "Analysis of each file",
        unit: "ms",
        range: TIME_RANGE,
        words: TIME_WORDS,
        minDifference: 1
    },
    {
        id: "rememberedNs",
        title: "`tokenize` of a remembered text",
        unit: "ns",
        range: TIME_RANGE,
        words: TIME_WORDS,
        minDifference: 20
    },
    {
        id: "allocatedMB",
        title: "Allocation of the analysis of each line",
        unit: "MB",
        range: SIZE_RANGE,
        words: SIZE_WORDS,
        minDifference: 1
    },
    {
        id: "gcPauseMs",
        title: "Pause of garbage collection of that analysis",
        unit: "ms",
        range: PAUSE_RANGE,
        words: PAUSE_WORDS,
        minDifference: 1
    },
    {
        id: "memoryAfterAnalysisMB",
        title: "Memory after the analysis",
        unit: "MB",
        range: SIZE_RANGE,
        words: SIZE_WORDS,
        minDifference: 1
    }
];
const SIZE_ITEMS = [
    {
        id: "installedMB",
        title: "Installed size: the package and its dependencies",
        unit: "MB",
        range: SIZE_RANGE,
        words: SIZE_WORDS,
        minDifference: 0.1
    },
    // The two parts of the installed size are shown and not marked: files move between them
    { id: "packageMB", title: "Files of the package", unit: "MB", range: null },
    { id: "dependenciesMB", title: "Files of the dependencies", unit: "MB", range: null }
];
const TOP_FUNCTIONS = 10;
const MAX_SHOWN_TEXT = 80;

/**
 * The ratio head / base, and the mark of an item: "worse", "better", or null.
 * @param {{ range: { worse: number, better: number } | null, minDifference?: number }} item
 */
const compareValues = (item, base, head) => {
    const ratio = base > 0 ? head / base : null;
    if (ratio === null || item.range === null || Math.abs(head - base) < item.minDifference) {
        return { ratio, mark: null };
    }
    return { ratio, mark: ratio >= item.range.worse ? "worse" : ratio <= item.range.better ? "better" : null };
};

/**
 * @param {object[]} definitions SET_ITEMS or SIZE_ITEMS
 * @param {{ base?: object, head: object }} values the numbers of each build
 */
const createItems = (definitions, values) =>
    definitions.map((definition) => {
        const item = {
            id: definition.id,
            title: definition.title,
            unit: definition.unit,
            head: values.head[definition.id]
        };
        if (values.base === undefined) return item;
        const base = values.base[definition.id];
        const { ratio, mark } = compareValues(definition, base, item.head);
        return { ...item, base, ratio, mark, word: mark === null ? null : definition.words[mark] };
    });

const createSetItems = (measures) => createItems(SET_ITEMS, measures);
const createSizeItems = (sizes) => {
    const withInstalled = (size) => size && { ...size, installedMB: size.packageMB + size.dependenciesMB };
    return createItems(SIZE_ITEMS, { base: withInstalled(sizes.base), head: withInstalled(sizes.head) });
};

// ---------------------------------------------------------------------------
// Markdown

const formatNumber = (value) => {
    if (value === undefined || value === null) return "-";
    const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const formatCount = (value) => value.toLocaleString("en-US");
// 0.004 is shown as 0.004x, not as 0.00x
const formatTimes = (ratio) => `${ratio >= 0.1 || ratio === 0 ? ratio.toFixed(2) : ratio.toPrecision(1)}x`;
const formatRatio = (item) =>
    item.ratio === null
        ? "-"
        : `${formatTimes(item.ratio)}${
              item.mark === "worse" ? ` ⚠️ ${item.word}` : item.mark === "better" ? ` ${item.word}` : ""
          }`;
const escapeCell = (text) =>
    String(text)
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|")
        .replace(/`/g, "\\`");
const shorten = (text) => (text.length > MAX_SHOWN_TEXT ? `${text.slice(0, MAX_SHOWN_TEXT)}…` : text);
// The first `leftColumns` columns are text, and the others are numbers
const table = (headers, rows, leftColumns = 1) =>
    [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map((_, index) => (index < leftColumns ? "---" : "---:")).join(" | ")} |`,
        ...rows.map((row) => `| ${row.join(" | ")} |`)
    ].join("\n");
const commitLink = (build) =>
    `[\`${build.commit.slice(0, 12)}\`](${REPOSITORY}/commit/${build.commit})${build.ref ? ` (\`${build.ref}\`)` : ""}${
        build.dirty ? " with changes that are not committed" : ""
    }`;

const renderItems = (items, compared, noteOf = () => "") =>
    compared
        ? table(
              ["Item", "base", "head", "head / base"],
              items.map((item) => [
                  `${item.title} (${item.unit})`,
                  formatNumber(item.base) + noteOf(item, "base"),
                  formatNumber(item.head) + noteOf(item, "head"),
                  formatRatio(item)
              ])
          )
        : table(
              ["Item", "head"],
              items.map((item) => [`${item.title} (${item.unit})`, formatNumber(item.head) + noteOf(item, "head")])
          );

/** What changed in a list of items, as the parts of one sentence */
const changesOf = (items) => {
    const list = (mark) =>
        items
            .filter((item) => item.mark === mark)
            .map((item) => `${item.title} ${formatTimes(item.ratio)} ${item.word}`)
            .join(", ");
    const worse = list("worse");
    const better = list("better");
    return [worse && `⚠️ ${worse}`, better].filter(Boolean);
};

const renderVerdict = (result) => {
    const lines = result.sets.map((set) => {
        const { lines: changedLines, files: changedFiles } = set.tokens;
        const tokens =
            changedLines + changedFiles === 0
                ? "the tokens are the same"
                : `⚠️ the tokens differ for ${formatCount(changedLines)} of ${formatCount(
                      set.lines
                  )} lines and ${formatCount(changedFiles)} of ${formatCount(set.files)} files`;
        const changes = changesOf(set.items);
        return `- **${set.name}:** ${[
            tokens,
            ...(changes.length > 0 ? changes : ["no item is outside its range"])
        ].join("; ")}`;
    });
    const sizeChanges = changesOf(result.size.items);
    lines.push(
        `- **Installed size:** ${sizeChanges.length > 0 ? sizeChanges.join("; ") : "no item is outside its range"}`
    );
    return lines.join("\n");
};

const renderTokens = (set) => {
    const { lines, files, shown } = set.tokens;
    if (lines + files === 0) return "";
    const rows = shown.map((entry) => {
        const text = entry.kind === "line" ? `line \`${escapeCell(shorten(entry.text))}\`` : `file \`${entry.text}\``;
        // the surface form, and the fields that are not the same in the two builds
        const fields = Object.keys({ ...entry.base, ...entry.head }).filter(
            (key) =>
                key === "surface_form" ||
                entry.base === null ||
                entry.head === null ||
                JSON.stringify(entry.base[key]) !== JSON.stringify(entry.head[key])
        );
        const token = (value) =>
            value === null
                ? "no token"
                : `\`${escapeCell(
                      JSON.stringify(
                          Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, value[key]]))
                      )
                  )}\``;
        return `- ${text}, token ${entry.token + 1}\n    - base: ${token(entry.base)}\n    - head: ${token(
            entry.head
        )}`;
    });
    const rest = lines + files - shown.length;
    return [
        `### Tokens that differ in ${set.name}`,
        "",
        `${formatCount(lines)} of ${formatCount(set.lines)} lines and ${formatCount(files)} of ${formatCount(
            set.files
        )} files have other tokens. The first token that differs:`,
        "",
        ...rows,
        ...(rest > 0 ? ["", `${formatCount(rest)} more are not shown.`] : []),
        ""
    ].join("\n");
};

const passes = (count) => `${formatCount(count)} ${count === 1 ? "pass" : "passes"}`;
const renderCpu = (set, buildNames) => {
    const packageNames = new Set();
    const functionKeys = new Map();
    const keyOf = (fn) => `${fn.package}\t${fn.file}\t${fn.name}`;
    for (const name of buildNames) {
        set.cpu[name].packages.forEach((entry) => packageNames.add(entry.name));
        set.cpu[name].functions.slice(0, TOP_FUNCTIONS).forEach((fn) => functionKeys.set(keyOf(fn), fn));
    }
    const packageMs = (name, packageName) =>
        set.cpu[name].packages.find((entry) => entry.name === packageName)?.ms ?? 0;
    const functionMs = (name, key) => set.cpu[name].functions.find((fn) => keyOf(fn) === key)?.ms;
    const largest = (msOf) => (a, b) =>
        Math.max(...buildNames.map((name) => msOf(name, b) ?? 0)) -
        Math.max(...buildNames.map((name) => msOf(name, a) ?? 0));
    const packages = [...packageNames].sort(largest(packageMs));
    const functions = [...functionKeys.keys()].sort(largest(functionMs));
    return [
        "<details>",
        `<summary>CPU time of ${set.name}</summary>`,
        "",
        `Self time of one run of each build: the load, the analysis of each line (${passes(
            set.cpuPasses.lines
        )}), and the analysis of each file (${passes(
            set.cpuPasses.files
        )}). A function that is not among the 50 longest of a build is shown as -.`,
        "",
        table(
            ["Package", ...buildNames.map((name) => `${name} (ms)`)],
            packages.map((packageName) => [
                escapeCell(packageName),
                ...buildNames.map((name) => formatNumber(packageMs(name, packageName)))
            ])
        ),
        "",
        table(
            ["Function", "Package", "File", ...buildNames.map((name) => `${name} (ms)`)],
            functions.map((key) => {
                const fn = functionKeys.get(key);
                return [
                    `\`${escapeCell(fn.name)}\``,
                    escapeCell(fn.package),
                    escapeCell(fn.file),
                    ...buildNames.map((name) => formatNumber(functionMs(name, key)))
                ];
            }),
            3
        ),
        "",
        `CPU profiles: ${buildNames
            .map((name) => `\`${set.cpuProfiles[name]}\``)
            .join(", ")} (Chrome DevTools opens them in the Performance panel).`,
        "",
        "</details>"
    ].join("\n");
};

const renderSet = (set, compared, buildNames) => {
    const gcNote = (item, name) =>
        item.id === "gcPauseMs"
            ? ` (${formatNumber(set.collections[name].minor)} minor, ${formatNumber(
                  set.collections[name].major
              )} major)`
            : "";
    return [
        `## ${set.name}: ${set.label}`,
        "",
        `${formatCount(set.files)} files, ${formatCount(set.lines)} lines, ${formatCount(
            set.characters
        )} characters of the lines, ${formatCount(set.lineTokens)} tokens of the lines.`,
        "",
        renderItems(set.items, compared, gcNote),
        "",
        ...(compared ? [renderTokens(set)] : []),
        renderCpu(set, buildNames),
        ""
    ].join("\n");
};

/** @param {object} result the result of `createResult` */
const renderMarkdown = (result) => {
    const compared = result.builds.base !== undefined;
    const buildNames = compared ? ["base", "head"] : ["head"];
    const builds = compared
        ? `Base ${commitLink(result.builds.base)}, head ${commitLink(result.builds.head)}. A ratio is head / base.`
        : `Build ${commitLink(result.builds.head)}.`;
    return [
        "# kuromojin performance profile",
        "",
        `${builds} Node.js ${result.node} on ${result.platform}, ${result.cpus} CPUs.`,
        "",
        ...(compared ? ["## What changed", "", renderVerdict(result), ""] : []),
        ...result.sets.map((set) => renderSet(set, compared, buildNames)),
        "## Installed size",
        "",
        renderItems(result.size.items, compared),
        ""
    ].join("\n");
};

/**
 * @param {{ base?: object, head: object }} builds
 * @param {{ set: object, measures: object, tokens: object | null, cpuPasses: object }[]} measuredSets
 * @param {{ base?: object, head: object }} sizes
 * @param {{ node: string, platform: string, cpus: number }} machine
 */
const createResult = (builds, measuredSets, sizes, machine) => {
    const buildNames = Object.keys(builds);
    const pick = (measures, select) => Object.fromEntries(buildNames.map((name) => [name, select(measures[name])]));
    const describe = ({ root, name, ...build }) => build;
    return {
        ...machine,
        builds: Object.fromEntries(buildNames.map((name) => [name, describe(builds[name])])),
        sets: measuredSets.map(({ set, measures, tokens, cpuPasses }) => ({
            name: set.name,
            label: set.label,
            repository: set.repository,
            commit: set.commit,
            files: set.texts.files.length,
            lines: set.texts.lines.length,
            characters: set.texts.characters,
            lineTokens: measures.head.lineTokens,
            items: createSetItems(measures),
            collections: pick(measures, (measure) => ({ minor: measure.minorGcs, major: measure.majorGcs })),
            ...(tokens === null ? {} : { tokens }),
            cpuPasses,
            cpu: pick(measures, (measure) => measure.cpu),
            cpuProfiles: pick(measures, (measure) => measure.cpuProfile)
        })),
        size: {
            items: createSizeItems(sizes),
            dependencies: pick(sizes, (size) => size.dependencies)
        }
    };
};

module.exports = { compareValues, createSetItems, createSizeItems, createResult, renderMarkdown };
