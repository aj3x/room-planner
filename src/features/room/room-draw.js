// @ts-check
/* Drawing a custom room, the commands: starting, where the next corner
   lands (drawSnapPoint), finishing and abandoning the outline. The pointer
   and key handling, and the outline on screen, are the room-draw tool's
   (features/room/room-draw-tool.js). */
import {alignGuides, alignNote, roomSel} from '../../kernel/selection.js';
import {L} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {clampOpenings, syncWallOff} from '../../kernel/model/walls.js';
import {batch} from '../../kernel/signals.js';
import {flash} from '../../ui-kit/flash.js';
import {drawState, drawCursor, alignPoint, alignRadius, isSquare, snapPt, fit, stopOtherTools} from '../canvas/index.js';
import {roomMode} from '../../kernel/state.js';
import {setMode} from '../mode/index.js';
function cancelCustomDraw(){
  batch(()=>{ drawState.value = null; alignGuides.value = []; alignNote.value = ''; });
}
function finishCustomDraw(){
  if(!drawState.value||drawState.value.pts.length<3){ flash('Add at least 3 corners first'); return; }
  transact('room', ()=>{
    L().room.points=/** @type {{pts: import("../../kernel/types.js").Pt[]}} */(drawState.value).pts.map(p=>p.slice());   // drawing
    L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
    clampOpenings(); roomSel.value = null;
    drawState.value = null; alignGuides.value = []; alignNote.value = '';
  });
  fit();
}
/* Where the next corner would land, and why — the same magnet the corner drag uses, so
   an outline comes out straight and square while it is being drawn rather than having to
   be tidied up afterwards. Shift locks to 45° off the last corner instead. */
/** @param {import('../../kernel/types.js').Pt} raw @param {boolean} shift @returns {import('../../kernel/types.js').Pt} */
function drawSnapPoint(raw,shift){
  const pts=/** @type {{pts: import("../../kernel/types.js").Pt[]}} */(drawState.value).pts;   // drawing
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

/* ------------------------- custom room drawing (walls may cross) ------------------------- */
function startCustomDraw(){
  stopOtherTools('room-draw');
  if(!roomMode()) setMode('room');
  batch(()=>{ drawState.value = {pts:[]}; drawCursor.value = null; roomSel.value = null; });
}
export {cancelCustomDraw, finishCustomDraw, drawSnapPoint, startCustomDraw};
