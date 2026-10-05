/* The capture epilogue — Suite B's only way into the app's internals.
 *
 * index.html's <script> is a Vite entry, `type="module"`, so its scope is
 * unreachable from a test. Under `--mode instrumented`, vite.config.js appends
 * this text to an in-memory copy of that script, so the names below land on
 * `window.__rp` and on the global object. Appended, never prepended: "use
 * strict" stays the first statement. index.html itself is never written to.
 *
 * It imports every name it exposes, straight from the module that defines it.
 * **This file is not linted** as part of the app: ESLint lints index.html on
 * its own and never sees the epilogue appended to it. A path or name here that
 * no longer matches src/ breaks only the instrumented build — lint, the unit
 * tests and `npm run build` stay green, and every Suite B test fails with no
 * `__rp`. After moving or renaming anything named below, fix it here.
 */

/* Entry points the suite calls as `window.foo(...)`. Each assignment is in a
 * try/catch, so check the name is imported below. */
const GLOBALS = [
  'draw', 'fit', 'save', 'setMode', 'startCustomDraw',
  'exportPayload', 'readImport', 'applyImport',
  'polySimple', 'bpRebuild',
];

/* Appended INSIDE the app's own module, so a bare `import` resolves exactly as
 * index.html's own do (and hoists, so "use strict" keeps its place). */
export const EPILOGUE = `
;import {alignGuides, alignNote} from './src/kernel/selection.js';
;import {S, RP} from './src/kernel/state.js';
;import {save} from './src/kernel/store.js';
;import {commitRoom, commitFurn, undoRoom, redoRoom, undoFurn, redoFurn} from './src/kernel/history.js';
;import {polySimple} from './src/kernel/geometry.js';
;import {draw} from './src/features/canvas/draw.js';
;import {fit} from './src/features/canvas/camera.js';
;import {view} from './src/features/canvas/view.js';
;import {setMode} from './src/features/mode/mode.js';
;import {roomDrag} from './src/features/room/room-tool.js';
;import {startCustomDraw} from './src/features/room/room-draw.js';
;import {exportPayload} from './src/features/io/export.js';
;import {applyImport, readImport} from './src/features/io/import.js';
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
