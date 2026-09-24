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
  /* Phase 3.6: the side-panel characterization drives a state change and then
     needs the panels rebuilt the way the app rebuilds them. renderAll() is
     that one entry point -- it is what every acting listener in the panel
     region calls. */
  'renderAll',
  /* the app's own selection entry points -- renderSel reads both `sel` and
     `selSet`, so a test cannot set up a selection by poking one of them. */
  'selectOnly', 'selectSet', 'selectClear',
  /* the Library half of the same SCC: renderLibAll is what setMode() and
     itemDialog() call, and what every acting library listener calls. */
  'renderLibAll',
  'startWallDraw', 'startSplitRoom', 'setMeasure', 'activateLayout',
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
;import {alignGuides, alignNote, floorGuides, floorSnapNote} from './src/core/selection.js';
;import {drawCursor} from './src/canvas/interaction-state.js';
/* ctx left index.html's scope with resize()/fitBBox(): index.html still uses
   cv, but nothing in it reads ctx any more, so importing it back there would
   be an unused import. __rp.ctx is what visual.spec.js reads the recording
   context through, so it comes in here the CANVAS way. */
;import {ctx} from './src/canvas/view.js';
/* swingPoly is in GLOBALS below, and index.html stopped referencing it when
   draw() took drawOpening into canvas/draw.js. GLOBALS assigns inside a
   try/catch, so a name that has left scope fails SILENTLY and surfaces only as
   "window.swingPoly is not a function" in visual.spec.js -- which is exactly
   what it did. Import it here, the CANVAS way. */
;import {swingPoly} from './src/model/openings.js';
/* exportPayload is in GLOBALS below and left index.html's scope with the
   Export dialog -- savePlanImage was its last reader there. GLOBALS assigns
   inside a try/catch, so it would have gone missing silently. Import it the
   CANVAS way. */
;import {exportPayload} from './src/io/export.js';
/* The SCC commit took the last index.html readers of these four with it:
   idFolder/idLeaf went with itemDialog and the library menus, hasOpen with
   itemDialog's open-footprint fields, fileSlug with libItemMenu. __rp still
   hands all four to the unit suite, and __rp is NOT linted -- eslint never
   sees this file appended to index.html -- so they failed at boot with a bare
   ReferenceError: idFolder is not defined and 69 red tests. Import them the
   CANVAS way. */
;import {idFolder, idLeaf} from './src/core/ids.js';
;import {hasOpen} from './src/core/open-state.js';
;import {fileSlug} from './src/io/pickers.js';
/* Same again for the io/ round's tail: applyImport (GLOBALS) left with
   importDialog, and PREF_KEYS (__rp) with the Export dialog. */
;import {applyImport} from './src/io/import.js';
;import {PREF_KEYS} from './src/io/export.js';
;import {INV_SCOPES} from './src/core/floor-space.js';
;import {normItem} from './src/core/migrate.js';
;import {pickValues} from './src/io/pickers.js';
;import {clone} from './src/core/state.js';
/* The blueprint round's turn. bpCommit and bpSeedHistory were index.html's
   last readers of all five: roomHist/furnHist/snapRoom (__rp), normLayout and
   polySimple (GLOBALS). polySimple is the dangerous half of that list -- it is
   a GLOBALS entry, and GLOBALS assigns inside a try/catch, so it would have
   gone missing silently rather than failing at boot. Import them the CANVAS
   way. */
;import {roomHist, furnHist, snapRoom} from './src/core/history.js';
;import {polySimple} from './src/core/geometry.js';
;import {normLayout} from './src/core/migrate.js';
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
  get measureStart(){ return measureStart; },
  get measureSel(){ return measureSel; },
  /* The guide readouts. Four of the ten selection lets, reassigned from all
     over the interaction region and cleared again by endDrag(), so the only
     way to see them is to look while the pointer is still down. Nothing
     asserted them until Phase 3.5's pointer suite. */
  get alignGuides(){ return alignGuides; },
  get alignNote(){ return alignNote; },
  get floorGuides(){ return floorGuides; },
  get floorSnapNote(){ return floorSnapNote; },
  /* The interaction lets draw() reads. drag is the one that says whether the
     deadzone has armed yet. */
  get drag(){ return drag; },
  get drawState(){ return drawState; },
  get drawCursor(){ return drawCursor; },
  get wallDrawState(){ return wallDrawState; },
  get splitDrawState(){ return splitDrawState; },
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
