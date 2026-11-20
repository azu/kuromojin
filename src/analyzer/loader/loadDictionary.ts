// LICENSE : MIT
import type { Dictionary } from "../Dictionary";
import { loadKuromojiDictionary } from "./kuromojiFormat";
import { readKuromojinDictionary } from "./kuromojinFormat";
import { getPlatform, Platform } from "./platform";

/**
 * Load a dictionary from a dictionary path.
 * The end of the path tells the format, so only the files of one format are read:
 * a path that ends with `.dict` is the file of a dictionary of kuromojin,
 * and any other path is a directory or a URL with the twelve files of kuromoji.js.
 */
export async function loadDictionary(dictionaryPath: string, platform: Platform = getPlatform()): Promise<Dictionary> {
    if (dictionaryPath.endsWith(".dict")) {
        return readKuromojinDictionary(await platform.read(dictionaryPath), dictionaryPath, platform);
    }
    return loadKuromojiDictionary(dictionaryPath, platform);
}
