// Derived from kuromoji.js ViterbiNode (Apache-2.0).
export type NodeType = "KNOWN" | "UNKNOWN" | "BOS" | "EOS";

export class ViterbiNode {
    prev: ViterbiNode | null = null;
    shortest_cost: number;
    constructor(
        readonly name: number,
        readonly cost: number,
        /** 1-based, surrogate-aware index */
        readonly start_pos: number,
        readonly length: number,
        readonly type: NodeType,
        readonly left_id: number,
        readonly right_id: number,
        /** only set for unknown words; known words take the surface form from the dictionary */
        readonly surface_form: string,
        /** UTF-16 index of the start in the sentence */
        readonly index: number = -1
    ) {
        this.shortest_cost = type === "BOS" ? 0 : Number.MAX_VALUE;
    }
}
