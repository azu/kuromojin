// LICENSE : MIT
import { BitSet, countBits } from "./BitSet";
import type { WordTrie } from "./Dictionary";

/**
 * Read-only trie of UTF-16 code units, for a dictionary in the format of kuromojin.
 * The file has the nodes in breadth-first order, so the children of a node are next to each other:
 * they are the nodes from the first child of the node to the first child of the next node.
 * They are in the order of their characters. The lookup searches the children of a node by bisection.
 * The words have their numbers in the order of the nodes where a word ends,
 * so the number of a word is the number of ends before its node.
 */
export class CharTrie implements WordTrie {
    /** the nodes where a word ends */
    private readonly ends: BitSet;
    /** character -> child of the root, or -1 */
    private readonly rootChild: Int32Array;
    /** number of words */
    readonly size: number;

    /**
     * @param chars character of each node
     * @param childStart first child of each node, and after the last node the end of its children
     * @param endBits bit set of the nodes where a word ends
     */
    constructor(
        private readonly chars: Uint16Array,
        private readonly childStart: Int32Array,
        endBits: Uint8Array
    ) {
        const n = chars.length;
        this.ends = new BitSet(endBits, n);
        this.size = this.ends.size;
        const rootChild = new Int32Array(0x10000).fill(-1);
        for (let i = childStart[0]; i < childStart[1]; i++) rootChild[chars[i]] = i;
        this.rootChild = rootChild;
    }

    commonPrefixMatches(text: string, start: number, out: Int32Array): number {
        const length = text.length;
        const { chars, childStart } = this;
        const ends = this.ends.bits;
        const endsBefore = this.ends.before;
        const limit = out.length >> 1;
        let node = this.rootChild[text.charCodeAt(start)];
        let i = start + 1;
        let found = 0;
        while (node !== -1) {
            const bits = ends[node >> 5];
            const bit = 1 << (node & 31);
            if ((bits & bit) !== 0 && found < limit) {
                out[found * 2] = endsBefore[node >> 5] + countBits(bits & (bit - 1));
                out[found * 2 + 1] = i;
                found++;
            }
            if (i >= length) break;
            const code = text.charCodeAt(i++);
            let low = childStart[node];
            let high = childStart[node + 1] - 1;
            node = -1;
            while (low <= high) {
                const middle = (low + high) >> 1;
                const char = chars[middle];
                if (char < code) low = middle + 1;
                else if (char > code) high = middle - 1;
                else {
                    node = middle;
                    break;
                }
            }
        }
        return found;
    }
}
