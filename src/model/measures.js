/* Measurements: what can be measured, the geometry each anchor resolves to, and
   the shortest distance between two of them.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   The canvas half of the Measure tool stayed in index.html: the measure* state
   lets, measurePick (screen-space hit testing, wx/wy/sx/sy) and the drawing.
   pruneMeasures/remapMeasures stayed too — they sit inside the migrate region,
   which is blocked on library/item-folders.js. */

import {pointInPoly, ptSegDist, worldPoly} from '../core/geometry.js';
import {L, itemOf} from '../core/state.js';
import {wallOf, iwallGeom, iwallPoly} from './walls.js';
import {openGeom, swingPoly} from './openings.js';

const measuresOf = () => L().measures || (L().measures=[]);
const anchorKey = a => a ? [a.k,a.id,a.part,a.n==null?'':a.n].join(':') : '';

/* everything that can be measured, top-most first, each with the anchors it offers */
function measureObjs(){
  const l=L(), r=l.room, out=[];
  const solid = (k,id,poly,center,angular) => ({k, id, center, whole:{pts:poly, area:true},
    corners: angular ? poly : [],
    sides: angular ? poly.map((p,i)=>[p,poly[(i+1)%poly.length]]) : []});
  for(let pass=0;pass<2;pass++) for(let i=l.placed.length-1;i>=0;i--){
    const p=l.placed[i], it=itemOf(p.itemId);
    if(!it || (pass===0)===!!it.passThrough) continue;
    out.push(solid('item', p.id, worldPoly(p,it), [p.x,p.y], it.shape.type!=='ellipse'));
  }
  for(const pl of r.pillars) out.push(solid('pillar', pl.id, worldPoly(pl,pl), [pl.x,pl.y], pl.shape.type!=='ellipse'));
  for(const w of r.iwalls) out.push(solid('iwall', w.id, iwallPoly(w), iwallGeom(w).mid, true));
  for(const o of l.openings){
    const g=openGeom(o);
    const sp=swingPoly(o);
    out.push({k:'open', id:o.id, center:g.mid, whole:{pts:[g.p0,g.p1]}, corners:[g.p0,g.p1], sides:[],
      swing: sp ? {pts:sp, area:true} : null});
  }
  for(let i=0;i<r.points.length;i++){
    const w=wallOf(i);
    out.push({k:'wall', id:i, center:w.mid, whole:{pts:[w.a,w.b]}, corners:[w.a,w.b], sides:[], band:r.wall});
  }
  return out;
}
const objOfAnchor = (a,objs) => objs.find(o=>o.k===a.k && o.id===a.id);
/* an anchor's shape: {pts, area} — one point, a segment, or a solid polygon */
function anchorGeom(a,objs){
  const o=objOfAnchor(a,objs);
  if(!o) return null;
  if(a.part==='corner') return o.corners[a.n] ? {pts:[o.corners[a.n]]} : null;
  if(a.part==='side') return o.sides[a.n] ? {pts:o.sides[a.n]} : null;
  if(a.part==='swing') return o.swing||null;
  return o.whole;
}
function segCross(a,b,c,d){
  const rx=b[0]-a[0], ry=b[1]-a[1], qx=d[0]-c[0], qy=d[1]-c[1], den=rx*qy-ry*qx;
  if(Math.abs(den)<1e-9) return null;
  const t=((c[0]-a[0])*qy-(c[1]-a[1])*qx)/den, u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;
  return t>=0&&t<=1&&u>=0&&u<=1 ? [a[0]+rx*t, a[1]+ry*t] : null;
}
/* the closest pair of points between two anchor shapes: {d, p, q} */
function closestBetween(A,B){
  for(const [X,Y] of [[A,B],[B,A]]){
    if(X.area) for(const p of Y.pts) if(pointInPoly(p,X.pts)) return {d:0, p, q:p};
  }
  const edges = g => {
    const P=g.pts, n=P.length;
    if(n===1) return [[P[0],P[0]]];
    const out=[];
    for(let i=0;i<(g.area?n:n-1);i++) out.push([P[i],P[(i+1)%n]]);
    return out;
  };
  const foot = (p,a,b) => { const t=ptSegDist(p,a,b).t; return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; };
  let best={d:Infinity, p:A.pts[0], q:B.pts[0]};
  const consider = (p,q) => { const d=Math.hypot(p[0]-q[0],p[1]-q[1]); if(d<best.d) best={d,p,q}; };
  for(const [a0,a1] of edges(A)) for(const [b0,b1] of edges(B)){
    const x = a0!==a1 && b0!==b1 && segCross(a0,a1,b0,b1);
    if(x) return {d:0, p:x, q:x};
    // two segments that don't cross are closest at an end of one of them
    const pairs=[[a0,foot(a0,b0,b1)], [a1,foot(a1,b0,b1)], [foot(b0,a0,a1),b0], [foot(b1,a0,a1),b1]];
    const dist = pr => Math.hypot(pr[0][0]-pr[1][0], pr[0][1]-pr[1][1]);
    const min=Math.min(...pairs.map(dist)), tied=pairs.filter(pr=>dist(pr)<min+0.5);
    // parallel sides are equally close all along their overlap, so measure across its middle
    const avg = i => [tied.reduce((s,pr)=>s+pr[i][0],0)/tied.length, tied.reduce((s,pr)=>s+pr[i][1],0)/tied.length];
    const mid=[avg(0), avg(1)];
    consider(...(dist(mid)<min+0.5 ? mid : tied[0]));
  }
  return best;
}

export {measuresOf, anchorKey, measureObjs, objOfAnchor, anchorGeom, segCross,
        closestBetween};
