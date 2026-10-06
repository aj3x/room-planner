import { defineConfig } from 'vitest/config';

export default defineConfig({
  /* JSX as vite.config.js compiles it (Preact's automatic runtime). */
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    /* Node, not jsdom: the harness builds its own jsdom per test so each boot is
       isolated and so we control the environment *before* the app script runs. */
    environment: 'jsdom',
    setupFiles: ['./test/unit-setup.js'],
    include: ['test/unit/**/*.test.{js,jsx}', 'test/build/**/*.test.js'],
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
