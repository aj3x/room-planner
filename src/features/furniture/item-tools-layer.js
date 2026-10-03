/* Furniture mode's selection: an outline on every selected item, and for a
   single one its rotate handle and dimension lines. hitTest says whether a
   screen point is on that rotate handle. */

import {ctx, sx, sy, view, PAL, drawDimension, pathPoly} from '../canvas/index.js';
import {bbox, shapePoly, worldPoly} from '../../kernel/geometry.js';
import {sel, selSet} from '../../kernel/selection.js';
import {L, S, furnMode, instOf, itemOf} from '../../kernel/state.js';
import {getConflicts} from '../../kernel/validity.js';

/* the selected item's outline and rotate handle, drawn after everything else so nothing covers them */
function drawItemTools(){
  if(!selSet.value.size) return;
  const C=PAL(), {bad}=getConflicts();
  // selection: a surface halo under a crisp accent line, so it reads on any furniture colour
  for(const id of selSet.value){
    const p=L().placed.find(q=>q.id===id), it=p&&itemOf(p.itemId);
    if(!it) continue;
    const isBadPos=bad.has(p.id);
    pathPoly(worldPoly(p,it));
    ctx.lineJoin='round';
    ctx.lineWidth=5; ctx.strokeStyle=C.surface; ctx.stroke();
    ctx.lineWidth=2; ctx.strokeStyle=isBadPos?C.danger:C.accent; ctx.stroke();
    ctx.lineJoin='miter';
  }
  // rotate handle only makes sense for a single selected item
  if(selSet.value.size!==1) return;
  const p=instOf(sel.value), it=p&&itemOf(p.itemId);
  if(!it) return;
  const isBadPos=bad.has(p.id);
  const h=handlePos(p,it);
  const lb=bbox(shapePoly(it.shape)), r=(p.rot||0)*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  const lx=(lb.x0+lb.x1)/2, ly=lb.y0;
  const ex=p.x+lx*c-ly*s, ey=p.y+lx*s+ly*c;
  ctx.beginPath(); ctx.moveTo(sx(ex),sy(ey)); ctx.lineTo(h.x,h.y);
  ctx.strokeStyle=isBadPos?C.danger:C.accent; ctx.lineWidth=1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(h.x,h.y,7,0,Math.PI*2);
  ctx.fillStyle=C.surface; ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  if(S.showDims) drawItemDims(p,it,C);
}
/* the selected item's width and depth as dimension lines just outside it, turning with it.
   Width runs along the edge opposite the rotate handle, depth along whichever end sits
   further right on screen. */
function drawItemDims(p,it,C){
  const lb=bbox(shapePoly(it.shape)), r=(p.rot||0)*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  const W = (x,y) => [p.x+x*c-y*s, p.y+x*s+y*c];
  const px=1/Math.max(view.scale,1e-6), gap=6*px, off=18*px;
  const endX = sx(W(lb.x1,0)[0]) >= sx(W(lb.x0,0)[0]) ? lb.x1 : lb.x0, out = endX===lb.x1 ? 1 : -1;
  const dims=[
    // [from corner, to corner, outward direction in the item's frame]
    [[lb.x0,lb.y1], [lb.x1,lb.y1], [0,1]],
    [[endX,lb.y0], [endX,lb.y1], [out,0]]
  ];
  for(const [a,b,[nx,ny]] of dims){
    const at = (q,k) => W(q[0]+nx*k, q[1]+ny*k);
    // extension lines from the item out past the dimension line
    ctx.save();
    ctx.beginPath();
    for(const q of [a,b]){ const e0=at(q,gap), e1=at(q,off+4*px); ctx.moveTo(sx(e0[0]),sy(e0[1])); ctx.lineTo(sx(e1[0]),sy(e1[1])); }
    ctx.lineWidth=3; ctx.strokeStyle=C.surface; ctx.stroke();
    ctx.lineWidth=1; ctx.strokeStyle=C.ink; ctx.stroke();
    ctx.restore();
    const pa=at(a,off), pb=at(b,off);
    drawDimension({d:Math.hypot(b[0]-a[0],b[1]-a[1]), p:pa, q:pb}, C.ink, C, false);
  }
}
const handlePos = (p,it) => {
  const lb=bbox(shapePoly(it.shape)), r=(p.rot||0)*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  const lx=(lb.x0+lb.x1)/2, ly=lb.y0-26/Math.max(view.scale,1e-6);
  return {x:sx(p.x+lx*c-ly*s), y:sy(p.y+lx*s+ly*c)};
};

const itemToolsLayer = {
  id:'item-tools', z:125, scene:'room',
  deps(){ sel.value; selSet.value; },
  draw(){ if(furnMode()) drawItemTools(); },
  /* the rotate handle of the one selected item, if (px,py) is on it */
  hitTest(px,py){
    if(selSet.value.size!==1 || !sel.value) return null;
    const inst=instOf(sel.value), it=inst&&itemOf(inst.itemId);
    if(!inst||!it) return null;
    const h=handlePos(inst,it);
    return Math.hypot(px-h.x,py-h.y)<14 ? inst : null;
  }
};

export {itemToolsLayer};
