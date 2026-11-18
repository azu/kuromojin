// Derived from doublearray 0.0.2 (MIT) by Takuya Asano. Read-only part only.
export const NOT_FOUND = -1;
const ROOT_ID = 0;
const TERM_CODE = 0;

/**
 * Read-only double-array trie. The keys are UTF-8 bytes of the surface form.
 */
export class DoubleArray {
    constructor(
        private readonly base: Int32Array,
        private readonly check: Int32Array
    ) {}

    traverse(parent: number, code: number): number {
        const child = this.base[parent] + code;
        // An index out of the array returns undefined and never equals to parent
        return this.check[child] === parent ? child : NOT_FOUND;
    }

    /**
     * Walk the trie with the UTF-8 bytes of `text` from the UTF-16 index `start`,
     * and call `onMatch(value, endIndex)` for each key that is a prefix of the text.
     * `endIndex` is the UTF-16 index just after the matched key.
     * This is equivalent to `commonPrefixSearch(text.slice(start))` of doublearray,
     * but it does not copy or encode the rest of the text.
     */
    commonPrefixSearchAt(text: string, start: number, onMatch: (value: number, endIndex: number) => void): void {
        let parent = ROOT_ID;
        const length = text.length;
        let i = start;
        while (i < length) {
            let code = text.charCodeAt(i++);
            if (code >= 0xd800 && code <= 0xdbff) {
                const lower = text.charCodeAt(i);
                if (lower >= 0xdc00 && lower <= 0xdfff) {
                    i++;
                    code = (code - 0xd800) * 0x400 + 0x10000 + (lower - 0xdc00);
                } else {
                    // malformed surrogate pair: the original implementation throws here
                    return;
                }
            }
            // UTF-8 bytes of the code point
            if (code < 0x80) {
                parent = this.traverse(parent, code);
            } else if (code < 0x800) {
                parent = this.traverse(parent, (code >>> 6) | 0xc0);
                if (parent === NOT_FOUND) return;
                parent = this.traverse(parent, (code & 0x3f) | 0x80);
            } else if (code < 0x10000) {
                parent = this.traverse(parent, (code >>> 12) | 0xe0);
                if (parent === NOT_FOUND) return;
                parent = this.traverse(parent, ((code >> 6) & 0x3f) | 0x80);
                if (parent === NOT_FOUND) return;
                parent = this.traverse(parent, (code & 0x3f) | 0x80);
            } else {
                parent = this.traverse(parent, (code >>> 18) | 0xf0);
                if (parent === NOT_FOUND) return;
                parent = this.traverse(parent, ((code >> 12) & 0x3f) | 0x80);
                if (parent === NOT_FOUND) return;
                parent = this.traverse(parent, ((code >> 6) & 0x3f) | 0x80);
                if (parent === NOT_FOUND) return;
                parent = this.traverse(parent, (code & 0x3f) | 0x80);
            }
            if (parent === NOT_FOUND) return;
            // look forward by the terminal character to check that this node ends a key
            const leaf = this.traverse(parent, TERM_CODE);
            if (leaf !== NOT_FOUND) {
                const base = this.base[leaf];
                if (base <= 0) {
                    onMatch(-base - 1, i);
                }
            }
        }
    }

    /**
     * Same result as doublearray's commonPrefixSearch, kept for compatibility.
     */
    commonPrefixSearch(key: string): { k: string; v: number }[] {
        const result: { k: string; v: number }[] = [];
        this.commonPrefixSearchAt(key, 0, (v, end) => result.push({ k: key.slice(0, end), v }));
        return result;
    }
}
