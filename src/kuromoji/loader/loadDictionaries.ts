// Derived from kuromoji.js DictionaryLoader / NodeDictionaryLoader / BrowserDictionaryLoader (Apache-2.0).
import { DoubleArray } from "../dict/DoubleArray";
import { CompactTokenInfoDictionary, TargetMap, TokenInfoDictionary } from "../dict/TokenInfoDictionary";
import { ConnectionCosts } from "../dict/ConnectionCosts";
import { UnknownDictionary } from "../dict/UnknownDictionary";
import { CharacterDefinition } from "../dict/CharacterDefinition";
import type { Dictionaries } from "../dict/Dictionaries";

export type LoadArrayBuffer = (file: string) => Promise<ArrayBuffer>;

const join = (dir: string, file: string) => (dir.endsWith("/") ? dir + file : dir + "/" + file);

const nodeLoader = (): LoadArrayBuffer | undefined => {
    if (typeof process === "undefined" || !process.versions || !process.versions.node) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zlib = require("zlib") as typeof import("zlib");
    return async (file) => {
        const data = await fs.promises.readFile(file);
        const raw: Buffer = await new Promise((resolve, reject) =>
            zlib.gunzip(data, (error, result) => (error ? reject(error) : resolve(result)))
        );
        if (raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength) {
            return raw.buffer as ArrayBuffer;
        }
        // copy into its own ArrayBuffer, so that typed arrays can be created at offset 0
        return new Uint8Array(raw).buffer;
    };
};

const browserLoader: LoadArrayBuffer = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    // the server may have already removed the gzip encoding
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
};

export async function loadDictionaries(
    dicPath: string,
    load: LoadArrayBuffer = nodeLoader() ?? browserLoader
): Promise<Dictionaries> {
    // The compact layout has tid_feat.dat.gz + tid_str.dat.gz instead of tid_pos.dat.gz.
    // A directory of the kuromoji.js layout (e.g. KUROMOJIN_DIC_PATH to kuromoji/dict) is still supported.
    const compact: Promise<[ArrayBuffer, ArrayBuffer] | undefined> = Promise.all([
        load(join(dicPath, "tid_feat.dat.gz")),
        load(join(dicPath, "tid_str.dat.gz"))
    ]).then(
        (buffers) => buffers,
        () => undefined
    );
    const featuresPromise = (async (): Promise<[ArrayBuffer, ArrayBuffer] | ArrayBuffer> => {
        const buffers = await compact;
        return buffers !== undefined ? buffers : load(join(dicPath, "tid_pos.dat.gz"));
    })();
    const names = [
        "base.dat.gz",
        "check.dat.gz",
        "tid.dat.gz",
        "tid_map.dat.gz",
        "cc.dat.gz",
        "unk.dat.gz",
        "unk_pos.dat.gz",
        "unk_map.dat.gz",
        "unk_char.dat.gz",
        "unk_compat.dat.gz",
        "unk_invoke.dat.gz"
    ];
    const [features, base, check, tid, tidMap, cc, unk, unkPos, unkMap, unkChar, unkCompat, unkInvoke] =
        await Promise.all([featuresPromise, ...names.map((name) => load(join(dicPath, name)))]);
    const trie = new DoubleArray(new Int32Array(base), new Int32Array(check));
    const tokenInfoDictionary = Array.isArray(features)
        ? new CompactTokenInfoDictionary(
              new Uint8Array(tid),
              TargetMap.load(new Uint8Array(tidMap)),
              new Int32Array(features[0]),
              new Uint8Array(features[1])
          )
        : new TokenInfoDictionary(
              new Uint8Array(tid),
              new Uint8Array(features as ArrayBuffer),
              TargetMap.load(new Uint8Array(tidMap))
          );
    const connectionCosts = new ConnectionCosts(new Int16Array(cc));
    const characterDefinition = new CharacterDefinition(
        new Uint8Array(unkChar),
        new Uint32Array(unkCompat),
        new Uint8Array(unkInvoke)
    );
    const unknownDictionary = new UnknownDictionary(
        new Uint8Array(unk),
        new Uint8Array(unkPos),
        TargetMap.load(new Uint8Array(unkMap)),
        characterDefinition
    );
    return { trie, tokenInfoDictionary, connectionCosts, unknownDictionary };
}
