/* A room's floor: its colour, the grid and the baseboard trim. The room
   scene paints the active room with it; the floor scene paints every room
   on the floor with the same drawRoomFloor. */

import {ctx, sx, sy, view} from '../canvas/view.js';
import {PAL, pathPoly} from '../canvas/paint.js';
import {bbox} from '../../kernel/geometry.js';
import {RP, L, S} from '../../kernel/state.js';

function gridStep(){
  const imp = S.unit==='ftin'||S.unit==='in';
  let base = imp?304.8:500;
  while(base*view.scale<16) base*=2;
  while(base*view.scale>90) base/=2;
  return base;
}
function drawGrid(P){
  const step=gridStep();
  if(step*view.scale<7) return;
  const b=bbox(P);
  ctx.save(); pathPoly(P); ctx.clip();
  ctx.strokeStyle=PAL().grid; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=Math.ceil(b.x0/step)*step;x<=b.x1;x+=step){ ctx.moveTo(Math.round(sx(x))+.5,sy(b.y0)); ctx.lineTo(Math.round(sx(x))+.5,sy(b.y1)); }
  for(let y=Math.ceil(b.y0/step)*step;y<=b.y1;y+=step){ ctx.moveTo(sx(b.x0),Math.round(sy(y))+.5); ctx.lineTo(sx(b.x1),Math.round(sy(y))+.5); }
  ctx.stroke(); ctx.restore();
}
function drawRoomFloor(P, r){
  const C=PAL();
  pathPoly(P); ctx.fillStyle=r.floor; ctx.fill('evenodd');
  drawGrid(P);
  if(r.trimOn && r.trim>0){
    ctx.save(); pathPoly(P); ctx.clip();
    pathPoly(P);
    ctx.lineWidth=Math.max(1,r.trim*2*view.scale);
    ctx.strokeStyle=C.trim; ctx.stroke();
    ctx.restore();
  }
}

const roomFloorLayer = {
  id:'room-floor', z:20, scene:'room',
  draw(){ drawRoomFloor(RP(), L().room); }
};

export {roomFloorLayer, drawRoomFloor};
