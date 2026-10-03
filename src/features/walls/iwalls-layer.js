/* Freestanding interior walls. */

import {ctx} from '../canvas/view.js';
import {PAL, pathPoly} from '../canvas/paint.js';
import {L} from '../../kernel/state.js';
import {iwallPoly} from '../../kernel/walls.js';

function drawIWalls(){
  for(const w of L().room.iwalls){
    const C=PAL();
    pathPoly(iwallPoly(w));
    ctx.fillStyle=C.wall; ctx.fill();
    ctx.lineWidth=1; ctx.strokeStyle=C.wallEdge; ctx.stroke();
  }
}

const iwallsLayer = {id:'iwalls', z:50, scene:'room', draw(){ drawIWalls(); }};

export {iwallsLayer};
