// @ts-check
/* Pass F of the floor scene. */

import {ctx, pathPoly} from '../canvas/index.js';
import {polyHit} from '../../kernel/geometry.js';

/** @param {import('../canvas/types.js').FullFloorFrame} f */
function drawFloorOverlaps({C, members}){
  // F — two rooms sitting on top of each other is a broken arrangement; say so rather
  //     than trying to render it, since the evenodd clip in pass B can't represent it
  for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++){
    if(!polyHit(members[i].P, members[j].P)) continue;
    ctx.save();
    pathPoly(members[i].P); ctx.clip();
    pathPoly(members[j].P);
    ctx.fillStyle='rgba('+C.dangerRGB+',.22)'; ctx.fill();
    ctx.restore();
  }
}

/** @satisfies {import('../canvas/types.js').Layer} */
const floorOverlapsLayer = {
  id:'floor-overlaps', z:105, scene:'floor',
  draw(ctx, view, f){ if(!f.empty) drawFloorOverlaps(f); }
};

export {floorOverlapsLayer};
