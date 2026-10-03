/* Drawing a custom room: the in-progress polygon, the snap point the cursor
   shows, and finishing or abandoning the outline.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   startCustomDraw did not come with it: it calls setMeasure, which is still
   in the monolith behind the two other cancel* functions.
*/
import {alignGuides, alignNote, roomSel} from '../core/selection.js';
import {L} from '../core/state.js';
import {transact} from '../core/tx.js';
import {clampOpenings, syncWallOff} from '../model/walls.js';
import {expect} from '../core/registry.js';
import {batch} from '../core/signals.js';
import {flash} from '../ui/flash.js';
import {$} from '../ui/modal.js';
import {drawState, drawCursor} from './interaction-state.js';
import {alignPoint, alignRadius, isSquare} from './snap.js';
import {snapPt} from './view.js';
import {fit} from './camera.js';
import {roomMode} from '../core/state.js';
import {splitDrawState, wallDrawState} from './interaction-state.js';
import {measureOn} from './measure-state.js';
import {setMeasure} from './measure-tool.js';
import {cancelSplitDraw} from './split-room.js';
import {cancelWallDraw} from './wall-draw.js';
function cancelCustomDraw(){
  batch(()=>{ drawState.value = null; alignGuides.value = []; alignNote.value = ''; });
  $('drawHint').hidden=true;
}
function finishCustomDraw(){
  if(!drawState.value||drawState.value.pts.length<3){ flash('Add at least 3 corners first'); return; }
  transact('room', ()=>{
    L().room.points=drawState.value.pts.map(p=>p.slice());
    L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
    clampOpenings(); roomSel.value = null;
    drawState.value = null; alignGuides.value = []; alignNote.value = ''; $('drawHint').hidden=true;
  });
  fit();
}
/* Where the next corner would land, and why — the same magnet the corner drag uses, so
   an outline comes out straight and square while it is being drawn rather than having to
   be tidied up afterwards. Shift still means the old 45° lock off the last corner. */
function drawSnapPoint(raw,shift){
  const pts=drawState.value.pts;
  if(shift&&pts.length){
    const prev=pts[pts.length-1];
    const v=[raw[0]-prev[0], raw[1]-prev[1]], len=Math.hypot(v[0],v[1])||1;
    const ang=Math.round(Math.atan2(v[1],v[0])/(Math.PI/4))*(Math.PI/4);
    alignGuides.value = []; alignNote.value = 'Straight';
    return snapPt([prev[0]+Math.cos(ang)*len, prev[1]+Math.sin(ang)*len]);
  }
  if(!pts.length){ alignGuides.value = []; alignNote.value = ''; return snapPt(raw); }
  const last=pts.length-1;
  const refs=pts.map((p,k)=>({
    p,
    bias: k===last ? 0 : (k===0 ? 0.15 : 0.3),   // the corner just placed pulls hardest, then the one the loop closes on
    edge: k===last && k>0 ? [p[0]-pts[k-1][0], p[1]-pts[k-1][1]] : null
  }));
  const s=alignPoint(raw, refs, alignRadius());
  alignGuides.value = s.guides;
  alignNote.value = s.guides.length ? (pts.length>1 && isSquare(pts[last-1], pts[last], s.pt) ? 'Right angle' : 'Lined up') : '';
  return s.pt;
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* ------------------------- custom room drawing (walls may cross) ------------------------- */
function startCustomDraw(){
  if(wallDrawState.value) cancelWallDraw();
  if(splitDrawState.value) cancelSplitDraw();
  if(measureOn.value) setMeasure(false);
  if(!roomMode()) expect('plan.setMode')('room');
  batch(()=>{ drawState.value = {pts:[]}; drawCursor.value = null; roomSel.value = null; });
  $('drawHint').hidden=false;
}
export {cancelCustomDraw, finishCustomDraw, drawSnapPoint, startCustomDraw};
