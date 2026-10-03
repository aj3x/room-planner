/* Room mode's tracing aid: the other rooms on this room's floor, faint. */

import {ctx, sx, sy, view} from '../view.js';
import {PAL, clip, pathPoly} from '../paint.js';
import {floorPt, floorPtInv, floorXf} from '../../core/floor-space.js';
import {bbox} from '../../core/geometry.js';
import {L, floorLayouts, floorOf, roomMode} from '../../core/state.js';

/* While editing one room, show the others on its floor as a faint backdrop, drawn
   in THIS room's own space. Shaping a foyer to meet four neighbours is guesswork
   otherwise. Nothing here is pickable; it is a tracing aid, not part of the room. */
function drawFloorUnderlay(){
  const me=L(), fl=floorOf(me.floorId); if(!fl) return;
  const t=floorXf(me), C=PAL();
  ctx.save();
  ctx.globalAlpha=0.3;
  for(const o of floorLayouts(fl.id)){
    if(o.id===me.id) continue;
    const to=floorXf(o);
    const pts=o.room.points.map(p=>floorPtInv(t, floorPt(to,p)));
    pathPoly(pts);
    ctx.fillStyle=o.room.floor; ctx.fill('evenodd');
    ctx.lineWidth=Math.max(1,(o.room.wall||0)*view.scale);
    ctx.strokeStyle=C.wall; ctx.stroke();
    const b=bbox(pts), wpx=b.w*view.scale;
    if(wpx>56 && b.h*view.scale>24){
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='600 11px ui-sans-serif,system-ui,sans-serif'; ctx.fillStyle=C.ink2;
      ctx.fillText(clip(o.name.toUpperCase(), wpx), sx((b.x0+b.x1)/2), sy((b.y0+b.y1)/2));
    }
  }
  ctx.restore();
}

const floorUnderlayLayer = {
  id:'floor-underlay', z:10, scene:'room',
  draw(){ if(roomMode()) drawFloorUnderlay(); }
};

export {floorUnderlayLayer};
