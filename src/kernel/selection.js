// @ts-check
/* The selection: what is picked, what is marked, and what the guide readout
   says. Each is a signal (kernel/signals.js), so whatever shows it — the canvas,
   the Selection panels, the layout tree — subscribes by reading `.value`, and
   whoever changes it writes `.value` and names no view.

   They live here rather than in kernel/state.js because they are not part of the
   saved project — S is what `save()` serialises, and none of this is.

   The Set-valued ones (selSet, mergeSel, treeOpen) are replaced, never mutated
   in place: a signal notifies on assignment, and `selSet.value.add(id)` would
   change the set behind every reader's back with nobody told. Use the helpers
   below, which build a new Set. */

import {batch, signal} from './signals.js';

/** @typedef {import('@preact/signals-core').Signal<Set<string>>} IdSet */
/** @type {IdSet} */
const selSet = signal(new Set());   // placed furniture ids (multi-select), source of truth
/** @type {import('@preact/signals-core').Signal<string|null>} */
const sel = signal(null);           // last-added/primary placed furniture id; null when selSet is empty
/** @type {import('@preact/signals-core').Signal<import('./types.js').RoomSel|null>} */
const roomSel = signal(null);       // {kind:'wall'|'corner', i} / {kind:'opening'|'pillar'|'iwall', id}
/** @type {import('@preact/signals-core').Signal<string|null>} */
const floorSel = signal(null);      // id of the room picked up in Floor mode
/** @type {IdSet} */
const mergeSel = signal(new Set()); // up to 2 layout ids marked for merge/delete (Floor canvas + room list, shift+click)
/** @type {import('@preact/signals-core').Signal<import('./types.js').Seg[]>} */
const floorGuides = signal([]);     // edges a dragged room is currently lining up with
const floorSnapNote = signal('');   // what that alignment is, shown while dragging
/** @type {import('@preact/signals-core').Signal<import('./types.js').Seg[]>} */
const alignGuides = signal([]);     // lines a dragged corner is currently latched onto
const alignNote = signal('');       // what that alignment is, shown in the readout
/** @type {IdSet} */
const treeOpen = signal(new Set()); // expanded folder and floor ids in the layout tree

/* sel and selSet always move together, so each helper writes both in one
   batch and a subscriber sees them agree. */
/** @param {string|null|undefined} id */
function selectOnly(id){ batch(()=>{ selSet.value = new Set(id?[id]:[]); sel.value = id||null; }); }
/** @param {string} id */
function selectAdd(id){ batch(()=>{ selSet.value = new Set([...selSet.value, id]); sel.value = id; }); }
/** @param {string} id */
function selectToggle(id){
  if(!selSet.value.has(id)) return selectAdd(id);
  const s = new Set(selSet.value); s.delete(id);
  batch(()=>{ selSet.value = s; sel.value = [...s].pop()||null; });
}
/** @param {string[]} ids */
function selectSet(ids){ batch(()=>{ selSet.value = new Set(ids); sel.value = ids.length ? ids[ids.length-1] : null; }); }
function selectClear(){ if(selSet.value.size || sel.value!==null) batch(()=>{ selSet.value = new Set(); sel.value = null; }); }

/* Shift+click marking for merge/delete: toggles `id`, keeping at most the two
   most recent. */
/** @param {string} id */
function mergeToggle(id){
  const s = new Set(mergeSel.value);
  if(s.has(id)) s.delete(id); else s.add(id);
  while(s.size>2) s.delete(/** @type {string} */(s.values().next().value));   // size>2: there is a first
  mergeSel.value = s;
}
/** @param {string} id */
function mergeOnly(id){ mergeSel.value = new Set([id]); }
function mergeClear(){ if(mergeSel.value.size) mergeSel.value = new Set(); }

/** @param {string} id */
function treeExpand(id){ if(!treeOpen.value.has(id)) treeOpen.value = new Set([...treeOpen.value, id]); }
/** @param {...string} ids */
function treeCollapse(...ids){
  if(!ids.some(id => treeOpen.value.has(id))) return;
  const s = new Set(treeOpen.value); for(const id of ids) s.delete(id);
  treeOpen.value = s;
}
/** @param {string} id */
function treeToggle(id){ if(treeOpen.value.has(id)) treeCollapse(id); else treeExpand(id); }

export {sel, selSet, roomSel, floorSel, mergeSel,
        floorGuides, floorSnapNote, alignGuides, alignNote, treeOpen,
        selectOnly, selectAdd, selectToggle, selectSet, selectClear,
        mergeToggle, mergeOnly, mergeClear, treeExpand, treeCollapse, treeToggle};
