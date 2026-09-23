/* Playwright fixture: the real app, in a real browser, made deterministic.
 *
 * Same contract as the jsdom harness — index.html is never modified. Here the
 * epilogue is appended by rewriting the HTTP response body in flight, so the
 * browser parses a copy that exposes the script's let/const bindings on
 * window.__rp while the file on disk stays byte-for-byte what ships.
 */

import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectEpilogue } from '../epilogue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const BLUEPRINT_PNG = path.join(REPO_ROOT, 'example blueprints/apartment-1.png');

export const fixtureState = (name) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'test/fixtures/states', name), 'utf8'));

const APP_KEY = 'room-planner:v2';

/* Seeded PRNG + frozen clock, installed before any page script runs. Without
   the seed every uid() differs run to run and the polygon goldens churn. */
const DETERMINISM = `
(function(){
  var a = 0x9E3779B9 >>> 0;
  Math.random = function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  var FIXED = Date.parse('2024-01-01T00:00:00.000Z');
  var RealDate = Date;
  function FakeDate(){
    if (!(this instanceof FakeDate)) return new RealDate(FIXED).toString();
    return arguments.length === 0 ? new RealDate(FIXED) : new RealDate(...arguments);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function(){ return FIXED; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
})();
`;

export const test = base.extend({
  /* Opt in per-test: `test.use({ savedState: fixtureState('...') })`. */
  savedState: [null, { option: true }],

  app: async ({ page, savedState, baseURL }, use) => {
    // 1. append the capture epilogue to the served HTML, in flight
    await page.route('**/index.html', async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      await route.fulfill({
        response: res,
        body: injectEpilogue(body),
        headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' },
      });
    });

    // 2. determinism, before a line of app code runs
    await page.addInitScript(DETERMINISM);

    // 3. seed persistence the way a returning user would have it
    if (savedState) {
      /* Seed only when storage is empty. addInitScript runs on EVERY navigation,
         so an unconditional write would silently undo whatever the app itself
         had saved and make a re-navigation look like it lost the edit. The
         context is fresh per test, so this still seeds exactly once. */
      await page.addInitScript(
        ([k, v]) => {
          try { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch { /* ignore */ }
        },
        [APP_KEY, JSON.stringify(savedState)],
      );
    } else {
      await page.addInitScript(([k]) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      }, [APP_KEY]);
    }

    await page.goto(`${baseURL}/index.html`);
    await waitForApp(page);
    await use(page);
  },
});

/** Resolve once boot() has finished and the first frame has been painted. */
export async function waitForApp(page) {
  await page.waitForFunction(() => {
    const t = window.__rp;
    return !!(t && t.S && t.S.layouts && t.S.layouts.length && document.body.dataset.mode);
  });
  await settle(page);
}

/** Let the app's own rAF-scheduled draw land, twice over. */
export async function settle(page) {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))),
  );
}

/** Read the live state out of the page. */
export const readS = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__rp.S)));

/** Flush the debounced save() and read back what landed in storage. */
export async function flushSave(page) {
  await page.waitForTimeout(450);
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : JSON.parse(raw);
  }, APP_KEY);
}

/* Ids are an implementation detail; see the note on stableIds in the jsdom
   harness. Same normalisation, so the two suites agree. */
export function stableIds(value) {
  const seen = new Map();
  const tag = (v) => {
    if (!seen.has(v)) seen.set(v, `id${seen.size + 1}`);
    return seen.get(v);
  };
  const ID_LIKE = /^[a-z0-9]{8}$/;
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        const x = v[k];
        out[k] = typeof x === 'string' && ID_LIKE.test(x) ? tag(x) : walk(x);
      }
      return out;
    }
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v;
  };
  return walk(value);
}

export { expect };
