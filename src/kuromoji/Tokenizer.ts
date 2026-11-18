// Derived from kuromoji.js Tokenizer / IpadicFormatter (Apache-2.0).
import { ViterbiBuilder } from "./viterbi/ViterbiBuilder";
import { ViterbiSearcher } from "./viterbi/ViterbiSearcher";
import type { Dictionaries } from "./dict/Dictionaries";
import type { TokenInfoDictionary } from "./dict/TokenInfoDictionary";
import type { UnknownDictionary } from "./dict/UnknownDictionary";

export type IpadicFeatures = {
    word_id: number;
    word_type: "KNOWN" | "UNKNOWN";
    word_position: number;
    surface_form: string;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    conjugated_type: string;
    conjugated_form: string;
    basic_form: string;
    reading?: string;
    pronunciation?: string;
};

const PUNCTUATION = /、|。/;

export class Tokenizer {
    private readonly tokenInfoDictionary: TokenInfoDictionary;
    private readonly unknownDictionary: UnknownDictionary;
    private readonly viterbiBuilder: ViterbiBuilder;
    private readonly viterbiSearcher: ViterbiSearcher;

    constructor(dic: Dictionaries) {
        this.tokenInfoDictionary = dic.tokenInfoDictionary;
        this.unknownDictionary = dic.unknownDictionary;
        this.viterbiBuilder = new ViterbiBuilder(dic);
        this.viterbiSearcher = new ViterbiSearcher(dic.connectionCosts);
    }

    static splitByPunctuation(input: string): string[] {
        const sentences: string[] = [];
        let tail = input;
        while (tail !== "") {
            const index = tail.search(PUNCTUATION);
            if (index < 0) {
                sentences.push(tail);
                break;
            }
            sentences.push(tail.substring(0, index + 1));
            tail = tail.substring(index + 1);
        }
        return sentences;
    }

    tokenize(text: string): IpadicFeatures[] {
        const sentences = Tokenizer.splitByPunctuation(text);
        const tokens: IpadicFeatures[] = [];
        for (let i = 0; i < sentences.length; i++) {
            this.tokenizeForSentence(sentences[i], tokens);
        }
        return tokens;
    }

    tokenizeForSentence(sentence: string, tokens: IpadicFeatures[] = []): IpadicFeatures[] {
        const lattice = this.viterbiBuilder.build(sentence);
        const best_path = this.viterbiSearcher.search(lattice);
        let last_pos = 0;
        if (tokens.length > 0) {
            last_pos = tokens[tokens.length - 1].word_position;
        }
        for (let j = 0; j < best_path.length; j++) {
            const node = best_path[j];
            const position = last_pos + node.start_pos;
            if (node.type === "KNOWN") {
                tokens.push(
                    this.tokenInfoDictionary.createToken(node.name, position, sentence, node.index, node.length)
                );
            } else {
                // UNKNOWN (BOS and EOS are not in the path)
                const features = this.unknownDictionary.getSplitFeatures(node.name);
                tokens.push({
                    word_id: node.name,
                    word_type: "UNKNOWN",
                    word_position: position,
                    surface_form: node.surface_form,
                    pos: features[1],
                    pos_detail_1: features[2],
                    pos_detail_2: features[3],
                    pos_detail_3: features[4],
                    conjugated_type: features[5],
                    conjugated_form: features[6],
                    basic_form: features[7]
                });
            }
        }
        return tokens;
    }
}
