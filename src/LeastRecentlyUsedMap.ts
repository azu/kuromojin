// LICENSE : MIT
"use strict";

type Entry<K, V> = {
    key: K;
    value: V;
    // the entry used just before this one, or undefined for the least recently used one
    older: Entry<K, V> | undefined;
    // the entry used just after this one, or undefined for the most recently used one
    newer: Entry<K, V> | undefined;
};

/**
 * A map that keeps the `limit` most recently used keys.
 * When a new key is set and the map is full, the least recently used key is removed.
 * `get` and `set` mark a key as used.
 *
 * The entries are linked in the order of their use, so marking a key as used changes a few references
 * and does not delete and add the key in the `Map` again.
 */
export class LeastRecentlyUsedMap<K, V> {
    private readonly map = new Map<K, Entry<K, V>>();
    private oldest: Entry<K, V> | undefined = undefined;
    private newest: Entry<K, V> | undefined = undefined;

    constructor(private readonly limit: number) {}

    get(key: K): V | undefined {
        const entry = this.map.get(key);
        if (entry === undefined) return undefined;
        this.markAsUsed(entry);
        return entry.value;
    }

    set(key: K, value: V): void {
        const entry = this.map.get(key);
        if (entry !== undefined) {
            entry.value = value;
            this.markAsUsed(entry);
            return;
        }
        const added: Entry<K, V> = { key, value, older: this.newest, newer: undefined };
        if (this.newest === undefined) {
            this.oldest = added;
        } else {
            this.newest.newer = added;
        }
        this.newest = added;
        this.map.set(key, added);
        if (this.map.size > this.limit) {
            const removed = this.oldest as Entry<K, V>;
            this.oldest = removed.newer as Entry<K, V>;
            this.oldest.older = undefined;
            this.map.delete(removed.key);
        }
    }

    private markAsUsed(entry: Entry<K, V>): void {
        if (entry === this.newest) return;
        // unlink the entry; it is not the newest, so it has a newer one
        const newer = entry.newer as Entry<K, V>;
        newer.older = entry.older;
        if (entry.older === undefined) {
            this.oldest = newer;
        } else {
            entry.older.newer = newer;
        }
        // link it as the newest
        entry.older = this.newest;
        entry.newer = undefined;
        (this.newest as Entry<K, V>).newer = entry;
        this.newest = entry;
    }
}
