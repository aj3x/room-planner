/* The stage's wiring: everything that listens to the canvas itself, plus the
   toolbars that sit on it — the Room|Furniture mode switch, the measure and
   shortcuts buttons, the measure bar, and undo/redo/zoom/fit.

   One of the per-pane bind modules; src/app/bind/header.js carries the full
   rationale for the pattern. The short version: each HTML partial ends
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

import { S, L, roomMode, floorMode } from '../../kernel/state.js';
import {mergeSel, mergeOnly} from '../../kernel/selection.js';
import { transact } from '../../kernel/tx.js';
import { undoRoom, redoRoom, undoFurn, redoFurn, undoFloor, redoFloor } from '../../kernel/history.js';
import { askConfirm, showShortcuts } from '../../ui-kit/modal.jsx';
import { $ } from '../../ui-kit/dom.js';
import { menuAtPoint } from '../../ui-kit/menu.js';
import { cv, W, H, fit, pickRoom } from '../../features/canvas/index.js';
import { zoomAt, activeTool, onCanvasPointerDown, onCanvasPointerMove, onCanvasMouseMove, onCanvasPointerUp, onCanvasPointerLeave, onCanvasWheel } from '../../features/canvas/host.js';
import { startSplitRoom, roomTool } from '../../features/room/index.js';
import { floorTool, pickFloorRoom, openFloorMergeMenu } from '../../features/floors/index.js';
import {measureOn, measureSel, liveMeasures, setMeasure, resetMeasureState, removeMeasure} from '../../features/measure/index.js';
import { activateLayout, setMode } from '../../features/mode/index.js';
import { wallDialog } from '../../features/walls/index.js';

function bindStage(){
  cv.addEventListener('mousemove', onCanvasMouseMove);

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
  cv.addEventListener('pointerleave', onCanvasPointerLeave);
  $('btnMeasure').addEventListener('click', ()=>setMeasure(!measureOn.value));
  $('btnShortcuts').addEventListener('click', showShortcuts);
  $('measureBar').addEventListener('click', e=>{
    const b=e.target.closest('button[data-act]'); if(!b) return;
    if(b.dataset.act==='done') setMeasure(false);
    else if(b.dataset.act==='remove' && measureSel.value) removeMeasure(measureSel.value);
    else if(b.dataset.act==='clear'){
      const n=liveMeasures().length;
      askConfirm('Clear measurements', 'Remove '+(n===1?'the measurement':'all '+n+' measurements')+' from '+L().name+'?', 'Clear measurements', ()=>{
        transact('room', ()=>{ L().measures=[]; resetMeasureState(); }, {history:false});   // no undo for measurements
      });
    }
  });

  cv.addEventListener('pointerdown', onCanvasPointerDown);
  cv.addEventListener('pointermove', onCanvasPointerMove);
  cv.addEventListener('pointerup', onCanvasPointerUp);
  cv.addEventListener('pointercancel', onCanvasPointerUp);
  /* in Room mode, double-clicking a wall types its length in rather than dragging for it */
  cv.addEventListener('dblclick', e=>{
    const t=activeTool();
    /* double-clicking a room on the floor is the way back to editing it */
    if(t===floorTool){
      const id=pickFloorRoom(e.offsetX,e.offsetY);
      if(id){ transact('project', ()=>{ activateLayout(id); setMode('room'); }); fit(); }
      return;
    }
    if(t!==roomTool) return;   // not while a drawing tool or Measure has the canvas
    const hit=pickRoom(e.offsetX,e.offsetY);
    if(hit&&hit.kind==='wall') wallDialog(hit.i);
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
    if(activeTool()===roomTool){
      e.preventDefault();
      menuAtPoint(e.clientX, e.clientY, [{label:'Split room…', fn:()=>startSplitRoom(S.active)}]);
      return;
    }
    if(activeTool()!==floorTool) return;
    const hit=pickFloorRoom(e.offsetX,e.offsetY);
    if(!hit) return;
    e.preventDefault();
    if(!mergeSel.value.has(hit)) mergeOnly(hit);
    if(mergeSel.value.size!==2) return;
    openFloorMergeMenu([...mergeSel.value], e.clientX, e.clientY);
  });
  cv.addEventListener('wheel', onCanvasWheel, {passive:false});

  $('modeSeg').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b) setMode(b.dataset.mode); });

  $('btnUndo').addEventListener('click',()=>{ floorMode()?undoFloor():roomMode()?undoRoom():undoFurn(); });
  $('btnRedo').addEventListener('click',()=>{ floorMode()?redoFloor():roomMode()?redoRoom():redoFurn(); });
  $('btnZoomIn').addEventListener('click',()=>zoomAt(1.25,W/2,H/2));
  $('btnZoomOut').addEventListener('click',()=>zoomAt(1/1.25,W/2,H/2));
  $('btnFit').addEventListener('click',fit);
}

export {bindStage};
