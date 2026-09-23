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

export const EPILOGUE = `
;globalThis.__rp = {
  get S(){ return S; },        set S(v){ S = v; },
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
  MM: MM,
  BARE: BARE,
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
`;

/** Append the epilogue to a full index.html source string, in memory. */
export function injectEpilogue(html) {
  const close = html.lastIndexOf('</script>');
  if (close < 0) throw new Error('injectEpilogue: no </script> found');
  return html.slice(0, close) + EPILOGUE + html.slice(close);
}
