/* Playwright fixture: the real app, in a real browser, made deterministic.
 *
 * Same contract as the jsdom harness — index.html is never modified. The copy
 * the browser parses has the capture epilogue appended to it, so the script's
 * let/const bindings are reachable on window.__rp; since Phase 2 that copy is
 * made by Vite (`--mode instrumented`) rather than by rewriting the response
 * here. The file on disk stays byte-for-byte what ships.
 */

import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const BLUEPRINT_PNG = path.join(REPO_ROOT, 'example blueprints/apartment-1.png');

/* The shipped artifact. Since Phase 2 this — not the source index.html — is the
   thing the file:// deployment contract is about: index.html became a Vite
   entry whose one <script> is `type="module"`, and a module script is fetched
   under CORS rules that an opaque file:// origin can never satisfy. The
   "open the file and it works" promise is unchanged; the file it is a promise
   about is now the build output, which is what the refactor plan's Tier 3
   always specified. */
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
    /* 1. the capture epilogue is no longer appended here.
       It used to be grafted onto the HTTP response with `page.route`, which
       worked while the app was one inline classic script sitting in the HTML.
       Neither target has that shape any more: the dev server hoists the inline
       module into a proxy module, and the build wraps the bundle in an IIFE, so
       text appended to the response would land outside the app's scope and
       capture nothing. Both servers are therefore started from
       `--mode instrumented`, which injects it in vite.config.js before Vite's
       own HTML handling. index.html on disk is still never written to. */

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
/* save() debounces at 350ms. Waiting a fixed 450ms for it leaves a 100ms
   margin, which a loaded machine eats: a parallel worker or a Vite rebuild is
   enough to read localStorage before the timer has fired. That is what made
   this helper flaky. So poll for the write instead of sleeping through it.

   `want` is an optional predicate on the parsed state. Pass one whenever the
   assertion depends on a *particular* write having landed — without it, a
   value left by an earlier save satisfies the non-null check and the race is
   still there, just quieter. */
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
      throw new Error(
        `flushSave: the expected write never landed within ${timeout}ms. `
        + `Last value in storage: ${JSON.stringify(last)}`,
      );
    }
    await page.waitForTimeout(50);
  }
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

/* ---------------------------------------------------------------------------
   Pointer input (Phase 3.5)

   Everything above drives the app through its own entry points. These helpers
   drive it through the browser's real pointer pipeline instead — `mouse.down` /
   `mouse.move` / `mouse.up` on `#cv` — because that is the only way the drag
   deadzone, the alignment magnet and the guide readouts are reached at all.

   Two things they exist to get right:

   1. **Coordinates.** Tests are written in world millimetres; `pointerdown`
      reads `e.offsetX`/`e.offsetY`, canvas-relative CSS px; `page.mouse` takes
      viewport CSS px. The camera (`view.ox`/`oy`/`scale`) is set by `fit()` and
      moves during a pan, so it is read fresh for every gesture rather than
      cached. `#cv` has no border or padding (see the `canvas{}` rule), so the
      element's border box and its padding box coincide and
      `getBoundingClientRect()` is the offset origin.

   2. **Intermediate moves.** `DEADZONE_PX` is 4 canvas px, and a drag arms only
      once a `pointermove` lands further than that from where the pointer went
      down. One jump from start to finish arms it and then applies the whole
      travel in a single step, which is a different code path from the real
      thing. So a drag is always stepped.

   Nothing here sleeps. `settle()` waits on the app's own rAF, and the drag's
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
export const project = (cam, [x, y]) => ({
  x: cam.left + cam.ox + x * cam.scale,
  y: cam.top + cam.oy + y * cam.scale,
});

/** Project world mm -> canvas-relative CSS px (what `e.offsetX/Y` will report). */
export const projectOffset = (cam, [x, y]) => ({ x: cam.ox + x * cam.scale, y: cam.oy + y * cam.scale });

/* The floating `.island` controls sit over the canvas at its four corners with
   z-index 4, and `edgePanVel` starts auto-panning inside 40px of any edge.
   A gesture that strays into either is not testing what it thinks it is, so
   every projected point is checked against both. */
/* 40px is edgePanVel's zone; the tallest island is 36px tall at a 12px inset,
   so 56px clears both and the margin is one number rather than two. */
const SAFE_INSET = 56;
export function assertUsable(cam, p, what) {
  const ox = p.x - cam.left, oy = p.y - cam.top;
  if (ox < SAFE_INSET || oy < SAFE_INSET || ox > cam.width - SAFE_INSET || oy > cam.height - SAFE_INSET) {
    throw new Error(
      `${what} projects to canvas px (${ox.toFixed(1)}, ${oy.toFixed(1)}) on a `
      + `${cam.width}x${cam.height} canvas, within ${SAFE_INSET}px of an edge — that is the `
      + 'auto-pan zone and the floating island controls. Pick a point nearer the middle.',
    );
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

/**
 * A complete stepped drag between two world points.
 *
 * `whileDown` is called after the last move and before the release, which is
 * the only window in which `alignGuides`/`alignNote`/`floorGuides`/
 * `floorSnapNote` and `drag` are readable — `endDrag()` clears all of them.
 * Whatever it returns comes back from `dragWorld`.
 */
export async function dragWorld(page, from, to, opts = {}) {
  const { steps = 10, modifiers = [], whileDown } = opts;
  const cam = await pointerDownAt(page, from, { modifiers });
  await pointerStepTo(page, cam, from, to, steps);
  let held;
  if (whileDown) held = await whileDown(cam);
  await pointerUp(page, { modifiers });
  return held;
}

/** Everything the interaction region keeps in flight, in one read. */
export const liveDrag = (page) => page.evaluate(() => {
  const t = window.__rp;
  return {
    drag: t.drag && JSON.parse(JSON.stringify(t.drag)),
    alignNote: t.alignNote,
    alignGuides: JSON.parse(JSON.stringify(t.alignGuides)),
    floorSnapNote: t.floorSnapNote,
    floorGuides: JSON.parse(JSON.stringify(t.floorGuides)),
    readout: document.getElementById('readout').textContent,
    snapSpan: document.querySelector('#readout .snap')?.textContent ?? null,
  };
});

/** A single click (down+up, no travel) at a world point. */
export async function clickWorld(page, world, opts = {}) {
  const cam = await pointerDownAt(page, world, opts);
  void cam;
  await pointerUp(page, opts);
}

/**
 * Park the camera so a world box sits in the middle `fraction` of the canvas.
 *
 * `fit()` fills the canvas, which puts the room's own walls within a few pixels
 * of the edge — inside `edgePanVel`'s 40px auto-pan band and under the floating
 * island controls. Any gesture that has to click ON a wall (splitting a room,
 * measuring off a wall, drawing an outline near one) needs the room smaller
 * than the canvas instead. Setting the camera directly is not a behaviour
 * change: `view` is mutated exactly as `zoomAt`/`fit` mutate it.
 */
export async function frameBox(page, [x0, y0, x1, y1], fraction = 0.55) {
  await page.evaluate(([bx0, by0, bx1, by1, f]) => {
    const c = document.getElementById('cv');
    const w = c.clientWidth, h = c.clientHeight;
    const v = window.__rp.view;
    v.scale = Math.min((w * f) / Math.max(bx1 - bx0, 1), (h * f) / Math.max(by1 - by0, 1));
    v.ox = w / 2 - ((bx0 + bx1) / 2) * v.scale;
    v.oy = h / 2 - ((by0 + by1) / 2) * v.scale;
    window.draw();
  }, [x0, y0, x1, y1, fraction]);
  await settle(page);
}

/**
 * Put the app on a coarse, predictable snap grid.
 *
 * Tests that assert an exact landing coordinate need a grid step bigger than
 * the pointer's own quantisation: at the fixtures' 25.4mm ("1 inch") one grid
 * cell is under four screen pixels, so which cell a click lands in is not
 * something a test can predict. 500mm is about 48px, which is.
 *
 * The unit has to move with it. `renderSnap()` rebuilds the snap <select> from
 * SNAPS.imperial or SNAPS.metric depending on S.unit and — this is the part
 * that bites — resets `S.snap` to the list's third entry if the current value
 * is not one of its options. 500 is in the metric list only, so setting it on a
 * ft+in project survives exactly until the next `renderAll()`, which
 * `startSplitRoom()` calls. Setting the unit too makes it stick.
 */
export async function useCoarseSnap(page, mm = '500') {
  await page.evaluate((v) => {
    window.__rp.S.unit = 'm';
    window.__rp.S.snap = v;
  }, mm);
}

/** Confirm the app's modal by its primary button, after checking its title. */
export async function confirmModal(page, title) {
  if (title !== undefined) {
    await expect(page.locator('#moTitle')).toHaveText(title);
  }
  await page.click('#moOk');
  await settle(page);
}

/* ---------------------------------------------------------------------------
   Panel text (Phase 3.6)

   The side panels and the Library UI are rebuilt by `render*()` functions that
   re-set `innerHTML`. Nothing in the suite read that HTML until Phase 3.6, and
   a break that does not throw turns nothing red. These read it as **text and
   state** — row counts, labels, `disabled`, `aria-pressed`, `aria-expanded`,
   the order of entries — never as a screenshot: a DOM-text assertion says what
   broke, a panel screenshot only says something did and goes red on every
   legitimate style change.

   Whitespace is collapsed because the templates are indented source strings;
   what is being pinned is the wording and the order, not the indentation.
--------------------------------------------------------------------------- */

/** The collapsed text of every element matching `sel`, in document order. */
export const texts = (page, sel) =>
  page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

/** One attribute off every element matching `sel`, in document order. */
export const attrs = (page, sel, name) =>
  page.$$eval(sel, (els, n) => els.map((e) => e.getAttribute(n)), name);

/** The open `⋯` menu: its title and the labels in it, separators marked. */
export const menuItems = (page) =>
  page.$$eval('.menu > *', (els) => els.map((e) => (e.className === 'sep' ? '—' : e.textContent)));
