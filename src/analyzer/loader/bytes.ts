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
 * Join numbers that are written as planes: first the lowest byte of every number, then the next byte, and so on.
 */
export const joinPlanes = (planes: Uint8Array, width: number): Uint8Array => {
    const count = Math.floor(planes.length / width);
    const output = new Uint8Array(count * width);
    for (let b = 0; b < width; b++) {
        const plane = b * count;
        for (let i = 0, j = b; i < count; i++, j += width) {
            output[j] = planes[plane + i];
        }
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
