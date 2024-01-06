// Patch for gz
// https://github.com/hexenq/kuroshiro/issues/27
import { kvsEnvStorage } from "@kvs/env";
import BrowserDictionaryLoader from "kuromoji/src/loader/BrowserDictionaryLoader";
import Compressor from "tiny-compressor";
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
        version: 2,
        async upgrade({ kvs, oldVersion, newVersion }) {
            if (oldVersion === 1) {
                await kvs.clear();
            }
        }
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
        .then(async function (response) {
            if (!response.ok) {
                return callback(response.statusText, null);
            }
            const arraybuffer = await response.arrayBuffer();
            // decomparess gzipped dictionary
            const typedArray = await Compressor.decompress(new Uint8Array(arraybuffer), "gzip");
            const decompressedArrayBuffer = typedArray.buffer;
            return stroage.set(fixedURL, decompressedArrayBuffer).then(() => {
                deferred.resolve(decompressedArrayBuffer);
                callback(null, decompressedArrayBuffer);
            });
        })
        .catch(function (exception) {
            deferred.reject(exception);
            callback(exception, null);
        });
};
