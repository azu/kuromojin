// LICENSE : MIT
import type { Dictionary } from "./Dictionary";

/**
 * A dictionary version as a caller writes it: a date written as YYYY-MM-DD, such as "2007-08-01".
 * The type checks only the form. A call also checks that the value is a date of the calendar
 * and that the loaded dictionary has a version for it.
 */
export type DictionaryVersion = `${number}-${number}-${number}`;

/**
 * One dictionary version of a dictionary file.
 * The entries that versions add have numbers after the numbers of the base dictionary, in the order of the versions.
 * So the entries of a version are the ones with a number below `entryCount`, without the removed ones.
 */
export type DictionaryVersionRecord = {
    /** YYYY-MM-DD */
    date: string;
    /** number of entries of the dictionary up to this version, including the removed ones */
    entryCount: number;
    /** numbers of the entries that this version removes */
    removed: number[];
};

/**
 * The dictionary versions of a dictionary file, in the order of their dates. The first one is the base dictionary.
 */
export type DictionaryVersions = DictionaryVersionRecord[];

/**
 * The entries of the dictionary that an analysis sees.
 */
export type DictionaryView = {
    /** entries with this number or a larger one are not seen: later versions added them */
    entryCount: number;
    /**
     * The numbers of the entries of each word, as `wordEntries` of the dictionary.
     * A removed entry has the number NOT_SEEN, so the analysis needs only the one comparison with `entryCount`.
     * It is the array of the dictionary itself when no entry is removed.
     */
    wordEntries: Int32Array;
};

/** The number in `wordEntries` of a view for an entry that the view does not see. No entry has this number. */
const NOT_SEEN = 0x7fffffff;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isDate = (value: unknown): value is string => {
    if (typeof value !== "string") return false;
    const match = DATE.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC treats the years 0 to 99 as 1900 to 1999
    date.setUTCFullYear(year);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Check the `dictionaryVersion` of a call and return the date of the version that it means:
 * the newest version that is not later than the date.
 * Dates written as YYYY-MM-DD are in the order of their strings.
 */
export function resolveDictionaryVersion(value: unknown, versions: DictionaryVersions | null): string {
    if (versions === null) {
        throw new Error(
            `dictionaryVersion cannot be used with this dictionary: a dictionary of kuromoji.js has no versions.`
        );
    }
    if (!isDate(value)) {
        throw new Error(`dictionaryVersion must be a date written as YYYY-MM-DD: ${JSON.stringify(value)}`);
    }
    const base = versions[0].date;
    if (value < base) {
        throw new Error(`dictionaryVersion "${value}" is earlier than the base dictionary "${base}".`);
    }
    const newest = versions[versions.length - 1].date;
    if (value > newest) {
        throw new Error(
            `dictionaryVersion "${value}" is later than the newest version "${newest}" of the loaded dictionary. ` +
                `A newer kuromojin may have this version.`
        );
    }
    let resolved = base;
    for (const version of versions) {
        if (version.date > value) break;
        resolved = version.date;
    }
    return resolved;
}

/**
 * The view of a version: the entries up to it, without the entries that the versions up to it remove.
 * @param date date of a version of the dictionary, as resolveDictionaryVersion returns it
 */
export function createDictionaryView(
    dictionary: Dictionary,
    versions: DictionaryVersions,
    date: string
): DictionaryView {
    let entryCount = versions[0].entryCount;
    const removed = new Set<number>();
    for (const version of versions) {
        if (version.date > date) break;
        entryCount = version.entryCount;
        for (const number of version.removed) removed.add(number);
    }
    if (removed.size === 0) return { entryCount, wordEntries: dictionary.wordEntries };
    const wordEntries = dictionary.wordEntries.slice();
    for (let i = 0; i < wordEntries.length; i++) {
        if (removed.has(wordEntries[i])) wordEntries[i] = NOT_SEEN;
    }
    return { entryCount, wordEntries };
}

/**
 * The view of a call without a dictionary version.
 * In this major version of kuromojin, the default version is the base dictionary.
 * A dictionary without versions has only its own entries.
 */
export function createDefaultView(dictionary: Dictionary): DictionaryView {
    const versions = dictionary.versions;
    return versions !== null
        ? createDictionaryView(dictionary, versions, versions[0].date)
        : { entryCount: dictionary.known.left.length, wordEntries: dictionary.wordEntries };
}
