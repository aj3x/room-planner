/* Drawing a custom room: the in-progress polygon, the snap point the cursor
   shows, and finishing or abandoning the outline.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   startCustomDraw did not come with it: it calls setMeasure, which is still
   in the monolith behind the two other cancel* functions.
*/
import {commitRoom} from '../core/history.js';
import {setAlignGuides, setAlignNote, setRoomSel} from '../core/selection.js';
import {L} from '../core/state.js';
import {save} from '../core/store.js';
import {clampOpenings, syncWallOff} from '../model/walls.js';
import {renderOpen, renderRoom, renderRoomSel, renderWalls} from '../plan/room-panel.js';
import {flash} from '../ui/flash.js';
import {$} from '../ui/modal.js';
import {draw, scheduleDraw} from './draw.js';
import {drawState, setDrawCursor, setDrawState, setWallDrawShift} from './interaction-state.js';
import {alignPoint, alignRadius, isSquare} from './snap.js';
import {fit, snapPt, wx, wy} from './view.js';
import {roomMode} from '../core/state.js';
import {setMode} from '../plan/mode.js';
import {splitDrawState, wallDrawState} from './interaction-state.js';
import {measureOn} from './measure-state.js';
import {setMeasure} from './measure-tool.js';
import {cancelSplitDraw} from './split-room.js';
import {cancelWallDraw} from './wall-draw.js';
function cancelCustomDraw(){
  setDrawState(null); setAlignGuides([]); setAlignNote(''); $('drawHint').hidden=true; draw();
}
function finishCustomDraw(){
  if(!drawState||drawState.pts.length<3){ flash('Add at least 3 corners first'); return; }
  L().room.points=drawState.pts.map(p=>p.slice());
  L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
  clampOpenings(); setRoomSel(null);
  setDrawState(null); setAlignGuides([]); setAlignNote(''); $('drawHint').hidden=true;
  renderRoom(); renderWalls(); renderRoomSel(); renderOpen(); fit(); save(); commitRoom();
}
/* Where the next corner would land, and why — the same magnet the corner drag uses, so
   an outline comes out straight and square while it is being drawn rather than having to
   be tidied up afterwards. Shift still means the old 45° lock off the last corner. */
function drawSnapPoint(raw,shift){
  const pts=drawState.pts;
  if(shift&&pts.length){
    const prev=pts[pts.length-1];
    const v=[raw[0]-prev[0], raw[1]-prev[1]], len=Math.hypot(v[0],v[1])||1;
    const ang=Math.round(Math.atan2(v[1],v[0])/(Math.PI/4))*(Math.PI/4);
    setAlignGuides([]); setAlignNote('Straight');
    return snapPt([prev[0]+Math.cos(ang)*len, prev[1]+Math.sin(ang)*len]);
  }
  if(!pts.length){ setAlignGuides([]); setAlignNote(''); return snapPt(raw); }
  const last=pts.length-1;
  const refs=pts.map((p,k)=>({
    p,
    bias: k===last ? 0 : (k===0 ? 0.15 : 0.3),   // the corner just placed pulls hardest, then the one the loop closes on
    edge: k===last && k>0 ? [p[0]-pts[k-1][0], p[1]-pts[k-1][1]] : null
  }));
  const s=alignPoint(raw, refs, alignRadius());
  setAlignGuides(s.guides);
  setAlignNote(s.guides.length ? (pts.length>1 && isSquare(pts[last-1], pts[last], s.pt) ? 'Right angle' : 'Lined up') : '');
  return s.pt;
}
function applyDrawCursorAt(px,py,shift){
  const raw=[wx(px),wy(py)];
  setDrawCursor(drawState ? drawSnapPoint(raw, shift) : raw);
  setWallDrawShift(shift);
  scheduleDraw();
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* ------------------------- custom room drawing (walls may cross) ------------------------- */
function startCustomDraw(){
  if(wallDrawState) cancelWallDraw();
  if(splitDrawState) cancelSplitDraw();
  if(measureOn) setMeasure(false);
  if(!roomMode()) setMode('room');
  setDrawState({pts:[]}); setDrawCursor(null);
  setRoomSel(null); renderRoomSel();
  $('drawHint').hidden=false;
  draw();
}
export {cancelCustomDraw, finishCustomDraw, drawSnapPoint, applyDrawCursorAt, startCustomDraw};
