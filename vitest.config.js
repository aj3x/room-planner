import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* Node, not jsdom: the harness builds its own jsdom per test so each boot is
       isolated and so we control the environment *before* the app script runs. */
    environment: 'node',
    include: ['test/unit/**/*.test.js'],
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
