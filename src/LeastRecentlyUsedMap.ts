// LICENSE : MIT
"use strict";

/**
 * A map that keeps the `limit` most recently used keys.
 * When a new key is set and the map is full, the least recently used key is removed.
 * `get` and `set` mark a key as used.
 *
 * It relies on the insertion order of `Map`: the first key is the least recently used one.
 */
export class LeastRecentlyUsedMap<K, V> {
    private readonly map = new Map<K, V>();
    // the most recently used key, which is already at the end of the map
    private lastKey: K | undefined = undefined;

    constructor(private readonly limit: number) {}

    get(key: K): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined && key !== this.lastKey) {
            // move the key to the end, as the most recently used one
            this.map.delete(key);
            this.map.set(key, value);
            this.lastKey = key;
        }
        return value;
    }

    set(key: K, value: V): void {
        this.map.delete(key);
        this.map.set(key, value);
        this.lastKey = key;
        if (this.map.size > this.limit) {
            this.map.delete(this.map.keys().next().value as K);
        }
    }
}
