// The builds that are measured: the working tree, and the base of a comparison
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { HEAD_ROOT, ProfileError, run, git, log } = require("./command");

const hasCommit = (ref) =>
    spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: HEAD_ROOT, stdio: "ignore" })
        .status === 0;

const defaultBase = () => {
    const ref = ["origin/master", "master"].find(hasCommit);
    if (ref === undefined) {
        throw new ProfileError("No base: neither origin/master nor master exists. Pass --base <ref>.");
    }
    return ref;
};

/**
 * The package manager of a commit, from its lock file.
 * The commits before the move to pnpm use Yarn 1, so a base can be one of them.
 */
const packageManagerOf = (root) => (fs.existsSync(path.join(root, "yarn.lock")) ? "yarn" : "pnpm");

const build = (root, label) => {
    log(`building ${label}`);
    run(packageManagerOf(root), ["run", "build"], { cwd: root, label: `The build of ${label}` });
};

const checkBuilt = (root, label) => {
    const main = path.join(root, JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")).main);
    if (!fs.existsSync(main)) {
        throw new ProfileError(`${label} is not built: ${main} does not exist. Run "pnpm run build" first.`);
    }
};

/** The working tree */
const prepareHead = (options) => {
    if (options.build) {
        build(HEAD_ROOT, "the working tree");
    }
    checkBuilt(HEAD_ROOT, "The working tree");
    const dirty = git(["status", "--porcelain", "--untracked-files=no"]) !== "";
    return { name: "head", root: HEAD_ROOT, ref: null, commit: git(["rev-parse", "HEAD"]), dirty };
};

/**
 * The base: a worktree of its commit with the dependencies that the commit locks.
 * It is kept in the cache directory for the next comparison with the same commit.
 */
const prepareBase = (ref, cacheDir) => {
    if (!hasCommit(ref)) {
        throw new ProfileError(`The base ${ref} is not a commit of this repository.`);
    }
    const commit = git(["rev-parse", "--verify", `${ref}^{commit}`]);
    const dir = path.join(cacheDir, `base-${commit}`);
    const marker = path.join(dir, ".profile-built");
    if (!fs.existsSync(marker)) {
        if (fs.existsSync(dir)) {
            // a comparison that was stopped before the build ended
            spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: HEAD_ROOT, stdio: "ignore" });
            fs.rmSync(dir, { recursive: true, force: true });
        }
        spawnSync("git", ["worktree", "prune"], { cwd: HEAD_ROOT, stdio: "ignore" });
        fs.mkdirSync(cacheDir, { recursive: true });
        log(`creating a worktree of the base ${commit.slice(0, 12)}`);
        git(["worktree", "add", "--detach", dir, commit]);
        log("installing the dependencies of the base");
        // --ignore-scripts: the scripts of the package would build it and set the Git hooks of the repository
        const packageManager = packageManagerOf(dir);
        run(packageManager, ["install", "--frozen-lockfile", "--ignore-scripts"], {
            cwd: dir,
            label: `${packageManager} install of the base`
        });
        build(dir, "the base");
        fs.writeFileSync(marker, commit);
    }
    checkBuilt(dir, "The base");
    // CI passes the commit itself as the base: a ref that is the commit says nothing more
    return { name: "base", root: dir, ref: ref === commit ? null : ref, commit, dirty: false };
};

module.exports = { defaultBase, prepareHead, prepareBase };
