/* The capture epilogue — Suite B's only way into the app's internals.
 *
 * index.html's one <script> is a Vite entry, `type="module"`, so it has its own
 * scope: its top-level `let`/`const` bindings and its `function` declarations
 * are unreachable from a test no matter how hard you poke. This snippet is
 * APPENDED to an in-memory copy of that script (by vite.config.js, under
 * `--mode instrumented`) so the handful of names the suite needs become
 * reachable on `window.__rp` and on the global object.
 *
 * Appended, never prepended: "use strict" has to stay the first statement of
 * the script or the whole app silently changes semantics.
 *
 * index.html itself is never written to. Only the copy Vite builds is rewritten.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES, both learned the hard way. Read test/README.md before editing.
 *
 * 1. **`__rp` is not linted.** ESLint lints index.html on its own and never
 *    sees this file appended to it. When the last index.html reader of an
 *    `__rp` name moves into src/, the app throws a bare ReferenceError during
 *    *module evaluation* — with a green build and a green browser.
 * 2. **`GLOBALS` fails silently.** It assigns inside a try/catch, so a name
 *    that has left index.html's scope simply stops being on `window`, and you
 *    find out much later as `window.foo is not a function`.
 *
 * So: after any move, check every name below is still declared or imported in
 * index.html — or import it here, which is strictly better and is what the
 * imports below do.
 */

/* Entry points the suite calls as `window.foo(...)`. */
const GLOBALS = [
  'draw', 'fit', 'save', 'setMode', 'startCustomDraw',
  'exportPayload', 'readImport', 'applyImport',
  'polySimple', 'bpRebuild',
];

/* A binding that has moved into src/ is out of index.html's scope, so it cannot
 * be named directly any more. This text is appended INSIDE the app's own
 * module, so a bare `import` resolves exactly as index.html's own do (and
 * hoists, so "use strict" keeps its place). Importing here is preferred over
 * importing a name back into index.html just to keep the epilogue fed.
 */
export const EPILOGUE = `
;import {alignGuides, alignNote} from './src/core/selection.js';
;import {exportPayload} from './src/io/export.js';
;import {applyImport} from './src/io/import.js';
;import {polySimple} from './src/core/geometry.js';
;import {bpState} from './src/blueprint/state.js';
;import {bpRebuild} from './src/blueprint/draft.js';
;globalThis.__rp = {
  get S(){ return S; },
  get view(){ return view; },
  /* The guide readouts, reassigned from all over the interaction region and
     cleared again by endDrag() — so the only way to see them is to look while
     the pointer is still down. */
  get alignGuides(){ return alignGuides; },
  get alignNote(){ return alignNote; },
  /* drag says whether the deadzone has armed yet. */
  get drag(){ return drag; },
  get bpState(){ return bpState; },
  RP: RP,
  /* undo/redo. Room edits and item edits have separate per-layout stacks. */
  commitRoom: commitRoom,
  commitFurn: commitFurn,
  undoRoom: undoRoom,
  redoRoom: redoRoom,
  undoFurn: undoFurn,
  redoFurn: redoFurn
};
${GLOBALS.map((n) => `try{ globalThis.${n} = ${n}; }catch(e){}`).join('\n')}
`;

/** Append the epilogue to a full index.html source string, in memory. */
export function injectEpilogue(html) {
  const close = html.lastIndexOf('</script>');
  if (close < 0) throw new Error('injectEpilogue: no </script> found');
  return html.slice(0, close) + EPILOGUE + html.slice(close);
}
