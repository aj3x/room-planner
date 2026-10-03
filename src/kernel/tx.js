/* transact(): the one place a change to the document is committed.

   An edit names the part of the document it touches and hands over the change
   itself, instead of each call site remembering which history stack, save and
   redraw it owes, and in what order:

     transact('room', () => { wall.t = v; });

   and this module does the rest, in a fixed order:
     1. run fn() against live state (its return value is transact's);
     2. record the matching undo stack — room, furn or floor — unless
        opts.history === false; lib, prefs and project have no stack;
     3. bump the active layout's revision, which keys the derived caches
        (kernel/validity.js getConflicts, features/walkpaths/walkpaths.js) — for the scopes
        that can change what those caches read (REV_SCOPES below);
     4. save() (debounced, in kernel/store.js);
     5. bump the revision signal of every scope touched (kernel/signals.js),
        once, and planRev — the canvas's — unless every call for the commit
        passed opts.canvas === false, because the plan does not show it (a
        list filter, a collapsed section). Whatever shows that scope is an
        effect reading its signal and repaints itself; this module names no
        view, and a test that never mounts one gets the commit with no
        drawing.

   fn may be omitted when the edit has already happened live — the colour
   picker previews on every `input` and commits with a bare transact('room')
   on `change`.

   The whole call runs inside one signals batch, so an effect never sees a
   half-made edit: selection writes inside fn() and the revision bumps are
   delivered together when the outermost transact returns.

   Nesting. A transact inside another one's fn() records its scope and returns;
   the outermost call commits every scope touched, once. So a helper that
   transacts on its own can be called from a larger edit without splitting the
   user's one action into two undo steps. If fn() throws, nothing is committed
   and the error propagates.

   Gestures. A pointermove frame is not an undo step and is not worth a write
   to storage: it goes through preview(scope, fn), which bumps the revisions
   (so the canvas and the panels follow) but neither records history nor
   saves. The pointerup that ends the gesture calls transact() once, which is
   what makes one gesture one undo step. */

import {bumpRev, commit, commitFloor, furnHist, roomHist, snapFurn, snapRoom} from './history.js';
import {L} from './state.js';
import {SCOPES, batch, bump} from './signals.js';
import {save} from './store.js';

const RECORD = {
  room:  () => commit(roomHist, snapRoom),
  furn:  () => commit(furnHist, snapFurn),
  floor: () => commitFloor(),
};

/* What reads the layout revision: getConflicts (kernel/validity.js) and
   walkGrid (features/walkpaths/walkpaths.js), both keyed on the active layout's own
   geometry and on the footprints of the items placed in it. room and furn
   edit that directly; lib can reshape an item already placed (the item
   dialog, "Take theirs") without changing any count in the key; project can
   put a layout's geometry back under the same id (split/merge undo, import).
   floor only moves rooms relative to each other, and prefs are view settings,
   so neither can stale those caches. */
const REV_SCOPES = new Set(['room','furn','lib','project']);

let depth = 0;
let pending = new Map();   // scope -> {hist, canvas}: whether any call for it wanted each

function check(scope){
  if(!SCOPES.includes(scope)) throw new Error('transact: unknown scope '+scope);
}

function transact(scope, fn, opts){
  check(scope);
  return batch(() => run(scope, fn, opts));
}
function run(scope, fn, opts){
  const p = pending.get(scope) || {hist:false, canvas:false};
  p.hist = p.hist || !(opts && opts.history===false);
  p.canvas = p.canvas || !(opts && opts.canvas===false);
  pending.set(scope, p);
  depth++;
  let out, ok=false;
  try{ out = fn ? fn() : undefined; ok=true; }
  finally{
    depth--;
    if(depth===0){
      const done = pending; pending = new Map();
      if(ok) finish(done);
    }
  }
  return out;
}

function finish(done){
  for(const [scope, p] of done) if(p.hist && RECORD[scope]) RECORD[scope]();
  if(L() && [...done.keys()].some(s=>REV_SCOPES.has(s))) bumpRev();
  save();
  bump([...done.keys()], [...done.values()].some(p => p.canvas));
}

/* One frame of a gesture: live state changes, the canvas follows, nothing is
   recorded or saved. The gesture's pointerup is what commits. */
function preview(scope, fn){
  check(scope);
  return batch(() => {
    const out = fn ? fn() : undefined;
    if(L() && REV_SCOPES.has(scope)) bumpRev();
    bump([scope], true);
    return out;
  });
}

export {SCOPES, transact, preview};
