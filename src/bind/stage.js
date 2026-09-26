/* The stage's wiring: everything that listens to the canvas itself, plus the
   toolbars that sit on it — the Room|Furniture mode switch, the measure and
   shortcuts buttons, the measure bar, and undo/redo/zoom/fit.

   One of the per-pane bind modules; src/bind/header.js carries the full
   rationale for the pattern. The short version: each src/html/ partial ends
   with a module script that imports its bind function and calls it, so a pane's
   markup and the list of things listening to it sit in the same file, and it is
   a function rather than registrations at import time because nothing in src/
   may have a top-level side effect.

   Ordering: cv carries nine of these eighteen and they are all here, in
   index.html's order, which is the only thing registration order can decide.
   Every one is a different event type, so nothing depends on it today — keep
   the order anyway, because that is what makes the claim checkable. The
   edgePanTick() call that stood between cv's pointermove and pointerup stays
   in index.html: it starts a rAF loop rather than registering anything, and
   when it starts relative to these is not observable.

   The two long explanatory comments — the measuring model, and how a room's
   dividing line is drawn — came with the code they explain rather than staying
   behind in a shell that no longer contains their readers. */

import { S, L, roomMode, floorMode } from '../core/state.js';
import { mergeSel } from '../core/selection.js';
import { save } from '../core/store.js';
import { undoRoom, redoRoom, undoFurn, redoFurn, undoFloor, redoFloor } from '../core/history.js';
import { $, askConfirm, showShortcuts } from '../ui/modal.js';
import { menuAtPoint } from '../ui/menu.js';
import { cv, W, H, fit, zoomAt } from '../canvas/view.js';
import { drag, drawState, wallDrawState, splitDrawState, setDrag } from '../canvas/interaction-state.js';
import { lastPX, lastPY, lastMods, setLastPX, setLastPY, setLastMods, onCanvasPointerDown, applyDragAt, endDrag, ZOOM_FACTOR, ZOOM_ACCEL_K, wheelState } from '../canvas/interaction.js';
import { applyDrawCursorAt } from '../canvas/room-draw.js';
import { startSplitRoom } from '../canvas/split-room.js';
import { draw, scheduleDraw, pickFloorRoom } from '../canvas/draw.js';
import { pickRoom } from '../canvas/snap.js';
import { measureOn, measureSel, setMeasureHover, setMeasureHoverId, setMeasureCursor } from '../canvas/measure-state.js';
import { liveMeasures, renderMeasureBar, setMeasure, resetMeasureState, removeMeasure, measureHoverAt } from '../canvas/measure-tool.js';
import { renderAll, setMode } from '../plan/mode.js';
import { renderTree, activateLayout } from '../plan/layout-tree.js';
import { wallDialog } from '../plan/room-panel.js';
import { renderFloorSel, openFloorMergeMenu } from '../plan/floors.js';

function bindStage(){
  cv.addEventListener('mousemove', e=>{
    if(!drawState && !wallDrawState && !splitDrawState) return;
    setLastPX(e.offsetX); setLastPY(e.offsetY); setLastMods({shiftKey:e.shiftKey,altKey:e.altKey});
    applyDrawCursorAt(lastPX,lastPY,e.shiftKey);
  });

  /* ------------------------- measuring -------------------------
     A measurement joins two anchors and shows the shortest distance between them.
     An anchor is part of something on the plan — an item, pillar, interior wall, door or
     window, or a room wall:
       corner  a point;
       side    one edge of a footprint;
       whole   the footprint itself (solid, so anything overlapping it is 0 away), or for a
               door, window or room wall the span of its face. Picked at its centre point.
       swing   a hinged door's swing: the area the door sweeps as it opens.
     Stored as l.measures = [{id, a, b}], anchor = {k, id, part, n}; k is the kind, id the
     thing's id (a room wall's index), n which corner or side. Ends are looked up live, so a
     measurement follows what it joins as things move. It is a note on the plan, not part of
     the room or the furniture, so it has no undo history of its own. */
  cv.addEventListener('pointerleave', ()=>{
    if(!measureOn || drag) return;
    setMeasureHover(null); setMeasureHoverId(null); setMeasureCursor(null); scheduleDraw();
  });
  $('btnMeasure').addEventListener('click', ()=>setMeasure(!measureOn));
  $('btnShortcuts').addEventListener('click', showShortcuts);
  $('measureBar').addEventListener('click', e=>{
    const b=e.target.closest('button[data-act]'); if(!b) return;
    if(b.dataset.act==='done') setMeasure(false);
    else if(b.dataset.act==='remove' && measureSel) removeMeasure(measureSel);
    else if(b.dataset.act==='clear'){
      const n=liveMeasures().length;
      askConfirm('Clear measurements', 'Remove '+(n===1?'the measurement':'all '+n+' measurements')+' from '+L().name+'?', 'Clear measurements', ()=>{
        L().measures=[]; resetMeasureState(); renderMeasureBar(); draw(); save();
      });
    }
  });

  cv.addEventListener('pointerdown', onCanvasPointerDown);
  cv.addEventListener('pointermove', e=>{
    if(measureOn && !drag){ measureHoverAt(e.offsetX,e.offsetY); return; }
    if(!drag) return;
    setLastPX(e.offsetX); setLastPY(e.offsetY); setLastMods({shiftKey:e.shiftKey,altKey:e.altKey});
    applyDragAt(lastPX,lastPY,lastMods);
  });
  cv.addEventListener('pointerup',endDrag);
  cv.addEventListener('pointercancel',endDrag);
  /* in Room mode, double-clicking a wall types its length in rather than dragging for it */
  cv.addEventListener('dblclick', e=>{
    if(drawState) return;
    /* double-clicking a room on the floor is the way back to editing it */
    if(floorMode()){
      const id=pickFloorRoom(e.offsetX,e.offsetY);
      if(id){ setDrag(null); activateLayout(id); setMode('room'); renderAll(); fit(); save(); }
      return;
    }
    if(!roomMode()) return;
    const hit=pickRoom(e.offsetX,e.offsetY);
    if(hit&&hit.kind==='wall'){ setDrag(null); wallDialog(hit.i); }
  });
  /* ------------------------- splitting a room in two ------------------------- */
  /* A room's own dividing line is drawn the same way a freestanding wall is (same
     snapping), except both ends must land ON the room's own boundary — unlike a
     freestanding wall, a split has nowhere else to start or end. Between the two
     ends the user can drop as many interior points as they like, bending the cut
     into a polyline; each one must stay strictly inside the room. */
  /* right-clicking a room marked for merge/delete opens that menu; right-clicking any
     other room collapses the marked set down to just the one under the pointer first */
  cv.addEventListener('contextmenu', e=>{
    if(roomMode() && !drawState && !wallDrawState && !splitDrawState && !measureOn){
      e.preventDefault();
      menuAtPoint(e.clientX, e.clientY, [{label:'Split room…', fn:()=>startSplitRoom(S.active)}]);
      return;
    }
    if(!floorMode()) return;
    const hit=pickFloorRoom(e.offsetX,e.offsetY);
    if(!hit) return;
    e.preventDefault();
    if(!mergeSel.has(hit)){ mergeSel.clear(); mergeSel.add(hit); renderFloorSel(); renderTree(); draw(); }
    if(mergeSel.size!==2) return;
    openFloorMergeMenu([...mergeSel], e.clientX, e.clientY);
  });
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const now = performance.now();
    const dt = wheelState.last ? Math.max(1, now-wheelState.last) : 100;
    wheelState.last = now;
    // deltaMode 1 = DOM_DELTA_LINE (mouse wheel notches, chunky); 0 = DOM_DELTA_PIXEL (trackpad, many small events)
    const norm = e.deltaMode===1 ? e.deltaY*16 : e.deltaY;
    const velocity = Math.abs(norm)/dt;
    const accel = Math.min(4, 1+velocity*ZOOM_ACCEL_K);
    const speed = S.zoomSpeed||1;
    const magnitude = accel*speed*Math.min(3, Math.abs(norm)/4);
    zoomAt(Math.pow(ZOOM_FACTOR, (norm<0?1:-1)*magnitude), e.offsetX, e.offsetY);
  }, {passive:false});

  $('modeSeg').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b) setMode(b.dataset.mode); });

  $('btnUndo').addEventListener('click',()=>{ floorMode()?undoFloor():roomMode()?undoRoom():undoFurn(); });
  $('btnRedo').addEventListener('click',()=>{ floorMode()?redoFloor():roomMode()?redoRoom():redoFurn(); });
  $('btnZoomIn').addEventListener('click',()=>zoomAt(1.25,W/2,H/2));
  $('btnZoomOut').addEventListener('click',()=>zoomAt(1/1.25,W/2,H/2));
  $('btnFit').addEventListener('click',fit);
}

export {bindStage};
