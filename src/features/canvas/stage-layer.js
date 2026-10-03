/* The stage: the canvas cleared to the background colour. Under everything,
   in both scenes. */

import {H, W} from './view.js';

const stageLayer = {
  id:'stage', z:0,
  draw(ctx, view, f){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=f.C.stage; ctx.fillRect(0,0,W,H);
  }
};

export {stageLayer};
