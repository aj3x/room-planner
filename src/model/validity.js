/* Validity: whether a placement is legal, and what it runs into if it is not.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. The walk-paths region that shares this banner's half of the
   file did NOT come along — it draws (ctx, PAL, view, cv) and belongs behind
   canvas/. */

import {EPS, bbox, bbHit, shrink, pointInPoly, segHit, polyHit, segDist,
        centroid, worldPoly} from '../core/geometry.js';
import {openPoly} from '../core/open-state.js';
import {L, RP, itemOf} from '../core/state.js';
import {obstaclePolys} from './walls.js';

/* ------------------------- validity ------------------------- */
function insideRoom(poly){
  const R=RP(), t=L().room.trimOn ? L().room.trim : 0;
  for(const v of poly) if(!pointInPoly(v,R)) return false;
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    for(let j=0;j<R.length;j++){
      const c=R[j], d=R[(j+1)%R.length];
      if(segHit(a,b,c,d)) return false;
      if(t>0 && segDist(a,b,c,d) < t-EPS) return false;
    }
  }
  return true;
}
function collides(inst,poly){
  const me=itemOf(inst.itemId);
  if(me&&me.passThrough) return null;
  const test=shrink(poly,EPS), tb=bbox(poly);
  for(const {poly:op,name} of obstaclePolys()){
    if(!bbHit(tb,bbox(op))) continue;
    if(polyHit(test,shrink(op,EPS))) return name;
  }
  for(const other of L().placed){
    if(other.id===inst.id) continue;
    const oi=itemOf(other.itemId);
    if(!oi||oi.passThrough) continue;
    const op=worldPoly(other,oi);
    if(!bbHit(tb,bbox(op))) continue;
    if(polyHit(test,shrink(op,EPS))) return oi.name;
  }
  return null;
}
function validate(inst,poly){
  if(!insideRoom(poly)) return {ok:false, why:'Outside the room'};
  const c=collides(inst,poly);
  if(c) return {ok:false, why:'Bumps into '+c};
  return {ok:true};
}
function conflictSet(){
  const ps=L().placed, polys=[], bbs=[], out=new Set();
  const obs=obstaclePolys();
  for(const p of ps){
    const it=itemOf(p.itemId), w=it?worldPoly(p,it):null;
    polys.push(w); bbs.push(w?bbox(w):null);
  }
  for(let i=0;i<ps.length;i++){
    if(!polys[i]) continue;
    if(!insideRoom(polys[i])) out.add(ps[i].id);
    const it=itemOf(ps[i].itemId);
    if(it.passThrough) continue;
    for(const o of obs){
      if(!bbHit(bbs[i],bbox(o.poly))) continue;
      if(polyHit(shrink(polys[i],EPS),shrink(o.poly,EPS))){ out.add(ps[i].id); break; }
    }
    for(let j=i+1;j<ps.length;j++){
      const oj=itemOf(ps[j].itemId);
      if(!oj||oj.passThrough||!polys[j]) continue;
      if(!bbHit(bbs[i],bbs[j])) continue;
      if(polyHit(shrink(polys[i],EPS),shrink(polys[j],EPS))){ out.add(ps[i].id); out.add(ps[j].id); }
    }
  }
  return out;
}
/* An open footprint may sit over the trim — a drawer clears a baseboard — so
   this is a plainer test than insideRoom(): only the wall line itself counts. */
function openThroughWall(poly){
  const R=RP();
  for(const v of poly) if(!pointInPoly(v,R)) return true;
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    for(let j=0;j<R.length;j++) if(segHit(a,b,R[j],R[(j+1)%R.length])) return true;
  }
  return false;
}
/* id -> why, for every placed thing that hasn't the room to open. Kept apart
   from conflictSet() because these never make a placement illegal.
   The open box is inset by a true perpendicular margin rather than shrink()'s
   radial one: its sides run flush with the piece's own, and a neighbour pushed
   up alongside is allowed to sit up to 2*EPS into that line, so only a real
   overlap into the open area — not side-by-side contact — counts. */
const OPEN_SLOP = 2*EPS+1;
function openConflicts(){
  const ps=L().placed, out=new Map();
  const solids=ps.map(p=>{ const it=itemOf(p.itemId); return (it&&!it.passThrough)?worldPoly(p,it):null; });
  const obs=obstaclePolys();
  for(let i=0;i<ps.length;i++){
    const it=itemOf(ps[i].itemId);
    const test=it&&openPoly(ps[i],it,OPEN_SLOP);
    if(!test) continue;
    if(openThroughWall(test)){ out.set(ps[i].id,'Opened out, it reaches past the wall'); continue; }
    const ob=bbox(test);
    for(let j=0;j<ps.length;j++){
      if(j===i||!solids[j]) continue;
      if(!bbHit(ob,bbox(solids[j]))) continue;
      if(polyHit(test,solids[j])){
        out.set(ps[i].id,'Opened out, it runs into '+itemOf(ps[j].itemId).name);
        break;
      }
    }
    if(out.has(ps[i].id)) continue;
    for(const o of obs){
      if(!bbHit(ob,bbox(o.poly))) continue;
      if(polyHit(test,o.poly)){ out.set(ps[i].id,'Opened out, it runs into '+o.name); break; }
    }
  }
  return out;
}
/* conflictSet()/openConflicts() are both ~O(N^2) over placed items and run every
   draw(). Cache them together against a cheap key — a per-layout revision bumped
   by every commit/live-drag mutation, plus array lengths as a backstop — so a
   redraw triggered by nothing but panning/zooming/hover reuses the last result. */
let conflictsCache=null;
function getConflicts(){
  const l=L();
  const key=l.id+':'+(l._rev||0)+':'+l.room.points.length+':'+l.placed.length;
  if(conflictsCache && conflictsCache.key===key) return conflictsCache;
  conflictsCache={key, bad:conflictSet(), openBad:openConflicts()};
  return conflictsCache;
}
const isBad = inst => { const it=itemOf(inst.itemId); return it ? !validate(inst,worldPoly(inst,it)).ok : false; };
/* while a piece is overlapping we let it move freely, but never off the floor */
function centreInside(inst){
  const it=itemOf(inst.itemId);
  if(!it) return true;
  const c=centroid(worldPoly(inst,it));
  return c ? pointInPoly(c,RP()) : true;
}
/* slide inst from a known-valid point toward a desired (possibly invalid) point,
   stopping at the furthest reachable valid position along that line */
function bisectToValid(inst,it,from,to){
  const at=t=>[from[0]+(to[0]-from[0])*t, from[1]+(to[1]-from[1])*t];
  const len=Math.hypot(to[0]-from[0], to[1]-from[1]);
  let lo=0, hi=1;
  inst.x=to[0]; inst.y=to[1];
  if(validate(inst,worldPoly(inst,it)).ok) return 1;
  // stop once the bracket is under a hundredth of a millimetre
  for(let i=0;i<32 && (hi-lo)*len>0.01;i++){
    const t=(lo+hi)/2, p=at(t);
    inst.x=p[0]; inst.y=p[1];
    if(validate(inst,worldPoly(inst,it)).ok) lo=t; else hi=t;
  }
  const p=at(lo); inst.x=p[0]; inst.y=p[1];
  return lo;
}
/* move inst from a known-valid point as close to `to` as it can get: straight
   there if it fits, otherwise the furthest it can go along each axis (so a
   piece pushed past a wall ends up flush with it, and slides along it). Tries
   x-then-y, y-then-x and the straight line, and keeps whichever lands nearest. */
function slideToValid(inst,it,from,to){
  inst.x=to[0]; inst.y=to[1];
  if(validate(inst,worldPoly(inst,it)).ok) return [to[0],to[1]];
  const axisFirst=ax=>{
    bisectToValid(inst,it,from, ax===0 ? [to[0],from[1]] : [from[0],to[1]]);
    const p=[inst.x,inst.y];
    bisectToValid(inst,it,p, ax===0 ? [p[0],to[1]] : [to[0],p[1]]);
    return [inst.x,inst.y];
  };
  const cands=[axisFirst(0), axisFirst(1)];
  bisectToValid(inst,it,from,to); cands.push([inst.x,inst.y]);
  const d=p=>Math.hypot(to[0]-p[0], to[1]-p[1]);
  const best=cands.reduce((a,b)=>d(b)<d(a)?b:a);
  inst.x=best[0]; inst.y=best[1];
  return best;
}


export {insideRoom, collides, validate, conflictSet, openThroughWall, OPEN_SLOP,
        openConflicts, getConflicts, isBad, centreInside,
        bisectToValid, slideToValid};
