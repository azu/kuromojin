// LICENSE : MIT
/**
 * A token of the analysis. The fields are the same as the ones of kuromoji.js with the IPADIC dictionary.
 */
export type Token = {
    // 辞書内での単語ID
    word_id: number;
    // 単語タイプ(辞書に登録されている単語ならKNOWN; 未知語ならUNKNOWN)
    word_type: "KNOWN" | "UNKNOWN";
    // 表層形
    surface_form: string;
    // 品詞
    pos: string;
    // 品詞細分類1
    pos_detail_1: string;
    // 品詞細分類2
    pos_detail_2: string;
    // 品詞細分類3
    pos_detail_3: string;
    // 活用型
    conjugated_type: string;
    // 活用形
    conjugated_form: string;
    // 基本形
    basic_form: string;
    // 読み
    // A token of an unknown word does not have this field
    reading: string;
    // 発音
    // A token of an unknown word does not have this field
    pronunciation: string;
    // 単語の開始位置
    word_position: number;
};
