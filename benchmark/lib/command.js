// Commands that the profile and the comparison run
"use strict";
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HEAD_ROOT = path.resolve(__dirname, "../..");

/** An error whose message is for the person who runs the profile: it is printed without a stack */
class ProfileError extends Error {}

const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? HEAD_ROOT,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...options.env }
    });
    const label = options.label ?? `${command} ${args.join(" ")}`;
    if (result.error) {
        throw new ProfileError(`${label} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new ProfileError(`${label} failed with the exit status ${result.status}.\n${result.stderr ?? ""}`);
    }
    return result.stdout;
};
const log = (message) => process.stderr.write(`[profile] ${message}\n`);
const git = (args, cwd = HEAD_ROOT) => run("git", args, { cwd }).trim();

module.exports = { HEAD_ROOT, ProfileError, run, log, git };
