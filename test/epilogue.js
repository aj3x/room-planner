/* The capture epilogue, shared by the jsdom harness and the Playwright suite.
 *
 * index.html is one classic strict-mode <script>. Its top-level `function`
 * declarations become properties of globalThis all by themselves, but its
 * top-level `let`/`const` bindings — which is where every piece of interesting
 * state lives — do not. This snippet is APPENDED to an in-memory copy of that
 * script so those bindings become reachable from a test.
 *
 * Appended, never prepended: "use strict" has to stay the first statement of
 * the script or the whole app silently changes semantics.
 *
 * index.html itself is never written to. Both suites rewrite only the copy they
 * evaluate — jsdom builds its document from a split-up string, and Playwright
 * rewrites the HTTP response body in flight.
 */

/* Entry points the suites call as `window.foo(...)`.
 *
 * Until Phase 2 the app was one classic <script>, so every top-level `function`
 * declaration landed on globalThis for free and the suites just called them.
 * As a Vite entry the script is `type="module"`, which gives it its own scope —
 * the declarations are still there, still hoisted, still identical, but they
 * are no longer global. Nothing about the app changed; only its scope did.
 *
 * So the epilogue republishes the handful of entry points the baseline drives
 * the app through. It is explicit rather than automatic because module scope
 * cannot be enumerated from inside, and explicit is the better failure mode
 * anyway: a name that goes missing during extraction fails here, loudly, in
 * one place, instead of surfacing as `window.draw is not a function` in twelve
 * specs. Add to this list when a test needs another entry point — never an
 * export to index.html.
 */
const GLOBALS = [
  // driven by Suite B (Playwright)
  'draw', 'fit', 'save', 'setMode', 'startCustomDraw',
  'exportPayload', 'readImport', 'applyImport',
  'polySimple', 'swingPoly', 'bpRebuild',
  // driven by Suite A (jsdom) — already global there, harmless to re-assign
  'parseLen', 'fmtLen', 'migrate', 'normLayout', 'normItem',
];

/* A binding that has moved into src/ is out of index.html's scope, so the
 * epilogue cannot name it directly any more. Where a test still needs one, the
 * epilogue imports it the ordinary way -- this text is appended INSIDE the
 * app's own module, so a bare `import` resolves exactly as index.html's own do
 * (and hoists, so "use strict" keeps its place at the top). CANVAS went this
 * way when canvas/draw.js took the palette: index.html itself no longer
 * references it, only visual.spec.js does.
 */
export const EPILOGUE = `
;import {CANVAS} from './src/canvas/draw.js';
;globalThis.__rp = {
  get S(){ return S; },        set S(v){ setS(v); },
  get sel(){ return sel; },
  get selSet(){ return selSet; },
  get roomSel(){ return roomSel; },
  get floorSel(){ return floorSel; },
  get mergeSel(){ return mergeSel; },
  get view(){ return view; },
  get nav(){ return nav; },
  get measureOn(){ return measureOn; },
  get bpState(){ return bpState; },
  get bpLastImport(){ return bpLastImport; },
  roomHist: roomHist,
  furnHist: furnHist,
  KEY: KEY,
  Store: Store,
  PREF_KEYS: PREF_KEYS,
  INV_SCOPES: INV_SCOPES,
  PALETTE: PALETTE,
  ctx: ctx,
  cv: cv,
  /* const-declared helpers: real functions, but arrow consts, so unlike the
     function declarations above they never reach globalThis on their own. */
  fmtArea: fmtArea,
  uid: uid,
  clone: clone,
  rectPts: rectPts,
  idFolder: idFolder,
  idLeaf: idLeaf,
  hasOpen: hasOpen,
  pickValues: pickValues,
  fileSlug: fileSlug,
  snapRoom: snapRoom,
  PAL: PAL,
  CANVAS: CANVAS,
  L: L,
  RP: RP,
  roomMode: roomMode,
  floorMode: floorMode,
  /* undo/redo. Room edits and item edits have separate per-layout stacks, and
     every one of these entry points is an arrow const too. */
  commitRoom: commitRoom,
  commitFurn: commitFurn,
  undoRoom: undoRoom,
  redoRoom: redoRoom,
  undoFurn: undoFurn,
  redoFurn: redoFurn,
  undoFloor: undoFloor,
  redoFloor: redoFloor
};
${GLOBALS.map((n) => `try{ globalThis.${n} = ${n}; }catch(e){}`).join('\n')}
`;

/* A binding that has moved into src/ is no longer in index.html's scope, so it
 * cannot be captured here — MM and BARE left with core/units.js. That is not a
 * loss: a module's own exports are reachable the ordinary way, by importing the
 * module from the test. Capture here is only for what is still closure-scoped
 * inside index.html, and this list shrinks as Phase 3 proceeds.
 */

/** Append the epilogue to a full index.html source string, in memory. */
export function injectEpilogue(html) {
  const close = html.lastIndexOf('</script>');
  if (close < 0) throw new Error('injectEpilogue: no </script> found');
  return html.slice(0, close) + EPILOGUE + html.slice(close);
}
