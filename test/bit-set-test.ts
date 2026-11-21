// LICENSE : MIT
import assert from "node:assert";
import { describe, it } from "vitest";
import { BitSet } from "../src/analyzer/BitSet";

describe("BitSet", function () {
    it("has the numbers of the bits, and counts the numbers below a number", function () {
        const numbers = [0, 1, 7, 8, 30, 31, 32, 33, 62, 63, 64, 95, 96, 100];
        const length = 101;
        const bytes = new Uint8Array(Math.ceil(length / 8));
        for (const number of numbers) bytes[number >> 3] |= 1 << (number & 7);
        const set = new BitSet(bytes, length);
        assert.strictEqual(set.size, numbers.length);
        for (let i = 0; i < length; i++) {
            assert.strictEqual(set.has(i), numbers.includes(i), `has(${i})`);
            assert.strictEqual(set.countBelow(i), numbers.filter((number) => number < i).length, `countBelow(${i})`);
        }
    });
    it("is empty when it has no bytes", function () {
        const set = new BitSet(new Uint8Array(0), 0);
        assert.strictEqual(set.size, 0);
    });
});
