// LICENSE : MIT
"use strict";
import path from "path";
import { LRUMap } from "lru_map";
import Deferred from "./Deferred";
// @ts-expect-error: no type definition
import kuromoji from "kuromoji";

export type Tokenizer = {
    tokenize: (text: string) => KuromojiToken[];
    tokenizeForSentence: (text: string) => KuromojiToken[];
};
export type KuromojiToken = {
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
    reading: string;
    // 発音
    pronunciation: string;
    // 単語の開始位置
    word_position: number;
};
type KuromojiWindow = Window & {
    kuromojin?: {
        dicPath?: string;
    };
};
const deferred = new Deferred<Tokenizer>();
const getNodeModuleDirPath = () => {
    // Node
    if (typeof process !== "undefined" && typeof process.env === "object" && process.env.KUROMOJIN_DIC_PATH) {
        return process.env.KUROMOJIN_DIC_PATH;
    }
    // Browser
    // if window.kuromojin.dicPath is defined, use it as default dict path.
    const maybeKuromojiWindow: KuromojiWindow | undefined = typeof window != "undefined" ? window : undefined;
    if (
        typeof maybeKuromojiWindow !== "undefined" &&
        typeof maybeKuromojiWindow.kuromojin === "object" &&
        typeof maybeKuromojiWindow.kuromojin.dicPath === "string"
    ) {
        return maybeKuromojiWindow.kuromojin.dicPath;
    }
    const kuromojiDir = path.dirname(require.resolve("kuromoji"));
    return path.join(kuromojiDir, "..", "dict");
};

// cache for tokenizer
let _tokenizer: null | Tokenizer = null;
// lock boolean
let isLoading = false;
// cache for tokenize
const tokenizeCacheMap = new LRUMap<string, KuromojiToken[]>(10000);

export type getTokenizerOption = {
    dicPath: string;
    // Cache by default
    // Default: false
    noCacheTokenize?: boolean;
};

export function getTokenizer(options: getTokenizerOption = { dicPath: getNodeModuleDirPath() }): Promise<Tokenizer> {
    if (_tokenizer) {
        return Promise.resolve(_tokenizer);
    }
    if (isLoading) {
        return deferred.promise;
    }
    isLoading = true;
    // load dict
    kuromoji.builder(options).build(function (err: undefined | Error, tokenizer: Tokenizer) {
        if (err) {
            return deferred.reject(err);
        }
        _tokenizer = tokenizer;
        deferred.resolve(tokenizer);
    });
    return deferred.promise;
}

export function tokenize(text: string, options?: getTokenizerOption): Promise<KuromojiToken[]> {
    return getTokenizer(options).then((tokenizer) => {
        if (options?.noCacheTokenize) {
            return tokenizer.tokenizeForSentence(text);
        } else {
            const cache = tokenizeCacheMap.get(text);
            if (cache) {
                return cache;
            }
            const tokens = tokenizer.tokenizeForSentence(text);
            tokenizeCacheMap.set(text, tokens);
            return tokens;
        }
    });
}
