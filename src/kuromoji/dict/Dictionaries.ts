import { DoubleArray } from "./DoubleArray";
import { TokenInfoDictionary } from "./TokenInfoDictionary";
import { ConnectionCosts } from "./ConnectionCosts";
import { UnknownDictionary } from "./UnknownDictionary";

export type Dictionaries = {
    trie: DoubleArray;
    tokenInfoDictionary: TokenInfoDictionary;
    connectionCosts: ConnectionCosts;
    unknownDictionary: UnknownDictionary;
};
