/* The furniture: pass-through items (rugs) first, then the rest in placement
   order, each hatched when it does not fit. Faded in Room mode. The floor
   scene draws every room's items with drawItem too. */

import {ctx, sx, sy, view, PAL, clip, pathPoly} from '../canvas/index.js';
import {hexA, pickText} from '../../kernel/color.js';
import {bbox, centroid, pointInPoly, worldPoly} from '../../kernel/geometry.js';
import {selSet} from '../../kernel/selection.js';
import {L, furnMode, itemOf, roomMode} from '../../kernel/state.js';

function drawItem(p,isSel,isBadPos){
  const it=itemOf(p.itemId);
  if(!it) return;
  const poly=worldPoly(p,it), C=PAL();
  pathPoly(poly);
  ctx.fillStyle = it.passThrough ? hexA(it.color,.34) : hexA(it.color,.93);
  ctx.fill();
  if(isBadPos){
    ctx.save(); ctx.clip();
    ctx.strokeStyle='rgba('+C.dangerRGB+',.8)'; ctx.lineWidth=2;
    const b0=bbox(poly);
    ctx.beginPath();
    for(let d=b0.x0-(b0.y1-b0.y0)*2; d<b0.x1; d+=220/Math.max(view.scale,1e-4)){
      ctx.moveTo(sx(d),sy(b0.y0)); ctx.lineTo(sx(d+(b0.y1-b0.y0)),sy(b0.y1));
    }
    ctx.stroke(); ctx.restore();
    pathPoly(poly);
  }
  if(!isSel){
    ctx.lineWidth = isBadPos?2:1.25;
    ctx.strokeStyle = isBadPos?C.danger:hexA(it.color,1);
    if(it.passThrough) ctx.setLineDash([6,4]);
    ctx.stroke(); ctx.setLineDash([]);
  }

  const b=bbox(poly);
  let anchor=centroid(poly);
  if(!anchor||!pointInPoly(anchor,poly)) anchor=[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
  if(it.passThrough){
    const up=[anchor[0], b.y0+Math.min(b.h*.16, 22/Math.max(view.scale,1e-4))];
    if(pointInPoly(up,poly)) anchor=up;
  }
  const cxp=sx(anchor[0]), cyp=sy(anchor[1]), wpx=b.w*view.scale, hpx=b.h*view.scale;
  if(wpx>34&&hpx>18){
    const fg=pickText(it.color,it.passThrough);
    const halo = fg==='#ffffff' ? 'rgba(23,27,26,.45)' : 'rgba(255,255,255,.6)';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round'; ctx.miterLimit=2;
    const line=(txt,y,font,alpha)=>{
      ctx.font=font; ctx.globalAlpha*=alpha;
      ctx.strokeStyle=halo; ctx.lineWidth=3; ctx.strokeText(txt,cxp,y);
      ctx.fillStyle=fg; ctx.fillText(txt,cxp,y);
      ctx.globalAlpha/=alpha;
    };
    // just the name: the size is drawn around the item once it's selected (drawItemDims)
    line(clip(it.name,wpx), cyp, '600 12px ui-sans-serif,system-ui,sans-serif', 1);
    ctx.lineJoin='miter';
  }
}

const itemsLayer = {
  id:'items', z:90, scene:'room',
  deps(){ selSet.value; },
  draw(ctx, view, {bad}){
    ctx.globalAlpha = roomMode() ? .4 : 1;
    const drawOrder = L().placed.map((p,i)=>({p,i})).sort((a,b)=>{
      const pa = itemOf(a.p.itemId), pb = itemOf(b.p.itemId);
      const oa = pa&&pa.passThrough ? 0 : 1, ob = pb&&pb.passThrough ? 0 : 1;
      return oa-ob || a.i-b.i;
    });
    for(const {p} of drawOrder) drawItem(p, furnMode()&&selSet.value.has(p.id), bad.has(p.id));
  }
};

export {itemsLayer, drawItem};
