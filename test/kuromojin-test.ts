// LICENSE : MIT
"use strict";
import assert from "assert";
// it is compatible check for <= 1.1.0
import { getTokenizer, tokenize } from "../src";

describe("kuromojin", function () {
    context("many access at a time", function () {
        it("should return a.promise", function () {
            var promises = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((_num) => {
                return getTokenizer();
            });
            return Promise.all(promises).then((tokenizer) => {
                tokenizer.reduce((prev, current) => {
                    assert(prev === current);
                    return current;
                });
            });
        });
    });
    context("tokenize", function () {
        it("is alias to default", function () {
            var data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            var promises = data.map((num) => {
                return tokenize(String(num));
            });
            return Promise.all(promises).then((texts) => {
                texts.forEach((results, index) => {
                    let firstNode = results[0];
                    assert.strictEqual(firstNode.surface_form, String(index));
                });
            });
        });
        it("should return a.promise that resolve analyzed text", function () {
            var data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            var promises = data.map((num) => {
                return tokenize(String(num));
            });
            return Promise.all(promises).then((texts) => {
                texts.forEach((results, index) => {
                    let firstNode = results[0];
                    assert.strictEqual(firstNode.surface_form, String(index));
                });
            });
        });
        it("should tokenize sentence", function () {
            return tokenize("これは1文。これは2文。").then((tokens) => {
                const firstToken = tokens[0];
                assert.strictEqual(firstToken.word_position, 1);
                const lastToken = tokens[tokens.length - 1];
                assert.strictEqual(lastToken.word_position, 12);
            });
        });
    });
});
