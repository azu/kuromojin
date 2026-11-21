import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*-test.{js,ts}"],
        // the tests load the dictionary many times, and the reference test analyzes many lines
        testTimeout: 120000,
        hookTimeout: 120000
    }
});
