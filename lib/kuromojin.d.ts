export type Tokenizer = {
    tokenize: (text: string) => KuromojiToken[];
    tokenizeForSentence: (text: string) => KuromojiToken[];
};
export type KuromojiToken = {
    word_id: number;
    word_type: "KNOWN" | "UNKNOWN";
    surface_form: string;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    conjugated_type: string;
    conjugated_form: string;
    basic_form: string;
    reading: string;
    pronunciation: string;
    word_position: number;
};
export type getTokenizerOption = {
    dicPath: string;
    noCacheTokenize?: boolean;
};
export declare function getTokenizer(options?: getTokenizerOption): Promise<Tokenizer>;
export declare function tokenize(text: string, options?: getTokenizerOption): Promise<KuromojiToken[]>;
