/* Undo / redo: the three history stacks and everything that writes to them.

   Extracted from index.html in Phase 3, move-only: the three chunks below are
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   The region splits, and the seam is the same one the plan predicted. What
   *records* history needs nothing but S and the layout accessors, so it is
   here. What *replays* it — applyRoomSnap, applyFurnSnap, applyFloorSnap and
   the six undo/redo entry points that call them — repaints the side panels
   through renderRoom/renderWalls/renderRoomSel/renderOpen/renderInv/renderSel/
   renderFloorSel, and those are still in index.html, inside the plan/library
   cycle described in .claude/plans/refactor-split.md. So they stayed, and they
   import the recording half back.
*/
import {L, roomMode, floorMode, floorLayouts} from './state.js';
import {$} from '../ui/modal.js';

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

function updateHistButtons(){
  const btnU=$('btnUndo'), btnR=$('btnRedo'); if(!btnU) return;
  if(floorMode()){
    const h=floorEntry();
    btnU.disabled = !h || h.idx<=0;
    btnR.disabled = !h || h.idx>=h.stack.length-1;
    return;
  }
  const h = roomMode() ? histEntry(roomHist,snapRoom) : histEntry(furnHist,snapFurn);
  btnU.disabled = h.idx<=0;
  btnR.disabled = h.idx>=h.stack.length-1;
}

export {roomHist, furnHist, snapRoom, snapFurn, histEntry, seedHistFor, commit,
        bumpRev, commitRoom, commitFurn, stepHist,
        floorHist, curFloorId, snapFloor, floorEntry, commitFloor,
        updateHistButtons};
