/* Room mode: the dashed lines saying which alignment is holding a dragged
   corner or the next corner of an outline being drawn. */

import {ctx, sx, sy} from './view.js';
import {PAL} from './paint.js';
import {alignGuides} from '../../kernel/selection.js';
import {roomMode} from '../../kernel/state.js';

/* the dashed lines saying which alignment is holding a dragged or hovered point */
function drawAlignGuides(){
  if(!alignGuides.value.length) return;
  const C=PAL();
  ctx.save();
  ctx.setLineDash([6,5]); ctx.lineWidth=1.5; ctx.strokeStyle=C.accent;
  for(const g of alignGuides.value){
    ctx.beginPath(); ctx.moveTo(sx(g[0][0]),sy(g[0][1])); ctx.lineTo(sx(g[1][0]),sy(g[1][1])); ctx.stroke();
  }
  ctx.restore();
}

const alignGuidesLayer = {
  id:'align-guides', z:110, scene:'room',
  deps(){ alignGuides.value; },
  draw(){ if(roomMode()) drawAlignGuides(); }
};

export {alignGuidesLayer};
