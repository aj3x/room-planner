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

export {boundaryHit, splitAngleSnap};
