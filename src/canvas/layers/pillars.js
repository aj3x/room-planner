/* Pillars and other fixed structure. */

import {ctx} from '../view.js';
import {PAL, pathPoly} from '../paint.js';
import {worldPoly} from '../../core/geometry.js';
import {L} from '../../core/state.js';

function drawPillars(){
  for(const pl of L().room.pillars){
    const C=PAL();
    pathPoly(worldPoly(pl,pl));
    ctx.fillStyle=C.pillar; ctx.fill();
    ctx.lineWidth=1.25; ctx.strokeStyle=C.wall; ctx.stroke();
  }
}

const pillarsLayer = {id:'pillars', z:60, scene:'room', draw(){ drawPillars(); }};

export {pillarsLayer};
