// @ts-check
/* The floor magnet's guides: the neighbour edges a dragged room is lining up with. */

import {ctx, sx, sy} from '../canvas/index.js';
import {floorGuides} from '../../kernel/selection.js';

/** @param {import('../canvas/types.js').FullFloorFrame} f */
function drawFloorGuides({C}){
  for(const g of floorGuides.value){
    ctx.save();
    ctx.setLineDash([6,5]); ctx.lineWidth=1.5; ctx.strokeStyle=C.stageAccent;
    ctx.beginPath(); ctx.moveTo(sx(g[0][0]),sy(g[0][1])); ctx.lineTo(sx(g[1][0]),sy(g[1][1])); ctx.stroke();
    ctx.restore();
  }
}

/** @satisfies {import('../canvas/types.js').Layer} */
const floorGuidesLayer = {
  id:'floor-guides', z:110, scene:'floor',
  deps(){ floorGuides.value; },
  draw(ctx, view, f){ if(!f.empty) drawFloorGuides(f); }
};

export {floorGuidesLayer};
