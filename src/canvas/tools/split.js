/* Splitting a room in two: a click on the room's wall starts the cut,
   clicks inside bend it, a click on another wall finishes it (and opens
   the solid/open choice). Points land on the same magnet as a corner drag,
   with a soft 45° snap (Shift forces it). Escape abandons it. While it is
   live it owns the canvas and the keyboard. The geometry and the commit are
   canvas/split-room.js. */

import {pointInPoly} from '../../core/geometry.js';
import {alignGuides, alignNote} from '../../core/selection.js';
import {RP} from '../../core/state.js';
import {flash} from '../../ui/flash.js';
import {draw, scheduleDraw} from '../draw.js';
import {drawCursor, splitDrawState, wallDrawShift} from '../interaction-state.js';
import {PAL, drawSquareTick} from '../paint.js';
import {snapWallPoint} from '../snap.js';
import {boundaryHit, cancelSplitDraw, splitCornerRef, splitResolvePoint, trySplitLine} from '../split-room.js';
import {ctx, sx, sy, wx, wy} from '../view.js';

function splitDown(e,px,py){
  const raw0=[wx(px),wy(py)];
  const pts=splitDrawState.value.pts;
  const resolved=splitResolvePoint(raw0, e.shiftKey);
  const snapped=snapWallPoint(resolved.pt,null,!e.altKey);
  const hit=boundaryHit(snapped);
  if(hit){
    if(!pts.length){ pts.push(hit); showGuides(); draw(); return null; }
    trySplitLine(pts[0], pts.slice(1), hit);
    return null;
  }
  if(!pts.length){ flash("Click a point on the room's wall"); return null; }
  if(!pointInPoly(snapped, RP())){ flash('Stay inside the room'); return null; }
  pts.push(snapped);
  showGuides();
  draw();
  return null;
}
/* the guides and readout note for where the next point would land — worked
   out when the pointer moves or a point is placed, never inside a draw */
function showGuides(){
  if(!splitDrawState.value || !drawCursor.value) return;
  const resolved=splitResolvePoint(drawCursor.value, wallDrawShift.value);
  alignGuides.value = resolved.guides; alignNote.value = resolved.note;
}
function splitCursor(px,py,mods){
  drawCursor.value = [wx(px),wy(py)];
  wallDrawShift.value = mods.shiftKey;
  showGuides();
  scheduleDraw();
}
function splitKey(e){
  if(e.key==='Escape') cancelSplitDraw();
  return true;
}

function drawSplitOverlay(){
  if(!splitDrawState.value) return;
  const worldPts=splitDrawState.value.pts.map(p=>p.pt||p);
  let b=null;
  if(drawCursor.value){
    const resolved=splitResolvePoint(drawCursor.value, wallDrawShift.value);
    const snapped=snapWallPoint(resolved.pt, null, true);
    const hit=boundaryHit(snapped);
    b=hit?hit.pt:snapped;
    if(resolved.note==='Right angle'){
      const cr=splitCornerRef(splitDrawState.value.pts, b);
      if(cr) drawSquareTick(cr[0], cr[1], cr[2]);
    }
  }
  ctx.save();
  if(worldPts.length){
    ctx.setLineDash([5,4]); ctx.lineWidth=2; ctx.strokeStyle=PAL().accent;
    ctx.beginPath();
    ctx.moveTo(sx(worldPts[0][0]), sy(worldPts[0][1]));
    for(let i=1;i<worldPts.length;i++) ctx.lineTo(sx(worldPts[i][0]), sy(worldPts[i][1]));
    if(b) ctx.lineTo(sx(b[0]), sy(b[1]));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for(const p of worldPts){
    ctx.beginPath(); ctx.arc(sx(p[0]),sy(p[1]),5,0,Math.PI*2);
    ctx.fillStyle=PAL().accent; ctx.fill();
  }
  ctx.restore();
}

const splitOverlay = {
  id:'split', z:160, scene:'room',
  deps(){ splitDrawState.value; drawCursor.value; wallDrawShift.value; },
  draw(){ drawSplitOverlay(); }
};

const splitTool = {
  id:'split',
  active: () => !!splitDrawState.value,
  onDown: splitDown, onCursor: splitCursor, onKey: splitKey, stop: cancelSplitDraw,
  overlay: splitOverlay,
};

export {splitTool};
