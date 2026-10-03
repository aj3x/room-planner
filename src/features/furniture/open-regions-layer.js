/* Where each item reaches when it is opened (doors, drawers): shown for
   everything when the view setting is on, and always for what you have hold
   of. Faded in Room mode, like the items. */

import {ctx, PAL, pathPoly} from '../canvas/index.js';
import {openPoly} from '../../kernel/open-state.js';
import {hexA} from '../../kernel/color.js';
import {selSet} from '../../kernel/selection.js';
import {L, S, furnMode, itemOf, roomMode} from '../../kernel/state.js';

/* the open footprint is always drawn for whatever you have hold of, so you can
   see where it will reach as you place it, toggle on or off */
const showOpenFor = p => S.showOpen || (furnMode() && selSet.value.has(p.id));
function drawOpenRegion(p,bad){
  const it=itemOf(p.itemId);
  const poly=it&&openPoly(p,it);
  if(!poly) return;
  const C=PAL();
  pathPoly(poly);
  ctx.fillStyle = bad ? 'rgba('+C.dangerRGB+',.12)' : hexA(it.color,.15);
  ctx.fill();
  ctx.setLineDash([5,4]); ctx.lineWidth=bad?1.5:1.25;
  ctx.strokeStyle = bad ? 'rgba('+C.dangerRGB+',.75)' : hexA(it.color,.55);
  ctx.stroke(); ctx.setLineDash([]);
}

const openRegionsLayer = {
  id:'open-regions', z:80, scene:'room',
  deps(){ selSet.value; },
  draw(ctx, view, {openBad}){
    ctx.globalAlpha = roomMode() ? .4 : 1;
    for(const p of L().placed) if(showOpenFor(p)) drawOpenRegion(p, openBad.has(p.id));
  }
};

export {openRegionsLayer};
