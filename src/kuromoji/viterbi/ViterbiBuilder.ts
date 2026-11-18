// Derived from kuromoji.js ViterbiBuilder (Apache-2.0).
import { ViterbiNode } from "./ViterbiNode";
import { ViterbiLattice } from "./ViterbiLattice";
import type { Dictionaries } from "../dict/Dictionaries";
import type { DoubleArray } from "../dict/DoubleArray";
import type { TokenInfoDictionary } from "../dict/TokenInfoDictionary";
import type { UnknownDictionary } from "../dict/UnknownDictionary";

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

export class ViterbiBuilder {
    private readonly trie: DoubleArray;
    private readonly tokenInfoDictionary: TokenInfoDictionary;
    private readonly unknownDictionary: UnknownDictionary;

    constructor(dic: Dictionaries) {
        this.trie = dic.trie;
        this.tokenInfoDictionary = dic.tokenInfoDictionary;
        this.unknownDictionary = dic.unknownDictionary;
    }

    build(sentence: string): ViterbiLattice {
        const lattice = new ViterbiLattice();
        // UTF-16 index of each character (a surrogate pair is one character)
        const index: number[] = [];
        for (let i = 0; i < sentence.length; i++) {
            index.push(i);
            if (isHighSurrogate(sentence.charCodeAt(i))) i++;
        }
        const length = index.length;
        const tokenInfo = this.tokenInfoDictionary;
        const known = tokenInfo.targetMap;
        const unknown = this.unknownDictionary;
        const charDef = unknown.characterDefinition;

        for (let pos = 0; pos < length; pos++) {
            const start = index[pos];
            let found = false;
            this.trie.commonPrefixSearchAt(sentence, start, (trieId, end) => {
                found = true;
                const keyLength = end - start; // Words in dictionary do not have surrogate pair
                const from = known.offsets[trieId];
                const to = known.offsets[trieId + 1];
                for (let i = from; i < to; i++) {
                    const tokenInfoId = known.values[i];
                    lattice.append(
                        new ViterbiNode(
                            tokenInfoId,
                            tokenInfo.wordCost(tokenInfoId),
                            pos + 1,
                            keyLength,
                            "KNOWN",
                            tokenInfo.leftId(tokenInfoId),
                            tokenInfo.rightId(tokenInfoId),
                            "",
                            start
                        )
                    );
                }
            });

            // Unknown word processing
            const headClass = charDef.lookup(sentence.charCodeAt(start));
            if (!found || headClass.is_always_invoke === 1) {
                let end = pos + 1 < length ? index[pos + 1] : sentence.length;
                // kuromoji.js uses the surrogate-aware length (1) for a single character
                // and the UTF-16 length for grouped characters
                let keyLength = 1;
                if (headClass.is_grouping === 1 && 1 < length - pos) {
                    for (let k = pos + 1; k < length; k++) {
                        const nextClass = charDef.lookup(sentence.charCodeAt(index[k]));
                        if (headClass.class_name !== nextClass.class_name) {
                            break;
                        }
                        end = k + 1 < length ? index[k + 1] : sentence.length;
                        keyLength = end - start;
                    }
                }
                const surface = sentence.slice(start, end);
                const offsets = unknown.targetMap.offsets;
                const values = unknown.targetMap.values;
                const classId = headClass.class_id;
                for (let j = offsets[classId]; j < offsets[classId + 1]; j++) {
                    const unkId = values[j];
                    lattice.append(
                        new ViterbiNode(
                            unkId,
                            unknown.wordCost(unkId),
                            pos + 1,
                            keyLength,
                            "UNKNOWN",
                            unknown.leftId(unkId),
                            unknown.rightId(unkId),
                            surface
                        )
                    );
                }
            }
        }
        lattice.appendEos();
        return lattice;
    }
}
