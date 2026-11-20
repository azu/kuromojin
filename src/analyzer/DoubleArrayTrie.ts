// Derived from doublearray 0.0.2 by Takuya Asano (MIT License). See NOTICE.md in this directory.
// Changes: ported to TypeScript, kept only the lookup, and the lookup walks the text in place.
import type { WordTrie } from "./Dictionary";

/**
 * Read-only double-array trie, for a dictionary in the format of kuromoji.js.
 * The keys are the UTF-8 bytes of the words.
 */
export class DoubleArrayTrie implements WordTrie {
    constructor(
        private readonly base: Int32Array,
        private readonly check: Int32Array
    ) {}

    commonPrefixMatches(text: string, start: number, out: Int32Array): number {
        const { base, check } = this;
        const length = text.length;
        const limit = out.length >> 1;
        let parent = 0;
        let found = 0;
        let i = start;
        while (i < length) {
            const code = text.charCodeAt(i++);
            let child: number;
            if (code < 0x80) {
                // U+0000 is the code of the end of a key, so no word contains it
                if (code === 0) break;
                child = base[parent] + code;
                if (check[child] !== parent) break;
                parent = child;
            } else if (code < 0x800) {
                child = base[parent] + ((code >>> 6) | 0xc0);
                if (check[child] !== parent) break;
                parent = child;
                child = base[parent] + ((code & 0x3f) | 0x80);
                if (check[child] !== parent) break;
                parent = child;
            } else if (code < 0xd800 || code > 0xdfff) {
                child = base[parent] + ((code >>> 12) | 0xe0);
                if (check[child] !== parent) break;
                parent = child;
                child = base[parent] + (((code >> 6) & 0x3f) | 0x80);
                if (check[child] !== parent) break;
                parent = child;
                child = base[parent] + ((code & 0x3f) | 0x80);
                if (check[child] !== parent) break;
                parent = child;
            } else {
                // a surrogate without its pair is in no word
                if (code > 0xdbff || i >= length) break;
                const low = text.charCodeAt(i);
                if (low < 0xdc00 || low > 0xdfff) break;
                i++;
                const point = (code - 0xd800) * 0x400 + 0x10000 + (low - 0xdc00);
                child = base[parent] + ((point >>> 18) | 0xf0);
                if (check[child] !== parent) break;
                parent = child;
                child = base[parent] + (((point >> 12) & 0x3f) | 0x80);
                if (check[child] !== parent) break;
                parent = child;
                child = base[parent] + (((point >> 6) & 0x3f) | 0x80);
                if (check[child] !== parent) break;
                parent = child;
                child = base[parent] + ((point & 0x3f) | 0x80);
                if (check[child] !== parent) break;
                parent = child;
            }
            // the child for the code of the end of a key tells that a word ends at this node
            const leaf = base[parent];
            if (check[leaf] === parent) {
                const value = base[leaf];
                if (value <= 0 && found < limit) {
                    out[found * 2] = -value - 1;
                    out[found * 2 + 1] = i;
                    found++;
                }
            }
        }
        return found;
    }
}
