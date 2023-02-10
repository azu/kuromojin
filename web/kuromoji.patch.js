// Patch for gz
// https://github.com/hexenq/kuroshiro/issues/27
import BrowserDictionaryLoader from "kuromoji/src/loader/BrowserDictionaryLoader";
BrowserDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
        if (this.status > 0 && this.status !== 200) {
            callback(xhr.statusText, null);
            return;
        }
        var arraybuffer = this.response;

        //var gz = new zlib.Zlib.Gunzip(new Uint8Array(arraybuffer));
        //var typed_array = gz.decompress();
        callback(null, arraybuffer);
    };
    xhr.onerror = function (err) {
        callback(err, null);
    };
    xhr.send();
};
