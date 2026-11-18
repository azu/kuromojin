// Derived from kuromoji.js ConnectionCosts (Apache-2.0). Read-only part only.
export class ConnectionCosts {
    readonly backwardDimension: number;
    /** leading 2 values are forward_dimension and backward_dimension */
    constructor(readonly buffer: Int16Array) {
        this.backwardDimension = buffer[1];
    }
    get(forwardId: number, backwardId: number): number {
        const index = forwardId * this.backwardDimension + backwardId + 2;
        if (this.buffer.length < index + 1) {
            throw "ConnectionCosts buffer overflow";
        }
        return this.buffer[index];
    }
}
