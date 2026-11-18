// Convert the kuromoji.js dictionary (dict/*.dat.gz) into the compact layout used by kuromojin.
// usage: node scripts/build-compact-dict.mjs <kuromoji.js dict dir> <output dir> [gzip|br]
//
// Layout (kuromojin-dict.json has the format version and the compression):
// - base, check (Int32): value - index, then split into byte planes
// - cc (Int16), tid (10-byte entries), tid_map (Int32), tid_feat (4 x Int32 per entry): split into byte planes
// - tid_pos (40 MB of "surface,pos,...,reading,pronunciation") is replaced with
//   tid_feat (pos tuple id, basic_form id, reading id, pronunciation id per entry; -1 = same as surface / reading)
//   + tid_str (distinct strings separated by NUL). surface_form is not stored: it is the matched part of the input
// - unk*: kuromoji.js layout without the padding
// Splitting into byte planes puts similar bytes next to each other, so gzip/brotli compress them better.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [src, out, compression = "gzip"] = process.argv.slice(2);
if (compression !== "gzip" && compression !== "br") throw new Error("compression must be gzip or br");
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/\.(gz|br)$/.test(f)) fs.rmSync(path.join(out, f));
const ext = compression === "gzip" ? ".gz" : ".br";
const read = (name) => zlib.gunzipSync(fs.readFileSync(path.join(src, name)));
const compress = (buf) =>
    compression === "gzip"
        ? zlib.gzipSync(buf, { level: 9 })
        : zlib.brotliCompressSync(buf, {
              params: {
                  [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                  [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
                  [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length
              }
          });
const files = {};
const write = (name, buf) => {
    const data = compress(buf);
    fs.writeFileSync(path.join(out, name + ext), data);
    files[name] = { raw: buf.length, compressed: data.length };
};
const trim = (buf, unit = 1) => {
    let end = buf.length;
    while (end > 0 && buf[end - 1] === 0) end--;
    end = Math.ceil(end / unit) * unit;
    return buf.subarray(0, end);
};
// byte planes: out[b * n + i] = in[i * width + b]
const split = (buf, width) => {
    if (buf.length % width !== 0) throw new Error(`length ${buf.length} is not a multiple of ${width}`);
    const n = buf.length / width;
    const result = Buffer.alloc(buf.length);
    for (let i = 0; i < n; i++) for (let b = 0; b < width; b++) result[b * n + i] = buf[i * width + b];
    return result;
};
const minusIndex = (buf) => {
    const a = new Int32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    for (let i = 0; i < a.length; i++) a[i] -= i;
    return Buffer.from(a.buffer);
};

write("base", split(minusIndex(read("base.dat.gz")), 4));
write("check", split(minusIndex(read("check.dat.gz")), 4));
write("cc", split(read("cc.dat.gz"), 2));
write("tid_map", split(trim(read("tid_map.dat.gz"), 4), 4));
// unknown dictionary: small, keep the kuromoji.js layout without the padding
write("unk", trim(read("unk.dat.gz"), 2));
write("unk_pos", Buffer.concat([trim(read("unk_pos.dat.gz")), Buffer.from([0])]));
write("unk_map", trim(read("unk_map.dat.gz"), 4));
write("unk_char", read("unk_char.dat.gz"));
write("unk_compat", trim(read("unk_compat.dat.gz"), 4));
write("unk_invoke", Buffer.concat([trim(read("unk_invoke.dat.gz")), Buffer.from([0])]));

const tid = read("tid.dat.gz");
const tidPos = read("tid_pos.dat.gz");
const entries = Math.ceil(trim(tid).length / 10);
const strings = new Map();
const stringId = (s) => {
    let id = strings.get(s);
    if (id === undefined) {
        id = strings.size;
        strings.set(s, id);
    }
    return id;
};
const SAME = -1;
const posTuples = new Map();
const feat = new Int32Array(entries * 4);
for (let i = 0; i < entries; i++) {
    const posId = tid.readInt32LE(i * 10 + 6);
    const end = tidPos.indexOf(0, posId);
    const f = tidPos.toString("utf8", posId, end).split(",");
    if (f.length !== 10) throw new Error(`unexpected features at ${i}: ${f}`);
    const tuple = f.slice(1, 7).join(",");
    let tupleId = posTuples.get(tuple);
    if (tupleId === undefined) {
        tupleId = posTuples.size;
        posTuples.set(tuple, tupleId);
    }
    feat[i * 4] = tupleId;
    feat[i * 4 + 1] = f[7] === f[0] ? SAME : stringId(f[7]);
    feat[i * 4 + 2] = stringId(f[8]);
    feat[i * 4 + 3] = f[9] === f[8] ? SAME : stringId(f[9]);
}
// tid: left_id, right_id, word_cost, pos_id per entry (the token info id stays the byte offset)
write("tid", split(tid.subarray(0, entries * 10), 10));
write("tid_feat", split(Buffer.from(feat.buffer), 16));
const header = Buffer.alloc(4);
header.writeInt32LE(posTuples.size);
const body = [...posTuples.keys(), ...strings.keys()].join("\0");
write("tid_str", Buffer.concat([header, Buffer.from(body, "utf8")]));
fs.writeFileSync(path.join(out, "kuromojin-dict.json"), JSON.stringify({ format: 2, compression }, null, 2) + "\n");
const total = Object.values(files).reduce((s, f) => s + f.compressed, 0);
console.log(JSON.stringify({ entries, posTuples: posTuples.size, strings: strings.size, totalBytes: total, files }));
