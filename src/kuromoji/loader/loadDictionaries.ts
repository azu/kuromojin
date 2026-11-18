// Derived from kuromoji.js DictionaryLoader / NodeDictionaryLoader / BrowserDictionaryLoader (Apache-2.0).
import { DoubleArray } from "../dict/DoubleArray";
import { CompactTokenInfoDictionary, TargetMap, TokenInfoDictionary } from "../dict/TokenInfoDictionary";
import { ConnectionCosts } from "../dict/ConnectionCosts";
import { UnknownDictionary } from "../dict/UnknownDictionary";
import { CharacterDefinition } from "../dict/CharacterDefinition";
import type { Dictionaries } from "../dict/Dictionaries";

/**
 * Load a file and return its decompressed content.
 * Files ending with .gz are gzip and files ending with .br are brotli; others are returned as is.
 */
export type LoadArrayBuffer = (file: string) => Promise<ArrayBuffer>;

const join = (dir: string, file: string) => (dir.endsWith("/") ? dir + file : dir + "/" + file);

const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
        return data.buffer as ArrayBuffer;
    }
    // copy into its own ArrayBuffer, so that typed arrays can be created at offset 0
    return new Uint8Array(data).buffer;
};

const nodeLoader = (): LoadArrayBuffer | undefined => {
    if (typeof process === "undefined" || !process.versions || !process.versions.node) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zlib = require("zlib") as typeof import("zlib");
    return async (file) => {
        const data = await fs.promises.readFile(file);
        const decompress = file.endsWith(".gz") ? zlib.gunzip : file.endsWith(".br") ? zlib.brotliDecompress : undefined;
        if (!decompress) return toArrayBuffer(data);
        const raw: Buffer = await new Promise((resolve, reject) =>
            decompress(data, (error: Error | null, result: Buffer) => (error ? reject(error) : resolve(result)))
        );
        return toArrayBuffer(raw);
    };
};

const browserLoader: LoadArrayBuffer = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let format: "gzip" | "brotli" | undefined;
    if (url.endsWith(".gz")) {
        // the server may have already removed the gzip encoding
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) format = "gzip";
    } else if (url.endsWith(".br")) {
        format = "brotli";
    }
    if (!format) return toArrayBuffer(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format as CompressionFormat));
    return new Response(stream).arrayBuffer();
};

/** reverse of splitting into byte planes: out[i * width + b] = in[b * n + i] */
const joinBytePlanes = (buffer: ArrayBuffer, width: number): Uint8Array => {
    const input = new Uint8Array(buffer);
    const n = input.length / width;
    const output = new Uint8Array(input.length);
    for (let i = 0, j = 0; i < n; i++) {
        for (let b = 0; b < width; b++) {
            output[j++] = input[b * n + i];
        }
    }
    return output;
};
/** joinBytePlanes(buffer, 4) as Int32Array, then add the index to each value */
const joinInt32PlanesPlusIndex = (buffer: ArrayBuffer): Int32Array => {
    const input = new Uint8Array(buffer);
    const n = input.length / 4;
    const output = new Int32Array(n);
    for (let i = 0; i < n; i++) {
        output[i] = (input[i] | (input[n + i] << 8) | (input[2 * n + i] << 16) | (input[3 * n + i] << 24)) + i;
    }
    return output;
};

type Manifest = { format: number; compression: "gzip" | "br" };

/**
 * Load the compact layout made by scripts/build-compact-dict.mjs
 */
async function loadCompact(dicPath: string, manifest: Manifest, load: LoadArrayBuffer): Promise<Dictionaries> {
    const ext = manifest.compression === "br" ? ".br" : ".gz";
    const names = [
        "base",
        "check",
        "cc",
        "tid",
        "tid_feat",
        "tid_str",
        "tid_map",
        "unk",
        "unk_pos",
        "unk_map",
        "unk_char",
        "unk_compat",
        "unk_invoke"
    ];
    const [base, check, cc, tid, tidFeat, tidStr, tidMap, unk, unkPos, unkMap, unkChar, unkCompat, unkInvoke] =
        await Promise.all(names.map((name) => load(join(dicPath, name + ext))));
    const trie = new DoubleArray(
        joinInt32PlanesPlusIndex(base),
        joinInt32PlanesPlusIndex(check)
    );
    const tokenInfoDictionary = new CompactTokenInfoDictionary(
        joinBytePlanes(tid, 10),
        TargetMap.load(joinBytePlanes(tidMap, 4)),
        new Int32Array(joinBytePlanes(tidFeat, 16).buffer),
        new Uint8Array(tidStr)
    );
    const connectionCosts = new ConnectionCosts(new Int16Array(joinBytePlanes(cc, 2).buffer));
    const unknownDictionary = new UnknownDictionary(
        new Uint8Array(unk),
        new Uint8Array(unkPos),
        TargetMap.load(new Uint8Array(unkMap)),
        new CharacterDefinition(new Uint8Array(unkChar), new Uint32Array(unkCompat), new Uint8Array(unkInvoke))
    );
    return { trie, tokenInfoDictionary, connectionCosts, unknownDictionary };
}

/**
 * Load the dictionary of kuromoji.js (e.g. KUROMOJIN_DIC_PATH to kuromoji/dict)
 */
async function loadKuromojiLayout(dicPath: string, load: LoadArrayBuffer): Promise<Dictionaries> {
    const names = [
        "base.dat.gz",
        "check.dat.gz",
        "tid.dat.gz",
        "tid_pos.dat.gz",
        "tid_map.dat.gz",
        "cc.dat.gz",
        "unk.dat.gz",
        "unk_pos.dat.gz",
        "unk_map.dat.gz",
        "unk_char.dat.gz",
        "unk_compat.dat.gz",
        "unk_invoke.dat.gz"
    ];
    const [base, check, tid, tidPos, tidMap, cc, unk, unkPos, unkMap, unkChar, unkCompat, unkInvoke] =
        await Promise.all(names.map((name) => load(join(dicPath, name))));
    const trie = new DoubleArray(new Int32Array(base), new Int32Array(check));
    const tokenInfoDictionary = new TokenInfoDictionary(
        new Uint8Array(tid),
        new Uint8Array(tidPos),
        TargetMap.load(new Uint8Array(tidMap))
    );
    const connectionCosts = new ConnectionCosts(new Int16Array(cc));
    const unknownDictionary = new UnknownDictionary(
        new Uint8Array(unk),
        new Uint8Array(unkPos),
        TargetMap.load(new Uint8Array(unkMap)),
        new CharacterDefinition(new Uint8Array(unkChar), new Uint32Array(unkCompat), new Uint8Array(unkInvoke))
    );
    return { trie, tokenInfoDictionary, connectionCosts, unknownDictionary };
}

export async function loadDictionaries(
    dicPath: string,
    load: LoadArrayBuffer = nodeLoader() ?? browserLoader
): Promise<Dictionaries> {
    // kuromojin-dict.json exists only in the compact layout
    const manifest = await load(join(dicPath, "kuromojin-dict.json")).then(
        (buffer) => JSON.parse(new TextDecoder().decode(buffer)) as Manifest,
        () => undefined
    );
    if (manifest && manifest.format === 2) {
        return loadCompact(dicPath, manifest, load);
    }
    return loadKuromojiLayout(dicPath, load);
}
