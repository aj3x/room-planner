/* Undo / redo: the three history stacks and everything that writes to them.

   Recording needs nothing but S and the layout accessors. Replaying puts a
   snapshot back and says which scope it restored, by bumping that scope's
   revision signal (kernel/signals.js) — the same notification a transact()
   gives. Whatever shows the room, the furniture or the floor arrangement is
   an effect on that signal and repaints itself; this module names no view.

   `histRev` moves whenever a stack or its position changes, so the undo/redo
   buttons (features/mode/mode.js) can subscribe to whether there is anywhere to go. A
   unit test that imports this module without mounting any view gets working
   undo with nothing repainted, which is exactly what a headless undo should
   do. */
import {L, roomMode, floorMode, floorLayouts} from './state.js';
import {batch, bump, signal} from './signals.js';
import {selectClear, roomSel} from './selection.js';
import {S} from './state.js';
import {save} from './store.js';

/* ------------------------- undo / redo -------------------------
   Room edits (walls, doors, windows, floor/trim) and Things edits (placed
   furniture on the canvas) get their own history, kept per layout. Each
   layout's history is seeded with a pristine baseline (before any edits)
   the moment it becomes active, so undo can always get back to "untouched". */
const roomHist={}, furnHist={};
const histRev = signal(0);
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
  histMoved();
}
const bumpRev = () => { const l=L(); l._rev=(l._rev||0)+1; };
/* App code records history through transact() (kernel/tx.js), never these two
   directly; they stay exported because the e2e harness (test/epilogue.js)
   commits through them after editing S by hand. */
const commitRoom = () => { commit(roomHist,snapRoom); bumpRev(); bump(['room'], true); };
const commitFurn = () => { commit(furnHist,snapFurn); bumpRev(); bump(['furn'], true); };
function stepHist(map,snapFn,applyFn,dir){
  const h=histEntry(map,snapFn);
  const ni=h.idx+dir;
  if(ni<0||ni>=h.stack.length) return;
  h.idx=ni; applyFn(JSON.parse(h.stack[ni]));
  histMoved();
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
  histMoved();
}

/* Whether undo and redo have anywhere to go, for whichever mode is current. */
function histAvail(){
  if(floorMode()){
    const h=floorEntry();
    return {canUndo: !!h && h.idx>0, canRedo: !!h && h.idx<h.stack.length-1};
  }
  const h = roomMode() ? histEntry(roomHist,snapRoom) : histEntry(furnHist,snapFurn);
  return {canUndo: h.idx>0, canRedo: h.idx<h.stack.length-1};
}
function histMoved(){ histRev.value++; }


function applyRoomSnap(s){
  batch(()=>{ L().room=s.room; L().openings=s.openings; roomSel.value = null; bumpRev(); bump(['room'], true); });
  save();
}
function applyFurnSnap(s){
  batch(()=>{ L().placed=s.placed; selectClear(); bumpRev(); bump(['furn'], true); });
  save();
}
const undoRoom=()=>stepHist(roomHist,snapRoom,applyRoomSnap,-1);
const redoRoom=()=>stepHist(roomHist,snapRoom,applyRoomSnap,1);
const undoFurn=()=>stepHist(furnHist,snapFurn,applyFurnSnap,-1);
const redoFurn=()=>stepHist(furnHist,snapFurn,applyFurnSnap,1);
function applyFloorSnap(s){
  for(const [id,place] of s){ const l=S.layouts.find(x=>x.id===id); if(l) l.floorPlace=place; }
  bump(['floor'], true); save();
}
function stepFloor(dir){
  const h=floorEntry(); if(!h) return;
  const ni=h.idx+dir;
  if(ni<0||ni>=h.stack.length) return;
  h.idx=ni; applyFloorSnap(JSON.parse(h.stack[ni]));
  histMoved();
}
const undoFloor=()=>stepFloor(-1);
const redoFloor=()=>stepFloor(1);
export {histRev, roomHist, furnHist, snapRoom, snapFurn, histEntry, seedHistFor, commit, bumpRev, commitRoom, commitFurn, stepHist, floorHist, curFloorId, snapFloor, floorEntry, commitFloor, histAvail, applyRoomSnap, applyFurnSnap, undoRoom, redoRoom, undoFurn, redoFurn, applyFloorSnap, stepFloor, undoFloor, redoFloor};
