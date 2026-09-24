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

/* Instalment 5: draw() itself, and the whole drawing banner with it -- the
   floor plan, the arranging magnet, the grid, the walls, the openings, the
   items, the handles and the status readout. 766 lines.

   This is the keystone the canvas/ round stopped at. Its finding was that
   draw() is one connected component of about 1,500 lines that cannot be cut
   into green intermediate commits. That was true while the state it reads
   was stuck in index.html; it stopped being true once the nine selection
   lets, the six interaction lets, the seven measure lets and W/H moved into
   leaf modules. Each of the four draw*() helpers then moved on its own, each
   commit green, and what is left here is one ordinary move.

   Four import lines that stood inside the region are not in the paste: two
   imported addPoly/pathPoly and clip/normHex/hexA/pickText from this very
   file and are now local, and two imported from canvas/merge-rooms.js and
   are hoisted to the header below. Nothing else about the 766 lines changed.

   The imports of ./split-room.js and ../model/walkpaths.js close two cycles
   -- both modules import PAL, addPoly or drawSquareTick back from here. That
   is rule 4's case exactly: every name involved is a function declaration or
   is only read inside a function body, so nothing is touched during module
   evaluation and no binding is in TDZ when it matters. */
import {PARALLEL_TOL} from './merge-rooms.js';
import {drag, wallDrawShift, wallDrawState} from './interaction-state.js';
import {H, W, axisLockFrom, snapPt, view, wx, wy} from './view.js';
import {floorIWall, floorInst, floorPt, floorPtInv, floorPts, floorXf, ptsAt} from '../core/floor-space.js';
import {bbox, centroid, pointInPoly, polyArea, polyHit, shapePoly, worldPoly} from '../core/geometry.js';
import {openPoly} from '../core/open-state.js';
import {alignNote, floorGuides, floorSel, floorSnapNote, mergeSel, roomSel, sel, selSet} from '../core/selection.js';
import {L, RP, floorLayouts, floorMode, floorOf, furnMode, instOf, itemOf, roomMode} from '../core/state.js';
import {fmtArea} from '../core/units.js';
import {blockedOpenings, openGeom, swingPoly} from '../model/openings.js';
import {getConflicts} from '../model/validity.js';
import {iwallPoly, snapWallPoint, wallIsOff, wallOf, wallRuns} from '../model/walls.js';
import {$} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';
import {drawSplitOverlay} from './split-room.js';
import {drawWalkOverlay} from '../model/walkpaths.js';

/* ------------------------- drawing ------------------------- */

function draw(){
  if(floorMode()){ drawFloor(); return; }
  const r=L().room, P=RP(), C=PAL();
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle=C.stage; ctx.fillRect(0,0,W,H);
  if(roomMode()) drawFloorUnderlay();

  pathPoly(P); ctx.fillStyle=r.floor; ctx.fill('evenodd');
  drawGrid(P);
  if(r.trimOn && r.trim>0){
    ctx.save(); pathPoly(P); ctx.clip();
    pathPoly(P);
    ctx.lineWidth=Math.max(1,r.trim*2*view.scale);
    ctx.strokeStyle=C.trim; ctx.stroke();
    ctx.restore();
  }
  drawWalkOverlay();
  drawWalls();
  drawIWalls();
  drawPillars();
  const blocked = S.showSwing ? blockedOpenings() : [];
  for(const o of L().openings) if(!wallIsOff(r,o.wall)) drawOpening(o, blocked);

  const {bad,openBad}=getConflicts();
  ctx.globalAlpha = roomMode() ? .4 : 1;
  for(const p of L().placed) if(showOpenFor(p)) drawOpenRegion(p, openBad.has(p.id));
  const drawOrder = L().placed.map((p,i)=>({p,i})).sort((a,b)=>{
    const pa = itemOf(a.p.itemId), pb = itemOf(b.p.itemId);
    const oa = pa&&pa.passThrough ? 0 : 1, ob = pb&&pb.passThrough ? 0 : 1;
    return oa-ob || a.i-b.i;
  });
  for(const {p} of drawOrder) drawItem(p, furnMode()&&selSet.has(p.id), bad.has(p.id));
  ctx.globalAlpha = 1;

  drawWallLabels();
  // editing tools always sit above everything else on the plan
  if(roomMode()) drawHandles(); else if(furnMode()) drawItemTools();
  drawMeasures();
  drawCustomOverlay();
  drawWallDrawOverlay();
  drawSplitOverlay();
  drawMarquee();
  updateReadout(bad, openBad);
}
/* ---- the floor, drawn as one plan ----
   Walls are why this has its own pass order rather than looping draw(). A room's
   band lies OUTSIDE its measured face (see drawWalls), so two rooms parked exactly
   one wall-thickness apart both fill that same gap and it reads as a single shared
   wall, with no boolean geometry anywhere. That only holds if every band is laid
   down BEFORE any opening is punched: punch as you go and the next room's band
   paints the doorway shut again. */
function floorMembers(fl){
  return fl ? floorLayouts(fl.id).map(l=>{ const t=floorXf(l); return {l, t, P:l.room.points.map(p=>floorPt(t,p))}; }) : [];
}
function drawFloor(){
  const C=PAL(), fl=floorOf(L().floorId), members=floorMembers(fl);
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle=C.stage; ctx.fillRect(0,0,W,H);
  if(!fl || !members.length){ drawFloorEmpty(fl); updateFloorReadout(fl,members); return; }

  // A — each room's floor, grid and baseboard
  for(const m of members){
    const r=m.l.room;
    pathPoly(m.P); ctx.fillStyle=r.floor; ctx.fill('evenodd');
    drawGrid(m.P);
    if(r.trimOn && r.trim>0){
      ctx.save(); pathPoly(m.P); ctx.clip();
      pathPoly(m.P);
      ctx.lineWidth=Math.max(1,r.trim*2*view.scale);
      ctx.strokeStyle=C.trim; ctx.stroke();
      ctx.restore();
    }
  }

  // B — every wall band, clipped outside EVERY room so a band can never paint over a neighbour's floor
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20,-20,W+40,H+40);
  for(const m of members) addPoly(m.P);
  ctx.clip('evenodd');
  ctx.lineJoin='miter'; ctx.miterLimit=10; ctx.strokeStyle=C.wall;
  const depths=floorEdgeDepths(members, fl.extWall);
  members.forEach((m,mi)=>{
    const runs=depthRuns(m.P, depths[mi]);
    if(!runs){
      if(!depths[mi][0]) return;                 // every wall on this room has been taken away
      pathPoly(m.P);
      ctx.lineWidth=Math.max(2,depths[mi][0]*view.scale)*2;
      ctx.stroke();
      return;
    }
    for(const run of runs){
      if(!run.depth) continue;
      ctx.beginPath();
      ctx.moveTo(sx(run.pts[0][0]), sy(run.pts[0][1]));
      for(let k=1;k<run.pts.length;k++) ctx.lineTo(sx(run.pts[k][0]), sy(run.pts[k][1]));
      ctx.lineWidth=Math.max(2,run.depth*view.scale)*2;
      ctx.stroke();
    }
  });
  // C — and only now punch the doorways, each to the depth of the wall it sits in
  ctx.lineCap='butt';
  members.forEach((m,mi)=>{
    for(const o of m.l.openings){
      if(wallIsOff(m.l.room,o.wall)) continue;
      const g=openGeom(o,m.P,m.l.room);
      const d=depths[mi][o.wall] != null ? depths[mi][o.wall] : (m.l.room.wall||0);
      ctx.strokeStyle = o.kind==='window' ? C.glass : m.l.room.floor;
      ctx.lineWidth=Math.max(2,d*view.scale)*2+2;
      ctx.beginPath(); ctx.moveTo(sx(g.p0[0]),sy(g.p0[1])); ctx.lineTo(sx(g.p1[0]),sy(g.p1[1])); ctx.stroke();
    }
  });
  ctx.restore();

  // D — door and window symbols, structure, then everything standing in each room
  members.forEach((m,mi)=>{
    /* jambs and window lines are drawn across the band, so they take its depth too */
    for(const o of m.l.openings){
      if(wallIsOff(m.l.room,o.wall)) continue;
      const d=depths[mi][o.wall];
      drawOpening(o, [], d ? Object.assign({}, m.l.room, {wall:d}) : m.l.room, m.P);
    }
    for(const w of m.l.room.iwalls){
      pathPoly(iwallPoly(floorIWall(m.l,w,m.t)));
      ctx.fillStyle=C.wall; ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle=C.wallEdge; ctx.stroke();
    }
    for(const pl of m.l.room.pillars){
      const fp=floorInst(m.l,pl,m.t);
      pathPoly(worldPoly(fp,fp));
      ctx.fillStyle=C.pillar; ctx.fill();
      ctx.lineWidth=1.25; ctx.strokeStyle=C.wall; ctx.stroke();
    }
    for(const p of m.l.placed) drawItem(floorInst(m.l,p,m.t), false, false);
  });

  // E — which room is which, without having to open it
  for(const m of members) drawFloorLabel(m);

  // F — two rooms sitting on top of each other is a broken arrangement; say so rather
  //     than trying to render it, since the evenodd clip in pass B can't represent it
  for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++){
    if(!polyHit(members[i].P, members[j].P)) continue;
    ctx.save();
    pathPoly(members[i].P); ctx.clip();
    pathPoly(members[j].P);
    ctx.fillStyle='rgba('+C.dangerRGB+',.22)'; ctx.fill();
    ctx.restore();
  }
  for(const g of floorGuides){
    ctx.save();
    ctx.setLineDash([6,5]); ctx.lineWidth=1.5; ctx.strokeStyle=C.stageAccent;
    ctx.beginPath(); ctx.moveTo(sx(g[0][0]),sy(g[0][1])); ctx.lineTo(sx(g[1][0]),sy(g[1][1])); ctx.stroke();
    ctx.restore();
  }
  const selM=members.find(m=>m.l.id===floorSel);
  if(selM){
    ctx.save();
    pathPoly(selM.P);
    ctx.lineWidth=2; ctx.strokeStyle=C.accent; ctx.stroke();
    const h=floorRotHandle(selM.P), b=bbox(selM.P);
    ctx.beginPath(); ctx.moveTo(sx((b.x0+b.x1)/2), sy(b.y0)); ctx.lineTo(h.x,h.y);
    ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(h.x,h.y,6,0,Math.PI*2);
    ctx.fillStyle=C.surface; ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();
  }
  // rooms marked for merge/delete get a dashed outline — distinct from floorSel's solid
  // one, since these aren't being picked up to move, just earmarked for an action. Only
  // once a pair is actually marked, so a plain click's 1-room seed stays visually quiet.
  for(const id of mergeSel.size>=2 ? mergeSel : []){
    const m=members.find(x=>x.l.id===id); if(!m) continue;
    ctx.save();
    ctx.setLineDash([6,4]);
    pathPoly(m.P);
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; ctx.stroke();
    ctx.restore();
  }
  updateFloorReadout(fl, members);
}
/* ---- arranging ----
   Two rooms share a wall when their measured faces sit exactly one wall-thickness
   apart, so that is what the magnet aims for: not flush, but `max(wallA,wallB)` of
   clear air, which both bands then fill. Corner alignment along the wall is solved
   separately from the gap across it, so a room can meet one neighbour's face and
   line up with another's corner in the same drag. */
/* A room this size needs a more generous magnet than a wall endpoint does */
const floorSnapRadius = () => 24/view.scale;
/* Every way this room could line up with one neighbour edge, as {dir, delta}: move the
   room by dir*delta and that relationship becomes exact. Three kinds, in priority order:
     wall  — the two faces end up one wall-thickness apart, so they share a wall.
             Only offered when the edges actually overlap, i.e. genuinely face each other.
     line  — the two faces end up on the same line. This is what keeps the sides of
             stacked rooms flush, and it must NOT require overlap: the left wall of a
             kitchen sitting below a living room never overlaps the wall it lines up with.
     end   — a corner of this room meets a corner of that one, along the wall. */
function floorSnapCandidates(l, P, others, rad){
  const out=[], n=P.length;
  for(let i=0;i<n;i++){
    const a1=P[i], b1=P[(i+1)%n];
    const dx=b1[0]-a1[0], dy=b1[1]-a1[1], len1=Math.hypot(dx,dy);
    if(len1<1) continue;
    const u=[dx/len1, dy/len1], nr=[-u[1], u[0]];
    const mineOff=wallIsOff(l.room,i);
    for(const o of others){
      const m=o.P.length;
      for(let j=0;j<m;j++){
        /* how much air belongs between these two faces: enough for both walls, for the
           one wall that is there, or none at all when both sides have been opened —
           which is what lets two rooms read as one open space with a continuous floor */
        const theirsOff=wallIsOff(o.l.room,j);
        const gap = mineOff && theirsOff ? 0
                  : mineOff ? (o.l.room.wall||0)
                  : theirsOff ? (l.room.wall||0)
                  : Math.max(l.room.wall||0, o.l.room.wall||0);
        const a2=o.P[j], b2=o.P[(j+1)%m];
        const ex=b2[0]-a2[0], ey=b2[1]-a2[1], len2=Math.hypot(ex,ey);
        if(len2<1) continue;
        if(Math.abs(u[0]*(ey/len2)-u[1]*(ex/len2))>PARALLEL_TOL) continue;
        const sep=(a2[0]-a1[0])*nr[0]+(a2[1]-a1[1])*nr[1];
        const sa=(a2[0]-a1[0])*u[0]+(a2[1]-a1[1])*u[1];
        const sb=(b2[0]-a1[0])*u[0]+(b2[1]-a1[1])*u[1];
        if(Math.max(sa,sb)>1 && Math.min(sa,sb)<len1-1){
          const d=sep-(sep>=0?gap:-gap);        // +delta along nr closes sep by delta
          if(Math.abs(d)<rad) out.push({dir:nr, delta:d, cost:Math.abs(d), kind:gap?'wall':'open', guide:[a2,b2], gap});
        }
        if(Math.abs(sep)<rad) out.push({dir:nr, delta:sep, cost:Math.abs(sep)+rad*0.4, kind:'line', guide:[a2,b2]});
        for(const s of [sa,sb]) for(const mine of [0,len1]){
          const d=s-mine;
          if(Math.abs(d)<rad) out.push({dir:u, delta:d, cost:Math.abs(d)+rad*0.25, kind:'end', guide:[a2,b2]});
        }
      }
    }
  }
  return out;
}
/* Solve one axis, then the other. Taking the single best correction overall used to mean
   a room could meet its left neighbour or line up with the one above it, never both. */
function snapFloorPlace(l, x, y){
  const others=floorLayouts(l.floorId).filter(o=>o.id!==l.id).map(o=>({l:o, P:floorPts(o)}));
  if(!others.length){ const p=snapPt([x,y]); return {x:p[0], y:p[1], guides:[], note:'' }; }
  const rad=floorSnapRadius(), rot=l.floorPlace.rot||0;
  let px=x, py=y, took=null;
  const guides=[], kinds=[];
  for(let pass=0; pass<2; pass++){
    const cands=floorSnapCandidates(l, ptsAt(l,{x:px,y:py,rot}), others, rad);
    let pick=null;
    for(const c of cands){
      // the second correction has to be across a different axis, or it just re-solves the first
      if(took && Math.abs(c.dir[0]*took[0]+c.dir[1]*took[1])>0.3) continue;
      if(!pick || c.cost<pick.cost) pick=c;
    }
    if(!pick) break;
    px+=pick.dir[0]*pick.delta; py+=pick.dir[1]*pick.delta;
    guides.push(pick.guide); kinds.push(pick.kind);
    took=pick.dir;
  }
  if(!guides.length){ const p=snapPt([x,y]); return {x:p[0], y:p[1], guides:[], note:''}; }
  const note = kinds.includes('open') ? 'Open through'
             : kinds.includes('wall') ? 'Sharing a wall'
             : kinds.includes('line') ? 'Lined up' : 'Corners meet';
  return {x:px, y:py, guides, note};
}
/* How deep each room's wall band runs, edge by edge.
   An edge facing a neighbour is a SHARED wall, and its depth is the real gap between
   the two faces — so a door punched from either side clears the whole thickness even
   when the two rooms carry different wall settings. An edge facing nothing is
   EXTERIOR and takes the floor's exterior thickness, which is how a plan gets a heavy
   outer shell around thin partitions without any boolean union of the outline. */
function floorEdgeDepths(members, extWall){
  return members.map(m=>{
    const own=m.l.room.wall||0, n=m.P.length;
    return m.P.map((a1,i)=>{
      const b1=m.P[(i+1)%n];
      const dx=b1[0]-a1[0], dy=b1[1]-a1[1], len=Math.hypot(dx,dy);
      if(len<1) return own;
      if(wallIsOff(m.l.room,i)) return 0;        // no wall here: nothing to draw, nothing to punch
      const u=[dx/len,dy/len], w=wallOf(i,m.P), out=[-w.nrm[0],-w.nrm[1]];
      let found=0;
      for(const o of members){
        if(o.l.id===m.l.id) continue;
        const lim=Math.max(own, o.l.room.wall||0)*1.35+1;
        for(let j=0;j<o.P.length;j++){
          const a2=o.P[j], b2=o.P[(j+1)%o.P.length];
          const ex=b2[0]-a2[0], ey=b2[1]-a2[1], l2=Math.hypot(ex,ey);
          if(l2<1) continue;
          if(Math.abs(u[0]*(ey/l2)-u[1]*(ex/l2))>PARALLEL_TOL) continue;
          const d=(a2[0]-a1[0])*out[0]+(a2[1]-a1[1])*out[1];
          if(d<=0.5 || d>lim) continue;                       // behind us, or too far to be a shared wall
          const sa=(a2[0]-a1[0])*u[0]+(a2[1]-a1[1])*u[1];
          const sb=(b2[0]-a1[0])*u[0]+(b2[1]-a1[1])*u[1];
          if(Math.max(sa,sb)<1 || Math.min(sa,sb)>len-1) continue;
          if(!found || d<found) found=d;
        }
      }
      return found || Math.max(own, extWall||0);
    });
  });
}
/* consecutive edges sharing a depth, so each run strokes as one mitred polyline */
function extendEnd(pts,i,j,by){
  const a=pts[i], b=pts[j];
  const dx=a[0]-b[0], dy=a[1]-b[1], len=Math.hypot(dx,dy);
  if(len<1e-6 || !by) return;
  pts[i]=[a[0]+dx/len*by, a[1]+dy/len*by];
}
function depthRuns(P, depths){
  const n=P.length, runs=[];
  let start=-1;
  for(let k=0;k<n;k++) if(depths[k]!==depths[(k-1+n)%n]){ start=k; break; }
  if(start<0) return null;                                    // every edge the same: stroke it closed instead
  let cur=null;
  for(let k=0;k<n;k++){
    const i=(start+k)%n;
    if(!cur || depths[i]!==cur.depth){ cur={depth:depths[i], pts:[P[i].slice()], first:i, last:i}; runs.push(cur); }
    cur.pts.push(P[(i+1)%n].slice());
    cur.last=i;
  }
  /* A run stops wherever the thickness changes, which would leave that outside corner
     open — a thick outer wall meeting a thin shared one has a square hole between them.
     Carry each end on by the NEIGHBOURING band's depth and the two close up exactly.
     Anything that overshoots into a room is removed by the floor-wide clip. */
  for(const r of runs){
    extendEnd(r.pts, 0, 1, depths[(r.first-1+n)%n]);
    extendEnd(r.pts, r.pts.length-1, r.pts.length-2, depths[(r.last+1)%n]);
  }
  return runs;
}
function pickFloorRoom(px,py){
  const fl=floorOf(L().floorId); if(!fl) return null;
  const ms=floorMembers(fl), pt=[wx(px),wy(py)];
  for(let i=ms.length-1;i>=0;i--) if(pointInPoly(pt, ms[i].P)) return ms[i].l.id;
  return null;
}
const floorRotHandle = P => { const b=bbox(P); return {x:sx((b.x0+b.x1)/2), y:sy(b.y0)-26}; };
/* While editing one room, show the others on its floor as a faint backdrop, drawn
   in THIS room's own space. Shaping a foyer to meet four neighbours is guesswork
   otherwise. Nothing here is pickable; it is a tracing aid, not part of the room. */
function drawFloorUnderlay(){
  const me=L(), fl=floorOf(me.floorId); if(!fl) return;
  const t=floorXf(me), C=PAL();
  ctx.save();
  ctx.globalAlpha=0.3;
  for(const o of floorLayouts(fl.id)){
    if(o.id===me.id) continue;
    const to=floorXf(o);
    const pts=o.room.points.map(p=>floorPtInv(t, floorPt(to,p)));
    pathPoly(pts);
    ctx.fillStyle=o.room.floor; ctx.fill('evenodd');
    ctx.lineWidth=Math.max(1,(o.room.wall||0)*view.scale);
    ctx.strokeStyle=C.wall; ctx.stroke();
    const b=bbox(pts), wpx=b.w*view.scale;
    if(wpx>56 && b.h*view.scale>24){
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='600 11px ui-sans-serif,system-ui,sans-serif'; ctx.fillStyle=C.ink2;
      ctx.fillText(clip(o.name.toUpperCase(), wpx), sx((b.x0+b.x1)/2), sy((b.y0+b.y1)/2));
    }
  }
  ctx.restore();
}
function drawFloorLabel(m){
  const C=PAL(), b=bbox(m.P), wpx=b.w*view.scale, hpx=b.h*view.scale;
  if(wpx<56 || hpx<34) return;
  let anchor=centroid(m.P);
  if(!anchor||!pointInPoly(anchor,m.P)) anchor=[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
  const own=bbox(m.l.room.points);
  const dims=m.l.dimLabel || (fmtLen(own.w,S.unit)+' × '+fmtLen(own.h,S.unit));
  const cxp=sx(anchor[0]), cyp=sy(anchor[1]);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='600 12px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle=C.ink;
  ctx.fillText(clip(m.l.name.toUpperCase(), wpx), cxp, cyp-7);
  ctx.font='400 11px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle=C.ink2;
  ctx.fillText(clip(dims, wpx), cxp, cyp+8);
}
/* nothing to show: say which of the two reasons it is */
function drawFloorEmpty(fl){
  const C=PAL();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=C.wall;
  ctx.font='600 14px ui-sans-serif,system-ui,sans-serif';
  ctx.fillText(fl ? '“'+fl.name+'” has no rooms on it yet'
                  : '“'+L().name+'” is not on a floor', W/2, H/2-10);
  ctx.font='400 12px ui-sans-serif,system-ui,sans-serif';
  ctx.fillText(fl ? 'Add rooms to it from the Rooms list.'
                  : 'Put it on one from its ⋯ menu in the Rooms list.', W/2, H/2+12);
}
function updateFloorReadout(fl, members){
  const el=$('readout'); if(!el) return;
  if(!fl || !members.length){ el.textContent = fl ? 'No rooms on this floor' : 'Not on a floor'; return; }
  if(floorSnapNote){ el.textContent = floorSnapNote; return; }
  let area=0; for(const m of members) area+=Math.abs(polyArea(m.P));
  el.textContent = plural(members.length,'room')+' · '+fmtArea(area,S.unit);
}
let drawPending=false;
function scheduleDraw(){
  if(drawPending) return;
  drawPending=true;
  requestAnimationFrame(()=>{ drawPending=false; draw(); });
}
function gridStep(){
  const imp = S.unit==='ftin'||S.unit==='in';
  let base = imp?304.8:500;
  while(base*view.scale<16) base*=2;
  while(base*view.scale>90) base/=2;
  return base;
}
function drawGrid(P){
  const step=gridStep();
  if(step*view.scale<7) return;
  const b=bbox(P);
  ctx.save(); pathPoly(P); ctx.clip();
  ctx.strokeStyle=PAL().grid; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=Math.ceil(b.x0/step)*step;x<=b.x1;x+=step){ ctx.moveTo(Math.round(sx(x))+.5,sy(b.y0)); ctx.lineTo(Math.round(sx(x))+.5,sy(b.y1)); }
  for(let y=Math.ceil(b.y0/step)*step;y<=b.y1;y+=step){ ctx.moveTo(sx(b.x0),Math.round(sy(y))+.5); ctx.lineTo(sx(b.x1),Math.round(sy(y))+.5); }
  ctx.stroke(); ctx.restore();
}
/* walls sit outside the measured face: stroke double width, clipped to outside the polygon */
function drawWalls(){
  const r=L().room, P=RP(), t=Math.max(2,r.wall*view.scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20,-20,W+40,H+40);
  addPoly(P);
  ctx.clip('evenodd');
  ctx.lineWidth=t*2; ctx.lineJoin='miter'; ctx.miterLimit=10;
  ctx.strokeStyle=PAL().wall;
  const runs=wallRuns(P, r.wallOff);
  if(!runs){ pathPoly(P); ctx.stroke(); }
  else for(const run of runs){
    ctx.beginPath();
    ctx.moveTo(sx(run[0][0]),sy(run[0][1]));
    for(let k=1;k<run.length;k++) ctx.lineTo(sx(run[k][0]),sy(run[k][1]));
    ctx.stroke();
  }
  ctx.lineCap='butt';
  for(const o of L().openings){
    if(wallIsOff(r,o.wall)) continue;
    const g=openGeom(o);
    ctx.strokeStyle = o.kind==='window' ? PAL().glass : r.floor;
    ctx.lineWidth=t*2+2;
    ctx.beginPath(); ctx.moveTo(sx(g.p0[0]),sy(g.p0[1])); ctx.lineTo(sx(g.p1[0]),sy(g.p1[1])); ctx.stroke();
  }
  ctx.restore();
}
function drawIWalls(){
  for(const w of L().room.iwalls){
    const C=PAL();
    pathPoly(iwallPoly(w));
    ctx.fillStyle=C.wall; ctx.fill();
    ctx.lineWidth=1; ctx.strokeStyle=C.wallEdge; ctx.stroke();
  }
}
function drawPillars(){
  for(const pl of L().room.pillars){
    const C=PAL();
    pathPoly(worldPoly(pl,pl));
    ctx.fillStyle=C.pillar; ctx.fill();
    ctx.lineWidth=1.25; ctx.strokeStyle=C.wall; ctx.stroke();
  }
}
function drawWallDrawOverlay(){
  if(!wallDrawState) return;
  ctx.save();
  if(wallDrawState.a && drawCursor){
    const raw=wallDrawShift?axisLockFrom(wallDrawState.a,drawCursor):drawCursor;
    const b=snapWallPoint(raw, null, true);
    ctx.setLineDash([5,4]); ctx.lineWidth=2; ctx.strokeStyle=PAL().accent;
    ctx.beginPath(); ctx.moveTo(sx(wallDrawState.a[0]),sy(wallDrawState.a[1])); ctx.lineTo(sx(b[0]),sy(b[1])); ctx.stroke();
    ctx.setLineDash([]);
  }
  if(wallDrawState.a){
    ctx.beginPath(); ctx.arc(sx(wallDrawState.a[0]),sy(wallDrawState.a[1]),6,0,Math.PI*2);
    ctx.fillStyle=PAL().accent; ctx.fill();
  }
  ctx.restore();
}
/* `room`/`poly` let a floor draw a door on a room other than the active one */
function drawOpening(o,blocked,room,poly){
  const r=room||L().room, g=openGeom(o,poly,r), t=Math.max(2,r.wall*view.scale);
  const C=PAL();
  // jambs
  ctx.strokeStyle=C.ink; ctx.lineWidth=Math.max(1.5,t*.35);
  for(const p of [g.p0,g.p1]){
    ctx.beginPath();
    ctx.moveTo(sx(p[0]),sy(p[1]));
    ctx.lineTo(sx(p[0]-g.nrm[0]*r.wall),sy(p[1]-g.nrm[1]*r.wall));
    ctx.stroke();
  }
  if(o.kind==='window'){
    ctx.strokeStyle=C.glassLine; ctx.lineWidth=Math.max(1.2,t*.16);
    for(const k of [-0.34,0.34]){
      ctx.beginPath();
      ctx.moveTo(sx(g.p0[0]-g.nrm[0]*r.wall*k), sy(g.p0[1]-g.nrm[1]*r.wall*k));
      ctx.lineTo(sx(g.p1[0]-g.nrm[0]*r.wall*k), sy(g.p1[1]-g.nrm[1]*r.wall*k));
      ctx.stroke();
    }
  } else if(o.dtype==='hinge'){
    if(S.showSwing){
      const sp=swingPoly(o,poly,r), bad=blocked.includes(o.id);
      pathPoly(sp);
      ctx.fillStyle = bad?'rgba('+C.dangerRGB+',.16)':C.swing; ctx.fill();
      ctx.strokeStyle = bad?'rgba('+C.dangerRGB+',.7)':C.swingLine;
      ctx.setLineDash([4,4]); ctx.lineWidth=bad?1.5:1; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle=C.ink; ctx.lineWidth=Math.max(2,t*.45); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(sx(g.hinge[0]),sy(g.hinge[1])); ctx.lineTo(sx(g.open[0]),sy(g.open[1])); ctx.stroke();
    ctx.lineCap='butt';
  } else if(o.dtype==='bifold'){
    /* the chevron a closet is drawn with: a leaf from each jamb meeting at a fold, and
       no sweep arc, because a bi-fold does not sweep — it folds back on itself */
    /* only shaded when it is in the way — a bi-fold takes far less room than a swing,
       so shading it by default drew attention to clearance that is rarely the problem */
    const bad=blocked.includes(o.id);
    if(S.showSwing && bad){
      pathPoly(swingPoly(o,poly,r));
      ctx.fillStyle='rgba('+C.dangerRGB+',.16)'; ctx.fill();
      ctx.strokeStyle='rgba('+C.dangerRGB+',.7)';
      ctx.setLineDash([4,4]); ctx.lineWidth=1.5; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle=C.ink; ctx.lineWidth=Math.max(1.5,t*.3);
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(sx(g.pivot[0]),sy(g.pivot[1]));
    ctx.lineTo(sx(g.apex[0]),sy(g.apex[1]));
    ctx.lineTo(sx(g.railEnd[0]),sy(g.railEnd[1]));
    ctx.stroke();
    ctx.lineCap='butt'; ctx.lineJoin='miter';
  } else if(o.dtype==='slide'){
    const off=[-g.nrm[0]*r.wall*.5, -g.nrm[1]*r.wall*.5];
    ctx.lineWidth=Math.max(2,t*.4);
    ctx.strokeStyle=C.ink;
    ctx.beginPath();
    ctx.moveTo(sx(g.p0[0]+off[0]),sy(g.p0[1]+off[1]));
    ctx.lineTo(sx(g.mid[0]+off[0]),sy(g.mid[1]+off[1])); ctx.stroke();
    ctx.strokeStyle=C.swingLine;
    ctx.beginPath();
    ctx.moveTo(sx(g.mid[0]-off[0]*.5),sy(g.mid[1]-off[1]*.5));
    ctx.lineTo(sx(g.p1[0]-off[0]*.5),sy(g.p1[1]-off[1]*.5)); ctx.stroke();
  }
}
/* the open footprint is always drawn for whatever you have hold of, so you can
   see where it will reach as you place it, toggle on or off */
const showOpenFor = p => S.showOpen || (furnMode() && selSet.has(p.id));
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
/* the selected item's outline and rotate handle, drawn after everything else so nothing covers them */
function drawItemTools(){
  if(!selSet.size) return;
  const C=PAL(), {bad}=getConflicts();
  // selection: a surface halo under a crisp accent line, so it reads on any furniture colour
  for(const id of selSet){
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
  if(selSet.size!==1) return;
  const p=instOf(sel), it=p&&itemOf(p.itemId);
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
function drawMarquee(){
  if(!drag||drag.mode!=='marquee') return;
  const x0=Math.min(drag.x0,drag.x1), x1=Math.max(drag.x0,drag.x1);
  const y0=Math.min(drag.y0,drag.y1), y1=Math.max(drag.y0,drag.y1);
  const C=PAL();
  ctx.save();
  ctx.fillStyle=hexA(C.accent,.08);
  ctx.fillRect(x0,y0,x1-x0,y1-y0);
  ctx.setLineDash([5,4]); ctx.lineWidth=1.25; ctx.strokeStyle=C.accent;
  ctx.strokeRect(x0,y0,x1-x0,y1-y0);
  ctx.setLineDash([]);
  ctx.restore();
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
function sizeLabel(it){
  const s=it.shape;
  if(s.type==='rect'||s.type==='ellipse'||s.type==='lshape') return fmtLen(s.w,S.unit)+' × '+fmtLen(s.d,S.unit);
  const b=bbox(shapePoly(s));
  return fmtLen(b.w,S.unit)+' × '+fmtLen(b.h,S.unit);
}
function drawWallLabels(){
  const P=RP(), C=PAL();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let i=0;i<P.length;i++){
    const w=wallOf(i);
    if(w.len*view.scale<26) continue;
    const off=L().room.wall*view.scale+13;
    const x=sx(w.mid[0])-w.nrm[0]*off, y=sy(w.mid[1])-w.nrm[1]*off;
    let a=Math.atan2(w.dir[1],w.dir[0]);
    if(a>Math.PI/2||a<-Math.PI/2) a+=Math.PI;
    ctx.save(); ctx.translate(x,y); ctx.rotate(a);
    const on = roomSel&&roomSel.kind==='wall'&&roomSel.i===i;
    ctx.fillStyle = on?C.stageAccent:C.ink2;
    ctx.font = (on?'600 ':'500 ')+'11.5px ui-sans-serif,-apple-system,system-ui,sans-serif';
    ctx.fillText(fmtLen(w.len,S.unit),0,0);
    ctx.restore();
  }
}
function drawHandles(){
  const P=RP(), C=PAL(), r=L().room;
  drawAlignGuides();
  if(alignNote==='Right angle' && drag && drag.mode==='corner' && P.length>2){
    const n=P.length, i=drag.i;
    drawSquareTick(P[(i-1+n)%n], P[i], P[(i+1)%n]);
  }
  const pl=roomSel&&roomSel.kind==='pillar'&&r.pillars.find(q=>q.id===roomSel.id);
  if(pl){
    pathPoly(worldPoly(pl,pl));
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; ctx.stroke();
  }
  const iw=roomSel&&roomSel.kind==='iwall'&&r.iwalls.find(q=>q.id===roomSel.id);
  if(iw){
    pathPoly(iwallPoly(iw));
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; ctx.stroke();
    for(const p of [iw.a,iw.b]){
      ctx.beginPath(); ctx.rect(sx(p[0])-5,sy(p[1])-5,10,10);
      ctx.fillStyle=C.surface; ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
    }
  }
  if(roomSel&&roomSel.kind==='wall'){
    const w=wallOf(roomSel.i);
    ctx.beginPath(); ctx.moveTo(sx(w.a[0]),sy(w.a[1])); ctx.lineTo(sx(w.b[0]),sy(w.b[1]));
    ctx.strokeStyle=C.accent; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke(); ctx.lineCap='butt';
  }
  for(let i=0;i<P.length;i++){
    const on = roomSel&&roomSel.kind==='corner'&&roomSel.i===i;
    ctx.beginPath(); ctx.rect(sx(P[i][0])-5,sy(P[i][1])-5,10,10);
    ctx.fillStyle = on?C.accent:C.surface; ctx.fill();
    ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  }
  for(const o of L().openings){
    const g=openGeom(o), on=roomSel&&roomSel.kind==='opening'&&roomSel.id===o.id;
    ctx.beginPath(); ctx.arc(sx(g.mid[0]),sy(g.mid[1]),7,0,Math.PI*2);
    ctx.fillStyle = on?C.accent:C.surface; ctx.fill();
    ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  }
}
/* the status corner: what is true of this room right now, and what's wrong with it */
function updateReadout(bad,openBad){
  const el=$('readout'), n=bad?bad.size:0, no=openBad?openBad.size:0;
  const bits=[];
  if(roomMode()){
    bits.push(esc(fmtArea(polyArea(RP()),S.unit)), plural(RP().length,'wall'));
  } else {
    let used=0;
    for(const p of L().placed){
      const it=itemOf(p.itemId);
      if(it&&!it.passThrough) used+=polyArea(shapePoly(it.shape));
    }
    const total=polyArea(RP())||1;
    bits.push(L().placed.length+' placed', Math.round(used/total*100)+'% covered');
  }
  let html=bits.join(' · ');
  if(alignNote) html=`<span class="snap">${esc(alignNote)}</span> · `+html;
  if(n) html+=`<span class="bad">${n} ${n===1?"doesn't":"don't"} fit</span>`;
  if(no) html+=`<span class="bad">${no} can't open</span>`;
  el.innerHTML=html;
}

export {CANVAS, darkMQ, PAL, setForceLightCanvas,
        addPoly, pathPoly, clip, normHex, hexA, pickText,
        drawAlignGuides, drawSquareTick, drawCustomOverlay,
        drawDimension, drawMeasures,
        draw, scheduleDraw, floorMembers, snapFloorPlace, floorEdgeDepths,
        pickFloorRoom, floorRotHandle, handlePos, sizeLabel};
