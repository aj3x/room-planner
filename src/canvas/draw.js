/* Drawing: the canvas palette, and in later rounds draw() and the draw*()
   helpers that render the plan.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. (setForceLightCanvas is the exception it names itself: it
   was added to index.html one commit earlier, beside the binding it wraps, and
   moved here with the rest.)

   Instalment 1 was the palette; instalment 2 added the two path primitives
   (addPoly, pathPoly) and the colour/text helpers (clip, normHex, hexA,
   pickText), all of which were already dependency-free once canvas/view.js
   had taken ctx/sx/sy. The region's `drawing` banner stayed in index.html with
   draw() and the draw*() helpers it still heads. draw()
   itself could not come: it needs the selection lets (sel, selSet, roomSel,
   floorSel, mergeSel, floorGuides, floorSnapNote, alignGuides, alignNote), the
   interaction lets (drag, drawState, drawCursor, wallDrawState,
   wallDrawShift), W and H, and four draw*() helpers that live in the
   measuring, split-room and walk-path regions. See the canvas/ round's notes
   in .claude/plans/refactor-split.md.

   The palette had to lead, because every canvas module reads PAL().

   Top-level: window.matchMedia() is a BOM read that returns a live query
   object -- no listener, no work scheduled. The `change` listener that used to
   follow PAL() stayed in index.html at its exact spot, per the convention the
   ui/ round set: registering it at import time would move it ahead of every
   other listener in the file. */

import {ctx, sx, sy} from './view.js';

/* canvas colours mirror the CSS tokens (DESIGN.md §3.10); saved images always use `light`.
   Only what sits on the stage (background, walls, wall labels) changes in dark mode — selection,
   handles and warnings are drawn over the floor, which is the user's own (usually light) colour. */
const CANVAS={
  light:{stage:'#e6e6e2', stageAccent:'#2a5bd7', wall:'#2b2b29', wallEdge:'rgba(29,29,27,.5)', pillar:'#585853', ink:'#1d1d1b', ink2:'#585853',
         surface:'#fcfcfb', accent:'#2a5bd7', accentSoft:'#e9effc', danger:'#c0392b', dangerRGB:'192,57,43',
         grid:'rgba(29,29,27,.075)', trim:'rgba(29,29,27,.10)', glass:'#cfd8e2', glassLine:'#5c7a99', swing:'rgba(29,29,27,.05)', swingLine:'rgba(29,29,27,.3)',
         scrim:'rgba(20,20,19,.45)', ok:'#1f7a4d', okSoft:'#dcf0e4'},
  dark: {stage:'#141413', stageAccent:'#7aa2f7', wall:'#8a8a84', wallEdge:'rgba(236,236,234,.35)', pillar:'#6f6f69', ink:'#1d1d1b', ink2:'#adada7',
         surface:'#fcfcfb', accent:'#2a5bd7', accentSoft:'#e9effc', danger:'#c0392b', dangerRGB:'192,57,43',
         grid:'rgba(29,29,27,.075)', trim:'rgba(29,29,27,.10)', glass:'#9fb3c8', glassLine:'#5c7a99', swing:'rgba(29,29,27,.06)', swingLine:'rgba(29,29,27,.35)',
         scrim:'rgba(20,20,19,.45)', ok:'#1f7a4d', okSoft:'#dcf0e4'}
};
const darkMQ=window.matchMedia('(prefers-color-scheme: dark)');
let forceLightCanvas=false;
function setForceLightCanvas(v){ forceLightCanvas = v; }
const PAL = () => (!forceLightCanvas && darkMQ.matches) ? CANVAS.dark : CANVAS.light;

function addPoly(p){
  ctx.moveTo(sx(p[0][0]),sy(p[0][1]));
  for(let i=1;i<p.length;i++) ctx.lineTo(sx(p[i][0]),sy(p[i][1]));
  ctx.closePath();
}
function pathPoly(p){ ctx.beginPath(); addPoly(p); }

function clip(txt,wpx){ const max=Math.floor(wpx/7.2); return txt.length>max?txt.slice(0,Math.max(1,max-1))+'…':txt; }
/* accepts #abc, #aabbcc, or the same without the # — returns canonical '#aabbcc' or null */
function normHex(v){
  let h=String(v==null?'':v).trim().replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(h)) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return /^[0-9a-f]{6}$/i.test(h) ? '#'+h.toLowerCase() : null;
}
function hexA(hex,a){ const n=parseInt(hex.slice(1),16); return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }
function pickText(hex,light){
  const n=parseInt(hex.slice(1),16);
  const lum=(0.299*((n>>16)&255)+0.587*((n>>8)&255)+0.114*(n&255))/255;
  return (light||lum>.62)?'#1d1d1b':'#ffffff';
}

/* Instalment 3: the three overlays that draw what a gesture is doing -- the
   alignment guides, the 90-degree tick, and the outline being drawn. They
   could not come until the selection and interaction lets were out of
   index.html, which is what the commits before this one did. */
import {alignGuides} from '../core/selection.js';
import {drawState, drawCursor} from './interaction-state.js';

/* the dashed lines saying which alignment is holding a dragged or hovered point */
function drawAlignGuides(){
  if(!alignGuides.length) return;
  const C=PAL();
  ctx.save();
  ctx.setLineDash([6,5]); ctx.lineWidth=1.5; ctx.strokeStyle=C.accent;
  for(const g of alignGuides){
    ctx.beginPath(); ctx.moveTo(sx(g[0][0]),sy(g[0][1])); ctx.lineTo(sx(g[1][0]),sy(g[1][1])); ctx.stroke();
  }
  ctx.restore();
}
/* The square in the corner, the way a plan marks 90°. On a corner that turns the other
   way it lands on the wall band, so it is drawn twice — a pale line first, then the
   accent over it — to stay legible whatever is underneath. */
function drawSquareTick(a,b,c){
  const C=PAL(), bx=sx(b[0]), by=sy(b[1]);
  const dir=(q)=>{ const dx=sx(q[0])-bx, dy=sy(q[1])-by, l=Math.hypot(dx,dy); return l<1?null:[dx/l,dy/l]; };
  const u=dir(a), v=dir(c);
  if(!u||!v) return;
  const s=16;
  ctx.save();
  ctx.lineJoin='miter';
  for(const pass of [{w:5, c:C.surface}, {w:2.5, c:C.accent}]){
    ctx.beginPath();
    ctx.moveTo(bx+u[0]*s, by+u[1]*s);
    ctx.lineTo(bx+(u[0]+v[0])*s, by+(u[1]+v[1])*s);
    ctx.lineTo(bx+v[0]*s, by+v[1]*s);
    ctx.strokeStyle=pass.c; ctx.lineWidth=pass.w; ctx.stroke();
  }
  ctx.restore();
}
function drawCustomOverlay(){
  if(!drawState) return;
  const pts=drawState.pts, C=PAL();
  ctx.save();
  ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.setLineDash([5,4]);
  ctx.beginPath();
  if(pts.length){
    ctx.moveTo(sx(pts[0][0]),sy(pts[0][1]));
    for(let i=1;i<pts.length;i++) ctx.lineTo(sx(pts[i][0]),sy(pts[i][1]));
    if(drawCursor) ctx.lineTo(sx(drawCursor[0]),sy(drawCursor[1]));
  }
  ctx.stroke(); ctx.setLineDash([]);
  for(let i=0;i<pts.length;i++){
    const near0 = i===0 && pts.length>=3 && drawCursor && Math.hypot(sx(pts[0][0])-sx(drawCursor[0]),sy(pts[0][1])-sy(drawCursor[1]))<12;
    ctx.beginPath(); ctx.arc(sx(pts[i][0]),sy(pts[i][1]), (i===0?7:5), 0, Math.PI*2);
    ctx.fillStyle = near0 ? C.accent : (i===0?C.accentSoft:C.surface);
    ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  }
  ctx.restore();
}

/* Instalment 4: the measuring passes. drawMeasures is the last of the four
   draw*() helpers the canvas/ round listed as blocking draw() -- the other
   three were drawCustomOverlay (instalment 3), drawSplitOverlay
   (canvas/split-room.js) and drawWalkOverlay (model/walkpaths.js).

   They are here rather than with model/measures.js because measures.js is
   the geometry -- anchorGeom, closestBetween, what a measurement joins --
   and these six are paint. drawDimension in particular is shared: the item
   dimension lines use it too.

   The measure tool's pick/hit-test/bar functions stayed in index.html; they
   call draw(), renderMeasureBar() and save(). */
import {measureOn, measureStart, measureHover, measureHoverId, measureSel,
        measureCursor, measureBoxes, setMeasureBoxes} from './measure-state.js';
import {measuresOf, measureObjs, objOfAnchor, anchorKey, anchorGeom,
        closestBetween} from '../model/measures.js';
import {S} from '../core/state.js';
import {fmtLen} from '../core/units.js';

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
/* a dimension line with end ticks and its length on a label; returns where it was drawn */
function drawDimension(r,color,C,dashed){
  const p=[sx(r.p[0]),sy(r.p[1])], q=[sx(r.q[0]),sy(r.q[1])];
  const len=Math.hypot(q[0]-p[0],q[1]-p[1]);
  const u = len>1 ? [(q[0]-p[0])/len,(q[1]-p[1])/len] : [1,0], n=[-u[1],u[0]];
  ctx.save(); ctx.lineCap='round';
  ctx.beginPath();
  if(len>1){
    ctx.moveTo(p[0],p[1]); ctx.lineTo(q[0],q[1]);
    for(const e of [p,q]){ ctx.moveTo(e[0]-n[0]*5,e[1]-n[1]*5); ctx.lineTo(e[0]+n[0]*5,e[1]+n[1]*5); }
  } else ctx.arc(p[0],p[1],4,0,Math.PI*2);
  // a surface halo under the line, so it reads on the floor, on furniture and on the stage
  ctx.lineWidth=4; ctx.strokeStyle=C.surface; ctx.stroke();
  if(dashed) ctx.setLineDash([5,4]);
  ctx.lineWidth=1.5; ctx.strokeStyle=color; ctx.stroke();
  ctx.setLineDash([]);
  const txt = r.d<0.5 ? 'Touching' : fmtLen(r.d,S.unit);
  ctx.font='600 11px ui-sans-serif,-apple-system,system-ui,sans-serif';
  const w=ctx.measureText(txt).width+12, h=20;
  let cx=(p[0]+q[0])/2, cy=(p[1]+q[1])/2;
  // a line shorter than its label would disappear under it, so the label steps off to one side
  if(len<w+16){ const k=(n[1]>0?-1:1)*(len>1?14:18); cx+=n[0]*k; cy+=n[1]*k; }
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(cx-w/2,cy-h/2,w,h,h/2); else ctx.rect(cx-w/2,cy-h/2,w,h);
  ctx.fillStyle=C.surface; ctx.globalAlpha=.94; ctx.fill(); ctx.globalAlpha=1;
  ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(txt,cx,cy);
  ctx.restore();
  return {p,q,x:cx-w/2,y:cy-h/2,w,h};
}
function drawMeasures(){
  setMeasureBoxes([]);
  if(!S.showMeasure && !measureOn) return;
  const C=PAL(), objs=measureObjs();
  if(measureOn){
    if(measureHover) drawAnchorChoices(measureHover,objs,C);
    if(measureStart) drawAnchorPart(measureStart,objs,C);
  }
  for(const m of measuresOf()){
    const A=anchorGeom(m.a,objs), B=anchorGeom(m.b,objs);
    if(!A||!B) continue;
    const on = measureOn && (m.id===measureSel || m.id===measureHoverId);
    if(on){ drawAnchorPart(m.a,objs,C); drawAnchorPart(m.b,objs,C); }
    measureBoxes.push(Object.assign({id:m.id}, drawDimension(closestBetween(A,B), on?C.accent:C.ink, C, false)));
  }
  if(measureOn && measureStart){
    // the measurement being made: to the anchor under the pointer, or to the pointer itself
    const A=anchorGeom(measureStart,objs);
    const B = measureHover && anchorKey(measureHover)!==anchorKey(measureStart) ? anchorGeom(measureHover,objs)
      : measureCursor ? {pts:[measureCursor]} : null;
    if(A&&B) drawDimension(closestBetween(A,B), C.accent, C, true);
  }
}

export {CANVAS, darkMQ, PAL, setForceLightCanvas,
        addPoly, pathPoly, clip, normHex, hexA, pickText,
        drawAlignGuides, drawSquareTick, drawCustomOverlay,
        drawDimension, drawMeasures};
