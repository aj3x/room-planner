/* Pass D of the floor scene: door and window symbols, structure, then
   everything standing in each room — room by room, so one room's contents
   stack over the last room's exactly as they always have. */

import {ctx} from '../view.js';
import {pathPoly} from '../paint.js';
import {floorIWall, floorInst} from '../../core/floor-space.js';
import {worldPoly} from '../../core/geometry.js';
import {iwallPoly, wallIsOff} from '../../model/walls.js';
import {drawOpening} from './openings.js';
import {drawItem} from './items.js';

function drawFloorContents({C, members, depths}){
  members.forEach((m,mi)=>{
    /* jambs and window lines are drawn across the band, so they take its depth too */
    for(const o of m.l.openings){
      if(wallIsOff(m.l.room,o.wall)) continue;
      const d=depths[mi][o.wall];
      drawOpening(o, [], d ? Object.assign({}, m.l.room, {wall:d}) : m.l.room, m.P);
    }
    for(const w of m.l.room.iwalls){
      pathPoly(iwallPoly(floorIWall(m.l,w,m.t)));
      ctx.fillStyle=C.wall; ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle=C.wallEdge; ctx.stroke();
    }
    for(const pl of m.l.room.pillars){
      const fp=floorInst(m.l,pl,m.t);
      pathPoly(worldPoly(fp,fp));
      ctx.fillStyle=C.pillar; ctx.fill();
      ctx.lineWidth=1.25; ctx.strokeStyle=C.wall; ctx.stroke();
    }
    for(const p of m.l.placed) drawItem(floorInst(m.l,p,m.t), false, false);
  });
}

const floorContentsLayer = {
  id:'floor-contents', z:70, scene:'floor',
  draw(ctx, view, f){ if(!f.empty) drawFloorContents(f); }
};

export {floorContentsLayer};
