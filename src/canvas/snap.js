/* The alignment magnet: pulling a dragged point onto the lines the rest of the
   room already lies on.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, banner included, and the `export` block
   at the end is the only line added.

   It stops at snapCorner. squareCorner, which follows it under the same
   banner, calls commitRoom(), draw() and four render*() functions and is still
   in the monolith; so are pickAt/pickRoom, the hit-testing that shares the
   region. §3 files this as canvas/snap.js and that is what it is, minus those.

   This is the least-covered code in the app by the Phase 3.5 audit's own
   account: every magnet assertion in the pointer suite is on a rectangle, so
   alignPoint's bias ordering (near corner 0, far corner 0.3, square-to-edge
   +0.35) never decides an outcome. Nothing here changed, but that is the
   reason to read it rather than trust the suite. */

import {view} from './view.js';
import {RP} from '../core/state.js';
import {snapPt} from './view.js';

/* ------------------------- the alignment magnet -------------------------
   A dragged point used to land wherever the grid allowed, which is hopeless on a plan
   whose other corners are not on the grid themselves (anything imported or drawn
   freehand): a neighbour's exact x or y was simply unreachable, so squaring a corner
   by eye never came off. Instead the point is pulled onto the lines the rest of the
   room already lies on, and onto the crossing of two of them — which, when the two
   come from the corners either side, IS a right angle. */

/* how close, in world mm, a magnet still bites — pixel-based so it feels the same at
   every zoom, and a little wider than snapRadius() since this is chasing an alignment
   rather than one exact point */
const alignRadius = () => 18/Math.max(view.scale,1e-6);

/* Drop `raw` onto the best pair of lines within `reach`. Solved as a pair rather than
   one axis and then the other, because the pair is the whole point: an x borrowed from
   one corner and a y from another is a square corner. Two lines only pair up if they
   actually cross and hang off different points — both from one point would just land
   on top of it. An axis with nothing to line up with falls back to the ordinary grid. */
function snapToLines(raw, lines, reach){
  const unit=alignRadius();
  const near=lines.map(l=>{
    const d=Math.abs((raw[0]-l.p[0])*(-l.dir[1]) + (raw[1]-l.p[1])*l.dir[0]);
    return {l, d, cost:d + (l.bias||0)*unit};
  }).filter(c=>c.d<=reach).sort((a,b)=>a.cost-b.cost);
  const first=near[0];
  if(!first) return {pt:snapPt(raw), guides:[]};
  const second=near.find(c=>c!==first && c.l.pin!==first.l.pin
    && Math.abs(c.l.dir[0]*first.l.dir[0]+c.l.dir[1]*first.l.dir[1])<0.3);
  const pt = second ? lineCross(first.l, second.l) : lineProject(first.l, snapPt(raw));
  const took = second ? [first.l, second.l] : [first.l];
  return {pt, guides:took.map(l=>guideSeg(l,pt))};
}
function lineProject(l,q){
  const nx=-l.dir[1], ny=l.dir[0];
  const d=(q[0]-l.p[0])*nx + (q[1]-l.p[1])*ny;
  return [q[0]-nx*d, q[1]-ny*d];
}
function lineCross(a,b){
  const det=a.dir[0]*b.dir[1]-a.dir[1]*b.dir[0];
  if(Math.abs(det)<1e-9) return a.p.slice();
  const t=((b.p[0]-a.p[0])*b.dir[1]-(b.p[1]-a.p[1])*b.dir[0])/det;
  return [a.p[0]+a.dir[0]*t, a.p[1]+a.dir[1]*t];
}
/* the dashed line shown while a magnet holds: from the point it hangs off to where the
   dragged point landed, run on a little past both ends so it reads as a guide, not a wall */
function guideSeg(l,pt){
  const over=10/Math.max(view.scale,1e-6);
  const vx=pt[0]-l.pin[0], vy=pt[1]-l.pin[1], len=Math.hypot(vx,vy);
  const u = len>1e-6 ? [vx/len, vy/len] : l.dir;
  const end = len>1e-6 ? pt : l.pin;
  return [[l.pin[0]-u[0]*over, l.pin[1]-u[1]*over], [end[0]+u[0]*over, end[1]+u[1]*over]];
}
/* Every line a dragged point can latch onto, from the points it should line up with.
   A ref is {p, bias, edge}: `p` is the point, `bias` how reluctantly it is used (a
   fraction of the magnet's radius, so a corner across the room yields to a neighbour),
   and `edge` the wall arriving at it, which adds a line square to that wall — the one
   thing that gives a room sitting at an angle its right angles too. */
function alignPoint(raw, refs, reach){
  const lines=[];
  for(const r of refs){
    const bias=r.bias||0;
    lines.push({pin:r.p, p:r.p, dir:[0,1], bias});
    lines.push({pin:r.p, p:r.p, dir:[1,0], bias});
    const e=r.edge, L=e&&Math.hypot(e[0],e[1]);
    if(L>1) lines.push({pin:r.p, p:r.p, dir:[-e[1]/L, e[0]/L], bias:bias+0.35});
  }
  return snapToLines(raw, lines, reach);
}
/* is the corner at b square? */
function isSquare(a,b,c){
  const ux=a[0]-b[0], uy=a[1]-b[1], vx=c[0]-b[0], vy=c[1]-b[1];
  const lu=Math.hypot(ux,uy), lv=Math.hypot(vx,vy);
  if(lu<1||lv<1) return false;
  return Math.abs((ux*vx+uy*vy)/(lu*lv)) < 0.002;   // inside about a tenth of a degree
}
/* dragging corner i: the corners either side pull hardest, then every other corner */
function snapCorner(i, raw, reach){
  const P=RP(), n=P.length, prev=(i-1+n)%n, next=(i+1)%n;
  const refs=[];
  for(let k=0;k<n;k++){
    if(k===i) continue;
    if(k===prev||k===next){
      const far=P[k===prev ? (prev-1+n)%n : (next+1)%n];
      refs.push({p:P[k], bias:0, edge:[P[k][0]-far[0], P[k][1]-far[1]]});
    } else refs.push({p:P[k], bias:0.3});
  }
  const s=alignPoint(raw, refs, reach);
  if(!s.guides.length) return {pt:s.pt, guides:[], note:''};
  return {pt:s.pt, guides:s.guides, note: isSquare(P[prev], s.pt, P[next]) ? 'Right angle' : 'Lined up'};
}

export {alignRadius, snapToLines, lineProject, lineCross, guideSeg,
        alignPoint, isSquare, snapCorner};
