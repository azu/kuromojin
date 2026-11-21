// LICENSE : MIT
/**
 * The two functions that hide the difference between Node.js and browsers.
 */
export type Platform = {
    /** Read the bytes of a file (Node.js) or of a URL (browser). */
    read(path: string): Promise<Uint8Array>;
    /**
     * Decompress gzip data.
     * @param rawLength the length after decompression, when it is known
     */
    gunzip(data: Uint8Array, rawLength?: number): Promise<Uint8Array>;
};

export const isNode = (): boolean =>
    typeof process !== "undefined" && process.versions != null && typeof process.versions.node === "string";

// The modules of Node.js are required only when the code runs in Node.js.
// The "browser" field of package.json tells a bundler to leave them out of a build for a browser.
// The names have no `node:` prefix: webpack 5 fails a build for a browser on a name with the prefix,
// also when the "browser" field has the name.
// Node.js has DecompressionStream too, but its zlib module decompresses the dictionary several times faster.
const nodePlatform = (): Platform => {
    const fs = require("fs") as typeof import("fs");
    const zlib = require("zlib") as typeof import("zlib");
    return {
        read: (path) => fs.promises.readFile(path),
        gunzip: (data, rawLength) =>
            new Promise((resolve, reject) => {
                // With the length after decompression, zlib writes the output into one buffer of that size
                const options = rawLength !== undefined ? { chunkSize: Math.max(1024, rawLength) } : {};
                zlib.gunzip(data, options, (error, result) => (error ? reject(error) : resolve(result)));
            })
    };
};

const browserPlatform: Platform = {
    read: async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load the dictionary file ${url}: ${response.status} ${response.statusText}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    },
    gunzip: async (data) => {
        if (typeof DecompressionStream === "undefined") {
            throw new Error("kuromojin needs DecompressionStream to load the dictionary in this environment.");
        }
        const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
};

export const getPlatform = (): Platform => (isNode() ? nodePlatform() : browserPlatform);
export { browserPlatform };
