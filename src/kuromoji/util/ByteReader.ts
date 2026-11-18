// Derived from kuromoji.js ByteBuffer (Apache-2.0). Read-only part only.
const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : undefined;
type NodeBufferLike = {
    utf8Slice?: (start: number, end: number) => string;
    toString(enc: string, s: number, e: number): string;
};
const NodeBuffer: { from(ab: ArrayBufferLike, offset: number, length: number): NodeBufferLike } | undefined =
    typeof (globalThis as any).Buffer === "function" ? (globalThis as any).Buffer : undefined;

export const readShort = (buffer: Uint8Array, index: number): number => {
    if (buffer.length < index + 2) return 0;
    const value = (buffer[index + 1] << 8) + buffer[index];
    return value & 0x8000 ? -((value - 1) ^ 0xffff) : value;
};

export const readInt = (buffer: Uint8Array, index: number): number => {
    if (buffer.length < index + 4) return 0;
    return (buffer[index + 3] << 24) + (buffer[index + 2] << 16) + (buffer[index + 1] << 8) + buffer[index];
};

/**
 * Decode a NUL-terminated UTF-8 string.
 */
export class StringReader {
    private readonly nodeBuffer?: NodeBufferLike;
    constructor(private readonly buffer: Uint8Array) {
        if (NodeBuffer) {
            this.nodeBuffer = NodeBuffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        }
    }

    get(index: number): string {
        const buffer = this.buffer;
        let end = buffer.indexOf(0, index);
        if (end === -1) end = buffer.length;
        if (end <= index) return "";
        return this.decode(index, end);
    }

    decode(start: number, end: number): string {
        if (this.nodeBuffer) {
            return this.nodeBuffer.toString("utf8", start, end);
        }
        return textDecoder!.decode(this.buffer.subarray(start, end));
    }
}

/**
 * Sequential reader used while loading small dictionaries
 */
export class ByteReader {
    position = 0;
    constructor(readonly buffer: Uint8Array) {}
    size() {
        return this.buffer.length;
    }
    get(): number {
        const index = this.position++;
        return this.buffer.length < index + 1 ? 0 : this.buffer[index];
    }
    getInt(): number {
        const value = readInt(this.buffer, this.position);
        this.position += 4;
        return value;
    }
    getString(): string {
        let end = this.buffer.indexOf(0, this.position);
        if (end === -1) end = this.buffer.length;
        const value = new StringReader(this.buffer).get(this.position);
        this.position = end + 1;
        return value;
    }
}
