// Convert the kuromoji.js dictionary (dict/*.dat.gz) into the compact layout used by kuromojin.
// usage: node scripts/build-compact-dict.mjs <kuromoji.js dict dir> <output dir>
//
// - base, check, cc: copied as is
// - tid: padding removed
// - tid_pos (40 MB of "surface,pos,...,reading,pronunciation" strings) is replaced with
//   tid_feat.dat.gz (Int32 x 4 per entry) + tid_str.dat.gz (distinct strings separated by NUL)
//   surface_form is not stored: it is the matched part of the input
// - unk*: padding removed
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const read = (name) => zlib.gunzipSync(fs.readFileSync(path.join(src, name)));
const write = (name, buf) => fs.writeFileSync(path.join(out, name), zlib.gzipSync(buf, { level: 9 }));
const trim = (buf, unit = 1) => {
    let end = buf.length;
    while (end > 0 && buf[end - 1] === 0) end--;
    end = Math.ceil(end / unit) * unit;
    return buf.subarray(0, end);
};

for (const name of ["base.dat.gz", "check.dat.gz", "cc.dat.gz", "tid_map.dat.gz", "unk_char.dat.gz"]) {
    fs.copyFileSync(path.join(src, name), path.join(out, name));
}
// unknown dictionary: keep the format, only remove the padding
// (unk.dat entries are 10 bytes; unk_compat is Uint32)
write("unk.dat.gz", trim(read("unk.dat.gz"), 2));
write("unk_pos.dat.gz", Buffer.concat([trim(read("unk_pos.dat.gz")), Buffer.from([0])]));
write("unk_map.dat.gz", trim(read("unk_map.dat.gz"), 4));
write("unk_compat.dat.gz", trim(read("unk_compat.dat.gz"), 4));
write("unk_invoke.dat.gz", Buffer.concat([trim(read("unk_invoke.dat.gz")), Buffer.from([0])]));

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
// per entry: pos tuple id, basic_form id (-1: same as surface), reading id, pronunciation id (-1: same as reading)
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
// tid.dat: keep left_id, right_id, word_cost (the token info id stays the byte offset), drop nothing else
write("tid.dat.gz", tid.subarray(0, entries * 10));
write("tid_feat.dat.gz", Buffer.from(feat.buffer));
// strings: pos tuples first (count in the header), then the other strings
const header = Buffer.alloc(4);
header.writeInt32LE(posTuples.size);
const body = [...posTuples.keys(), ...strings.keys()].join("\0");
write("tid_str.dat.gz", Buffer.concat([header, Buffer.from(body, "utf8")]));
console.log({ entries, posTuples: posTuples.size, strings: strings.size });
