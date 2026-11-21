// Derived from kuromoji.js 0.1.2 (Tokenizer, ViterbiBuilder, ViterbiSearcher, IpadicFormatter).
// Copyright 2014 Takuya Asano, Copyright 2010-2014 Atilika Inc. and contributors.
// Licensed under the Apache License, Version 2.0. See NOTICE.md in this directory.
// Changes: ported to TypeScript. The candidates are rows of typed arrays that are kept between calls,
// the best split is chosen while the candidates are added, positions are UTF-16 indexes so that
// a surrogate pair is one character, and a dictionary version chooses the entries that the analysis sees.
import type { Dictionary, KnownFeatures } from "./Dictionary";
import type { DictionaryView } from "./DictionaryVersions";
import type { Token } from "./Token";

const PUNCTUATION = /、|。/;
const NONE = -1;
/** The first number of rows of the table of candidates, and of positions of a text */
const FIRST_ROWS = 4096;
const FIRST_POSITIONS = 1024;
/**
 * A table with more rows or positions than this is not kept after its analysis,
 * so that one long text does not keep its memory until the process ends.
 */
const KEPT_ROWS = 1 << 18;
/**
 * Split a text after each `、` and `。`, as `tokenize` of kuromoji.js does.
 */
export function splitByPunctuation(text: string): string[] {
    const sentences: string[] = [];
    let tail = text;
    while (tail !== "") {
        const index = tail.search(PUNCTUATION);
        if (index < 0) {
            sentences.push(tail);
            break;
        }
        sentences.push(tail.substring(0, index + 1));
        tail = tail.substring(index + 1);
    }
    return sentences;
}

/**
 * Finds, among all the ways to split a text into words of the dictionary, the one with the lowest total cost.
 * An analysis is synchronous, so one analyzer is shared by the tokenizers of all dictionary versions.
 */
export class Analyzer {
    private readonly trie: Dictionary["trie"];
    /** (word, end index) pairs of the words that start at a position */
    private readonly matched = new Int32Array(512);
    private readonly wordOffsets: Int32Array;
    private readonly knownLeft: Int16Array;
    private readonly knownRight: Int16Array;
    private readonly knownCost: Int16Array;
    private readonly knownFeatures: KnownFeatures;
    private readonly classOffsets: Int32Array;
    private readonly classEntries: Int32Array;
    private readonly unknownLeft: Int16Array;
    private readonly unknownRight: Int16Array;
    private readonly unknownCost: Int16Array;
    private readonly unknownFeatures: string[][];
    private readonly charClass: Uint8Array;
    private readonly classInvoke: Uint8Array;
    private readonly classGrouping: Uint8Array;
    private readonly connection: Int16Array;
    private readonly backwardSize: number;

    // The candidates are rows of a table, and each column is an array. Row 0 is the start of the text.
    private capacity = FIRST_ROWS;
    /** number of the entry of a known or unknown word */
    private nodeEntry = new Int32Array(this.capacity);
    /** UTF-16 index of the start. ~start for an unknown word */
    private nodeStart = new Int32Array(this.capacity);
    private nodeEnd = new Int32Array(this.capacity);
    private nodeRight = new Int16Array(this.capacity);
    /** the candidate before this one on the best split that ends with it */
    private nodePrev = new Int32Array(this.capacity);
    /** next candidate that ends at the same position */
    private nodeNext = new Int32Array(this.capacity);
    /** lowest cost of a split that ends with this candidate */
    private nodeTotal = new Float64Array(this.capacity);
    // per UTF-16 index: first and last candidate that ends there
    private endHead = new Int32Array(FIRST_POSITIONS);
    private endTail = new Int32Array(FIRST_POSITIONS);

    constructor(dictionary: Dictionary) {
        this.trie = dictionary.trie;
        this.wordOffsets = dictionary.wordOffsets;
        this.knownLeft = dictionary.known.left;
        this.knownRight = dictionary.known.right;
        this.knownCost = dictionary.known.cost;
        this.knownFeatures = dictionary.knownFeatures;
        this.classOffsets = dictionary.classOffsets;
        this.classEntries = dictionary.classEntries;
        this.unknownLeft = dictionary.unknown.left;
        this.unknownRight = dictionary.unknown.right;
        this.unknownCost = dictionary.unknown.cost;
        this.unknownFeatures = dictionary.unknownFeatures;
        this.charClass = dictionary.charClass;
        this.classInvoke = dictionary.classInvoke;
        this.classGrouping = dictionary.classGrouping;
        this.connection = dictionary.connectionCosts;
        this.backwardSize = dictionary.connectionCosts[1];
    }

    private grow(): void {
        const capacity = this.capacity * 2;
        const copy = <T extends Int32Array | Int16Array | Float64Array>(array: T): T => {
            const larger = new (array.constructor as new (length: number) => T)(capacity);
            larger.set(array);
            return larger;
        };
        this.nodeEntry = copy(this.nodeEntry);
        this.nodeStart = copy(this.nodeStart);
        this.nodeEnd = copy(this.nodeEnd);
        this.nodeRight = copy(this.nodeRight);
        this.nodePrev = copy(this.nodePrev);
        this.nodeNext = copy(this.nodeNext);
        this.nodeTotal = copy(this.nodeTotal);
        this.capacity = capacity;
    }

    /**
     * Go back to tables of the first size after the analysis of a long text.
     */
    private release(): void {
        if (this.capacity > KEPT_ROWS) {
            this.capacity = FIRST_ROWS;
            this.nodeEntry = new Int32Array(FIRST_ROWS);
            this.nodeStart = new Int32Array(FIRST_ROWS);
            this.nodeEnd = new Int32Array(FIRST_ROWS);
            this.nodeRight = new Int16Array(FIRST_ROWS);
            this.nodePrev = new Int32Array(FIRST_ROWS);
            this.nodeNext = new Int32Array(FIRST_ROWS);
            this.nodeTotal = new Float64Array(FIRST_ROWS);
        }
        if (this.endHead.length > KEPT_ROWS) {
            this.endHead = new Int32Array(FIRST_POSITIONS);
            this.endTail = new Int32Array(FIRST_POSITIONS);
        }
    }

    /**
     * Analyze `text` as one piece and append its tokens to `tokens`.
     * `word_position` continues from the last token of `tokens`.
     * @param view the entries of the dictionary that the analysis sees: the ones of a dictionary version
     */
    analyze(text: string, tokens: Token[], view: DictionaryView): Token[] {
        this.addTokens(text, tokens, view);
        this.release();
        return tokens;
    }

    private addTokens(text: string, tokens: Token[], view: DictionaryView): void {
        const length = text.length;
        if (length === 0) return;
        if (this.endHead.length < length + 1) {
            this.endHead = new Int32Array(length * 2 + 1);
            this.endTail = new Int32Array(length * 2 + 1);
        }
        const endHead = this.endHead;
        const endTail = this.endTail;
        endHead.fill(NONE, 0, length + 1);
        const { trie, matched, connection, backwardSize, charClass } = this;
        const { wordOffsets, knownLeft, knownRight, knownCost } = this;
        const { classOffsets, classEntries, unknownLeft, unknownRight, unknownCost, classInvoke, classGrouping } = this;
        let { nodeEntry, nodeStart, nodeEnd, nodeRight, nodePrev, nodeNext, nodeTotal } = this;
        // the start of the text
        nodeRight[0] = 0;
        nodeTotal[0] = 0;
        nodeNext[0] = NONE;
        nodePrev[0] = NONE;
        endHead[0] = endTail[0] = 0;
        let count = 1;
        let pairs = 0;
        const limit = view.entryCount;
        const wordEntries = view.wordEntries;

        for (let start = 0; start < length; start++) {
            const head = text.charCodeAt(start);
            // a surrogate pair is one character
            let isPair = false;
            if (head >= 0xd800 && head <= 0xdbff && start + 1 < length) {
                const low = text.charCodeAt(start + 1);
                isPair = low >= 0xdc00 && low <= 0xdfff;
            }
            // a position is used only when some candidate ends there
            const firstPrev = endHead[start];
            if (firstPrev !== NONE) {
                // --- words of the dictionary
                const matches = trie.commonPrefixMatches(text, start, matched);
                // number of words with an entry that the version sees
                let live = 0;
                for (let m = 0; m < matches; m++) {
                    const word = matched[m * 2];
                    const end = matched[m * 2 + 1];
                    let alive = false;
                    const to = wordOffsets[word + 1];
                    for (let k = wordOffsets[word]; k < to; k++) {
                        const entry = wordEntries[k];
                        // an entry that the view does not see: a later version added it, or the view removed it
                        if (entry >= limit) continue;
                        alive = true;
                        // the best candidate before this one
                        const left = knownLeft[entry];
                        let best = NONE;
                        let bestCost = Infinity;
                        for (let p = firstPrev; p !== NONE; p = nodeNext[p]) {
                            const cost = nodeTotal[p] + connection[nodeRight[p] * backwardSize + left + 2];
                            if (cost < bestCost) {
                                bestCost = cost;
                                best = p;
                            }
                        }
                        if (count === this.capacity) {
                            this.grow();
                            ({ nodeEntry, nodeStart, nodeEnd, nodeRight, nodePrev, nodeNext, nodeTotal } = this);
                        }
                        const node = count++;
                        nodeEntry[node] = entry;
                        nodeStart[node] = start;
                        nodeEnd[node] = end;
                        nodeRight[node] = knownRight[entry];
                        nodePrev[node] = best;
                        nodeTotal[node] = bestCost + knownCost[entry];
                        nodeNext[node] = NONE;
                        if (endHead[end] === NONE) {
                            endHead[end] = node;
                        } else {
                            nodeNext[endTail[end]] = node;
                        }
                        endTail[end] = node;
                    }
                    if (alive) live++;
                }

                // --- unknown words
                const classId = charClass[head];
                if (live === 0 || classInvoke[classId] === 1) {
                    let end = isPair ? start + 2 : start + 1;
                    if (classGrouping[classId] === 1) {
                        // the class of a high surrogate is the default class, so a pair continues a run of that class
                        while (end < length && charClass[text.charCodeAt(end)] === classId) {
                            const code = text.charCodeAt(end);
                            if (code >= 0xd800 && code <= 0xdbff && end + 1 < length) {
                                const low = text.charCodeAt(end + 1);
                                end += low >= 0xdc00 && low <= 0xdfff ? 2 : 1;
                            } else {
                                end++;
                            }
                        }
                    }
                    const to = classOffsets[classId + 1];
                    for (let k = classOffsets[classId]; k < to; k++) {
                        const entry = classEntries[k];
                        const left = unknownLeft[entry];
                        let best = NONE;
                        let bestCost = Infinity;
                        for (let p = firstPrev; p !== NONE; p = nodeNext[p]) {
                            const cost = nodeTotal[p] + connection[nodeRight[p] * backwardSize + left + 2];
                            if (cost < bestCost) {
                                bestCost = cost;
                                best = p;
                            }
                        }
                        if (count === this.capacity) {
                            this.grow();
                            ({ nodeEntry, nodeStart, nodeEnd, nodeRight, nodePrev, nodeNext, nodeTotal } = this);
                        }
                        const node = count++;
                        nodeEntry[node] = entry;
                        nodeStart[node] = ~start;
                        nodeEnd[node] = end;
                        nodeRight[node] = unknownRight[entry];
                        nodePrev[node] = best;
                        nodeTotal[node] = bestCost + unknownCost[entry];
                        nodeNext[node] = NONE;
                        if (endHead[end] === NONE) {
                            endHead[end] = node;
                        } else {
                            nodeNext[endTail[end]] = node;
                        }
                        endTail[end] = node;
                    }
                }
            }
            if (isPair) {
                pairs++;
                start++;
            }
        }

        // the end of the text
        let best = NONE;
        let bestCost = Infinity;
        for (let p = endHead[length]; p !== NONE; p = nodeNext[p]) {
            const cost = nodeTotal[p] + connection[nodeRight[p] * backwardSize + 2];
            if (cost < bestCost) {
                bestCost = cost;
                best = p;
            }
        }
        // the split from the end to the start, reversed in place through nodeNext
        let path = NONE;
        for (let node = best; node > 0; ) {
            const prev = nodePrev[node];
            nodeNext[node] = path;
            path = node;
            node = prev;
        }
        if (path === NONE) return;

        const lastPosition = tokens.length > 0 ? tokens[tokens.length - 1].word_position : 0;
        const knownFeatures = this.knownFeatures;
        // word_position counts a surrogate pair as one character
        let passedPairs = 0;
        let scanned = 0;
        for (let node = path; node !== NONE; node = nodeNext[node]) {
            const rawStart = nodeStart[node];
            const start = rawStart < 0 ? ~rawStart : rawStart;
            const end = nodeEnd[node];
            if (pairs > 0) {
                for (; scanned < start; scanned++) {
                    const code = text.charCodeAt(scanned);
                    if (code >= 0xd800 && code <= 0xdbff && scanned + 1 < start) {
                        const low = text.charCodeAt(scanned + 1);
                        if (low >= 0xdc00 && low <= 0xdfff) {
                            passedPairs++;
                            scanned++;
                        }
                    }
                }
            }
            const position = lastPosition + start - passedPairs + 1;
            const entry = nodeEntry[node];
            if (rawStart < 0) {
                const features = this.unknownFeatures[entry];
                // a token of an unknown word has no reading and no pronunciation, as in kuromoji.js
                tokens.push({
                    word_id: entry * 10,
                    word_type: "UNKNOWN",
                    word_position: position,
                    surface_form: text.slice(start, end),
                    pos: features[0],
                    pos_detail_1: features[1],
                    pos_detail_2: features[2],
                    pos_detail_3: features[3],
                    conjugated_type: features[4],
                    conjugated_form: features[5],
                    basic_form: features[6]
                } as Token);
            } else {
                tokens.push(knownFeatures.token(entry, position, text.slice(start, end)));
            }
        }
    }
}
