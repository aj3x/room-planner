// @ts-check
/* Arranging rooms on a floor: which rooms stand on it, where a dragged room's
   magnet pulls it, how deep each room's wall band runs, and which room is
   under a point. Pure geometry over the saved layouts — no camera, no canvas.
   The canvas half (the magnet's reach in screen pixels, the grid snap, the
   pointer) is passed in by the floor tool, features/floors/floor-tool.js; the floor
   layers (features/floors/floor-*-layer.js) paint what floorEdgeDepths/depthRuns
   return. */

import {floorPt, floorPts, floorXf, ptsAt} from './floor-space.js';
import {floorLayouts} from '../state.js';
import {pointInPoly} from '../geometry.js';
import {wallIsOff, wallOf} from './walls.js';

/** @typedef {import('../types.js').Pt} Pt */
/** @typedef {import('../types.js').Layout} Layout */
/** A room on a floor: its layout, its floor transform and its outline in floor space.
    @typedef {{l: Layout, t: import('./floor-space.js').FloorXf, P: Pt[]}} Member */
/** One way a dragged room could line up with a neighbour edge: move it by dir*delta.
    @typedef {{dir: Pt, delta: number, cost: number, kind: 'wall'|'open'|'line'|'end', guide: import('../types.js').Seg, gap?: number}} SnapCand */
/** A run of consecutive edges sharing one wall depth.
    @typedef {{depth: number, pts: Pt[], first: number, last: number}} DepthRun */

/* how far from parallel two edges may be and still count as facing each other */
const PARALLEL_TOL = Math.sin(2*Math.PI/180);

/* every room standing on floor `fl`, each with its floor transform and its
   outline in floor space */
/** @param {import('../types.js').Floor|null|undefined} fl @returns {Member[]} */
function floorMembers(fl){
  return fl ? floorLayouts(fl.id).map(l=>{ const t=floorXf(l); return {l, t, P:l.room.points.map(p=>floorPt(t,p))}; }) : [];
}
/* ---- arranging ----
   Two rooms share a wall when their measured faces sit exactly one wall-thickness
   apart, so that is what the magnet aims for: not flush, but `max(wallA,wallB)` of
   clear air, which both bands then fill. Corner alignment along the wall is solved
   separately from the gap across it, so a room can meet one neighbour's face and
   line up with another's corner in the same drag. */
/* Every way this room could line up with one neighbour edge, as {dir, delta}: move the
   room by dir*delta and that relationship becomes exact. Three kinds, in priority order:
     wall  — the two faces end up one wall-thickness apart, so they share a wall.
             Only offered when the edges actually overlap, i.e. genuinely face each other.
     line  — the two faces end up on the same line. This is what keeps the sides of
             stacked rooms flush, and it must NOT require overlap: the left wall of a
             kitchen sitting below a living room never overlaps the wall it lines up with.
     end   — a corner of this room meets a corner of that one, along the wall. */
/** @param {Layout} l @param {Pt[]} P @param {{l: Layout, P: Pt[]}[]} others @param {number} rad @returns {SnapCand[]} */
function floorSnapCandidates(l, P, others, rad){
  const out=/** @type {SnapCand[]} */([]), n=P.length;
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
/** @param {Layout} l @param {number} x @param {number} y @param {number} rad @param {(p: Pt) => Pt} snap
    @returns {{x: number, y: number, guides: import('../types.js').Seg[], note: string}} */
function snapFloorPlace(l, x, y, rad, snap){
  const others=floorLayouts(l.floorId).filter(o=>o.id!==l.id).map(o=>({l:o, P:floorPts(o)}));
  if(!others.length){ const p=snap([x,y]); return {x:p[0], y:p[1], guides:[], note:'' }; }
  const rot=l.floorPlace.rot||0;
  let px=x, py=y, took=/** @type {Pt|null} */(null);
  const guides=/** @type {import('../types.js').Seg[]} */([]), kinds=/** @type {SnapCand['kind'][]} */([]);
  for(let pass=0; pass<2; pass++){
    const cands=floorSnapCandidates(l, ptsAt(l,{x:px,y:py,rot}), others, rad);
    /** @type {SnapCand|null} */
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
  if(!guides.length){ const p=snap([x,y]); return {x:p[0], y:p[1], guides:[], note:''}; }
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
/** @param {Member[]} members @param {number} [extWall] @returns {number[][]} per member, per edge */
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
/** @param {Pt[]} pts @param {number} i @param {number} j @param {number} by */
function extendEnd(pts,i,j,by){
  const a=pts[i], b=pts[j];
  const dx=a[0]-b[0], dy=a[1]-b[1], len=Math.hypot(dx,dy);
  if(len<1e-6 || !by) return;
  pts[i]=[a[0]+dx/len*by, a[1]+dy/len*by];
}
/** @param {Pt[]} P @param {number[]} depths @returns {DepthRun[]|null} */
function depthRuns(P, depths){
  const n=P.length, runs=/** @type {DepthRun[]} */([]);
  let start=-1;
  for(let k=0;k<n;k++) if(depths[k]!==depths[(k-1+n)%n]){ start=k; break; }
  if(start<0) return null;                                    // every edge the same: stroke it closed instead
  /** @type {DepthRun|null} */
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
/* the topmost room on floor `fl` whose outline holds floor-space point `pt` */
/** @param {import('../types.js').Floor|null|undefined} fl @param {Pt} pt @returns {string|null} */
function floorRoomAt(fl, pt){
  const ms=floorMembers(fl);
  for(let i=ms.length-1;i>=0;i--) if(pointInPoly(pt, ms[i].P)) return ms[i].l.id;
  return null;
}

export {PARALLEL_TOL, floorMembers, floorSnapCandidates, snapFloorPlace, floorEdgeDepths,
        extendEnd, depthRuns, floorRoomAt};
