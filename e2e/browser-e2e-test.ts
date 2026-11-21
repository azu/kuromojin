// LICENSE : MIT
// Build pages that use the packed kuromojin with bundlers, open them in Chromium, and check the tokens.
// The scenarios of "Use Japanese rules in a page built with a bundler without setting up a dictionary"
// in docs/products/kuromojin/features/dictionary/requirements.md
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { build as viteBuild, createServer as createViteServer, type ViteDevServer } from "vite";
import webpack from "webpack";
import * as esbuild from "esbuild";

const root = path.join(__dirname, "..");
const TEXT = "日本語の文章を解析する";

/** The page: tokenize TEXT and put the result on `window` */
const pageScript = (importLine: string, call: string) => `${importLine}
window.e2eResult = ${call}.then(
    (tokens) => ({ ok: true, tokens }),
    (error) => ({ ok: false, error: String(error && error.message) })
);
`;
const html = (script: string) =>
    `<!doctype html><html><body><script type="module" src="${script}"></script></body></html>\n`;

type Result = { ok: true; tokens: unknown[] } | { ok: false; error: string };

/** Serve a directory with a static server */
const serve = async (directory: string): Promise<{ url: string; requests: string[]; close: () => Promise<void> }> => {
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
        requests.push(pathname);
        const file = path.join(directory, pathname.endsWith("/") ? pathname + "index.html" : pathname);
        if (!file.startsWith(directory) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404).end("not found");
            return;
        }
        const type = file.endsWith(".html")
            ? "text/html"
            : file.endsWith(".js")
              ? "text/javascript"
              : "application/octet-stream";
        response.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/`,
        requests,
        close: () => new Promise((resolve) => server.close(() => resolve()))
    };
};

describe("browser e2e", function () {
    let project: string;
    let browser: Browser;
    let expectedTokens: unknown[];

    beforeAll(async function () {
        // A project that installed the packed kuromojin and a textlint rule written in CommonJS
        project = fs.mkdtempSync(path.join(os.tmpdir(), "kuromojin-e2e-"));
        const packed = path.join(project, "packed");
        fs.mkdirSync(packed);
        execFileSync("npm", ["pack", "--silent", "--ignore-scripts", "--pack-destination", packed], { cwd: root });
        const tarball = fs.readdirSync(packed).find((name) => name.endsWith(".tgz"));
        assert.ok(tarball, "npm pack made a tarball");
        const kuromojinDirectory = path.join(project, "node_modules", "kuromojin");
        fs.mkdirSync(kuromojinDirectory, { recursive: true });
        execFileSync("tar", ["xzf", path.join(packed, tarball), "-C", kuromojinDirectory, "--strip-components=1"]);
        const rule = path.join(project, "node_modules", "cjs-rule");
        fs.mkdirSync(rule);
        fs.writeFileSync(
            path.join(rule, "package.json"),
            '{ "name": "cjs-rule", "version": "1.0.0", "main": "index.js" }\n'
        );
        fs.writeFileSync(
            path.join(rule, "index.js"),
            'const { tokenize } = require("kuromojin");\nmodule.exports = { tokenize };\n'
        );
        fs.writeFileSync(path.join(project, "package.json"), '{ "name": "e2e", "private": true }\n');

        const pages: Record<string, string> = {
            direct: pageScript('import { tokenize } from "kuromojin";', `tokenize(${JSON.stringify(TEXT)})`),
            "cjs-rule": pageScript('import rule from "cjs-rule";', `rule.tokenize(${JSON.stringify(TEXT)})`),
            "esbuild-file-loader": pageScript(
                'import { tokenize } from "kuromojin";\nimport dictionaryUrl from "kuromojin/dict/kuromojin.dict";',
                `tokenize(${JSON.stringify(TEXT)}, { dicPath: dictionaryUrl })`
            )
        };
        for (const [name, script] of Object.entries(pages)) {
            fs.mkdirSync(path.join(project, name));
            fs.writeFileSync(path.join(project, name, "main.js"), script);
            fs.writeFileSync(path.join(project, name, "index.html"), html("./main.js"));
        }

        // the tokens of Node.js are the expected tokens
        const kuromojin = require(kuromojinDirectory) as typeof import("../src/index");
        expectedTokens = JSON.parse(JSON.stringify(await kuromojin.tokenize(TEXT)));
        browser = await chromium.launch();
    });
    afterAll(async function () {
        await browser?.close();
        if (project) fs.rmSync(project, { recursive: true, force: true });
    });

    const open = async (url: string): Promise<Result> => {
        const context = await browser.newContext();
        try {
            const page = await context.newPage();
            await page.goto(url);
            await page.waitForFunction(() => (window as unknown as { e2eResult?: unknown }).e2eResult !== undefined);
            return await page.evaluate(() => (window as unknown as { e2eResult: Promise<Result> }).e2eResult);
        } finally {
            await context.close();
        }
    };
    const assertTokens = (result: Result) => {
        assert.ok(result.ok, result.ok ? "" : result.error);
        assert.deepStrictEqual(result.tokens, expectedTokens);
    };
    /** Open the built page, check the tokens, and return the requested paths */
    const openBuilt = async (directory: string): Promise<string[]> => {
        const server = await serve(directory);
        try {
            assertTokens(await open(server.url));
            return server.requests;
        } finally {
            await server.close();
        }
    };
    const dictionaryRequests = (requests: string[]) => requests.filter((request) => request.endsWith(".dict"));

    for (const page of ["direct", "cjs-rule"]) {
        it(`Vite build: the page "${page}" uses the copy of the dictionary without a setting`, async function () {
            const outDir = path.join(project, "dist", `vite-${page}`);
            await viteBuild({
                root: path.join(project, page),
                configFile: false,
                logLevel: "silent",
                build: { outDir, emptyOutDir: true }
            });
            const requests = await openBuilt(outDir);
            assert.strictEqual(dictionaryRequests(requests).length, 1);
        });

        it(`Vite dev server: the page "${page}" uses the dictionary of the package without a setting`, async function () {
            const server: ViteDevServer = await createViteServer({
                root: path.join(project, page),
                configFile: false,
                logLevel: "silent",
                cacheDir: path.join(project, ".vite", page),
                server: { port: 0, host: "127.0.0.1", fs: { allow: [project] } }
            });
            await server.listen();
            try {
                const url = server.resolvedUrls?.local[0];
                assert.ok(url, "the dev server has a URL");
                assertTokens(await open(url));
            } finally {
                await server.close();
            }
        });

        it(`webpack: the page "${page}" uses the copy of the dictionary without a setting`, async function () {
            const outDir = path.join(project, "dist", `webpack-${page}`);
            const stats = await new Promise<webpack.Stats>((resolve, reject) =>
                webpack(
                    {
                        mode: "production",
                        context: project,
                        entry: path.join(project, page, "main.js"),
                        output: { path: outDir, filename: "main.js" },
                        performance: { hints: false }
                    },
                    (error, result) => (error || !result ? reject(error) : resolve(result))
                )
            );
            assert.ok(!stats.hasErrors(), stats.toString("errors-only"));
            fs.writeFileSync(path.join(outDir, "index.html"), html("./main.js"));
            const requests = await openBuilt(outDir);
            assert.strictEqual(dictionaryRequests(requests).length, 1);
        });
    }

    it("esbuild: without a setting, the page fails with the error of a missing dictionary", async function () {
        const outDir = path.join(project, "dist", "esbuild-iife");
        await esbuild.build({
            absWorkingDir: project,
            entryPoints: [path.join(project, "direct", "main.js")],
            bundle: true,
            format: "iife",
            outfile: path.join(outDir, "main.js"),
            logLevel: "silent"
        });
        fs.writeFileSync(path.join(outDir, "index.html"), html("./main.js"));
        const server = await serve(outDir);
        try {
            const result = await open(server.url);
            assert.ok(!result.ok);
            assert.match(result.error, /kuromojin needs a dictionary path in a browser/);
        } finally {
            await server.close();
        }
    });

    it("esbuild: the setup of the README, with the file loader and dicPath, uses the copy of the dictionary", async function () {
        const outDir = path.join(project, "dist", "esbuild-file-loader");
        await esbuild.build({
            absWorkingDir: project,
            entryPoints: [path.join(project, "esbuild-file-loader", "main.js")],
            bundle: true,
            format: "esm",
            loader: { ".dict": "file" },
            outdir: outDir,
            logLevel: "silent"
        });
        fs.writeFileSync(path.join(outDir, "index.html"), html("./main.js"));
        const requests = await openBuilt(outDir);
        assert.strictEqual(dictionaryRequests(requests).length, 1);
    });
});
