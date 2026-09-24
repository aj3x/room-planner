/* ===========================================================================
   Characterization harness — boots the real, unmodified index.html in jsdom.

   To reach the app's internals WITHOUT touching the file on disk, we:

     1. read index.html into memory,
     2. cut the <script> body out of the shell,
     3. BUNDLE that body — following its `import`s into src/ — into one classic
        IIFE, with a small epilogue APPENDED first, which publishes the closure
        bindings on globalThis (see `appBundle` below for why),
     4. build a jsdom document from the shell alone (no scripts run yet),
     5. evaluate a *setup* script that installs deterministic stand-ins
        (seeded Math.random, frozen Date, a recording 2D canvas context),
     6. evaluate the bundle.

   The epilogue is appended, never prepended, so `"use strict"` stays the first
   statement of the script and the app still runs in strict mode.

   The file on disk is never written to. Nothing here is a source change.
   =========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { build } from 'vite';
import { EPILOGUE } from './epilogue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const INDEX_HTML = path.join(REPO_ROOT, 'index.html');

/* ---- source splitting ------------------------------------------------- */

/* A5 moved the static markup into src/html/, behind
   `<!-- @include src/html/foo.html -->` directives that a Vite plugin
   (`rp:html-includes`) substitutes in `transformIndexHtml`. Suite B gets its
   HTML through Vite and so never sees a directive, but this harness reads
   index.html off disk itself, so it has to do the same substitution — the two
   implementations must agree, and they are four lines each. Without it the
   shell has no #cv and the app dies at module evaluation on getContext(). */
const INCLUDE_RE = /^[ \t]*<!--\s*@include\s+(\S+?)\s*-->[ \t]*$/gm;
function expandIncludes(html) {
  return html.replace(INCLUDE_RE, (_, rel) =>
    fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf8').replace(/\n$/, ''));
}

let cached = null;
/** Read index.html and split it into the shell and the one app <script> body. */
export function readAppSource() {
  if (cached) return cached;
  const src = expandIncludes(fs.readFileSync(INDEX_HTML, 'utf8'));
  /* Phase 2 made this `<script type="module">` so Vite has an entry point to
     build. The tag is the only thing that changed; the body is byte-identical.
     Match either spelling so this harness is not a second place that has to be
     edited in lockstep with a tag attribute. */
  const m = /<script(?:\s+type="module")?\s*>/.exec(src);
  const open = m ? m.index : -1;
  const close = src.lastIndexOf('</script>');
  if (open < 0 || close < 0 || close < open) {
    throw new Error('index.html: could not locate the single app <script> block');
  }
  const first = src.indexOf('<script');
  if (first !== open) {
    throw new Error('index.html: expected exactly one <script> block; the harness assumption has changed');
  }
  cached = {
    src,
    shell: src.slice(0, open) + '<!-- app script evaluated by the test harness -->' + src.slice(close + '</script>'.length),
    body: src.slice(open + m[0].length, close),
  };
  return cached;
}

/* ---- bundling ---------------------------------------------------------- */

/* Why this exists (Phase 2.5).

   Until Phase 2 the app was one classic <script>, so the harness could simply
   eval its body in jsdom and every top-level `function` declaration landed on
   globalThis for free. Phase 3 turns that body into `import`s from src/, and
   **jsdom cannot run ES modules** — the first real import would break this
   harness outright, exactly when the baseline is needed most.

   So the harness stops eval-ing source and starts bundling it, with the same
   bundler that builds the shipped artifact. The body (plus the epilogue) is
   handed to Vite as a virtual entry module sitting at the repo root, so its
   `./src/...` specifiers resolve exactly as they do in `npm run build`, and the
   output is a classic IIFE — the one thing jsdom *can* evaluate.

   Two consequences worth stating plainly:

   - **This runs the app in ONE realm.** The alternative — `await import()` the
     src/ modules in Node and inject them into the jsdom window — puts module
     code in Node's realm, where `document` and `window` are the wrong ones or
     missing entirely. That is fine for `core/units.js` and fatal by the time
     `ui/` and `canvas/` move. Bundling sidesteps it completely: every module
     is evaluated inside the same jsdom window as the rest of the app.

   - **Function declarations are no longer global here either.** Inside an IIFE
     they are closure-scoped, which is precisely how the browser already scopes
     them since the `type="module"` tag. Suite A now reaches entry points the
     same way Suite B does — through `GLOBALS` in epilogue.js. That removes the
     scoping divergence between the two suites that test/README.md used to have
     to explain, so a name that goes missing during extraction now fails in both.

   `treeshake: false` and `minify: false`: the point is to run the code, not a
   smaller equivalent of it. `configFile: false` keeps vite.config.js's
   single-file/HTML plugins out of the way — this entry is JS, not the page.

   Nothing is written to disk. The entry id is virtual; `__rp-test-entry.js`
   does not and must not exist. */
const VIRTUAL_ENTRY = path.join(REPO_ROOT, '__rp-test-entry.js');

let bundling = null;

/** Bundle the app (index.html's script body + src/ + the epilogue) to an IIFE. */
export function appBundle() {
  if (!bundling) bundling = buildBundle();
  return bundling;
}

async function buildBundle() {
  const { body } = readAppSource();
  const entry = body + EPILOGUE;
  const out = await build({
    configFile: false,
    logLevel: 'error',
    root: REPO_ROOT,
    plugins: [
      {
        name: 'rp:test-entry',
        resolveId: (id) => (id === VIRTUAL_ENTRY ? VIRTUAL_ENTRY : null),
        load: (id) => (id === VIRTUAL_ENTRY ? entry : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      rollupOptions: {
        input: VIRTUAL_ENTRY,
        treeshake: false,
        output: { format: 'iife' },
      },
    },
  });
  const result = Array.isArray(out) ? out[0] : out;
  const chunks = result.output.filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) {
    throw new Error(
      `harness: expected one chunk, got ${chunks.length} — the app must stay a single bundle`,
    );
  }
  const code = chunks[0].code;
  /* Strict mode is load-bearing: the whole baseline was recorded with it on.
     Rolldown hoists the app's own directive to the top of the output; if that
     ever stops happening, say so here rather than silently characterizing
     sloppy-mode behaviour. */
  if (!/^["']use strict["'];/.test(code)) {
    throw new Error('harness: bundle does not begin with "use strict" — the app would run in sloppy mode');
  }
  return code;
}

/* ---- determinism ------------------------------------------------------ */

/* A tiny deterministic PRNG. uid() is Math.random-based, so without this every
   snapshot would churn. mulberry32, inlined so tests have no dependency. */
const SEED_PRELUDE = `
(function(){
  var a = 0x9E3779B9 >>> 0;
  Math.random = function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  globalThis.__rpResetRandom = function(){ a = 0x9E3779B9 >>> 0; };
})();
`;

/* exportPayload() stamps new Date().toISOString(). Freeze the clock so the
   export golden is stable, but keep Date usable for everything else. */
const CLOCK_PRELUDE = `
(function(){
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
  globalThis.Date = FakeDate;
})();
`;

/* jsdom has no canvas. index.html takes a 2D context at top level
   (const cv=$('cv'), ctx=cv.getContext('2d')) and draw() uses it on every
   render, so without a stand-in the app cannot boot at all under jsdom.
   This records the call sequence rather than rasterising: enough for the
   non-visual code paths, and it keeps draw() from throwing. Anything that
   depends on actual PIXELS (getImageData, the whole blueprint pipeline)
   belongs in the Playwright suite, not here. */
const CANVAS_PRELUDE = `
(function(){
  function FakeCtx(canvas){
    this.canvas = canvas;
    this.__calls = [];
  }
  var METHODS = ['save','restore','scale','rotate','translate','transform','setTransform',
    'resetTransform','clearRect','fillRect','strokeRect','beginPath','closePath','moveTo',
    'lineTo','bezierCurveTo','quadraticCurveTo','arc','arcTo','ellipse','rect','roundRect',
    'fill','stroke','clip','drawImage','putImageData','setLineDash','getLineDash',
    'createLinearGradient','createRadialGradient','createPattern','fillText','strokeText'];
  METHODS.forEach(function(m){
    FakeCtx.prototype[m] = function(){ this.__calls.push([m].concat([].slice.call(arguments))); };
  });
  FakeCtx.prototype.getLineDash = function(){ return []; };
  FakeCtx.prototype.measureText = function(t){
    return { width: String(t == null ? '' : t).length * 6,
             actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  };
  FakeCtx.prototype.createLinearGradient = function(){ return { addColorStop: function(){} }; };
  FakeCtx.prototype.createRadialGradient = function(){ return { addColorStop: function(){} }; };
  FakeCtx.prototype.createPattern = function(){ return null; };
  FakeCtx.prototype.getImageData = function(x,y,w,h){
    return { width:w, height:h, data:new Uint8ClampedArray(Math.max(0,w*h*4)) };
  };
  FakeCtx.prototype.createImageData = function(w,h){
    return { width:w, height:h, data:new Uint8ClampedArray(Math.max(0,w*h*4)) };
  };
  FakeCtx.prototype.isPointInPath = function(){ return false; };
  ['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit','font',
   'textAlign','textBaseline','globalAlpha','globalCompositeOperation','lineDashOffset',
   'shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY','imageSmoothingEnabled',
   'imageSmoothingQuality','direction'].forEach(function(p){
    Object.defineProperty(FakeCtx.prototype, p, {
      get: function(){ return this['_' + p]; },
      set: function(v){ this['_' + p] = v; },
      configurable: true
    });
  });

  var proto = globalThis.HTMLCanvasElement && globalThis.HTMLCanvasElement.prototype;
  if (!proto) return;
  proto.getContext = function(kind){
    if (kind !== '2d') return null;
    if (!this.__ctx) this.__ctx = new FakeCtx(this);
    return this.__ctx;
  };
  proto.toDataURL = function(){ return 'data:image/png;base64,'; };
  proto.toBlob = function(cb){ cb(null); };
  globalThis.__rpFakeCtx = FakeCtx;
})();
`;

/* The app takes matchMedia at top level (darkMQ) and again for the narrow
   layout query. jsdom's own matchMedia lacks addEventListener in some
   versions, so install a predictable one. Default: light, wide. */
function mediaPrelude({ dark = false, narrow = false } = {}) {
  return `
(function(){
  var dark = ${dark ? 'true' : 'false'}, narrow = ${narrow ? 'true' : 'false'};
  globalThis.matchMedia = function(q){
    var m = /dark/.test(q) ? dark : (/max-width/.test(q) ? narrow : false);
    return {
      media: q, matches: m, onchange: null,
      addEventListener: function(){}, removeEventListener: function(){},
      addListener: function(){}, removeListener: function(){},
      dispatchEvent: function(){ return false; }
    };
  };
})();
`;
}

/* ---- boot ------------------------------------------------------------- */

/**
 * Boot the real app in jsdom.
 *
 * @param {object}  [opts]
 * @param {object|string|null} [opts.saved]  state to seed localStorage with, under the app's own KEY
 * @param {boolean} [opts.dark]              report prefers-color-scheme: dark
 * @param {boolean} [opts.narrow]            report a narrow (<=900px) viewport
 * @param {boolean} [opts.settle]            await the async boot() IIFE (default true)
 * @returns {Promise<{window, document, dom, app, t, errors}>}
 *   `app` is globalThis of the page (function declarations live here);
 *   `t`   is the captured let/const bindings.
 */
export async function bootApp(opts = {}) {
  const { saved = null, dark = false, narrow = false, settle = true } = opts;
  const { shell } = readAppSource();
  const bundle = await appBundle();

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e));
  virtualConsole.on('error', (...a) => errors.push(new Error(a.join(' '))));

  const dom = new JSDOM(shell, {
    /* NOT a file:// url: jsdom refuses localStorage on an opaque origin, and the
       app's persistence is exactly what we are characterizing. The file:// path
       is covered for real in the Playwright suite, which is where it matters
       (it is the deployment model's actual contract). */
    url: 'http://localhost/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  // 1. deterministic environment, installed before a line of app code runs
  window.eval(SEED_PRELUDE + CLOCK_PRELUDE + CANVAS_PRELUDE + mediaPrelude({ dark, narrow }));

  // 2. seed persistence the way a returning user would have it
  if (saved !== null) {
    const raw = typeof saved === 'string' ? saved : JSON.stringify(saved);
    window.eval(`localStorage.setItem(${JSON.stringify('room-planner:v2')}, ${JSON.stringify(raw)});`);
  } else {
    window.eval(`try{ localStorage.clear(); }catch(e){}`);
  }

  // 3. the app itself — untouched body plus src/, bundled, epilogue appended
  const s = window.document.createElement('script');
  s.textContent = bundle;
  window.document.body.appendChild(s);

  const app = window;
  const t = window.__rp;
  if (!t) throw new Error('harness: capture epilogue did not run — the app script threw during evaluation');

  // 4. let the async boot() IIFE finish (it awaits Store.get before rendering)
  if (settle) await settleApp(window);

  return { window, document: window.document, dom, app, t, errors };
}

/** Drain microtasks and any pending timers the app scheduled during boot. */
export async function settleApp(window) {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => window.setTimeout(r, 0));
  }
}

/** Flush the debounced save() (350ms) and hand back what landed in storage. */
export async function flushSave(window) {
  await new Promise((r) => setTimeout(r, 400));
  await settleApp(window);
  const raw = window.localStorage.getItem('room-planner:v2');
  return raw === null ? null : JSON.parse(raw);
}

/* ---- snapshot hygiene -------------------------------------------------- */

/* Even with a seeded PRNG, id values are an implementation detail — an extra
   uid() call anywhere upstream shifts every id downstream and would turn a
   harmless change into a hundred-line snapshot diff. Snapshots therefore
   normalise ids to stable ordinals per kind, which still proves *identity*
   (the same id in two places stays the same ordinal in both). */
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
    return v;
  };
  return walk(value);
}

/** Deep-clone through JSON, the same way the app's own clone() does. */
export const clone = (v) => JSON.parse(JSON.stringify(v));
