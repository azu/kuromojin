// Patch for gz
// https://github.com/hexenq/kuroshiro/issues/27
import { kvsEnvStorage } from "@kvs/env";
import BrowserDictionaryLoader from "kuromoji/src/loader/BrowserDictionaryLoader";
import zlib from "zlibjs/bin/gunzip.min.js";
//=== Modify kuromoji.js's browser loader
const urlMap = new Map();

class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

/**
 * Utility function to load gzipped dictionary
 * @param {string} url Dictionary URL
 * @param {BrowserDictionaryLoader~onLoad} callback Callback function
 */
BrowserDictionaryLoader.prototype.loadArrayBuffer = async function (url, callback) {
    const stroage = await kvsEnvStorage({
        name: "kuromoji",
        version: 1
    });
    // https://github.com/takuyaa/kuromoji.js/issues/37
    const fixedURL = url.replace("https:/", "https://");
    const cachedDictBuffer = await stroage.get(fixedURL);
    if (cachedDictBuffer) {
        // console.log("return cache", cachedDictBuffer);
        return callback(null, cachedDictBuffer);
    }
    // Suppress multiple request to same url at same time
    if (urlMap.has(fixedURL)) {
        return urlMap
            .get(fixedURL)
            .promise.then((result) => {
                callback(null, result);
            })
            .catch((error) => {
                callback(error);
            });
    }
    const deferred = new Deferred();
    urlMap.set(fixedURL, deferred);
    fetch(fixedURL)
        .then(function (response) {
            if (!response.ok) {
                return callback(response.statusText, null);
            }
            response.arrayBuffer().then(function (arraybuffer) {
                var gz = new zlib.Zlib.Gunzip(new Uint8Array(arraybuffer));
                var typed_array = gz.decompress();
                return stroage.set(fixedURL, typed_array.buffer).then(() => {
                    // console.log("cached", fixedURL);
                    deferred.resolve(typed_array.buffer);
                    callback(null, typed_array.buffer);
                });
            });
        })
        .catch(function (exception) {
            deferred.reject(exception);
            callback(exception, null);
        });
};
