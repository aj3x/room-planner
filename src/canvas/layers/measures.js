/* Measurements: each dimension line with its label, and while the Measure
   tool is on, the anchors under the pointer and the one being made. Where
   each label was drawn is kept for hitTest, so a click can pick one. */

import {ctx, sx, sy} from '../view.js';
import {PAL, drawDimension, pathPoly} from '../paint.js';
import {ptSegDist} from '../../core/geometry.js';
import {measureOn, measureStart, measureHover, measureHoverId, measureSel, measureCursor} from '../measure-state.js';
import {measuresOf, measureObjs, objOfAnchor, anchorKey, anchorGeom, closestBetween} from '../../model/measures.js';
import {S} from '../../core/state.js';

let boxes = [];   // where each measurement was last drawn, in screen px

function drawMeasurePoint(p,on,C,square){
  const x=sx(p[0]), y=sy(p[1]);
  ctx.beginPath();
  if(square) ctx.rect(x-4,y-4,8,8); else ctx.arc(x,y,4.5,0,Math.PI*2);
  ctx.fillStyle = on?C.accent:C.surface; ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle=C.accent; ctx.stroke();
}
function strokeWhole(o){
  if(o.whole.area) pathPoly(o.whole.pts);
  else { ctx.beginPath(); ctx.moveTo(sx(o.whole.pts[0][0]),sy(o.whole.pts[0][1])); ctx.lineTo(sx(o.whole.pts[1][0]),sy(o.whole.pts[1][1])); }
  ctx.stroke();
}
/* one anchor, marked in accent */
function drawAnchorPart(a,objs,C){
  const o=objOfAnchor(a,objs);
  if(!o) return;
  ctx.save(); ctx.strokeStyle=C.accent; ctx.lineCap='round'; ctx.lineJoin='round';
  if(a.part==='corner'){ if(o.corners[a.n]) drawMeasurePoint(o.corners[a.n],true,C,true); }
  else if(a.part==='side'){
    const s=o.sides[a.n];
    if(s){ ctx.beginPath(); ctx.moveTo(sx(s[0][0]),sy(s[0][1])); ctx.lineTo(sx(s[1][0]),sy(s[1][1])); ctx.lineWidth=3.5; ctx.stroke(); }
  } else if(a.part==='swing'){
    if(o.swing){ pathPoly(o.swing.pts); ctx.fillStyle=C.accentSoft; ctx.globalAlpha=.5; ctx.fill(); ctx.globalAlpha=1; ctx.lineWidth=2; ctx.stroke(); }
  } else {
    ctx.lineWidth = o.whole.area?2:3.5; strokeWhole(o);
    drawMeasurePoint(o.center,true,C,false);
  }
  ctx.restore();
}
/* the thing under the pointer: every anchor it offers, with the one a click would take filled in */
function drawAnchorChoices(a,objs,C){
  const o=objOfAnchor(a,objs);
  if(!o) return;
  ctx.save();
  ctx.strokeStyle=C.accent; ctx.lineWidth=1; strokeWhole(o);
  if(o.swing && S.showSwing){ ctx.setLineDash([4,3]); pathPoly(o.swing.pts); ctx.stroke(); ctx.setLineDash([]); }
  for(const c of o.corners) drawMeasurePoint(c,false,C,true);
  drawMeasurePoint(o.center,false,C,false);
  ctx.restore();
  drawAnchorPart(a,objs,C);
}
function drawMeasures(){
  boxes=[];
  if(!S.showMeasure && !measureOn.value) return;
  const C=PAL(), objs=measureObjs();
  if(measureOn.value){
    if(measureHover.value) drawAnchorChoices(measureHover.value,objs,C);
    if(measureStart.value) drawAnchorPart(measureStart.value,objs,C);
  }
  for(const m of measuresOf()){
    const A=anchorGeom(m.a,objs), B=anchorGeom(m.b,objs);
    if(!A||!B) continue;
    const on = measureOn.value && (m.id===measureSel.value || m.id===measureHoverId.value);
    if(on){ drawAnchorPart(m.a,objs,C); drawAnchorPart(m.b,objs,C); }
    boxes.push(Object.assign({id:m.id}, drawDimension(closestBetween(A,B), on?C.accent:C.ink, C, false)));
  }
  if(measureOn.value && measureStart.value){
    // the measurement being made: to the anchor under the pointer, or to the pointer itself
    const A=anchorGeom(measureStart.value,objs);
    const B = measureHover.value && anchorKey(measureHover.value)!==anchorKey(measureStart.value) ? anchorGeom(measureHover.value,objs)
      : measureCursor.value ? {pts:[measureCursor.value]} : null;
    if(A&&B) drawDimension(closestBetween(A,B), C.accent, C, true);
  }
}

const measuresLayer = {
  id:'measures', z:130, scene:'room',
  deps(){ measureOn.value; measureStart.value; measureHover.value; measureHoverId.value; measureSel.value; measureCursor.value; },
  draw(){ drawMeasures(); },
  /* a drawn measurement under a screen point: its label, or with `lines` its line too */
  hitTest(px,py,lines){
    for(let i=boxes.length-1;i>=0;i--){
      const b=boxes[i];
      if(px>=b.x-2 && px<=b.x+b.w+2 && py>=b.y-2 && py<=b.y+b.h+2) return b.id;
      if(lines && ptSegDist([px,py],b.p,b.q).d<6) return b.id;
    }
    return null;
  }
};

export {measuresLayer};
