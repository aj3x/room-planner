/* Suite A's environment: enough of a document for src/ to evaluate in.
 *
 * The unit tests import real modules out of src/, and several reach the DOM at
 * module-evaluation time -- canvas/view.js does `$('cv').getContext('2d')` on
 * its first line -- so the shell has to exist, and jsdom has to answer
 * getContext, before the first import runs. index.html is never modified; the
 * shell is read off disk. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

/* A5 moved the static markup into src/html/, behind
   `<!-- @include src/html/foo.html -->` directives that a Vite plugin
   (rp:html-includes) substitutes in transformIndexHtml. Suite B is served by
   Vite and never sees a directive; this file reads index.html off disk, so it
   carries the same substitution. KEEP THE TWO IN STEP -- without it the shell
   has no #cv and every unit test dies at module evaluation. */
const INCLUDE_RE = /^[ \t]*<!--\s*@include\s+(\S+?)\s*-->[ \t]*$/gm;
const expandIncludes = (html) => html.replace(INCLUDE_RE, (_, rel) =>
  fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf8').replace(/\n$/, ''));

const src = expandIncludes(fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8'));

/* Strip EVERY script block, not the span from the first <script to the last
   </script>. That shortcut was exact while index.html held a single script,
   and became silently destructive the moment each src/html/ partial started
   carrying its own: the first <script> is now the header partial's, near the
   top of <body>, so cutting to the last </script> deleted every pane between
   them. The DOM still looked plausible — it just had no #cv, and the failure
   surfaced as `Cannot read properties of null (reading 'getContext')` from
   canvas/view.js, three imports deep and nowhere near the cause. */
const SCRIPTS = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
document.documentElement.innerHTML = src.replace(SCRIPTS, '');

/* Fail loudly and here, rather than as a null dereference deep inside a
   module. One id per partial: if a future change to the stripping above, or
   to the include expansion, drops a pane again, this names the pane. */
for (const [id, partial] of [['modal', 'modal'], ['cv', 'stage'],
  ['layoutTree', 'pane-left'], ['paneStuff', 'pane-right'], ['tree', 'pane-library']]) {
  if (!document.getElementById(id))
    throw new Error(`unit-setup: #${id} is missing — src/html/${partial}.html did not survive into the harness DOM`);
}

/* jsdom has no canvas. This records calls rather than rasterising -- enough for
   draw() to run without throwing. Anything needing real PIXELS is Suite B. */
function FakeCtx(canvas) { this.canvas = canvas; this.__calls = []; }
for (const m of ['save','restore','scale','rotate','translate','transform','setTransform',
  'resetTransform','clearRect','fillRect','strokeRect','beginPath','closePath','moveTo',
  'lineTo','bezierCurveTo','quadraticCurveTo','arc','arcTo','ellipse','rect','roundRect',
  'fill','stroke','clip','drawImage','putImageData','setLineDash','fillText','strokeText']) {
  FakeCtx.prototype[m] = function (...a) { this.__calls.push([m, ...a]); };
}
FakeCtx.prototype.getLineDash = () => [];
FakeCtx.prototype.measureText = (t) => ({
  width: String(t ?? '').length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
FakeCtx.prototype.createLinearGradient = () => ({ addColorStop() {} });
FakeCtx.prototype.createRadialGradient = () => ({ addColorStop() {} });
FakeCtx.prototype.createPattern = () => null;
const pixels = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) });
FakeCtx.prototype.getImageData = (x, y, w, h) => pixels(w, h);
FakeCtx.prototype.createImageData = pixels;
FakeCtx.prototype.isPointInPath = () => false;
window.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind !== '2d') return null;
  if (!this.__ctx) this.__ctx = new FakeCtx(this);
  return this.__ctx;
};

/* The app takes matchMedia at top level (darkMQ, and the narrow-layout query);
   jsdom's own lacks addEventListener in some versions. Light, wide. */
window.matchMedia = (q) => ({ media: q, matches: false, onchange: null,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, dispatchEvent: () => false });

/* ---- shared test helpers ---------------------------------------------- */

/** Load a saved-state fixture. */
export const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'test/fixtures/states', name), 'utf8'));

/** Deep-clone through JSON, the way the app's own clone() does. */
export const clone = (v) => JSON.parse(JSON.stringify(v));


/* Ids are an implementation detail: one extra uid() upstream shifts every id
   downstream and turns a harmless change into a hundred-line snapshot diff.
   Ordinals still prove *identity* -- the same id maps to the same ordinal. */
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
