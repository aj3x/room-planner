import { defineConfig, devices } from '@playwright/test';

/* Characterization E2E against the CURRENT single-file app.
 *
 * Phase 2 introduces Vite and a dist/ build; at that point this config gains a
 * second project pointing at dist/index.html, and both must stay green. Right
 * now there is no build, so the app under test is the repo root served
 * statically — which is exactly how GitHub Pages serves it today. */
export default defineConfig({
  testDir: './test/e2e',
  /* Baselines live beside the specs so a reviewer can find them. {platform} is
     part of the path on purpose: canvas text and antialiasing differ between
     macOS and the Linux box CI runs on, so the two need separate baselines
     rather than a tolerance wide enough to hide a real regression. */
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
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
    baseURL: 'http://127.0.0.1:4173',
    /* deviceScaleFactor 1 and a fixed viewport: fit() sizes the drawing off the
       canvas's own box, so the viewport is an input to every screenshot. */
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      name: 'chromium-dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
      /* The dark project exists for the visual baselines. Everything else would
         just run twice for no extra signal. */
      testMatch: /visual\.spec\.js/,
    },
  ],
  webServer: {
    /* Plain static file server over the repo root — no build, no bundler.
       The app as it actually ships. */
    command: 'node test/e2e/static-server.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
