/* Playwright fixture: the real app, in a real browser, made deterministic.
 *
 * index.html is never modified. The copy the browser parses has the capture
 * epilogue appended to it (by Vite, under `--mode instrumented`), so the
 * script's let/const bindings are reachable on window.__rp. */

import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const BLUEPRINT_PNG = path.join(REPO_ROOT, 'example blueprints/apartment-1.png');

/* The shipped artifact, and the subject of the file:// contract: index.html's
   one <script> is `type="module"`, fetched under CORS rules no file:// origin
   can satisfy, so the source file does not run off disk. dist/index.html does. */
export const DIST_HTML = path.join(REPO_ROOT, 'dist/index.html');

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
    await page.addInitScript(DETERMINISM);

    if (savedState) {
      /* Only when storage is empty: addInitScript runs on EVERY navigation, so
         an unconditional write would undo whatever the app itself had saved and
         make a re-navigation look like it lost the edit. */
      await page.addInitScript(
        ([k, v]) => {
          try { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch { /* ignore */ }
        },
        [APP_KEY, JSON.stringify(savedState)],
      );
    } else {
      await page.addInitScript(([k]) => { try { localStorage.removeItem(k); } catch { /* ignore */ } }, [APP_KEY]);
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
export const settle = (page) => page.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

/** Read the live state out of the page. */
export const readS = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__rp.S)));

/** Flush the debounced save() (350ms) and read back what landed in storage.
 *
 * POLLS — it used to sleep 450ms, and that 100ms margin was the one flake this
 * suite ever had. `want` is an optional predicate on the parsed state; pass one
 * whenever the assertion needs a *particular* write, or a value left by an
 * earlier save satisfies the non-null check and the race is merely quieter. */
export async function flushSave(page, want, timeout = 5000) {
  const read = () => page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }, APP_KEY);

  const deadline = Date.now() + timeout;
  for (;;) {
    const last = await read();
    if (last !== null && (!want || want(last))) return last;
    if (Date.now() > deadline) {
      throw new Error(`flushSave: no matching write within ${timeout}ms. Last: ${JSON.stringify(last)}`);
    }
    await page.waitForTimeout(50);
  }
}

export { expect };

/* ---------------------------------------------------------------------------
   Pointer input. Three things these exist to get right:

   1. **Coordinates.** Tests are written in world millimetres; `page.mouse`
      takes viewport CSS px. The camera (`view.ox`/`oy`/`scale`) is set by
      `fit()` and moves during a pan, so it is read fresh for every gesture.
   2. **Intermediate moves.** A drag arms only once a `pointermove` lands
      further than `DEADZONE_PX` (4) from the press. One jump arms it *and*
      applies the whole travel in a single step, which is not the path a real
      drag takes — so a drag is always stepped.
   3. **Guides are readable only MID-drag.** `endDrag()` clears `alignGuides`,
      `alignNote` and `#readout`'s `.snap` span.

   Nothing here sleeps: `settle()` waits on the app's own rAF, and the drag's
   effect on state is synchronous inside `applyDragAt`.
--------------------------------------------------------------------------- */

/** The canvas's viewport origin plus the live camera, read together. */
export const camera = (page) => page.evaluate(() => {
  const c = document.getElementById('cv');
  const r = c.getBoundingClientRect();
  const v = window.__rp.view;
  return { left: r.left, top: r.top, width: r.width, height: r.height, ox: v.ox, oy: v.oy, scale: v.scale };
});

/** Project world mm -> viewport CSS px using a camera snapshot from `camera()`. */
export const project = (cam, [x, y]) =>
  ({ x: cam.left + cam.ox + x * cam.scale, y: cam.top + cam.oy + y * cam.scale });

/* `edgePanVel` auto-pans inside 40px of any edge, and the floating `.island`
   controls sit over the corners (36px tall at a 12px inset). A gesture that
   strays into either is not testing what it thinks it is; 56px clears both. */
const SAFE_INSET = 56;
export function assertUsable(cam, p, what) {
  const ox = p.x - cam.left, oy = p.y - cam.top;
  if (ox < SAFE_INSET || oy < SAFE_INSET || ox > cam.width - SAFE_INSET || oy > cam.height - SAFE_INSET) {
    throw new Error(`${what} projects to (${ox.toFixed(1)}, ${oy.toFixed(1)}) on a `
      + `${cam.width}x${cam.height} canvas — within ${SAFE_INSET}px of an edge, which is the `
      + 'auto-pan zone and the island controls. Pick a point nearer the middle.');
  }
}

/** Press the pointer down at a world point. Returns the camera snapshot used. */
export async function pointerDownAt(page, world, { modifiers = [], button } = {}) {
  const cam = await camera(page);
  const p = project(cam, world);
  assertUsable(cam, p, 'pointerdown');
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(button ? { button } : undefined);
  return cam;
}

/** Step the pointer from one world point to another, in `steps` moves. */
export async function pointerStepTo(page, cam, from, to, steps = 10) {
  const a = project(cam, from), b = project(cam, to);
  assertUsable(cam, b, 'pointer target');
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + (b.x - a.x) * (i / steps), a.y + (b.y - a.y) * (i / steps));
  }
}

/** Release, and drop any modifiers that were held. */
export async function pointerUp(page, { modifiers = [] } = {}) {
  await page.mouse.up();
  for (const m of [...modifiers].reverse()) await page.keyboard.up(m);
}

/** Everything the interaction region keeps in flight, in one read. */
export const liveDrag = (page) => page.evaluate(() => {
  const t = window.__rp;
  return {
    drag: t.drag && JSON.parse(JSON.stringify(t.drag)),
    alignNote: t.alignNote,
    alignGuides: JSON.parse(JSON.stringify(t.alignGuides)),
    readout: document.getElementById('readout').textContent,
    snapSpan: document.querySelector('#readout .snap')?.textContent ?? null,
  };
});
