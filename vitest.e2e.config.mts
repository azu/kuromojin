import { defineConfig } from "vitest/config";

// The browser e2e tests: "pnpm run test:e2e". They need Chromium of Playwright ("pnpm exec playwright install chromium").
export default defineConfig({
    test: {
        include: ["e2e/**/*-test.ts"],
        testTimeout: 120000,
        hookTimeout: 120000
    }
});
