// @ts-check
/* The room's walls, with its doorways and windows punched through them. */

import {H, W, ctx, sx, sy, view, PAL, addPoly, pathPoly} from '../canvas/index.js';
import {L, RP} from '../../kernel/state.js';
import {openGeom} from '../../kernel/model/openings.js';
import {wallIsOff, wallRuns} from '../../kernel/model/walls.js';

/* walls sit outside the measured face: stroke double width, clipped to outside the polygon */
function drawWalls(){
  const r=L().room, P=RP(), t=Math.max(2,r.wall*view.scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20,-20,W+40,H+40);
  addPoly(P);
  ctx.clip('evenodd');
  ctx.lineWidth=t*2; ctx.lineJoin='miter'; ctx.miterLimit=10;
  ctx.strokeStyle=PAL().wall;
  const runs=wallRuns(P, r.wallOff);
  if(!runs){ pathPoly(P); ctx.stroke(); }
  else for(const run of runs){
    ctx.beginPath();
    ctx.moveTo(sx(run[0][0]),sy(run[0][1]));
    for(let k=1;k<run.length;k++) ctx.lineTo(sx(run[k][0]),sy(run[k][1]));
    ctx.stroke();
  }
  ctx.lineCap='butt';
  for(const o of L().openings){
    if(wallIsOff(r,o.wall)) continue;
    const g=openGeom(o);
    ctx.strokeStyle = o.kind==='window' ? PAL().glass : r.floor;
    ctx.lineWidth=t*2+2;
    ctx.beginPath(); ctx.moveTo(sx(g.p0[0]),sy(g.p0[1])); ctx.lineTo(sx(g.p1[0]),sy(g.p1[1])); ctx.stroke();
  }
  ctx.restore();
}

/** @satisfies {import('../canvas/types.js').Layer} */
const wallsLayer = {id:'walls', z:40, scene:'room', draw(){ drawWalls(); }};

export {wallsLayer};
