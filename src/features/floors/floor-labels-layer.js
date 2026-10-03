/* Pass E of the floor scene: which room is which, without having to open it. */

import {ctx, sx, sy, view} from '../canvas/view.js';
import {PAL, clip} from '../canvas/paint.js';
import {bbox, centroid, pointInPoly} from '../../kernel/geometry.js';
import {S} from '../../kernel/state.js';
import {fmtLen} from '../../kernel/units.js';

function drawFloorLabel(m){
  const C=PAL(), b=bbox(m.P), wpx=b.w*view.scale, hpx=b.h*view.scale;
  if(wpx<56 || hpx<34) return;
  let anchor=centroid(m.P);
  if(!anchor||!pointInPoly(anchor,m.P)) anchor=[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
  const own=bbox(m.l.room.points);
  const dims=m.l.dimLabel || (fmtLen(own.w,S.unit)+' × '+fmtLen(own.h,S.unit));
  const cxp=sx(anchor[0]), cyp=sy(anchor[1]);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='600 12px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle=C.ink;
  ctx.fillText(clip(m.l.name.toUpperCase(), wpx), cxp, cyp-7);
  ctx.font='400 11px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle=C.ink2;
  ctx.fillText(clip(dims, wpx), cxp, cyp+8);
}

const floorLabelsLayer = {
  id:'floor-labels', z:100, scene:'floor',
  draw(ctx, view, {members, empty}){ if(!empty) for(const m of members) drawFloorLabel(m); }
};

export {floorLabelsLayer};
