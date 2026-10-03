/* Passes B and C of the floor scene: every wall band at its depth (shared,
   exterior or taken away — model/floor-place.js), then the doorways punched
   through them. Bands first, all of them, or the next room's band paints a
   doorway shut again. */

import {H, W, ctx, sx, sy, view} from '../view.js';
import {addPoly, pathPoly} from '../paint.js';
import {depthRuns} from '../../model/floor-place.js';
import {openGeom} from '../../model/openings.js';
import {wallIsOff} from '../../model/walls.js';

function drawFloorWalls({C, members, depths}){
  // B — every wall band, clipped outside EVERY room so a band can never paint over a neighbour's floor
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20,-20,W+40,H+40);
  for(const m of members) addPoly(m.P);
  ctx.clip('evenodd');
  ctx.lineJoin='miter'; ctx.miterLimit=10; ctx.strokeStyle=C.wall;
  members.forEach((m,mi)=>{
    const runs=depthRuns(m.P, depths[mi]);
    if(!runs){
      if(!depths[mi][0]) return;                 // every wall on this room has been taken away
      pathPoly(m.P);
      ctx.lineWidth=Math.max(2,depths[mi][0]*view.scale)*2;
      ctx.stroke();
      return;
    }
    for(const run of runs){
      if(!run.depth) continue;
      ctx.beginPath();
      ctx.moveTo(sx(run.pts[0][0]), sy(run.pts[0][1]));
      for(let k=1;k<run.pts.length;k++) ctx.lineTo(sx(run.pts[k][0]), sy(run.pts[k][1]));
      ctx.lineWidth=Math.max(2,run.depth*view.scale)*2;
      ctx.stroke();
    }
  });
  // C — and only now punch the doorways, each to the depth of the wall it sits in
  ctx.lineCap='butt';
  members.forEach((m,mi)=>{
    for(const o of m.l.openings){
      if(wallIsOff(m.l.room,o.wall)) continue;
      const g=openGeom(o,m.P,m.l.room);
      const d=depths[mi][o.wall] != null ? depths[mi][o.wall] : (m.l.room.wall||0);
      ctx.strokeStyle = o.kind==='window' ? C.glass : m.l.room.floor;
      ctx.lineWidth=Math.max(2,d*view.scale)*2+2;
      ctx.beginPath(); ctx.moveTo(sx(g.p0[0]),sy(g.p0[1])); ctx.lineTo(sx(g.p1[0]),sy(g.p1[1])); ctx.stroke();
    }
  });
  ctx.restore();
}

const floorWallsLayer = {
  id:'floor-walls', z:40, scene:'floor',
  draw(ctx, view, f){ if(!f.empty) drawFloorWalls(f); }
};

export {floorWallsLayer};
