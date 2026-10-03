/* Drawing a freestanding wall: its start, and the rubber band to where its
   end would land. */

import {axisLockFrom, ctx, sx, sy} from '../view.js';
import {PAL} from '../paint.js';
import {drawCursor, wallDrawShift, wallDrawState} from '../interaction-state.js';
import {snapWallPoint} from '../snap.js';

function drawWallDrawOverlay(){
  if(!wallDrawState.value) return;
  ctx.save();
  if(wallDrawState.value.a && drawCursor.value){
    const raw=wallDrawShift.value?axisLockFrom(wallDrawState.value.a,drawCursor.value):drawCursor.value;
    const b=snapWallPoint(raw, null, true);
    ctx.setLineDash([5,4]); ctx.lineWidth=2; ctx.strokeStyle=PAL().accent;
    ctx.beginPath(); ctx.moveTo(sx(wallDrawState.value.a[0]),sy(wallDrawState.value.a[1])); ctx.lineTo(sx(b[0]),sy(b[1])); ctx.stroke();
    ctx.setLineDash([]);
  }
  if(wallDrawState.value.a){
    ctx.beginPath(); ctx.arc(sx(wallDrawState.value.a[0]),sy(wallDrawState.value.a[1]),6,0,Math.PI*2);
    ctx.fillStyle=PAL().accent; ctx.fill();
  }
  ctx.restore();
}

const wallDrawOverlay = {
  id:'wall-draw', z:150, scene:'room',
  deps(){ wallDrawState.value; drawCursor.value; wallDrawShift.value; },
  draw(){ drawWallDrawOverlay(); }
};

export {wallDrawOverlay};
