// LICENSE : MIT
// The compiled source in test-build/src/ loads the dictionary of the package from test-build/dict/,
// as lib/ loads it from dict/. Link test-build/dict/ to dict/.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const link = path.join(root, "test-build", "dict");
if (!fs.existsSync(link)) {
    // a junction needs no permission on Windows; other platforms ignore the type
    fs.symlinkSync(path.join(root, "dict"), link, "junction");
}
