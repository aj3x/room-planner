// @ts-check
/* Pillars and other fixed structure. */

import {ctx, PAL, pathPoly} from '../canvas/index.js';
import {worldPoly} from '../../kernel/geometry.js';
import {L} from '../../kernel/state.js';

function drawPillars(){
  for(const pl of L().room.pillars){
    const C=PAL();
    pathPoly(worldPoly(pl,pl));
    ctx.fillStyle=C.pillar; ctx.fill();
    ctx.lineWidth=1.25; ctx.strokeStyle=C.wall; ctx.stroke();
  }
}

/** @satisfies {import('../canvas/types.js').Layer} */
const pillarsLayer = {id:'pillars', z:60, scene:'room', draw(){ drawPillars(); }};

export {pillarsLayer};
