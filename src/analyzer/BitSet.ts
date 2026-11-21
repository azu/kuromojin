// LICENSE : MIT

/** The number of 1 bits of a 32-bit number */
export const countBits = (bits: number): number => {
    bits = bits - ((bits >>> 1) & 0x55555555);
    bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
    return Math.imul((bits + (bits >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

/**
 * Read-only set of numbers from 0 that also counts its numbers below a number.
 * When some items of a list have a value, the values are stored without gaps:
 * the value of the item `i` of the set is at the position `countBelow(i)`.
 */
export class BitSet {
    /** 32 numbers per element: the bit `i & 31` of the element `i >> 5` is 1 when `i` is in the set */
    readonly bits: Int32Array;
    /** how many numbers of the set are below the 32 numbers of each element of `bits` */
    readonly before: Int32Array;
    /** how many numbers the set has */
    readonly size: number;

    /**
     * @param bytes 8 numbers per byte, the lowest bit first
     * @param length the set has numbers below `length` only
     */
    constructor(bytes: Uint8Array, length: number) {
        const groups = (length + 31) >> 5;
        const bits = new Int32Array(groups);
        const before = new Int32Array(groups);
        let size = 0;
        for (let group = 0, byte = 0; group < groups; group++, byte += 4) {
            // a byte after the end of `bytes` is undefined, which is 0 in the operations of bits
            const value = bytes[byte] | (bytes[byte + 1] << 8) | (bytes[byte + 2] << 16) | (bytes[byte + 3] << 24);
            bits[group] = value;
            before[group] = size;
            size += countBits(value);
        }
        this.bits = bits;
        this.before = before;
        this.size = size;
    }

    has(i: number): boolean {
        return (this.bits[i >> 5] & (1 << (i & 31))) !== 0;
    }

    countBelow(i: number): number {
        return this.before[i >> 5] + countBits(this.bits[i >> 5] & ((1 << (i & 31)) - 1));
    }
}
