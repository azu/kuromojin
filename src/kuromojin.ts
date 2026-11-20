// LICENSE : MIT
"use strict";
import { LRUMap } from "lru_map";
import { Analyzer, splitByPunctuation } from "./analyzer/Analyzer";
import type { Dictionary } from "./analyzer/Dictionary";
import {
    createDefaultView,
    createDictionaryView,
    DictionaryVersions,
    DictionaryView,
    resolveDictionaryVersion
} from "./analyzer/DictionaryVersions";
import { loadDictionary } from "./analyzer/loader/loadDictionary";
import { isNode } from "./analyzer/loader/platform";
import type { Token } from "./analyzer/Token";

export type KuromojiToken = Token;
export type Tokenizer = {
    /**
     * Split the text after each `、` and `。`, analyze each piece, and return the tokens of all pieces.
     */
    tokenize: (text: string) => KuromojiToken[];
    /**
     * Analyze the whole text as one piece.
     */
    tokenizeForSentence: (text: string) => KuromojiToken[];
};

export type getTokenizerOption = {
    /**
     * The dictionary path: the file of a dictionary of kuromojin (it ends with `.dict`),
     * or a directory or a URL with a dictionary of kuromoji.js.
     * It is used only by the call that starts loading the dictionary.
     */
    dicPath?: string;
    /**
     * The dictionary version of the call, as a date written as YYYY-MM-DD.
     * The call gets the dictionary with the changes of every version up to the date.
     * Default: the default dictionary, which does not change within a major version of kuromojin.
     */
    dictionaryVersion?: string;
    // Cache by default
    // Default: false
    noCacheTokenize?: boolean;
};

type KuromojinGlobal = {
    kuromojin?: {
        dicPath?: string;
    };
};

/**
 * Decide the dictionary path when a load starts. The first source that is set is used.
 */
const getDictionaryPath = (options?: getTokenizerOption): string => {
    if (options && typeof options.dicPath === "string") {
        return options.dicPath;
    }
    if (typeof process !== "undefined" && typeof process.env === "object" && process.env.KUROMOJIN_DIC_PATH) {
        return process.env.KUROMOJIN_DIC_PATH;
    }
    // `globalThis` is `window` in a page, and it also exists in a worker and in Node.js
    const kuromojinGlobal = (globalThis as KuromojinGlobal).kuromojin;
    if (
        typeof kuromojinGlobal === "object" &&
        kuromojinGlobal !== null &&
        typeof kuromojinGlobal.dicPath === "string"
    ) {
        return kuromojinGlobal.dicPath;
    }
    if (isNode()) {
        // the dictionary of the package: lib/../dict/kuromojin.dict
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require("path") as typeof import("path");
        return path.join(__dirname, "..", "dict", "kuromojin.dict");
    }
    throw new Error(
        "kuromojin needs a dictionary path in a browser: " +
            "pass `dicPath` or set `globalThis.kuromojin.dicPath` to the URL of the dictionary."
    );
};

/** The loaded dictionary and the tokenizers of its dictionary versions */
class LoadedDictionary {
    private readonly analyzer: Analyzer;
    /** date of a version -> tokenizer. The key of a dictionary without versions is "". */
    private readonly tokenizers = new Map<string, Tokenizer>();
    /** The date of the default version, or "" for a dictionary without versions */
    readonly defaultVersion: string;
    readonly defaultTokenizer: Tokenizer;

    constructor(private readonly dictionary: Dictionary) {
        this.analyzer = new Analyzer(dictionary);
        // In this major version, the default version is the base dictionary
        this.defaultVersion = dictionary.versions !== null ? dictionary.versions[0].date : "";
        this.defaultTokenizer = this.createTokenizer(createDefaultView(dictionary));
        this.tokenizers.set(this.defaultVersion, this.defaultTokenizer);
    }

    private createTokenizer(view: DictionaryView): Tokenizer {
        const analyzer = this.analyzer;
        return {
            tokenize(text: string): KuromojiToken[] {
                const tokens: KuromojiToken[] = [];
                const sentences = splitByPunctuation(text);
                for (let i = 0; i < sentences.length; i++) {
                    analyzer.analyze(sentences[i], tokens, view);
                }
                return tokens;
            },
            tokenizeForSentence(text: string): KuromojiToken[] {
                return analyzer.analyze(text, [], view);
            }
        };
    }

    /**
     * The date of the version that `dictionaryVersion` means.
     * It throws when the value cannot be used with this dictionary.
     */
    resolveVersion(dictionaryVersion: unknown): string {
        if (dictionaryVersion === undefined) return this.defaultVersion;
        return resolveDictionaryVersion(dictionaryVersion, this.dictionary.versions);
    }

    /**
     * The tokenizer of a version. `version` is a date that resolveVersion returned.
     */
    tokenizerOf(version: string): Tokenizer {
        let tokenizer = this.tokenizers.get(version);
        if (tokenizer === undefined) {
            // a dictionary without versions has only the default tokenizer, which is already in the map
            const versions = this.dictionary.versions as DictionaryVersions;
            tokenizer = this.createTokenizer(createDictionaryView(this.dictionary, versions, version));
            this.tokenizers.set(version, tokenizer);
        }
        return tokenizer;
    }
}

// The dictionary is loaded once. A failed load is kept, so every later call gets the same error.
let loaded: LoadedDictionary | null = null;
let loading: Promise<LoadedDictionary> | null = null;
// cache for tokenize: version + "\n" + text -> tokens
const tokenizeCacheMap = new LRUMap<string, KuromojiToken[]>(10000);

const load = (options?: getTokenizerOption): Promise<LoadedDictionary> => {
    if (loading === null) {
        // the dictionary path is decided only when a load starts, not on every call
        loading = new Promise<string>((resolve) => resolve(getDictionaryPath(options)))
            .then((dictionaryPath) => loadDictionary(dictionaryPath))
            .then((dictionary) => {
                loaded = new LoadedDictionary(dictionary);
                return loaded;
            });
    }
    return loading;
};

const selectTokenizer = (dictionary: LoadedDictionary, options?: getTokenizerOption): Tokenizer => {
    if (options === undefined || options.dictionaryVersion === undefined) return dictionary.defaultTokenizer;
    return dictionary.tokenizerOf(dictionary.resolveVersion(options.dictionaryVersion));
};

const tokenizeWith = (dictionary: LoadedDictionary, text: string, options?: getTokenizerOption): KuromojiToken[] => {
    const version =
        options === undefined || options.dictionaryVersion === undefined
            ? dictionary.defaultVersion
            : dictionary.resolveVersion(options.dictionaryVersion);
    const tokenizer = dictionary.tokenizerOf(version);
    if (options !== undefined && options.noCacheTokenize) {
        return tokenizer.tokenizeForSentence(text);
    }
    // the key has the version, so that the tokens of one version are never returned for another one
    const key = version + "\n" + text;
    const cache = tokenizeCacheMap.get(key);
    if (cache) {
        return cache;
    }
    const tokens = tokenizer.tokenizeForSentence(text);
    tokenizeCacheMap.set(key, tokens);
    return tokens;
};

export function getTokenizer(options?: getTokenizerOption): Promise<Tokenizer> {
    if (loaded !== null) {
        try {
            return Promise.resolve(selectTokenizer(loaded, options));
        } catch (error) {
            return Promise.reject(error);
        }
    }
    return load(options).then((dictionary) => selectTokenizer(dictionary, options));
}

export function tokenize(text: string, options?: getTokenizerOption): Promise<Readonly<Readonly<KuromojiToken>[]>> {
    if (loaded !== null) {
        try {
            return Promise.resolve(tokenizeWith(loaded, text, options));
        } catch (error) {
            return Promise.reject(error);
        }
    }
    return load(options).then((dictionary) => tokenizeWith(dictionary, text, options));
}
