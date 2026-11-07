import { defineConfig } from 'vitest/config';

/**
 * The rendering probes of PR-45 (D65), run by hand in the pinned container and
 * never by `check` or `test:pinned`: they bind no report and gate nothing.
 */
export default defineConfig({
  test: {
    include: ['tests/probes/**/*.probe.ts'],
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 1_800_000,
    retry: 0,
  },
});
