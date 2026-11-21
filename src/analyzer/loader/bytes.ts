// LICENSE : MIT
// Helpers to read the parts of a dictionary. All numbers are little endian.

/**
 * `bytes` as numbers of `width` bytes: a view of the same memory, or a copy when the bytes are not aligned.
 */
const aligned = (bytes: Uint8Array, width: number): Uint8Array => {
    const length = bytes.byteLength - (bytes.byteLength % width);
    // `new Uint8Array` copies. `slice` of a Buffer of Node.js does not.
    return bytes.byteOffset % width === 0 ? bytes.subarray(0, length) : new Uint8Array(bytes.subarray(0, length));
};
export const toInt16Array = (bytes: Uint8Array): Int16Array => {
    const source = aligned(bytes, 2);
    return new Int16Array(source.buffer, source.byteOffset, source.byteLength / 2);
};
export const toUint16Array = (bytes: Uint8Array): Uint16Array => {
    const source = aligned(bytes, 2);
    return new Uint16Array(source.buffer, source.byteOffset, source.byteLength / 2);
};
export const toInt32Array = (bytes: Uint8Array): Int32Array => {
    const source = aligned(bytes, 4);
    return new Int32Array(source.buffer, source.byteOffset, source.byteLength / 4);
};

export const readInt16 = (bytes: Uint8Array, index: number): number => {
    if (bytes.length < index + 2) return 0;
    return ((bytes[index] | (bytes[index + 1] << 8)) << 16) >> 16;
};

export const readInt32 = (bytes: Uint8Array, index: number): number => {
    if (bytes.length < index + 4) return 0;
    return bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24);
};

/**
 * Read numbers that are written as differences: each one is the difference from the one before, as a zigzag number
 * of three bytes. The differences are written as planes: first the lowest byte of every difference,
 * then the next byte of every difference, and then the highest one.
 */
export const readDifferences = (planes: Uint8Array): Int32Array => {
    const count = Math.floor(planes.length / 3);
    const output = new Int32Array(count);
    let previous = 0;
    for (let i = 0, middle = count, high = count * 2; i < count; i++, middle++, high++) {
        const zigzag = planes[i] | (planes[middle] << 8) | (planes[high] << 16);
        previous += (zigzag >>> 1) ^ -(zigzag & 1);
        output[i] = previous;
    }
    return output;
};

type NodeBufferLike = { toString(encoding: string, start: number, end: number): string };
type NodeBufferConstructor = { from(buffer: ArrayBufferLike, offset: number, length: number): NodeBufferLike };

/**
 * Decodes UTF-8 strings of one buffer.
 */
export class Utf8Reader {
    private readonly nodeBuffer?: NodeBufferLike;
    private readonly decoder?: TextDecoder;
    constructor(private readonly bytes: Uint8Array) {
        // Buffer of Node.js decodes short strings faster than TextDecoder
        const NodeBuffer = (globalThis as { Buffer?: unknown }).Buffer as NodeBufferConstructor | undefined;
        if (NodeBuffer !== undefined && typeof NodeBuffer.from === "function") {
            this.nodeBuffer = NodeBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        } else {
            this.decoder = new TextDecoder("utf-8");
        }
    }

    decode(start: number, end: number): string {
        if (this.nodeBuffer) return this.nodeBuffer.toString("utf8", start, end);
        return (this.decoder as TextDecoder).decode(this.bytes.subarray(start, end));
    }

    /** The string that starts at `start` and ends before the next NUL */
    decodeUntilNul(start: number): string {
        let end = this.bytes.indexOf(0, start);
        if (end === -1) end = this.bytes.length;
        return end <= start ? "" : this.decode(start, end);
    }
}
