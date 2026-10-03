/* An item's footprint drawn into a tile's own little canvas, with its open
   state dashed around it: the Library grid, a listing and a marketplace item
   all use it. It takes the canvas as an argument and reads nothing else. */
import {hexA} from '../../kernel/color.js';
import {bbox, shapePoly} from '../../kernel/geometry.js';
import {hasOpen, openLocalBox} from '../../kernel/open-state.js';

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
  const toPx=(/** @type {import('../../kernel/types.js').Pt} */[x,y])=>[cx+x*s, cy+y*s];
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

export {drawPreview};
