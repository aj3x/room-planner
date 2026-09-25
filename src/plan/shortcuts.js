/* The keyboard. One handler on `document`, and the order of its guards is the
   whole design: a modifier-free letter must not fire while the user is typing
   in a text box, Escape means "back out of whatever is innermost", and a mode
   that owns the canvas (drawing a room, a wall, a split line) swallows the key
   before the general bindings get a look at it. Read it top to bottom; each
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
   opening and the arrow-key nudge all reach into plan/'s panels, and plan/
   sits above canvas/ -- it may import downward, so the renderers below are
   plain imports rather than bus events. Nothing imports this module except
   index.html, so it joins no cycle.

   Byte-identical to what stood in the shell; only the wrapper changed. */
import {worldPoly} from '../core/geometry.js';
import {commitFurn, redoFloor, redoFurn, redoRoom, undoFloor, undoFurn, undoRoom} from '../core/history.js';
import {floorSel, mergeSel, roomSel, selSet, selectClear, setFloorSel, setRoomSel} from '../core/selection.js';
import {S, floorMode, instOf, isCanvasMode, itemOf, roomMode} from '../core/state.js';
import {save} from '../core/store.js';
import {bisectToValid, centreInside, isBad, validate} from '../model/validity.js';
import {deleteCorner} from '../canvas/corners.js';
import {draw} from '../canvas/draw.js';
import {cancelDrag, setSpaceDown} from '../canvas/interaction.js';
import {drag, drawState, splitDrawState, wallDrawState} from '../canvas/interaction-state.js';
import {measureOn, measureSel, measureStart, setMeasureSel, setMeasureStart} from '../canvas/measure-state.js';
import {removeMeasure, renderMeasureBar, setMeasure} from '../canvas/measure-tool.js';
import {cancelCustomDraw, finishCustomDraw} from '../canvas/room-draw.js';
import {cancelSplitDraw} from '../canvas/split-room.js';
import {cv, snapMM} from '../canvas/view.js';
import {cancelWallDraw} from '../canvas/wall-draw.js';
import {flash} from '../ui/flash.js';
import {closeModal, mo, showShortcuts} from '../ui/modal.js';
import {renderFloorSel, turnFloorRoom} from './floors.js';
import {renderTree} from './layout-tree.js';
import {deleteIWall, deleteOpening, deletePillar, renderOpen, renderRoomSel, renderWalls} from './room-panel.js';
import {removeSel, renderSel, rotate} from './selection-panel.js';

function onDocumentKeyDown(e){
  const tag=(e.target.tagName||'').toLowerCase();
  if(drag && e.key==='Escape'){ e.preventDefault(); cancelDrag(); return; }
  if(tag==='input'||tag==='textarea'||tag==='select') return;
  if(e.code==='Space' && !e.repeat && isCanvasMode(S.mode)){
    setSpaceDown(true); cv.style.cursor='grab'; e.preventDefault(); return;
  }
  if(drawState){
    if(e.key==='Escape'){ cancelCustomDraw(); return; }
    if(e.key==='Enter'){ finishCustomDraw(); return; }
    return;
  }
  if(wallDrawState){
    if(e.key==='Escape'){ cancelWallDraw(); return; }
    return;
  }
  if(splitDrawState){
    if(e.key==='Escape'){ cancelSplitDraw(); return; }
    return;
  }
  if(mo.hidden && (e.key==='m'||e.key==='M') && !e.ctrlKey && !e.metaKey && !e.altKey && isCanvasMode(S.mode) && !floorMode()){
    setMeasure(!measureOn); return;
  }
  if(mo.hidden && !drag && e.key==='?' && isCanvasMode(S.mode)){
    e.preventDefault(); showShortcuts(); return;
  }
  if(measureOn && mo.hidden){
    // Escape backs out one step at a time: the first end, then the selection, then the tool
    if(e.key==='Escape'){
      if(measureStart) setMeasureStart(null);
      else if(measureSel) setMeasureSel(null);
      else { setMeasure(false); return; }
      renderMeasureBar(); draw(); return;
    }
    if((e.key==='Delete'||e.key==='Backspace') && measureSel){ e.preventDefault(); removeMeasure(measureSel); return; }
  }
  if(e.key==='Escape'){
    if(!mo.hidden){ closeModal(); return; }
    selectClear(); setRoomSel(null); setFloorSel(null); mergeSel.clear();
    renderSel(); renderRoomSel(); renderWalls(); renderOpen(); renderFloorSel(); renderTree(); draw(); return;
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
  if(mo.hidden && floorMode() && floorSel && (e.key==='['||e.key===']') && !e.ctrlKey && !e.metaKey){
    const l=S.layouts.find(x=>x.id===floorSel);
    if(l){ e.preventDefault(); turnFloorRoom(l, e.key==='[' ? -90 : 90); }
    return;
  }
  if(roomMode()){
    if((e.key==='Delete'||e.key==='Backspace') && roomSel){
      e.preventDefault();
      if(roomSel.kind==='opening') deleteOpening(roomSel.id);
      else if(roomSel.kind==='corner') deleteCorner(roomSel.i);
      else if(roomSel.kind==='pillar') deletePillar(roomSel.id);
      else if(roomSel.kind==='iwall') deleteIWall(roomSel.id);
    }
    return;
  }
  if(!selSet.size) return;
  if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); removeSel(); return; }
  if(e.key==='r'||e.key==='R'){ if(selSet.size===1){ e.preventDefault(); rotate(e.shiftKey?-90:90); } return; }
  const step=(snapMM()||10)*(e.shiftKey?5:1);
  const d={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
  if(d){
    e.preventDefault();
    let moved=false;
    for(const id of selSet){
      const inst=instOf(id); const it=inst&&itemOf(inst.itemId);
      if(!inst||!it) continue;
      moved=true;
      const loose=isBad(inst), ox=inst.x, oy=inst.y;
      inst.x+=d[0]; inst.y+=d[1];
      if(!validate(inst,worldPoly(inst,it)).ok){
        if(loose){ if(!centreInside(inst)){ inst.x=ox; inst.y=oy; } }
        else {
          // take as much of the step as fits
          inst.x=ox; inst.y=oy;
          bisectToValid(inst,it,[ox,oy],[ox+d[0],oy+d[1]]);
          if(Math.hypot(inst.x-ox,inst.y-oy)<0.01){ inst.x=ox; inst.y=oy; if(selSet.size===1) flash('No room that way'); }
        }
      }
    }
    if(moved){ draw(); renderSel(); save(); commitFurn(); }
  }
}

export {onDocumentKeyDown};
