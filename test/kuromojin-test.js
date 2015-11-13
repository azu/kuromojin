// LICENSE : MIT
"use strict";
import assert from "power-assert";
import kuromojin from "../src/kuromojin";
import {getTokenizer} from "../src/kuromojin";
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
    context("kuromojin", function () {
        it("should return a.promise that resolve analyzed text", function () {
            var data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            var promises = data.map(num => {
                return kuromojin(String(num));
            });
            return Promise.all(promises).then(texts => {
                texts.forEach((results, index) => {
                    let firstNode = results[0];
                    assert.equal(firstNode.surface_form, String(index));
                });
            });
        });
    });
});