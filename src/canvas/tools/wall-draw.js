/* Drawing a freestanding wall: a click for its start, a click for its end,
   each landing on the wall magnet (Alt drops it; Shift locks the end to the
   start's axis). Escape abandons it. While it is live it owns the canvas and
   the keyboard. The commands it ends in are canvas/wall-draw.js. */

import {flash} from '../../ui/flash.js';
import {draw, scheduleDraw} from '../draw.js';
import {drawCursor, wallDrawShift, wallDrawState} from '../interaction-state.js';
import {PAL} from '../paint.js';
import {snapWallPoint} from '../snap.js';
import {axisLockFrom, ctx, sx, sy, wx, wy} from '../view.js';
import {cancelWallDraw, finishWallDraw} from '../wall-draw.js';

function wallDrawDown(e,px,py){
  const raw0=[wx(px),wy(py)];
  const raw = (wallDrawState.value.a && e.shiftKey) ? axisLockFrom(wallDrawState.value.a,raw0) : raw0;
  const snapped=snapWallPoint(raw,null,!e.altKey);
  if(!wallDrawState.value.a){ wallDrawState.value.a=snapped; draw(); return null; }
  if(Math.hypot(snapped[0]-wallDrawState.value.a[0], snapped[1]-wallDrawState.value.a[1])<50){ flash('Drag out a longer wall'); return null; }
  finishWallDraw(wallDrawState.value.a, snapped);
  return null;
}
function wallDrawCursor(px,py,mods){
  drawCursor.value = [wx(px),wy(py)];
  wallDrawShift.value = mods.shiftKey;
  scheduleDraw();
}
function wallDrawKey(e){
  if(e.key==='Escape') cancelWallDraw();
  return true;
}

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

const wallDrawTool = {
  id:'wall-draw',
  active: () => !!wallDrawState.value,
  onDown: wallDrawDown, onCursor: wallDrawCursor, onKey: wallDrawKey, stop: cancelWallDraw,
  overlay: wallDrawOverlay,
};

export {wallDrawTool};
