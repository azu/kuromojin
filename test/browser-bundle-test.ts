// LICENSE : MIT
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { build, type Rollup } from "vite";

const root = path.join(__dirname, "..");
const packageDictionary = fs.readFileSync(path.join(root, "dict", "kuromojin.dict"));

// The scenario "When a page is built with a bundler, the dictionary of the package is used"
// of docs/products/kuromojin/features/dictionary/requirements.md
describe("browser bundle", function () {
    let project: string;
    beforeAll(function () {
        // A project that installed kuromojin: node_modules/kuromojin is the built package
        project = fs.mkdtempSync(path.join(os.tmpdir(), "kuromojin-bundle-"));
        fs.mkdirSync(path.join(project, "node_modules"));
        fs.symlinkSync(root, path.join(project, "node_modules", "kuromojin"), "dir");
        fs.writeFileSync(
            path.join(project, "main.js"),
            'import { tokenize } from "kuromojin";\ntokenize("黒文字").then((tokens) => console.log(tokens));\n'
        );
    });
    afterAll(function () {
        fs.rmSync(project, { recursive: true, force: true });
    });

    it("copies the dictionary of the package and gives its URL when Vite builds for a browser", async function () {
        const result = (await build({
            root: project,
            configFile: false,
            logLevel: "silent",
            build: {
                write: false,
                // the build of a page. The library mode of Vite inlines every asset.
                rollupOptions: { input: path.join(project, "main.js") }
            }
        })) as Rollup.RollupOutput | Rollup.RollupOutput[];
        const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) => output.output);
        const dictionaries = outputs.filter(
            (output): output is Rollup.OutputAsset => output.type === "asset" && output.fileName.endsWith(".dict")
        );
        assert.strictEqual(dictionaries.length, 1, "the build has one copy of the dictionary");
        assert.ok(Buffer.from(dictionaries[0].source as Uint8Array).equals(packageDictionary));
        const chunks = outputs.filter((output): output is Rollup.OutputChunk => output.type === "chunk");
        const code = chunks.map((chunk) => chunk.code).join("\n");
        assert.ok(code.includes(path.basename(dictionaries[0].fileName)), "the code has the URL of the copy");
        // the code for Node.js is not in the build
        assert.ok(!code.includes("__dirname"), "the build has no path of Node.js");
    });
});
