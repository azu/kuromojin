// LICENSE : MIT
"use strict";
import assert from "power-assert";
// it is compatible check for <= 1.1.0
import defaultFunction from "../src";
import {getTokenizer, tokenize} from "../src";
describe("kuromojin", function () {
    context("many access at a time", function () {
        it("should return a.promise", function () {
            var promises = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
                return getTokenizer();
            });
            return Promise.all(promises).then(tokenizer => {
                tokenizer.reduce((prev, current) => {
                    assert(prev === current);
                    return current;
                })
            });
        });
    });
    context("tokenize", function () {
        it("is alias to default", function () {
            var data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            var promises = data.map(num => {
                return defaultFunction(String(num));
            });
            return Promise.all(promises).then(texts => {
                texts.forEach((results, index) => {
                    let firstNode = results[0];
                    assert.equal(firstNode.surface_form, String(index));
                });
            });
        });
        it("should return a.promise that resolve analyzed text", function () {
            var data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            var promises = data.map(num => {
                return tokenize(String(num));
            });
            return Promise.all(promises).then(texts => {
                texts.forEach((results, index) => {
                    let firstNode = results[0];
                    assert.equal(firstNode.surface_form, String(index));
                });
            });
        });
        it("should tokenize sentence", function () {
            return tokenize("これは1文。これは2文。").then(tokens => {
                const firstToken = tokens[0];
                assert.equal(firstToken.word_position, 1);
                const lastToken = tokens[tokens.length - 1];
                assert.equal(lastToken.word_position, 12);
            });
        });
    });
});