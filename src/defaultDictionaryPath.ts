// LICENSE : MIT
import { isNode } from "./analyzer/loader/platform";

/**
 * The path of the dictionary of the package, or undefined when it cannot be found.
 *
 * Node.js: the file `dict/kuromojin.dict` next to the code of the package.
 * A bundler for a browser reads the "browser" field of package.json and uses
 * `defaultDictionaryPath.browser.mjs` instead of this module.
 * Without such a bundler, a browser has no default path.
 */
export const defaultDictionaryPath = (): string | undefined => {
    if (!isNode()) return undefined;
    // lib/../dict/kuromojin.dict
    const path = require("path") as typeof import("path");
    return path.join(__dirname, "..", "dict", "kuromojin.dict");
};
