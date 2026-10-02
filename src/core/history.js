/* Undo / redo: the three history stacks and everything that writes to them.

   Extracted from index.html in Phase 3, move-only: the three chunks below are
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   The region splits, and the seam is the same one the plan predicted. What
   *records* history needs nothing but S and the layout accessors. What
   *replays* it — applyRoomSnap, applyFurnSnap, applyFloorSnap — has to put the
   restored state back on screen, and that used to mean importing six render
   functions out of plan/ and canvas/ from inside core/. It was the single
   worst edge in the repo: the undo stack depended on the shape of the side
   panels, and it welded core/ into the 45-module tangle.

   So replaying now announces what it restored and lets somebody else repaint.
   The three `repaint.*` names below, and `repaint.histAvail`, are looked up
   through core/registry.js and provided by boot.js. This file imports nothing
   outside core/ (.claude/plans/decoupling.md §4, step 2).

   The hooks are optional by design: a unit test that imports this module
   without running boot() gets working undo with no repaint, which is exactly
   what a headless undo should do.
*/
import {L, roomMode, floorMode, floorLayouts} from './state.js';
import {use} from './registry.js';
import {selectClear, roomSel} from './selection.js';
import {S} from './state.js';
import {save} from './store.js';

/* ------------------------- undo / redo -------------------------
   Room edits (walls, doors, windows, floor/trim) and Things edits (placed
   furniture on the canvas) get their own history, kept per layout. Each
   layout's history is seeded with a pristine baseline (before any edits)
   the moment it becomes active, so undo can always get back to "untouched". */
const roomHist={}, furnHist={};
const snapRoom = () => JSON.stringify({room:L().room, openings:L().openings});
const snapFurn = () => JSON.stringify({placed:L().placed});
function histEntry(map,snapFn){ const id=L().id; if(!map[id]) map[id]={stack:[snapFn()], idx:0}; return map[id]; }
function seedHistFor(){ histEntry(roomHist,snapRoom); histEntry(furnHist,snapFurn); floorEntry(); }
function commit(map,snapFn){
  const h=histEntry(map,snapFn);
  const s=snapFn();
  if(h.stack[h.idx]===s) return;
  h.stack=h.stack.slice(0,h.idx+1); h.stack.push(s);
  if(h.stack.length>80) h.stack.shift();
  h.idx=h.stack.length-1;
  updateHistButtons();
}
const bumpRev = () => { const l=L(); l._rev=(l._rev||0)+1; };
/* App code records history through transact() (core/tx.js), never these two
   directly; they stay exported because the e2e harness (test/epilogue.js)
   commits through them after editing S by hand. */
const commitRoom = () => { commit(roomHist,snapRoom); bumpRev(); };
const commitFurn = () => { commit(furnHist,snapFurn); bumpRev(); };
function stepHist(map,snapFn,applyFn,dir){
  const h=histEntry(map,snapFn);
  const ni=h.idx+dir;
  if(ni<0||ni>=h.stack.length) return;
  h.idx=ni; applyFn(JSON.parse(h.stack[ni]));
  updateHistButtons();
}

/* An arrangement is the floor's own history, keyed by floor, not by room: moving one
   room changes the floor. It is deliberately NOT folded into snapRoom, whose
   {room,openings} snapshot belongs to Room mode — sharing one stack would make a
   wall edit and a floor move undo each other. */
const floorHist={};
const curFloorId = () => (L() && L().floorId) || null;
const snapFloor = () => JSON.stringify(floorLayouts(curFloorId()).map(l=>[l.id, l.floorPlace]));
function floorEntry(){
  const id=curFloorId(); if(!id) return null;
  if(!floorHist[id]) floorHist[id]={stack:[snapFloor()], idx:0};
  return floorHist[id];
}
function commitFloor(){
  const h=floorEntry(); if(!h) return;
  const s=snapFloor();
  if(h.stack[h.idx]===s) return;
  h.stack=h.stack.slice(0,h.idx+1); h.stack.push(s);
  if(h.stack.length>80) h.stack.shift();
  h.idx=h.stack.length-1;
  updateHistButtons();
}

/* Whether undo and redo have anywhere to go, for whichever mode is current.
   Pure, and the only part of the old updateHistButtons that was ever history's
   business; the two `disabled` assignments it used to make are now boot.js's. */
function histAvail(){
  if(floorMode()){
    const h=floorEntry();
    return {canUndo: !!h && h.idx>0, canRedo: !!h && h.idx<h.stack.length-1};
  }
  const h = roomMode() ? histEntry(roomHist,snapRoom) : histEntry(furnHist,snapFurn);
  return {canUndo: h.idx>0, canRedo: h.idx<h.stack.length-1};
}
function updateHistButtons(){ use('repaint.histAvail')?.(histAvail()); }


/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function applyRoomSnap(s){
  L().room=s.room; L().openings=s.openings; roomSel.value = null; bumpRev();
  use('repaint.afterRoomRestore')?.(); save();
}
function applyFurnSnap(s){
  L().placed=s.placed; selectClear(); bumpRev();
  use('repaint.afterFurnRestore')?.(); save();
}
const undoRoom=()=>stepHist(roomHist,snapRoom,applyRoomSnap,-1);
const redoRoom=()=>stepHist(roomHist,snapRoom,applyRoomSnap,1);
const undoFurn=()=>stepHist(furnHist,snapFurn,applyFurnSnap,-1);
const redoFurn=()=>stepHist(furnHist,snapFurn,applyFurnSnap,1);
function applyFloorSnap(s){
  for(const [id,place] of s){ const l=S.layouts.find(x=>x.id===id); if(l) l.floorPlace=place; }
  use('repaint.afterFloorRestore')?.(); save();
}
function stepFloor(dir){
  const h=floorEntry(); if(!h) return;
  const ni=h.idx+dir;
  if(ni<0||ni>=h.stack.length) return;
  h.idx=ni; applyFloorSnap(JSON.parse(h.stack[ni]));
  updateHistButtons();
}
const undoFloor=()=>stepFloor(-1);
const redoFloor=()=>stepFloor(1);
export {roomHist, furnHist, snapRoom, snapFurn, histEntry, seedHistFor, commit, bumpRev, commitRoom, commitFurn, stepHist, floorHist, curFloorId, snapFloor, floorEntry, commitFloor, histAvail, updateHistButtons, applyRoomSnap, applyFurnSnap, undoRoom, redoRoom, undoFurn, redoFurn, applyFloorSnap, stepFloor, undoFloor, redoFloor};
