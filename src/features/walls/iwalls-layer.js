// @ts-check
/* Freestanding interior walls. */

import {ctx, PAL, pathPoly} from '../canvas/index.js';
import {L} from '../../kernel/state.js';
import {iwallPoly} from '../../kernel/model/walls.js';

function drawIWalls(){
  for(const w of L().room.iwalls){
    const C=PAL();
    pathPoly(iwallPoly(w));
    ctx.fillStyle=C.wall; ctx.fill();
    ctx.lineWidth=1; ctx.strokeStyle=C.wallEdge; ctx.stroke();
  }
}

/** @satisfies {import('../canvas/types.js').Layer} */
const iwallsLayer = {id:'iwalls', z:50, scene:'room', draw(){ drawIWalls(); }};

export {iwallsLayer};
