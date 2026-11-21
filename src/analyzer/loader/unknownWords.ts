// Derived from kuromoji.js 0.1.2 (UnknownDictionary, TokenInfoDictionary, CharacterDefinition, InvokeDefinitionMap).
// Copyright 2014 Takuya Asano, Copyright 2010-2014 Atilika Inc. and contributors.
// Licensed under the Apache License, Version 2.0. See NOTICE.md in the parent directory.
// Changes: ported to TypeScript, kept only the reading, and the data is turned into arrays of numbers.
import type { Dictionary, EntryCosts } from "../Dictionary";
import { readInt16, readInt32, Utf8Reader } from "./bytes";

/**
 * Read a map of kuromoji.js: the number of keys, then for each key (key, number of values, values).
 * A value is the position of a 10-byte entry, so the number of the entry is the value / 10.
 * Returns the entries of the key `k` as entries[offsets[k]] .. entries[offsets[k + 1] - 1].
 */
export function readTargetMap(bytes: Uint8Array): { offsets: Int32Array; entries: Int32Array } {
    let maxKey = -1;
    let total = 0;
    // kuromoji.js reads until the end of the file and does not use the number of keys
    for (let position = 4; position + 1 <= bytes.length; ) {
        const key = readInt32(bytes, position);
        const size = readInt32(bytes, position + 4);
        position += 8 + size * 4;
        if (key > maxKey) maxKey = key;
        total += size;
    }
    const offsets = new Int32Array(maxKey + 2);
    for (let position = 4; position + 1 <= bytes.length; ) {
        const key = readInt32(bytes, position);
        const size = readInt32(bytes, position + 4);
        offsets[key + 1] += size;
        position += 8 + size * 4;
    }
    for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
    const entries = new Int32Array(total);
    const filled = new Int32Array(maxKey + 1);
    for (let position = 4; position + 1 <= bytes.length; ) {
        const key = readInt32(bytes, position);
        const size = readInt32(bytes, position + 4);
        position += 8;
        for (let i = 0; i < size; i++) {
            entries[offsets[key] + filled[key]++] = readInt32(bytes, position) / 10;
            position += 4;
        }
    }
    return { offsets, entries };
}

/**
 * Read the entries of kuromoji.js: left id (2 bytes), right id (2), word cost (2), position of the features (4).
 */
export function readEntries(bytes: Uint8Array): EntryCosts & { featurePositions: Int32Array } {
    const count = Math.floor(bytes.length / 10);
    const left = new Int16Array(count);
    const right = new Int16Array(count);
    const cost = new Int16Array(count);
    const featurePositions = new Int32Array(count);
    for (let i = 0, o = 0; i < count; i++, o += 10) {
        left[i] = readInt16(bytes, o);
        right[i] = readInt16(bytes, o + 2);
        cost[i] = readInt16(bytes, o + 4);
        featurePositions[i] = readInt32(bytes, o + 6);
    }
    return { left, right, cost, featurePositions };
}

type UnknownWords = Pick<
    Dictionary,
    "classOffsets" | "classEntries" | "unknown" | "unknownFeatures" | "charClass" | "classInvoke" | "classGrouping"
>;

/**
 * Read the unknown words. Both formats of a dictionary store them in the layout of kuromoji.js.
 * @param unk entries of unknown words (unk.dat)
 * @param unkPos features of the entries (unk_pos.dat)
 * @param unkMap character class -> entries (unk_map.dat)
 * @param unkChar UTF-16 code unit -> character class (unk_char.dat)
 * @param unkInvoke definitions of the character classes (unk_invoke.dat)
 */
export function readUnknownWords(
    unk: Uint8Array,
    unkPos: Uint8Array,
    unkMap: Uint8Array,
    unkChar: Uint8Array,
    unkInvoke: Uint8Array
): UnknownWords {
    const { left, right, cost, featurePositions } = readEntries(unk);
    const { offsets, entries } = readTargetMap(unkMap);
    const strings = new Utf8Reader(unkPos);
    const unknownFeatures: string[][] = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        // class name, pos, pos_detail_1, pos_detail_2, pos_detail_3, conjugated_type, conjugated_form, basic_form
        unknownFeatures[entry] = strings.decodeUntilNul(featurePositions[entry]).split(",").slice(1, 8);
    }

    // definitions of the classes: always invoke (1 byte), grouping (1), max length (4), name (until NUL)
    const invoke: number[] = [];
    const grouping: number[] = [];
    let defaultClass = 0;
    let foundDefault = false;
    const names = new Utf8Reader(unkInvoke);
    for (let position = 0; position + 1 < unkInvoke.length; ) {
        const classId = invoke.length;
        invoke.push(unkInvoke[position]);
        grouping.push(unkInvoke[position + 1]);
        position += 6;
        let end = unkInvoke.indexOf(0, position);
        if (end === -1) end = unkInvoke.length;
        if (!foundDefault && names.decode(position, end) === "DEFAULT") {
            defaultClass = classId;
            foundDefault = true;
        }
        position = end + 1;
    }

    const charClass = new Uint8Array(0x10000).fill(defaultClass);
    charClass.set(unkChar.subarray(0, 0x10000));
    // A character outside the Basic Multilingual Plane has the default class.
    // kuromoji.js looks at the first code unit only, so a low surrogate keeps the class of the dictionary.
    charClass.fill(defaultClass, 0xd800, 0xdc00);

    // a character class is one byte, so arrays of 256 classes are long enough for every class of charClass
    const classOffsets = new Int32Array(257).fill(entries.length);
    classOffsets.set(offsets.subarray(0, 257));
    const classInvoke = new Uint8Array(256);
    classInvoke.set(invoke.slice(0, 256));
    const classGrouping = new Uint8Array(256);
    classGrouping.set(grouping.slice(0, 256));
    return {
        classOffsets,
        classEntries: entries,
        unknown: { left, right, cost },
        unknownFeatures,
        charClass,
        classInvoke,
        classGrouping
    };
}
