// Derived from kuromoji.js UnknownDictionary (Apache-2.0). Read-only part only.
import { TargetMap, TokenInfoDictionary } from "./TokenInfoDictionary";
import { CharacterDefinition } from "./CharacterDefinition";

export class UnknownDictionary extends TokenInfoDictionary {
    constructor(
        dictionary: Uint8Array,
        posBuffer: Uint8Array,
        targetMap: TargetMap,
        readonly characterDefinition: CharacterDefinition
    ) {
        super(dictionary, posBuffer, targetMap);
    }
}
