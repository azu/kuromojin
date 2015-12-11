// LICENSE : MIT
"use strict";
import kuromoji from "kuromoji";
import path from "path";
import Deferred from "./Deferred";
const kuromojiDir = require.resolve("kuromoji");
const options = {dicPath: path.join(kuromojiDir, "../../dict") + "/"};
const deferred = new Deferred();
// cache for tokenizer
let _tokenizer = null;
// lock boolean
let isLoading = false;
export function getTokenizer() {
    if (_tokenizer) {
        return Promise.resolve(_tokenizer);
    }
    if (isLoading) {
        return deferred.promise;
    }
    isLoading = true;
    // load dict
    kuromoji.builder(options).build(function (err, tokenizer) {
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
        return tokenizer.tokenize(text);
    })
}
export default tokenize;