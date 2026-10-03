/* The capture epilogue — Suite B's only way into the app's internals.
 *
 * index.html's one <script> is a Vite entry, `type="module"`, so it has its own
 * scope: its top-level bindings are unreachable from a test no matter how hard
 * you poke. This snippet is APPENDED to an in-memory copy of that script (by
 * vite.config.js, under `--mode instrumented`) so the handful of names the
 * suite needs become reachable on `window.__rp` and on the global object.
 * Appended, never prepended: "use strict" has to stay the first statement or
 * the app silently changes semantics. index.html itself is never written to.
 *
 * TWO RULES, both learned the hard way (test/README.md has the long version):
 * **`__rp` is not linted** — ESLint never sees this file appended to
 * index.html, so when the last index.html reader of an `__rp` name moves into
 * src/, the app throws a bare ReferenceError during *module evaluation*, with
 * a green build and a green browser. And **`GLOBALS` fails silently** — it
 * assigns inside a try/catch, so such a name just stops being on `window` and
 * surfaces much later as `window.foo is not a function`.
 *
 * So after any move, check every name below is still declared or imported in
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
;import {alignGuides, alignNote} from './src/kernel/selection.js';
/* S, and the four GLOBALS entries draw/fit/save/setMode, were last read by the
 * left-hand pane — the layout tree and the inventory list — and went with it.
 * index.html now imports nothing the app's own listeners do not need. */
;import {S} from './src/kernel/state.js';
;import {save} from './src/kernel/store.js';
;import {draw} from './src/features/canvas/draw.js';
;import {fit} from './src/features/canvas/camera.js';
;import {setMode} from './src/features/mode/mode.js';
/* view left index.html's scope when onCanvasPointerDown moved into
 * canvas/interaction.js — it was the shell's last reader. */
;import {view} from './src/features/canvas/view.js';
/* commitFurn's last shell reader was the arrow-key nudge, which moved into
 * plan/shortcuts.js. */
;import {commitFurn} from './src/kernel/history.js';
/* The four undo/redo entry points were last read by the stage's toolbar and
 * went with it; the room tool's drag lives in its own module. All five are
 * __rp members. */
;import {roomDrag} from './src/features/room/room-tool.js';
;import {undoRoom, redoRoom, undoFurn, redoFurn} from './src/kernel/history.js';
;import {exportPayload} from './src/features/io/export.js';
/* readImport's last shell reader was the #fileIn change handler, which moved
 * into bind/header.js when the header's wiring went to its partial. It was in
 * GLOBALS, where a missing name fails silently inside a try/catch — the
 * round-trip spec went red and lint said nothing, which is rule 2 exactly. */
;import {applyImport, readImport} from './src/features/io/import.js';
/* RP, commitRoom and startCustomDraw all left the shell with the right-hand
 * Room pane's wiring — the outline presets and the colour/trim controls were
 * their last readers there. RP and commitRoom are __rp getters, which fail
 * loudly; startCustomDraw is a GLOBALS entry, which does not. */
;import {RP} from './src/kernel/state.js';
;import {commitRoom} from './src/kernel/history.js';
;import {startCustomDraw} from './src/features/room/room-draw.js';
;import {polySimple} from './src/kernel/geometry.js';
;import {bpState} from './src/features/blueprint/state.js';
;import {bpRebuild} from './src/features/blueprint/draft.js';
;globalThis.__rp = {
  get S(){ return S; },
  get view(){ return view; },
  /* The guide readouts, set by the tools mid-gesture and cleared again on
     pointerup — so the only way to see them is to look while the pointer is
     still down. */
  get alignGuides(){ return alignGuides.value; },
  get alignNote(){ return alignNote.value; },
  /* The room tool's drag in flight: whether the deadzone has armed yet, and
     the snapshot Escape would restore. */
  get drag(){ return roomDrag.value; },
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
