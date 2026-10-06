// @ts-check
/* The canvas element's own listeners: the pointer, the wheel, double-click
   and the context menu, routed to the active tool (features/canvas) or, for
   the two that open something, to the feature that does. The canvas is the
   one element the shell keeps for itself rather than a component, so its
   listeners are registered here, by bindCanvas(), which boot() calls
   before anything else.

   Every one is a different event type, so registration order decides
   nothing between them; they stay in one function so that stays checkable. */
import {S} from '../kernel/state.js';
import {mergeSel, mergeOnly} from '../kernel/selection.js';
import {transact} from '../kernel/tx.js';
import {menuAtPoint} from '../ui-kit/menu.js';
import {cv, fit, pickRoom} from '../features/canvas/index.js';
import {activeTool, onCanvasPointerDown, onCanvasPointerMove, onCanvasMouseMove, onCanvasPointerUp, onCanvasPointerLeave, onCanvasWheel} from '../features/canvas/host.js';
import {startSplitRoom, roomTool} from '../features/room/index.js';
import {floorTool, pickFloorRoom, openFloorMergeMenu} from '../features/floors/index.js';
import {activateLayout, setMode} from '../features/mode/index.js';
import {wallDialog} from '../features/walls/index.js';

function bindCanvas(){
  cv.addEventListener('mousemove', onCanvasMouseMove);

  cv.addEventListener('pointerleave', onCanvasPointerLeave);
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
}

export {bindCanvas};
