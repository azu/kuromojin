// LICENSE : MIT
"use strict";
const path = require("path");
const kuromoji = require("kuromoji");
import Deferred from "./Deferred";

const deferred = new Deferred();
const getNodeModuleDirPath = () => {
    // if window.kuromojin.dicPath is defined, use it as default dict path.
    if (
        typeof window !== "undefined" &&
        typeof window.kuromojin === "object" &&
        typeof window.kuromojin.dicPath === "string"
    ) {
        return window.kuromojin.dicPath;
    }
    const kuromojiDir = path.dirname(require.resolve("kuromoji"));
    return path.join(kuromojiDir, "..", "dict");
};
// cache for tokenizer
let _tokenizer = null;
// lock boolean
let isLoading = false;

export function getTokenizer(options = { dicPath: getNodeModuleDirPath() }) {
    if (_tokenizer) {
        return Promise.resolve(_tokenizer);
    }
    if (isLoading) {
        return deferred.promise;
    }
    isLoading = true;
    // load dict
    kuromoji.builder(options).build(function(err, tokenizer) {
        if (err) {
            return deferred.reject(err);
        }
        _tokenizer = tokenizer;
        deferred.resolve(tokenizer);
    });
    return deferred.promise;
}

export function tokenize(text) {
    return getTokenizer().then(tokenizer => {
        return tokenizer.tokenizeForSentence(text);
    });
}