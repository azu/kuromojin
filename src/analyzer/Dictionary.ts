// LICENSE : MIT
import type { Token } from "./Token";
import type { DictionaryVersions } from "./DictionaryVersions";

/**
 * Finds the words of the dictionary that start at a position of a text.
 */
export type WordTrie = {
    /**
     * Find the words that are a prefix of `text` from the UTF-16 index `start`, shorter words first.
     * Writes (word number, end index) pairs to `out` and returns the number of pairs.
     */
    commonPrefixMatches(text: string, start: number, out: Int32Array): number;
};

/**
 * The left id, the right id, and the word cost of every entry, by the number of the entry.
 */
export type EntryCosts = {
    left: Int16Array;
    right: Int16Array;
    cost: Int16Array;
};

/**
 * The fields of an entry that are read only for the words of the chosen split.
 */
export type KnownFeatures = {
    /**
     * Create the token of the entry.
     * `surface` is the word as written in the text.
     */
    token(entry: number, position: number, surface: string): Token;
};

/**
 * The tables that the analysis reads. Both formats of a dictionary are turned into them.
 * The number of an entry is its position in the dictionary of kuromoji.js: `word_id` is the number * 10.
 * The entries that dictionary versions add have the numbers after them.
 */
export type Dictionary = {
    trie: WordTrie;
    /** entries of the word `w`: wordEntries[wordOffsets[w]] .. wordEntries[wordOffsets[w + 1] - 1] */
    wordOffsets: Int32Array;
    wordEntries: Int32Array;
    known: EntryCosts;
    knownFeatures: KnownFeatures;
    /** forward size, backward size, and then the cost of each (right id, left id) */
    connectionCosts: Int16Array;
    /** entries of unknown words of the character class `c`: classEntries[classOffsets[c]] .. */
    classOffsets: Int32Array;
    classEntries: Int32Array;
    unknown: EntryCosts;
    /** pos, pos_detail_1, pos_detail_2, pos_detail_3, conjugated_type, conjugated_form, basic_form of an unknown entry */
    unknownFeatures: string[][];
    /** UTF-16 code unit -> character class */
    charClass: Uint8Array;
    /** character class -> 1 when an unknown word is always made */
    classInvoke: Uint8Array;
    /** character class -> 1 when a run of the same class is one unknown word */
    classGrouping: Uint8Array;
    /** The dictionary versions of the file. A dictionary of kuromoji.js has none. */
    versions: DictionaryVersions | null;
};
