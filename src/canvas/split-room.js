/* Splitting a room in two: cutting a polyline from one point on the room's
   outline to another.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   FIRST instalment, and only the two dependency-free helpers: boundaryHit (is
   this point on the room's outline?) and splitAngleSnap (the 45-degree magnet
   while drawing the cut). Everything else in the region stayed, and the reason
   is uniform -- startSplitRoom, cancelSplitDraw, splitRefs, splitResolvePoint,
   drawSplitOverlay, trySplitLine, openSplitChoice, commitSplit and splitUndo
   all call draw() and the render*() functions, or write the splitDrawState /
   alignGuides / alignNote lets. draw() is the keystone of the whole canvas/
   round; see the round's notes in .claude/plans/refactor-split.md.

   The region's banner and its introductory comment stayed with the code they
   describe, which is the part still in index.html. */

import {nearestOnWalls} from '../model/walls.js';

/* is `pt` (already snapped) essentially exactly on the room's own outline? Returns
   the room-wall hit {i,t,len,pt} if so, else null — used to accept/reject each click. */
function boundaryHit(pt){
  const nb=nearestOnWalls(pt);
  if(!nb || nb.d>1) return null;
  return {i:nb.i, t:nb.t, len:nb.len, pt:pt.slice()};
}
/* Straight lines are common enough while cutting a room in two that they deserve
   an easy, largely automatic snap — not just a Shift-held hard lock like the
   freestanding-wall tool's axis lock. Held within SPLIT_ANGLE_TOL of a 45°
   multiple off the previous point, the point magnet-snaps there; Shift forces it
   regardless of how far off the raw angle actually is. */
const SPLIT_ANGLE_STEP=Math.PI/4, SPLIT_ANGLE_TOL=6*Math.PI/180;
function splitAngleSnap(prev, raw, hard){
  const dx=raw[0]-prev[0], dy=raw[1]-prev[1], dist=Math.hypot(dx,dy);
  if(dist<1) return raw;
  const ang=Math.atan2(dy,dx), snapAng=Math.round(ang/SPLIT_ANGLE_STEP)*SPLIT_ANGLE_STEP;
  const diff=Math.abs(Math.atan2(Math.sin(ang-snapAng), Math.cos(ang-snapAng)));
  if(!hard && diff>SPLIT_ANGLE_TOL) return raw;
  return [prev[0]+Math.cos(snapAng)*dist, prev[1]+Math.sin(snapAng)*dist];
}

/* SECOND instalment: splitRefs, splitCornerRef, splitResolvePoint and
   drawSplitOverlay. They could not come in the first because splitResolvePoint
   calls alignPoint/alignRadius/isSquare (now canvas/snap.js), drawSplitOverlay
   calls drawSquareTick (now canvas/draw.js), and both read splitDrawState (now
   canvas/interaction-state.js) and write alignGuides/alignNote (now
   core/selection.js). drawSplitOverlay is one of the four draw*() helpers
   draw() cannot move without, which is why these four come next.

   startSplitRoom, cancelSplitDraw, trySplitLine, openSplitChoice, commitSplit
   and splitUndo still call draw() and the render*() functions and stay. */
import {ctx, sx, sy} from './view.js';
import {RP} from '../core/state.js';
import {wallOf, snapWallPoint} from '../model/walls.js';
import {splitDrawState, drawCursor, wallDrawShift} from './interaction-state.js';
import {setAlignGuides, setAlignNote} from '../core/selection.js';
import {PAL, drawSquareTick} from './draw.js';
import {alignPoint, alignRadius, isSquare} from './snap.js';

/* Every existing room corner, and every split point already placed, that the
   NEXT split point can align to — the same {p, bias, edge} shape snapCorner
   builds for dragging a room corner, so it reuses alignPoint/isSquare as-is.
   A corner offers both of its own walls as a "square to this" option; the
   most recently placed split point offers the segment behind it (or, for
   the very first point, the wall it started on) the same way drawSnapPoint
   does for a freehand room outline. */
function splitRefs(){
  const P=RP(), n=P.length, refs=[];
  for(let i=0;i<n;i++){
    refs.push({p:P[i], bias:0.3, edge:wallOf(i).dir});
    refs.push({p:P[i], bias:0.3, edge:wallOf((i-1+n)%n).dir});
  }
  const pts=splitDrawState.pts;
  for(let k=0;k<pts.length;k++){
    const p=pts[k].pt||pts[k], last=k===pts.length-1;
    let edge=null;
    if(last && k>0){ const prev=pts[k-1].pt||pts[k-1]; edge=[p[0]-prev[0], p[1]-prev[1]]; }
    else if(last) edge=wallOf(pts[0].i).dir;   // only point so far is the start hit
    refs.push({p, bias:last?0:0.2, edge});
  }
  return refs;
}
/* the three points a "is this bend square?" check (and its tick glyph) reads —
   the last two placed points plus the candidate, or, before any bend exists
   yet, a point synthesised back along the start wall so the very first
   segment can still be told apart from square. */
function splitCornerRef(pts, candidatePt){
  if(pts.length>=2){
    return [pts[pts.length-2].pt||pts[pts.length-2], pts[pts.length-1].pt||pts[pts.length-1], candidatePt];
  }
  if(pts.length===1){
    const start=pts[0], w=wallOf(start.i);
    /* w.dir is a unit vector — a synthetic point only 1mm back along the wall is
       invisible on screen (drawSquareTick's own arm-direction check bails out
       under 1 screen px), so push it out a real distance instead. */
    return [[start.pt[0]-w.dir[0]*500, start.pt[1]-w.dir[1]*500], start.pt, candidatePt];
  }
  return null;
}
/* Where the next split point actually lands: Shift hard-locks to a 45° off
   the last point; otherwise the room's own corners/walls and the split
   line's own last segment get first pick (so a bend can line up square in a
   corner, same as dragging a room corner does), falling back to the plain
   45°-ish soft angle magnet, and finally to whatever raw point was given. */
function splitResolvePoint(raw0, hard){
  const pts=splitDrawState.pts;
  const prev=pts.length ? (pts[pts.length-1].pt||pts[pts.length-1]) : null;
  if(hard && prev) return {pt:splitAngleSnap(prev, raw0, true), guides:[], note:'Straight'};
  const aligned=alignPoint(raw0, splitRefs(), alignRadius());
  if(aligned.guides.length){
    const cr=splitCornerRef(pts, aligned.pt);
    return {pt:aligned.pt, guides:aligned.guides, note: cr && isSquare(cr[0],cr[1],cr[2]) ? 'Right angle' : 'Lined up'};
  }
  if(prev){
    const angled=splitAngleSnap(prev, raw0, false);
    if(angled!==raw0) return {pt:angled, guides:[], note:'Straight'};
  }
  return {pt:raw0, guides:[], note:''};
}
function drawSplitOverlay(){
  if(!splitDrawState) return;
  const worldPts=splitDrawState.pts.map(p=>p.pt||p);
  let b=null;
  if(drawCursor){
    const resolved=splitResolvePoint(drawCursor, wallDrawShift);
    setAlignGuides(resolved.guides); setAlignNote(resolved.note);
    const snapped=snapWallPoint(resolved.pt, null, true);
    const hit=boundaryHit(snapped);
    b=hit?hit.pt:snapped;
    if(resolved.note==='Right angle'){
      const cr=splitCornerRef(splitDrawState.pts, b);
      if(cr) drawSquareTick(cr[0], cr[1], cr[2]);
    }
  }
  ctx.save();
  if(worldPts.length){
    ctx.setLineDash([5,4]); ctx.lineWidth=2; ctx.strokeStyle=PAL().accent;
    ctx.beginPath();
    ctx.moveTo(sx(worldPts[0][0]), sy(worldPts[0][1]));
    for(let i=1;i<worldPts.length;i++) ctx.lineTo(sx(worldPts[i][0]), sy(worldPts[i][1]));
    if(b) ctx.lineTo(sx(b[0]), sy(b[1]));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for(const p of worldPts){
    ctx.beginPath(); ctx.arc(sx(p[0]),sy(p[1]),5,0,Math.PI*2);
    ctx.fillStyle=PAL().accent; ctx.fill();
  }
  ctx.restore();
}

export {boundaryHit, splitAngleSnap,
        splitRefs, splitCornerRef, splitResolvePoint, drawSplitOverlay};
