// Derived from kuromoji.js ViterbiSearcher (Apache-2.0).
import type { ConnectionCosts } from "../dict/ConnectionCosts";
import type { ViterbiLattice } from "./ViterbiLattice";
import type { ViterbiNode } from "./ViterbiNode";

export class ViterbiSearcher {
    constructor(private readonly connectionCosts: ConnectionCosts) {}

    search(lattice: ViterbiLattice): ViterbiNode[] {
        this.forward(lattice);
        return this.backward(lattice);
    }

    forward(lattice: ViterbiLattice): void {
        const costs = this.connectionCosts;
        // kuromoji.js declares this with `var`, so it keeps the value of the previous node
        // when no previous node is cheaper than Number.MAX_VALUE
        let shortest_prev_node: ViterbiNode | null = null;
        for (let i = 1; i <= lattice.eos_pos; i++) {
            const nodes = lattice.nodes_end_at[i];
            if (nodes === undefined) {
                continue;
            }
            for (let j = 0; j < nodes.length; j++) {
                const node = nodes[j];
                let cost = Number.MAX_VALUE;
                const prev_nodes = lattice.nodes_end_at[node.start_pos - 1];
                if (prev_nodes === undefined) {
                    continue;
                }
                for (let k = 0; k < prev_nodes.length; k++) {
                    const prev_node = prev_nodes[k];
                    const _cost = prev_node.shortest_cost + costs.get(prev_node.right_id, node.left_id) + node.cost;
                    if (_cost < cost) {
                        shortest_prev_node = prev_node;
                        cost = _cost;
                    }
                }
                node.prev = shortest_prev_node;
                node.shortest_cost = cost;
            }
        }
    }

    backward(lattice: ViterbiLattice): ViterbiNode[] {
        const shortest_path: ViterbiNode[] = [];
        const eos = lattice.nodes_end_at[lattice.nodes_end_at.length - 1][0];
        let node_back = eos.prev;
        if (node_back === null) {
            return [];
        }
        while (node_back.type !== "BOS") {
            shortest_path.push(node_back);
            if (node_back.prev === null) {
                return [];
            }
            node_back = node_back.prev;
        }
        return shortest_path.reverse();
    }
}
