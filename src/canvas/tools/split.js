/* Splitting a room: the cut drawn so far, and where its next point would
   land. */

import {ctx, sx, sy} from '../view.js';
import {PAL, drawSquareTick} from '../paint.js';
import {alignGuides, alignNote} from '../../core/selection.js';
import {drawCursor, splitDrawState, wallDrawShift} from '../interaction-state.js';
import {snapWallPoint} from '../snap.js';
import {boundaryHit, splitCornerRef, splitResolvePoint} from '../split-room.js';

function drawSplitOverlay(){
  if(!splitDrawState.value) return;
  const worldPts=splitDrawState.value.pts.map(p=>p.pt||p);
  let b=null;
  if(drawCursor.value){
    const resolved=splitResolvePoint(drawCursor.value, wallDrawShift.value);
    alignGuides.value = resolved.guides; alignNote.value = resolved.note;
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

export {splitOverlay};
