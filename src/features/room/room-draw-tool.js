// @ts-check
/* Drawing a room's outline: each click places a corner, under the same
   alignment magnet a corner drag uses (Shift locks to 45°); a click back on
   the first corner, or Enter, closes it; Escape abandons it. While it is
   live it owns the canvas and the keyboard. The commands it ends in are
   features/room/room-draw.js. */

import {alignGuides, alignNote} from '../../kernel/selection.js';
import {draw, scheduleDraw, drawCursor, drawState, wallDrawShift, PAL, ctx, sx, sy, wx, wy} from '../canvas/index.js';
import {cancelCustomDraw, drawSnapPoint, finishCustomDraw} from './room-draw.js';

/** @type {import('../canvas/types.js').Tool['onDown']} */
function roomDrawDown(e,px,py){
  const ds=/** @type {{pts: import('../../kernel/types.js').Pt[]}} */(drawState.value);   // on: active() holds
  const raw=[wx(px),wy(py)];
  if(ds.pts.length>=3){
    const s0=[sx(ds.pts[0][0]), sy(ds.pts[0][1])];
    if(Math.hypot(px-s0[0], py-s0[1])<12){ finishCustomDraw(); return null; }
  }
  ds.pts.push(drawSnapPoint(raw,e.shiftKey));
  alignGuides.value = []; alignNote.value = '';
  draw();
  return null;
}
/* where the next corner would land, shown as the rubber band */
/** @type {NonNullable<import('../canvas/types.js').Tool['onCursor']>} */
function roomDrawCursor(px,py,mods){
  drawCursor.value = drawSnapPoint([wx(px),wy(py)], mods.shiftKey);
  wallDrawShift.value = mods.shiftKey;
  scheduleDraw();
}
/** @type {NonNullable<import('../canvas/types.js').Tool['onKey']>} */
function roomDrawKey(e){
  if(e.key==='Escape') cancelCustomDraw();
  else if(e.key==='Enter') finishCustomDraw();
  return true;
}

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

/** @satisfies {import('../canvas/types.js').Layer} */
const roomDrawOverlay = {
  id:'room-draw', z:140, scene:'room',
  deps(){ drawState.value; drawCursor.value; },
  draw(){ drawCustomOverlay(); }
};

/** @satisfies {import('../canvas/types.js').Tool} */
const roomDrawTool = {
  id:'room-draw',
  active: () => !!drawState.value,
  onDown: roomDrawDown, onCursor: roomDrawCursor, onKey: roomDrawKey, stop: cancelCustomDraw,
  overlay: roomDrawOverlay,
};

export {roomDrawTool};
