/* Merging two rooms into one: the polygon weld, and the helpers that cut the
   two outlines so they can be welded.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   PARALLEL_TOL leads the file, and it is NOT from this region. It is a bare
   const (no dependencies of any kind) declared at the head of the `arranging`
   block, which canvas/draw.js will take later; three call sites use it, one
   here in edgeFacing and two in arranging. It had to move because nothing in
   src/ can import from index.html, and it is the whole of what this region
   needed from outside. index.html imports it back at its exact spot for the
   two arranging call sites, so when draw.js takes `arranging` it will find
   PARALLEL_TOL already here and simply import it.

   What did NOT come with this file is everything around the weld -- the merge
   selection UI, drawMergeOverlay, the Floor-mode merge menu -- because those
   read mergeSel and the rest of the selection lets, and call draw() and the
   render*() functions. §3 puts them in this file; they follow once those move.
*/

import {clone} from '../core/state.js';
import {polySimple, signedArea} from '../core/geometry.js';
import {syncWallOff} from '../model/walls.js';
import {floorPt, floorXf} from '../core/floor-space.js';

const PARALLEL_TOL = Math.sin(2*Math.PI/180);

/* ---- merging two rooms into one ----
   Two rooms on the same floor can share only part of a wall — one room's wall may run
   past where the other one starts. Merging welds the polygons together along whatever
   they actually share and leaves the rest of each wall standing. */
/* Do edge (a1,b1) and edge (a2,b2) face each other: parallel, and overlapping along the
   shared axis? Returns null when they don't; otherwise this edge's own direction/normal/
   length, and where the other edge's endpoints land projected onto this edge's axis —
   the same test floorSnapCandidates/floorEdgeDepths each already run inline. */
function edgeFacing(a1,b1,a2,b2){
  const dx=b1[0]-a1[0], dy=b1[1]-a1[1], len1=Math.hypot(dx,dy);
  if(len1<1) return null;
  const u=[dx/len1, dy/len1], nrm=[-u[1], u[0]];
  const ex=b2[0]-a2[0], ey=b2[1]-a2[1], len2=Math.hypot(ex,ey);
  if(len2<1) return null;
  if(Math.abs(u[0]*(ey/len2)-u[1]*(ex/len2))>PARALLEL_TOL) return null;
  const sa=(a2[0]-a1[0])*u[0]+(a2[1]-a1[1])*u[1];
  const sb=(b2[0]-a1[0])*u[0]+(b2[1]-a1[1])*u[1];
  if(!(Math.max(sa,sb)>1 && Math.min(sa,sb)<len1-1)) return null;
  const sep=(a2[0]-a1[0])*nrm[0]+(a2[1]-a1[1])*nrm[1];
  return {u, nrm, len1, sa, sb, sep};
}
/* insert a new corner into a room's (floor-space) polygon at distance `t` along edge i,
   renumbering openings/measures in lockstep exactly like splitWall does — but against a
   detached working copy, not the live room, so a merge that turns out invalid never
   touches real state. A no-op when `t` already lands on an existing corner. */
function mergeSplice(work, i, t){
  const P=work.points, n=P.length, a=P[i], b=P[(i+1)%n];
  const len=Math.hypot(b[0]-a[0], b[1]-a[1]);
  if(t<=1 || t>=len-1) return;
  const ux=(b[0]-a[0])/len, uy=(b[1]-a[1])/len;
  P.splice(i+1, 0, [a[0]+ux*t, a[1]+uy*t]);
  work.wallOff.splice(i+1, 0, !!work.wallOff[i]);
  for(const o of work.openings){
    if(o.wall>i){ o.wall++; continue; }
    if(o.wall!==i || o.offset+o.width/2 < t) continue;
    o.wall=i+1; o.offset=Math.max(0, o.offset-t);
  }
  for(const m of work.measures) for(const anc of [m.a,m.b]) if(anc.k==='wall' && anc.id>i) anc.id++;
}
/* cut a room's edge `i` at both ends of the overlap interval [lo,hi] (its own units,
   measured from that edge's start), leaving the shared portion as its own edge and
   returning that edge's index once both cuts have landed. */
function mergeInsertCuts(work, i, lo, hi, len){
  let idx=i;
  if(lo>1){ mergeSplice(work, i, lo); idx=i+1; }
  mergeSplice(work, idx, hi-(lo>1?lo:0));
  return idx;
}
/* The polygon merge itself: weld A and B along whatever they overlap on their one shared
   wall, in floor space (where both already sit). Returns {points, wallOff, openings,
   measures, removedOpenings} ready to drop onto the surviving room, or {error} when the
   two rooms don't share exactly one clean wall. */
function mergeGeometry(A, B){
  const tA=floorXf(A), tB=floorXf(B);
  const PA=A.room.points.map(p=>floorPt(tA,p));
  const PB=B.room.points.map(p=>floorPt(tB,p));
  const lim=Math.max(A.room.wall||0, B.room.wall||0)*1.35+1;
  const hits=[];
  for(let i=0;i<PA.length;i++){
    const a1=PA[i], b1=PA[(i+1)%PA.length];
    for(let j=0;j<PB.length;j++){
      const a2=PB[j], b2=PB[(j+1)%PB.length];
      const f=edgeFacing(a1,b1,a2,b2);
      if(f && Math.abs(f.sep)<=lim) hits.push({i,j});
    }
  }
  if(!hits.length) return {error:"These rooms don't share a wall"};
  if(hits.length>1) return {error:"These rooms meet along more than one wall — merge only works where they share exactly one wall"};
  const {i:i0, j:j0}=hits[0];

  const workA={points:PA.map(p=>p.slice()), wallOff:syncWallOff(A.room).slice(), openings:clone(A.openings), measures:clone(A.measures)};
  const workB={points:PB.map(p=>p.slice()), wallOff:syncWallOff(B.room).slice(), openings:clone(B.openings), measures:clone(B.measures)};

  const a1=workA.points[i0], b1=workA.points[(i0+1)%workA.points.length];
  const a2=workB.points[j0], b2=workB.points[(j0+1)%workB.points.length];
  const f=edgeFacing(a1,b1,a2,b2);
  if(!f) return {error:"These rooms don't share a wall"};
  const len1=f.len1, sa=f.sa, sb=f.sb;
  const lo=Math.max(0, Math.min(sa,sb)), hi=Math.min(len1, Math.max(sa,sb));
  if(hi-lo<50) return {error:"These rooms don't share a wall"};

  const idxA=mergeInsertCuts(workA, i0, lo, hi, len1);
  const len2=Math.hypot(b2[0]-a2[0], b2[1]-a2[1]);
  const rAt = s => (s-sa)*len2/(sb-sa);
  let rLo=rAt(lo), rHi=rAt(hi);
  if(rLo>rHi){ const t=rLo; rLo=rHi; rHi=t; }
  const idxB=mergeInsertCuts(workB, j0, rLo, rHi, len2);

  /* Every corner survives — A_lo/A_hi (the ends of A's now-removed shared edge) and
     their opposite numbers on B stay put; only the edge directly between A_lo and A_hi
     (and directly between B's two ends) is gone. What used to be that edge is now two
     new edges, each crossing straight over from one room's corner to the other's
     nearest one — which is exactly the old wall's own end caps, still standing, just
     with no wall drawn between them any more (see the two `true` entries below). */
  const nA=workA.points.length, nB=workB.points.length;
  const chainA=workA.points.slice(idxA+1).concat(workA.points.slice(0, idxA+1));
  const chainB=workB.points.slice(idxB+1).concat(workB.points.slice(0, idxB+1));
  const offA=workA.wallOff.slice(idxA+1).concat(workA.wallOff.slice(0, idxA));
  const offB=workB.wallOff.slice(idxB+1).concat(workB.wallOff.slice(0, idxB));

  const merged=chainA.concat(chainB);
  const mergedOff=offA.concat([true], offB, [true]);
  if(!polySimple(merged) || Math.sign(signedArea(merged))!==Math.sign(signedArea(PA))){
    return {error:"These rooms can't be combined into one simple shape"};
  }

  const remapA = w => w===idxA ? null : (((w-(idxA+1))%nA)+nA)%nA;
  const remapB = w => w===idxB ? null : nA + ((((w-(idxB+1))%nB)+nB)%nB);

  const openings=[]; let removedOpenings=0;
  for(const o of workA.openings){ const w=remapA(o.wall); if(w===null){ removedOpenings++; continue; } o.wall=w; openings.push(o); }
  for(const o of workB.openings){ const w=remapB(o.wall); if(w===null){ removedOpenings++; continue; } o.wall=w; openings.push(o); }

  for(const m of workA.measures) for(const anc of [m.a,m.b]) if(anc.k==='wall'){ const w=remapA(anc.id); anc.id = w===null ? -1 : w; }
  for(const m of workB.measures) for(const anc of [m.a,m.b]) if(anc.k==='wall'){ const w=remapB(anc.id); anc.id = w===null ? -1 : w; }
  const measures=workA.measures.concat(workB.measures);

  return {points:merged, wallOff:mergedOff, openings, measures, removedOpenings};
}

export {PARALLEL_TOL, mergeSplice, mergeGeometry};
