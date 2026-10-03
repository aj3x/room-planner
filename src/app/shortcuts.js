/* The keyboard. One handler on `document`, and the order of its guards is the
   whole design: a modifier-free letter must not fire while the user is typing
   in a text box, Escape means "back out of whatever is innermost", and a
   canvas tool that is live (drawing a room, a wall, a split line; measuring)
   gets the key — onKey, canvas/interaction.js — before the general bindings
   get a look at it. Read it top to bottom; each
   early `return` is a claim on the key.

   Moved out of index.html's <script> as part of Step 4 of
   .claude/plans/decoupling.md. The registration stayed behind, at the exact
   line it occupied -- AGENTS.md rule 3: a module that calls addEventListener
   at import time is a top-level side effect AND jumps that listener ahead of
   every other one in the file. The rule constrains the registration, not the
   body, so index.html now reads
   `document.addEventListener('keydown', onDocumentKeyDown)` and the dispatch
   lives here.

   Why plan/ and not canvas/: these are the app's shortcuts, not the canvas's.
   Undo/redo, the Escape that clears every selection, Delete on a wall or an
   opening and the arrow-key nudge act on plan/'s commands. They change state
   and the selection; the panels and the canvas are effects and follow.
   Nothing imports this module except index.html, so it joins no cycle.

*/
import {worldPoly} from '../kernel/geometry.js';
import {redoFloor, redoFurn, redoRoom, undoFloor, undoFurn, undoRoom} from '../kernel/history.js';
import {floorSel, roomSel, selSet, selectClear, mergeClear} from '../kernel/selection.js';
import {S, floorMode, instOf, isCanvasMode, itemOf, roomMode} from '../kernel/state.js';
import {transact} from '../kernel/tx.js';
import {batch} from '../kernel/signals.js';
import {bisectToValid, centreInside, isBad, validate} from '../kernel/validity.js';
import {deleteCorner} from '../features/walls/corners.js';
import {cancelGesture, gestureTool, isGesturing, onCanvasKey} from '../features/canvas/interaction.js';
import {measureOn} from '../features/measure/measure-state.js';
import {setMeasure} from '../features/measure/measure.js';
import {panTool, setSpaceDown} from '../features/canvas/pan-tool.js';
import {cv, snapMM} from '../features/canvas/view.js';
import {flash} from '../ui-kit/flash.js';
import {closeModal, mo, showShortcuts} from '../ui-kit/modal.js';
import {turnFloorRoom} from '../features/floors/floors.js';
import {deleteIWall, deletePillar} from '../features/walls/walls-panel.js';
import {deleteOpening} from '../features/openings/openings-panel.js';
import {removeSel, rotate} from '../features/furniture/selection-panel.js';

function onDocumentKeyDown(e){
  const tag=(e.target.tagName||'').toLowerCase();
  if(isGesturing() && e.key==='Escape'){ e.preventDefault(); cancelGesture(); return; }
  if(tag==='input'||tag==='textarea'||tag==='select') return;
  if(e.code==='Space' && !e.repeat && isCanvasMode(S.mode)){
    setSpaceDown(true); cv.style.cursor=panTool.cursor; e.preventDefault(); return;
  }
  // a canvas tool that is live (drawing an outline, a wall or a split line; measuring) claims its keys first
  if(onCanvasKey(e)) return;
  if(mo.hidden && (e.key==='m'||e.key==='M') && !e.ctrlKey && !e.metaKey && !e.altKey && isCanvasMode(S.mode) && !floorMode()){
    setMeasure(!measureOn.value); return;
  }
  if(mo.hidden && !isGesturing() && e.key==='?' && isCanvasMode(S.mode)){
    e.preventDefault(); showShortcuts(); return;
  }
  if(e.key==='Escape'){
    if(!mo.hidden){ closeModal(); return; }
    batch(()=>{ selectClear(); roomSel.value = null; floorSel.value = null; mergeClear(); });
    return;
  }
  if(mo.hidden && (e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
    e.preventDefault();
    const redo=e.shiftKey;
    if(floorMode()){ redo?redoFloor():undoFloor(); }
    else if(roomMode()){ redo?redoRoom():undoRoom(); } else { redo?redoFurn():undoFurn(); }
    return;
  }
  if(mo.hidden && (e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){
    e.preventDefault();
    floorMode() ? redoFloor() : roomMode() ? redoRoom() : redoFurn();
    return;
  }
  /* turning the picked room a quarter at a time is what an arrangement actually needs */
  if(mo.hidden && floorMode() && floorSel.value && (e.key==='['||e.key===']') && !e.ctrlKey && !e.metaKey){
    const l=S.layouts.find(x=>x.id===floorSel.value);
    if(l){ e.preventDefault(); turnFloorRoom(l, e.key==='[' ? -90 : 90); }
    return;
  }
  if(roomMode()){
    if((e.key==='Delete'||e.key==='Backspace') && roomSel.value){
      e.preventDefault();
      if(roomSel.value.kind==='opening') deleteOpening(roomSel.value.id);
      else if(roomSel.value.kind==='corner') deleteCorner(roomSel.value.i);
      else if(roomSel.value.kind==='pillar') deletePillar(roomSel.value.id);
      else if(roomSel.value.kind==='iwall') deleteIWall(roomSel.value.id);
    }
    return;
  }
  if(!selSet.value.size) return;
  if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); removeSel(); return; }
  if(e.key==='r'||e.key==='R'){ if(selSet.value.size===1){ e.preventDefault(); rotate(e.shiftKey?-90:90); } return; }
  const step=(snapMM()||10)*(e.shiftKey?5:1);
  const d={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
  if(d){
    e.preventDefault();
    transact('furn', ()=>{
      for(const id of selSet.value){
        const inst=instOf(id); const it=inst&&itemOf(inst.itemId);
        if(!inst||!it) continue;
        const loose=isBad(inst), ox=inst.x, oy=inst.y;
        inst.x+=d[0]; inst.y+=d[1];
        if(!validate(inst,worldPoly(inst,it)).ok){
          if(loose){ if(!centreInside(inst)){ inst.x=ox; inst.y=oy; } }
          else {
            // take as much of the step as fits
            inst.x=ox; inst.y=oy;
            bisectToValid(inst,it,[ox,oy],[ox+d[0],oy+d[1]]);
            if(Math.hypot(inst.x-ox,inst.y-oy)<0.01){ inst.x=ox; inst.y=oy; if(selSet.value.size===1) flash('No room that way'); }
          }
        }
      }
    });
  }
}

/* Space's other half. It lives here rather than beside setSpaceDown in
   canvas/tools/pan.js for the same reason the keydown does: the pair is one
   binding, and reading them apart is how one of them gets forgotten. Note it
   does NOT clear the cursor mid-pan -- a pan started with Space keeps its
   grabbing cursor until the pointer comes up, whatever the key does. */
function onDocumentKeyUp(e){
  if(e.code==='Space'){
    setSpaceDown(false);
    if(gestureTool()!==panTool) cv.style.cursor='';
  }
}

export {onDocumentKeyDown, onDocumentKeyUp};
