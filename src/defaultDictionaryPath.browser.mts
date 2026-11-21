// LICENSE : MIT
// The "browser" field of package.json replaces lib/defaultDictionaryPath.js with lib/defaultDictionaryPath.browser.mjs,
// which tsconfig.browser.json builds from this file as an ES module,
// when a bundler builds for a browser.
// A bundler such as Vite or webpack finds `new URL("...", import.meta.url)`,
// copies the file into its output, and replaces the expression with the URL of the copy.
// Keep the expression as it is: a bundler understands only a string literal and `import.meta.url`.
// The path is relative to the built file: lib/../dict/kuromojin.dict
const dictionaryUrl: string | undefined = (() => {
    try {
        return new URL("../dict/kuromojin.dict", import.meta.url).href;
    } catch {
        // A bundler that does not support `import.meta` (for example, the iife format of esbuild)
        // leaves no base URL
        return undefined;
    }
})();

/**
 * The URL of the dictionary of the package, or undefined when it cannot be found.
 */
export const defaultDictionaryPath = (): string | undefined => dictionaryUrl;
