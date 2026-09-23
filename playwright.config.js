import { defineConfig, devices } from '@playwright/test';

/* Characterization E2E. Phase 2 gives it two targets, and both must be green:
 *
 *   dev   — `vite` serving index.html, the module graph, HMR. What a contributor
 *           actually runs. Started in `--mode instrumented` so the capture
 *           epilogue is part of the source Vite builds.
 *   dist  — the built single file, served statically. What actually ships.
 *
 * The dist projects deliberately share the dev projects' screenshot baselines
 * (see snapshotPathTemplate below). That is the stronger assertion: bundling
 * and minifying must not move a single pixel, and a build that did would fail
 * against the pre-build baseline rather than quietly grow one of its own.
 *
 * The epilogue no longer arrives via `page.route`. In dev, Vite hoists the
 * inline module script out of the HTML into a proxy module, so there is no
 * script body left in the response to append to; in a build, the bundle is
 * wrapped in an IIFE, so anything appended after it lands outside the closure.
 * It is injected in vite.config.js instead — earlier in the same pipeline, same
 * in-memory-copy contract, index.html on disk still untouched.
 */

const BASE = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
};

const DEV = 'http://127.0.0.1:5173';
const DIST = 'http://127.0.0.1:4173';

/* Baselines live beside the specs so a reviewer can find them. {platform} is
   part of the path on purpose: canvas text and antialiasing differ between
   macOS and the Linux box CI runs on, so the two need separate baselines rather
   than a tolerance wide enough to hide a real regression. */
const SNAPSHOTS = '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}';
/* Pin the dist projects to the dev projects' files by hardcoding the name the
   template would otherwise interpolate. */
const sharedWith = (projectName) =>
  SNAPSHOTS.replace('{projectName}', projectName);

export default defineConfig({
  testDir: './test/e2e',
  snapshotPathTemplate: SNAPSHOTS,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      /* Canvas text rasterises a hair differently between machines and browser
         builds. A small tolerance keeps the baseline about geometry and colour
         — what a refactor actually breaks — instead of font hinting. */
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: DEV,
    /* deviceScaleFactor 1 and a fixed viewport: fit() sizes the drawing off the
       canvas's own box, so the viewport is an input to every screenshot. */
    ...BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-light',
      use: { ...BASE, colorScheme: 'light', baseURL: DEV },
    },
    {
      name: 'chromium-dark',
      use: { ...BASE, colorScheme: 'dark', baseURL: DEV },
      /* The dark project exists for the visual baselines. Everything else would
         just run twice for no extra signal. */
      testMatch: /visual\.spec\.js/,
    },
    {
      name: 'dist-light',
      use: { ...BASE, colorScheme: 'light', baseURL: DIST },
      snapshotPathTemplate: sharedWith('chromium-light'),
    },
    {
      name: 'dist-dark',
      use: { ...BASE, colorScheme: 'dark', baseURL: DIST },
      testMatch: /visual\.spec\.js/,
      snapshotPathTemplate: sharedWith('chromium-dark'),
    },
  ],
  webServer: [
    {
      command: 'npx vite --mode instrumented',
      url: `${DEV}/index.html`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      /* `npm run test:e2e` builds both dist/ and dist-test/ first; this only
         serves. Keeping the build out of here means a bad build fails as a
         build, with its own error, rather than as a server timeout. */
      command: 'node test/e2e/static-server.js dist-test 4173',
      url: `${DIST}/index.html`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
