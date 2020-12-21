// LICENSE : MIT
"use strict";
export default class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T) => void;
    reject!: (reason: any) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
