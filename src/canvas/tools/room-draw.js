/* Drawing a room's outline: the corners placed so far and the rubber band
   to the pointer. */

import {ctx, sx, sy} from '../view.js';
import {PAL} from '../paint.js';
import {drawState, drawCursor} from '../interaction-state.js';

function drawCustomOverlay(){
  if(!drawState.value) return;
  const pts=drawState.value.pts, C=PAL();
  ctx.save();
  ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.setLineDash([5,4]);
  ctx.beginPath();
  if(pts.length){
    ctx.moveTo(sx(pts[0][0]),sy(pts[0][1]));
    for(let i=1;i<pts.length;i++) ctx.lineTo(sx(pts[i][0]),sy(pts[i][1]));
    if(drawCursor.value) ctx.lineTo(sx(drawCursor.value[0]),sy(drawCursor.value[1]));
  }
  ctx.stroke(); ctx.setLineDash([]);
  for(let i=0;i<pts.length;i++){
    const near0 = i===0 && pts.length>=3 && drawCursor.value && Math.hypot(sx(pts[0][0])-sx(drawCursor.value[0]),sy(pts[0][1])-sy(drawCursor.value[1]))<12;
    ctx.beginPath(); ctx.arc(sx(pts[i][0]),sy(pts[i][1]), (i===0?7:5), 0, Math.PI*2);
    ctx.fillStyle = near0 ? C.accent : (i===0?C.accentSoft:C.surface);
    ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  }
  ctx.restore();
}

const roomDrawOverlay = {
  id:'room-draw', z:140, scene:'room',
  deps(){ drawState.value; drawCursor.value; },
  draw(){ drawCustomOverlay(); }
};

export {roomDrawOverlay};
