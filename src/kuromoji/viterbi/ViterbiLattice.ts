// Derived from kuromoji.js ViterbiLattice (Apache-2.0).
import { ViterbiNode } from "./ViterbiNode";

export class ViterbiLattice {
    nodes_end_at: ViterbiNode[][] = [[new ViterbiNode(-1, 0, 0, 0, "BOS", 0, 0, "")]];
    eos_pos = 1;

    append(node: ViterbiNode): void {
        const last_pos = node.start_pos + node.length - 1;
        if (this.eos_pos < last_pos) {
            this.eos_pos = last_pos;
        }
        const prev_nodes = this.nodes_end_at[last_pos];
        if (prev_nodes === undefined) {
            this.nodes_end_at[last_pos] = [node];
        } else {
            prev_nodes.push(node);
        }
    }

    appendEos(): void {
        const last_index = this.nodes_end_at.length;
        this.eos_pos++;
        this.nodes_end_at[last_index] = [new ViterbiNode(-1, 0, this.eos_pos, 0, "EOS", 0, 0, "")];
    }
}
