import { defineConfig, devices } from '@playwright/test';

/* Suite B. Two targets, both of which must be green:
 *
 *   dev   — `vite` serving index.html, the module graph, HMR. What a contributor
 *           actually runs. Started in `--mode instrumented` so the capture
 *           epilogue is part of the source Vite builds.
 *   dist  — the built single file, served statically. What actually ships.
 *
 * The dist project deliberately shares the dev project's snapshot files (see
 * snapshotPathTemplate below). That is the stronger assertion: bundling and
 * minifying must not move the blueprint goldens, and a build that did would
 * fail against the pre-build baseline rather than quietly grow one of its own.
 *
 * The epilogue arrives via vite.config.js, not `page.route`: in dev, Vite hoists
 * the inline module script out of the HTML into a proxy module, so there is no
 * script body left in the response to append to; in a build, the bundle is
 * wrapped in an IIFE, so anything appended after it lands outside the closure.
 * index.html on disk is still never written to.
 */

const BASE = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
};

const DEV = 'http://127.0.0.1:5173';
const DIST = 'http://127.0.0.1:4173';

/* Goldens live beside the specs so a reviewer can find them. {platform} is part
   of the path on purpose: the blueprint pipeline starts from drawImage-scaled
   pixels, so its coordinates depend on the platform's image resampling. */
const SNAPSHOTS = '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}';
/* Pin the dist project to the dev project's files by hardcoding the name the
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
  expect: { timeout: 10_000 },
  use: {
    baseURL: DEV,
    /* deviceScaleFactor 1 and a fixed viewport: fit() sizes the drawing off the
       canvas's own box, so the viewport is an input to every projected point. */
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
      name: 'dist-light',
      use: { ...BASE, colorScheme: 'light', baseURL: DIST },
      snapshotPathTemplate: sharedWith('chromium-light'),
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
      command: 'npx vite preview --outDir dist-test --port 4173 --strictPort',
      url: `${DIST}/index.html`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
