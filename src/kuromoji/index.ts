// Derived from kuromoji.js (Apache-2.0). Same entry point as `require("kuromoji")`.
import { Tokenizer } from "./Tokenizer";
import { loadDictionaries } from "./loader/loadDictionaries";

export { Tokenizer } from "./Tokenizer";
export type { IpadicFeatures } from "./Tokenizer";
export { loadDictionaries } from "./loader/loadDictionaries";

export class TokenizerBuilder {
    private readonly dicPath: string;
    constructor(option: { dicPath?: string }) {
        this.dicPath = option.dicPath ?? "dict/";
    }
    build(callback: (error: Error | null, tokenizer: Tokenizer) => void): void {
        this.buildAsync().then(
            (tokenizer) => callback(null, tokenizer),
            (error) => callback(error, undefined as unknown as Tokenizer)
        );
    }
    async buildAsync(): Promise<Tokenizer> {
        return new Tokenizer(await loadDictionaries(this.dicPath));
    }
}

export function builder(option: { dicPath?: string }): TokenizerBuilder {
    return new TokenizerBuilder(option);
}
