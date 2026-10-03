/* Furniture mode's marquee: the box being dragged out to select. */

import {ctx} from '../view.js';
import {PAL} from '../paint.js';
import {hexA} from '../../core/color.js';
import {drag} from '../interaction-state.js';

function drawMarquee(){
  if(!drag.value||drag.value.mode!=='marquee') return;
  const x0=Math.min(drag.value.x0,drag.value.x1), x1=Math.max(drag.value.x0,drag.value.x1);
  const y0=Math.min(drag.value.y0,drag.value.y1), y1=Math.max(drag.value.y0,drag.value.y1);
  const C=PAL();
  ctx.save();
  ctx.fillStyle=hexA(C.accent,.08);
  ctx.fillRect(x0,y0,x1-x0,y1-y0);
  ctx.setLineDash([5,4]); ctx.lineWidth=1.25; ctx.strokeStyle=C.accent;
  ctx.strokeRect(x0,y0,x1-x0,y1-y0);
  ctx.setLineDash([]);
  ctx.restore();
}

const marqueeOverlay = {
  id:'marquee', z:170, scene:'room',
  deps(){ drag.value; },
  draw(){ drawMarquee(); }
};

export {marqueeOverlay};
