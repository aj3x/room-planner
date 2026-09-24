/* Marketplace tiles and the item preview canvas.

   Extracted from index.html in Phase 3, move-only: the four blocks below are
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   drawPreview takes its canvas as an argument, so nothing here reads
   canvas/view.js; the only canvas import is hexA.

   What renders a marketplace did not come -- renderMarketTop,
   renderMarketSub, renderMarketItemPreview, addMarketDialog, subMenu and
   selectListing all reach renderLibContent or renderLibAll, and are inside
   the Plan-panels/Library SCC.
*/
import {hexA} from '../canvas/draw.js';
import {bbox, shapePoly} from '../core/geometry.js';
import {idParts} from '../core/ids.js';
import {hasOpen, openLocalBox} from '../core/open-state.js';
import {S} from '../core/state.js';
import {marketIndexCache} from './market-subs.js';
import {nav} from './nav.js';
import {svgI} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';

function marketSubTile(sub){
  const items=marketIndexCache.get(sub.id);
  let inner='';
  if(nav.showMarketContents){
    if(!items){ inner='<div class="sub" data-loadsub="'+sub.id+'">Loading…</div>'; }
    else {
      const groups=new Map();
      for(const it of items){
        const seg=it.id.includes('/') ? idParts(it.id)[0] : null;
        const key=seg||('\0'+it.id);
        if(!groups.has(key)) groups.set(key,{folder:seg, name:seg||it.name, id:it.id, n:0});
        groups.get(key).n++;
      }
      inner='<div class="chips">'+[...groups.values()].slice(0,8).map(g=>
        g.folder ? `<span class="tagchip" data-openmsub="${sub.id}" data-mfolder2="${esc(g.folder)}">${esc(g.folder)}/</span>`
                 : `<span class="tagchip" data-openmsub="${sub.id}" data-mitem="${esc(g.id)}">${esc(g.name)}</span>`
      ).join('')+'</div>';
    }
  }
  return `<button type="button" class="tile subtile" data-opensub="${sub.id}">
    <span class="more" data-act="more" title="More actions" aria-label="More actions">${svgI('more')}</span>
    <div class="thumb">${svgI('store')}</div>
    <div class="body"><div class="nm" title="${esc(sub.name)}">${esc(sub.name)}</div>
      <div class="dim" title="${esc(sub.url)}">${items?plural(items.length,'item'):esc(sub.url)}</div>${inner}</div>
  </button>`;
}

function marketPathChildren(items, prefix){
  const folders=new Map(), leaves=[];
  const plen=prefix?prefix.split('/').length:0;
  for(const it of items){
    const parts=idParts(it.id);
    if(prefix && it.id!==prefix && !it.id.startsWith(prefix+'/')) continue;
    if(parts.length>plen+1){ const seg=parts[plen]; if(!folders.has(seg)) folders.set(seg,0); folders.set(seg, folders.get(seg)+1); }
    else if(parts.length===plen+1) leaves.push(it);
  }
  return {folders:[...folders.entries()].map(([name,n])=>({name,n})), leaves};
}

function marketItemTile(it){
  const have=S.inventory.some(x=>x.id===it.id);
  return `<div class="ttile" data-mitemopen="${esc(it.id)}" role="button" tabindex="0" aria-label="Preview ${esc(it.name)}">
    <div class="tmain"><div class="tname" title="${esc(it.name)}">${esc(it.name)}</div></div>
    <button type="button" class="btn sm${have?' quiet':''}" data-add="${esc(it.id)}" title="Add “${esc(it.name)}” to your library">${have?'Added':'Add'}</button>
  </div>`;
}

function drawPreview(cv,it){
  const ctx=cv.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1,2.5);
  const W=cv.clientWidth||260, H=cv.clientHeight||150;
  cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  if(!it||!it.shape) return;
  const ob=hasOpen(it)?openLocalBox(it):null;
  const b=ob?{x0:ob.x0,y0:ob.y0,x1:ob.x1,y1:ob.y1,w:ob.x1-ob.x0,h:ob.y1-ob.y0}:bbox(shapePoly(it.shape));
  const pad=18, s=Math.min((W-pad*2)/Math.max(b.w,1),(H-pad*2)/Math.max(b.h,1));
  const cx=W/2-((b.x0+b.x1)/2)*s, cy=H/2-((b.y0+b.y1)/2)*s;
  const toPx=([x,y])=>[cx+x*s, cy+y*s];
  if(ob){
    ctx.beginPath();
    [[ob.x0,ob.y0],[ob.x1,ob.y0],[ob.x1,ob.y1],[ob.x0,ob.y1]].forEach((p,i)=>{const [x,y]=toPx(p); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.closePath();
    ctx.setLineDash([4,3]); ctx.strokeStyle=it.color; ctx.lineWidth=1.3; ctx.stroke(); ctx.setLineDash([]);
  }
  const poly=shapePoly(it.shape);
  ctx.beginPath();
  poly.forEach((p,i)=>{const [x,y]=toPx(p); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.closePath();
  ctx.fillStyle=hexA(it.color,.85); ctx.fill();
  ctx.strokeStyle=it.color; ctx.lineWidth=1.5; ctx.stroke();
}
export {marketSubTile, marketPathChildren, marketItemTile, drawPreview};
