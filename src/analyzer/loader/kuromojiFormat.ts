// Derived from kuromoji.js 0.1.2 (DictionaryLoader, DynamicDictionaries, TokenInfoDictionary, IpadicFormatter).
// Copyright 2014 Takuya Asano, Copyright 2010-2014 Atilika Inc. and contributors.
// Licensed under the Apache License, Version 2.0. See NOTICE.md in the parent directory.
// Changes: ported to TypeScript, and the files are turned into the tables of kuromojin.
import type { Dictionary, KnownFeatures } from "../Dictionary";
import type { Token } from "../Token";
import { DoubleArrayTrie } from "../DoubleArrayTrie";
import { toInt16Array, toInt32Array, Utf8Reader } from "./bytes";
import type { Platform } from "./platform";
import { readEntries, readTargetMap, readUnknownWords } from "./unknownWords";

/** The twelve files of a dictionary of kuromoji.js */
export const KUROMOJI_FILES = [
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
] as const;

/**
 * The features of the entries of a dictionary of kuromoji.js.
 * The features of an entry are one string: surface_form, pos, ..., pronunciation separated by commas.
 */
class KuromojiFeatures implements KnownFeatures {
    private readonly strings: Utf8Reader;
    /** split features by entry. It grows up to the number of distinct entries that the analysis returns. */
    private readonly cache: (string[] | undefined)[] = [];
    constructor(
        private readonly featurePositions: Int32Array,
        features: Uint8Array
    ) {
        this.strings = new Utf8Reader(features);
    }

    token(entry: number, position: number): Token {
        let features = this.cache[entry];
        if (features === undefined) {
            features = this.strings.decodeUntilNul(this.featurePositions[entry]).split(",");
            this.cache[entry] = features;
        }
        return {
            word_id: entry * 10,
            word_type: "KNOWN",
            word_position: position,
            surface_form: features[0],
            pos: features[1],
            pos_detail_1: features[2],
            pos_detail_2: features[3],
            pos_detail_3: features[4],
            conjugated_type: features[5],
            conjugated_form: features[6],
            basic_form: features[7],
            reading: features[8],
            pronunciation: features[9]
        };
    }
}

const join = (directory: string, file: string) => (directory.endsWith("/") ? directory + file : directory + "/" + file);
const isGzip = (bytes: Uint8Array) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

/**
 * Load a dictionary in the format of kuromoji.js from a directory or a URL.
 */
export async function loadKuromojiDictionary(directory: string, platform: Platform): Promise<Dictionary> {
    const files = await Promise.all(
        KUROMOJI_FILES.map(async (name) => {
            const bytes = await platform.read(join(directory, name));
            // a server can remove the gzip compression of a .gz file before the browser sees it
            return isGzip(bytes) ? platform.gunzip(bytes) : bytes;
        })
    );
    const [base, check, tid, tidPos, tidMap, cc, unk, unkPos, unkMap, unkChar, , unkInvoke] = files;
    const { left, right, cost, featurePositions } = readEntries(tid);
    const { offsets, entries } = readTargetMap(tidMap);
    return {
        trie: new DoubleArrayTrie(toInt32Array(base), toInt32Array(check)),
        wordOffsets: offsets,
        wordEntries: entries,
        known: { left, right, cost },
        knownFeatures: new KuromojiFeatures(featurePositions, tidPos),
        connectionCosts: toInt16Array(cc),
        ...readUnknownWords(unk, unkPos, unkMap, unkChar, unkInvoke),
        versions: null
    };
}
