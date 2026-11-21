// LICENSE : MIT
import type { WordTrie } from "./Dictionary";

/**
 * Read-only trie of UTF-16 code units, for a dictionary in the format of kuromojin.
 * The file has the nodes in breadth-first order, so the children of a node are next to each other.
 * For the lookup, (parent, character) -> child is put into a hash table when the dictionary is loaded.
 */
export class CharTrie implements WordTrie {
    private readonly parentOf: Int32Array;
    /** open addressing hash table of nodes. 0 = empty: node 0 is the root and is never a child */
    private readonly table: Int32Array;
    private readonly mask: number;
    /** node -> number of the word that ends at the node, or -1 */
    private readonly wordOf: Int32Array;
    /** character -> child of the root, or -1 */
    private readonly rootChild: Int32Array;
    /** number of words */
    readonly size: number;

    /**
     * @param chars character of each node
     * @param counts number of children of each node
     * @param ends bit set of the nodes where a word ends
     */
    constructor(
        private readonly chars: Uint16Array,
        counts: Uint16Array,
        ends: Uint8Array
    ) {
        const n = chars.length;
        const childStart = new Int32Array(n + 1);
        const wordOf = new Int32Array(n);
        let next = 1;
        let word = 0;
        for (let i = 0; i < n; i++) {
            childStart[i] = next;
            next += counts[i];
            wordOf[i] = (ends[i >> 3] >> (i & 7)) & 1 ? word++ : -1;
        }
        childStart[n] = next;
        this.wordOf = wordOf;
        this.size = word;
        const rootChild = new Int32Array(0x10000).fill(-1);
        for (let i = childStart[0]; i < childStart[1]; i++) rootChild[chars[i]] = i;
        this.rootChild = rootChild;
        let size = 1024;
        while (size < n * 2) size *= 2;
        const mask = size - 1;
        const table = new Int32Array(size);
        const parentOf = new Int32Array(n);
        for (let parent = 1; parent < n; parent++) {
            for (let child = childStart[parent]; child < childStart[parent + 1]; child++) {
                parentOf[child] = parent;
                let slot = (Math.imul(parent, 0x9e3779b1) ^ Math.imul(chars[child], 0x85ebca6b)) & mask;
                while (table[slot] !== 0) slot = (slot + 1) & mask;
                table[slot] = child;
            }
        }
        this.table = table;
        this.mask = mask;
        this.parentOf = parentOf;
    }

    commonPrefixMatches(text: string, start: number, out: Int32Array): number {
        const length = text.length;
        const { chars, parentOf, table, mask, wordOf } = this;
        const limit = out.length >> 1;
        let node = this.rootChild[text.charCodeAt(start)];
        let i = start + 1;
        let found = 0;
        while (node !== -1) {
            const word = wordOf[node];
            if (word !== -1 && found < limit) {
                out[found * 2] = word;
                out[found * 2 + 1] = i;
                found++;
            }
            if (i >= length) break;
            const code = text.charCodeAt(i++);
            let slot = (Math.imul(node, 0x9e3779b1) ^ Math.imul(code, 0x85ebca6b)) & mask;
            const parent = node;
            node = -1;
            for (let child = table[slot]; child !== 0; child = table[slot]) {
                if (parentOf[child] === parent && chars[child] === code) {
                    node = child;
                    break;
                }
                slot = (slot + 1) & mask;
            }
        }
        return found;
    }
}
