// Derived from kuromoji.js TokenInfoDictionary (Apache-2.0). Read-only part only.
import { readInt, readShort, StringReader } from "../util/ByteReader";
import type { IpadicFeatures } from "../Tokenizer";

/**
 * trie id (or character class id) -> token info ids, stored as CSR
 * (offsets[id]..offsets[id + 1] in values)
 */
export class TargetMap {
    constructor(
        readonly offsets: Int32Array,
        readonly values: Int32Array
    ) {}

    static load(buffer: Uint8Array): TargetMap {
        // layout: keys_size, then repeated (key, values_size, value * values_size)
        let maxKey = -1;
        let total = 0;
        let position = 4;
        while (position + 1 <= buffer.length) {
            const key = readInt(buffer, position);
            const size = readInt(buffer, position + 4);
            position += 8 + size * 4;
            if (key > maxKey) maxKey = key;
            total += size;
        }
        const counts = new Int32Array(maxKey + 2);
        position = 4;
        while (position + 1 <= buffer.length) {
            const key = readInt(buffer, position);
            const size = readInt(buffer, position + 4);
            counts[key + 1] += size;
            position += 8 + size * 4;
        }
        const offsets = counts; // prefix sum in place
        for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
        const values = new Int32Array(total);
        const filled = new Int32Array(maxKey + 1);
        position = 4;
        while (position + 1 <= buffer.length) {
            const key = readInt(buffer, position);
            const size = readInt(buffer, position + 4);
            position += 8;
            for (let i = 0; i < size; i++) {
                values[offsets[key] + filled[key]++] = readInt(buffer, position);
                position += 4;
            }
        }
        return new TargetMap(offsets, values);
    }

    /** compatible view: { [id]: number[] } like kuromoji.js */
    get(id: number): number[] | undefined {
        if (id < 0 || id + 1 >= this.offsets.length) return undefined;
        const start = this.offsets[id];
        const end = this.offsets[id + 1];
        if (start === end) return undefined;
        return Array.from(this.values.subarray(start, end));
    }
}

export class TokenInfoDictionary {
    readonly features: StringReader;
    constructor(
        /** left_id(2) right_id(2) word_cost(2) pos_id(4) per entry; the entry offset is the token info id */
        readonly dictionary: Uint8Array,
        readonly posBuffer: Uint8Array,
        readonly targetMap: TargetMap
    ) {
        this.features = new StringReader(posBuffer);
    }

    leftId(tokenInfoId: number): number {
        return readShort(this.dictionary, tokenInfoId);
    }
    rightId(tokenInfoId: number): number {
        return readShort(this.dictionary, tokenInfoId + 2);
    }
    wordCost(tokenInfoId: number): number {
        return readShort(this.dictionary, tokenInfoId + 4);
    }

    // decoded and split features by token info id / 10 (entries are 10 bytes).
    // It only grows up to the number of distinct words that this tokenizer has seen.
    private readonly splitFeaturesCache: (string[] | undefined)[] = [];
    getSplitFeatures(tokenInfoId: number): string[] {
        const key = tokenInfoId / 10;
        let features = this.splitFeaturesCache[key];
        if (features === undefined) {
            features = this.getFeatures(tokenInfoId).split(",");
            this.splitFeaturesCache[key] = features;
        }
        return features;
    }

    /**
     * Create the token of a known word.
     * `index` and `length` are the UTF-16 range of the word in `sentence`.
     */
    createToken(
        tokenInfoId: number,
        position: number,
        sentence: string,
        index: number,
        length: number
    ): IpadicFeatures {
        const features = this.getSplitFeatures(tokenInfoId);
        void sentence, index, length;
        return {
            word_id: tokenInfoId,
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

    getFeatures(tokenInfoId: number): string {
        const posId = readInt(this.dictionary, tokenInfoId + 6);
        return this.features.get(posId);
    }
}

const SAME = -1;
/**
 * Token info dictionary of the compact layout (see scripts/build-compact-dict.mjs).
 * Features are not decoded per token: they are references to strings decoded at load time.
 */
export class CompactTokenInfoDictionary extends TokenInfoDictionary {
    private readonly posTuples: string[][];
    private readonly strings: string[];
    constructor(
        dictionary: Uint8Array,
        targetMap: TargetMap,
        /** pos tuple id, basic_form id, reading id, pronunciation id per entry */
        private readonly feat: Int32Array,
        stringTable: Uint8Array
    ) {
        super(dictionary, new Uint8Array(0), targetMap);
        const tupleCount = readInt(stringTable, 0);
        const all = new StringReader(stringTable).decode(4, stringTable.length).split("\0");
        this.posTuples = all.slice(0, tupleCount).map((tuple) => tuple.split(","));
        this.strings = all.slice(tupleCount);
    }

    createToken(
        tokenInfoId: number,
        position: number,
        sentence: string,
        index: number,
        length: number
    ): IpadicFeatures {
        const i = (tokenInfoId / 10) * 4;
        const feat = this.feat;
        const tuple = this.posTuples[feat[i]];
        const surface = sentence.slice(index, index + length);
        const basic = feat[i + 1];
        const reading = this.strings[feat[i + 2]];
        const pronunciation = feat[i + 3];
        return {
            word_id: tokenInfoId,
            word_type: "KNOWN",
            word_position: position,
            surface_form: surface,
            pos: tuple[0],
            pos_detail_1: tuple[1],
            pos_detail_2: tuple[2],
            pos_detail_3: tuple[3],
            conjugated_type: tuple[4],
            conjugated_form: tuple[5],
            basic_form: basic === SAME ? surface : this.strings[basic],
            reading: reading,
            pronunciation: pronunciation === SAME ? reading : this.strings[pronunciation]
        };
    }

    getFeatures(tokenInfoId: number): string {
        throw new Error("getFeatures is not available in the compact dictionary: " + tokenInfoId);
    }
}
