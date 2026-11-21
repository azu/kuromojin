// The installed size of a build: the files of the package and of its dependencies
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { run } = require("./command");

/** The size of the files of a directory, without the packages that are installed inside it */
const directorySize = (dir) => {
    let size = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "node_modules") size += directorySize(entryPath);
        } else if (entry.isFile()) {
            size += fs.statSync(entryPath).size;
        }
    }
    return size;
};

/** Find the directory of a dependency as Node.js does: node_modules of the directory and of its parents */
const findPackage = (name, from) => {
    for (let dir = from; ; dir = path.dirname(dir)) {
        const candidate = path.join(dir, "node_modules", name);
        if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
        if (dir === path.dirname(dir)) return null;
    }
};

/**
 * The packages that are installed with the package of `root`: its dependencies and theirs, without devDependencies.
 * @returns {{ name: string, version: string, bytes: number }[]}
 */
const listDependencies = (root) => {
    const found = new Map();
    const visit = (dir) => {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
        for (const name of Object.keys(manifest.dependencies ?? {})) {
            const dependencyDir = findPackage(name, dir);
            if (dependencyDir === null || found.has(dependencyDir)) continue;
            const { version } = JSON.parse(fs.readFileSync(path.join(dependencyDir, "package.json"), "utf-8"));
            found.set(dependencyDir, { name, version, bytes: directorySize(dependencyDir) });
            visit(dependencyDir);
        }
    };
    visit(root);
    return [...found.values()].sort((a, b) => b.bytes - a.bytes);
};

/** @param {string} root the root of a build */
const measureSize = (root) => {
    // The files that npm would publish, without running the scripts of the package
    const [pack] = JSON.parse(
        run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, label: "npm pack --dry-run" })
    );
    const dependencies = listDependencies(root);
    return {
        packageMB: pack.unpackedSize / 1e6,
        dependenciesMB: dependencies.reduce((sum, dependency) => sum + dependency.bytes, 0) / 1e6,
        dependencies
    };
};

module.exports = { measureSize, listDependencies };
