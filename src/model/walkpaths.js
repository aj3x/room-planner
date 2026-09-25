/* Walk paths: can you actually get around this room? The clearance grid, the
   routes through it, and the solver that threads a line from door to door.

   Extracted from index.html in Phase 3, move-only. The region arrived whole,
   drawing included; the decoupling pass (.claude/plans/decoupling.md §2.1,
   step 3) took the drawing back out. walkShade, walkPinchLabel, drawWalkPath
   and drawWalkOverlay now live in canvas/walk-overlay.js, unchanged, and with
   them went the imports of canvas/view.js and canvas/draw.js -- the upward
   edge that made the domain layer depend on the renderer and helped hold the
   45-module cycle together.

   What is left is pure computation: core/ plus its two model/ siblings, no
   layer above. Four names are exported, all of them for the overlay: WALK (the three
   clearance bands), walkGrid (the cached grid), walkPaths (the annotated
   routes) and walkBand (which band a clearance falls in). Everything else --
   the solver, the route builder, the raycast graph -- still has no caller
   outside this file, which is finding D of the units pilot again: export only
   what is really referenced. */

import {L, RP, itemOf} from '../core/state.js';
import {bbox, worldPoly, pointInPoly, segHit, ptSegDist, segDist} from '../core/geometry.js';
import {obstaclePolys} from './walls.js';
import {openGeom} from './openings.js';

/* ------------------------- walk paths -------------------------
   An advisory overlay, off by default: how much floor a person actually has
   to walk through. For every point on the floor we estimate the width of the
   local gap it sits in (distance to the nearest surface on each side — see
   buildWalkGrid) and band it the way a person would judge it:
   comfortable (>=900mm/~35in, two people can pass), tight (>=550mm/~22in,
   one person, mind the shoulders), a squeeze (>=350mm/~14in, turned
   sideways, the narrowest an adult can still get through), or below that,
   impassable — a gap wandering the floor's shading pattern can't actually be
   walked at all, not just "not comfortable". Comfortable floor is drawn as
   nothing — the room is fine there, so there's nothing to say (restraint).
   We also thread a route from each door: between every pair of doors when
   there are two or more, or from the one door to the farthest corner of the
   room when there's only one. Impassable floor is excluded from that route
   search the same way furniture is — a route can never claim to cross a gap
   a person couldn't fit through — so the line only ever shows a walkable
   path, down to how tight it gets. */
const WALK={comfortable:900, tight:550, narrow:350};
/* margin a walker keeps off the corner of a piece of furniture, pillar, or
   swung door leaf when a straightened line passes it — a hair short of half
   the narrowest passable gap, so it never rules out a legitimate squeeze */
const WALK_OBJ_BUFFER=100;
/* spacing of clearance samples along a route — fine enough that the pinch
   between two corners can't slip between samples */
const WALK_SAMPLE=50;
/* the leaf of a hinged door swept fully open — a physical barrier that eats
   into the room's floor next to the doorway, the same as a pillar would */
function doorLeafPoly(o){
  const g=openGeom(o);
  if(!g.hinge) return null;
  const dx=g.open[0]-g.hinge[0], dy=g.open[1]-g.hinge[1], len=Math.hypot(dx,dy)||1;
  const ux=dx/len, uy=dy/len, nx=-uy, ny=ux, th=Math.min(40,(L().room.wall||114)*.4)/2;
  return [
    [g.hinge[0]+nx*th, g.hinge[1]+ny*th],
    [g.open[0]+nx*th, g.open[1]+ny*th],
    [g.open[0]-nx*th, g.open[1]-ny*th],
    [g.hinge[0]-nx*th, g.hinge[1]-ny*th],
  ];
}
/* distance from `o` to where the ray o+t*dir (t>=0) first crosses segment a-b, or Infinity */
function rayHitSeg(o,dir,a,b){
  const sx_=b[0]-a[0], sy_=b[1]-a[1];
  const denom=dir[0]*sy_-dir[1]*sx_;
  if(Math.abs(denom)<1e-12) return Infinity;
  const ax=a[0]-o[0], ay=a[1]-o[1];
  const t=(ax*sy_-ay*sx_)/denom, u=(ax*dir[1]-ay*dir[0])/denom;
  return (t>1e-6 && u>=0 && u<=1) ? t : Infinity;
}
function buildWalkGrid(){
  const l=L(), R=RP(), b=bbox(R);
  const res=Math.max(80, Math.min(220, Math.max(b.w,b.h)/50||220));
  const cols=Math.max(1,Math.ceil(b.w/res)), rows=Math.max(1,Math.ceil(b.h/res));
  if(!isFinite(cols)||!isFinite(rows)||cols*rows>20000||cols*rows<1) return {res,cols:0,rows:0,cells:[]};
  const edges=[]; for(let i=0;i<R.length;i++) edges.push([R[i],R[(i+1)%R.length]]);
  const obstacles=[];
  for(const o of obstaclePolys()) obstacles.push(o.poly);
  for(const p of l.placed){ const it=itemOf(p.itemId); if(it&&!it.passThrough) obstacles.push(worldPoly(p,it)); }
  for(const o of l.openings){ const lp=doorLeafPoly(o); if(lp) obstacles.push(lp); }
  const obEdges=[];
  for(const op of obstacles) for(let i=0;i<op.length;i++){ const e=[op[i],op[(i+1)%op.length]]; edges.push(e); obEdges.push(e); }
  const far=Math.max(b.w,b.h)*2+1000;
  const cells=new Array(cols*rows);
  for(let iy=0; iy<rows; iy++){
    for(let ix=0; ix<cols; ix++){
      const idx=iy*cols+ix, pt=[b.x0+(ix+.5)*res, b.y0+(iy+.5)*res];
      if(!pointInPoly(pt,R)){ cells[idx]=null; continue; }
      let inside=false;
      for(const op of obstacles) if(pointInPoly(pt,op)){ inside=true; break; }
      if(inside){ cells[idx]=null; continue; }
      // local corridor width: distance to the nearest surface, plus how far
      // the room continues in the opposite direction — so hugging one wall
      // in an otherwise open room reads as comfortable, not as a squeeze
      let dNear=Infinity, nearest=null;
      for(const [a,c] of edges){
        const r=ptSegDist(pt,a,c);
        if(r.d<dNear){ dNear=r.d; nearest=[a[0]+(c[0]-a[0])*r.t, a[1]+(c[1]-a[1])*r.t]; }
      }
      let dFar=far;
      if(nearest){
        const vx=pt[0]-nearest[0], vy=pt[1]-nearest[1], vl=Math.hypot(vx,vy)||1;
        const dir=[vx/vl,vy/vl];
        for(const [a,c] of edges) dFar=Math.min(dFar, rayHitSeg(pt,dir,a,c));
      }
      cells[idx]=dNear+Math.min(dFar,far);
    }
  }
  return {res,cols,rows,x0:b.x0,y0:b.y0,cells,obEdges};
}
let walkGridCache=null;
/* every door's geometry that can change the shape of its leaf-barrier —
   hashed into the cache key so editing, moving, or re-swinging a door (with
   no change in wall/pillar/furniture counts) still invalidates the grid;
   this is what made the door "not always" read as a barrier before */
function openingsKey(l){
  return l.openings.map(o=>[o.id,o.kind,o.wall,o.offset,o.width,o.dtype,o.hinge,o.swing].join(':')).join(',');
}
function walkGrid(){
  const l=L(), key=l.id+':'+(l._rev||0)+':'+l.room.points.length+':'+l.placed.length+':'+l.room.pillars.length+':'+l.room.iwalls.length+':'+openingsKey(l);
  if(walkGridCache && walkGridCache.key===key) return walkGridCache;
  walkGridCache={key, ...buildWalkGrid()};
  return walkGridCache;
}
/* Dijkstra over the 8-connected grid, biased to prefer wider floor the way a
   person would rather cross the open middle of a room than hug a tight gap.
   Returns per-node distance/prev arrays; the caller turns that into a route. */
function walkSolve(grid, fromPt){
  const {res,cols,rows,cells}=grid;
  if(!cols||!rows) return null;
  const toCell=pt=>{
    let ix=Math.round((pt[0]-grid.x0)/res-.5), iy=Math.round((pt[1]-grid.y0)/res-.5);
    ix=Math.max(0,Math.min(cols-1,ix)); iy=Math.max(0,Math.min(rows-1,iy));
    if(cells[iy*cols+ix]!=null) return iy*cols+ix;
    for(let rad=1; rad<Math.max(cols,rows); rad++){
      for(let dy=-rad; dy<=rad; dy++) for(let dx=-rad; dx<=rad; dx++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==rad) continue;
        const jx=ix+dx, jy=iy+dy;
        if(jx<0||jy<0||jx>=cols||jy>=rows) continue;
        if(cells[jy*cols+jx]!=null) return jy*cols+jx;
      }
    }
    return null;
  };
  const s=toCell(fromPt);
  if(s==null) return null;
  const N=cols*rows, dist=new Float64Array(N).fill(Infinity), prev=new Int32Array(N).fill(-1), done=new Uint8Array(N);
  dist[s]=0;
  const heap=[[0,s]];
  const push=(d,i)=>{ heap.push([d,i]); let k=heap.length-1;
    while(k>0){ const p=(k-1)>>1; if(heap[p][0]<=heap[k][0]) break; [heap[p],heap[k]]=[heap[k],heap[p]]; k=p; } };
  const pop=()=>{ const top=heap[0], last=heap.pop();
    if(heap.length){ heap[0]=last; let k=0;
      while(true){ const l2=2*k+1,r=2*k+2; let m=k;
        if(l2<heap.length&&heap[l2][0]<heap[m][0]) m=l2;
        if(r<heap.length&&heap[r][0]<heap[m][0]) m=r;
        if(m===k) break; [heap[m],heap[k]]=[heap[k],heap[m]]; k=m; } }
    return top; };
  const nbrs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
  while(heap.length){
    const [d,u]=pop();
    if(done[u]) continue; done[u]=1;
    const ux=u%cols, uy=(u-ux)/cols;
    for(const [dx,dy,base] of nbrs){
      const vx=ux+dx, vy=uy+dy;
      if(vx<0||vy<0||vx>=cols||vy>=rows) continue;
      const v=vy*cols+vx, cv=cells[v];
      if(cv==null || cv<WALK.narrow) continue; // too narrow for a person — treat like solid floor
      const w = cv>=WALK.comfortable ? 1 : cv>=WALK.tight ? 1.6 : 3.2;
      const nd=d+res*base*w;
      if(nd<dist[v]){ dist[v]=nd; prev[v]=u; push(nd,v); }
    }
  }
  return {dist,prev,cols,rows,s};
}
function walkTrace(grid, solved, targetPt){
  if(!solved) return null;
  const {res,cols}=grid;
  let ix=Math.round((targetPt[0]-grid.x0)/res-.5), iy=Math.round((targetPt[1]-grid.y0)/res-.5);
  ix=Math.max(0,Math.min(cols-1,ix)); iy=Math.max(0,Math.min(solved.rows-1,iy));
  let t=iy*cols+ix;
  if(solved.dist[t]===Infinity){
    // fall back to the reachable cell nearest the target
    let best=-1, bd=Infinity;
    for(let i=0;i<solved.dist.length;i++){
      if(solved.dist[i]===Infinity) continue;
      const jx=i%cols, jy=(i-jx)/cols;
      const dx=grid.x0+(jx+.5)*res-targetPt[0], dy=grid.y0+(jy+.5)*res-targetPt[1];
      const dd=dx*dx+dy*dy;
      if(dd<bd){ bd=dd; best=i; }
    }
    if(best===-1) return null;
    t=best;
  }
  const idx=[]; let cur=t;
  while(cur!==-1){ idx.push(cur); cur=solved.prev[cur]; }
  idx.reverse();
  return idx.map(i=>{ const ix2=i%cols, iy2=(i-ix2)/cols;
    return {pt:[grid.x0+(ix2+.5)*res, grid.y0+(iy2+.5)*res], clear:grid.cells[i]}; });
}
const doorEntry = o => { const g=openGeom(o), inset=Math.max(150,(walkGrid().res||150)/2); return [g.mid[0]+g.nrm[0]*inset, g.mid[1]+g.nrm[1]*inset]; };
/* signed area (shoelace) — sign gives the polygon's winding, which is all
   the outward-normal math below needs, convex or not */
function polySignedArea(poly){ let s=0; for(let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length]; s+=a[0]*b[1]-b[0]*a[1]; } return s/2; }
function edgeOutward(a,b,ccw){ const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy)||1; return ccw ? [dy/len,-dx/len] : [-dy/len,dx/len]; }
/* one offset point per vertex, pushed `buffer` along the outward miter
   bisector (sign +1) to clear an obstacle's corner, or inward (sign -1) to
   pull a room corner back off the wall — the corner nodes a raycast route
   bends around */
function offsetCorners(poly, buffer, sign){
  const n=poly.length, ccw=polySignedArea(poly)>0, out=[];
  for(let i=0;i<n;i++){
    const prev=poly[(i-1+n)%n], cur=poly[i], next=poly[(i+1)%n];
    const n1=edgeOutward(prev,cur,ccw), n2=edgeOutward(cur,next,ccw);
    let ux=n1[0]+n2[0], uy=n1[1]+n2[1]; const bl=Math.hypot(ux,uy);
    if(bl<1e-6){ ux=n1[0]; uy=n1[1]; } else { ux/=bl; uy/=bl; }
    const dot=Math.max(ux*n1[0]+uy*n1[1], .35);
    const dist=Math.min(buffer/dot, buffer*3);
    out.push([cur[0]+ux*dist*sign, cur[1]+uy*dist*sign]);
  }
  return out;
}
/* raycast shortest path: try the direct line from `from` to `to` first: no
   object in the way, that's the route, full stop. When something blocks it,
   route through a graph of every obstacle's (buffer-offset) corners plus the
   room's own corners, and take the shortest sequence of straight, mutually
   visible hops that gets around — Dijkstra over that small graph, not a
   grid, so the result is only ever a raycast that goes as straight as the
   room lets it. */
function walkRoute(from, to, room, obstacles, buffer){
  const roomEdges=[]; for(let i=0;i<room.length;i++) roomEdges.push([room[i],room[(i+1)%room.length]]);
  const obs=obstacles.map(poly=>{ const edges=[]; for(let i=0;i<poly.length;i++) edges.push([poly[i],poly[(i+1)%poly.length]]); return {poly,edges}; });
  const nodes=[{pt:from},{pt:to}];
  obs.forEach((od,oi)=>{ offsetCorners(od.poly,buffer,1).forEach((pt,ci)=>{
    if(!pointInPoly(pt,room)) return;
    for(const o2 of obs) if(pointInPoly(pt,o2.poly)) return;
    nodes.push({pt,oi,ei:[(ci-1+od.poly.length)%od.poly.length,ci]});
  }); });
  offsetCorners(room,buffer,-1).forEach((pt,ci)=>{
    if(!pointInPoly(pt,room)) return;
    for(const o2 of obs) if(pointInPoly(pt,o2.poly)) return;
    nodes.push({pt,room:1,ei:[(ci-1+room.length)%room.length,ci]});
  });
  const visible=(p,q)=>{
    for(const [a,c] of roomEdges) if(segHit(p.pt,q.pt,a,c)) return false;
    if(!pointInPoly(p.pt,room) || !pointInPoly(midpt(p.pt,q.pt),room)) return false;
    for(let oi=0;oi<obs.length;oi++){
      const {edges}=obs[oi];
      for(let ei=0;ei<edges.length;ei++){
        const skip=(p.oi===oi&&(p.ei[0]===ei||p.ei[1]===ei)) || (q.oi===oi&&(q.ei[0]===ei||q.ei[1]===ei));
        const [a,c]=edges[ei];
        if(segHit(p.pt,q.pt,a,c)) return false;
        if(!skip && segDist(p.pt,q.pt,a,c)<buffer-1e-6) return false;
      }
    }
    return true;
  };
  const N=nodes.length, adj=Array.from({length:N},()=>[]);
  for(let i=0;i<N;i++) for(let j=i+1;j<N;j++){
    if(!visible(nodes[i],nodes[j])) continue;
    const d=Math.hypot(nodes[i].pt[0]-nodes[j].pt[0], nodes[i].pt[1]-nodes[j].pt[1]);
    adj[i].push([j,d]); adj[j].push([i,d]);
  }
  const dist=new Array(N).fill(Infinity), prev=new Array(N).fill(-1), done=new Array(N).fill(false);
  dist[0]=0;
  for(let iter=0;iter<N;iter++){
    let u=-1, ud=Infinity;
    for(let i=0;i<N;i++) if(!done[i] && dist[i]<ud){ ud=dist[i]; u=i; }
    if(u===-1) break;
    done[u]=true;
    for(const [v,w] of adj[u]) if(dist[u]+w<dist[v]){ dist[v]=dist[u]+w; prev[v]=u; }
  }
  if(dist[1]===Infinity) return null;
  const idx=[]; let cur=1; while(cur!==-1){ idx.push(cur); cur=prev[cur]; } idx.reverse();
  return idx.map(i=>nodes[i].pt);
}
function midpt(a,b){ return [(a[0]+b[0])/2,(a[1]+b[1])/2]; }
/* local corridor width at an arbitrary point (not grid-snapped) — same
   near+far estimate buildWalkGrid uses, for annotating a raycast route */
function clearAtPoint(pt, edges, far){
  let dNear=Infinity, nearest=null;
  for(const [a,c] of edges){ const r=ptSegDist(pt,a,c); if(r.d<dNear){ dNear=r.d; nearest=[a[0]+(c[0]-a[0])*r.t, a[1]+(c[1]-a[1])*r.t]; } }
  let dFar=far;
  if(nearest){
    const vx=pt[0]-nearest[0], vy=pt[1]-nearest[1], vl=Math.hypot(vx,vy)||1, dir=[vx/vl,vy/vl];
    for(const [a,c] of edges) dFar=Math.min(dFar, rayHitSeg(pt,dir,a,c));
  }
  return dNear+Math.min(dFar,far);
}
function walkPaths(){
  const l=L(), R=RP(), b=bbox(R);
  if(!R.length) return [];
  const doors=l.openings.filter(o=>o.kind==='door');
  if(!doors.length) return [];
  const obstacles=[];
  for(const o of obstaclePolys()) obstacles.push(o.poly);
  for(const p of l.placed){ const it=itemOf(p.itemId); if(it&&!it.passThrough) obstacles.push(worldPoly(p,it)); }
  for(const o of l.openings){ const lp=doorLeafPoly(o); if(lp) obstacles.push(lp); }
  const edges=[]; for(let i=0;i<R.length;i++) edges.push([R[i],R[(i+1)%R.length]]);
  for(const op of obstacles) for(let i=0;i<op.length;i++) edges.push([op[i],op[(i+1)%op.length]]);
  const far=Math.max(b.w,b.h)*2+1000;
  // sample clearance along every leg, not just at the bends — a straight run
  // between two doors has no vertices in the gap it squeezes through
  const annotate=pts=>{
    const out=[{pt:pts[0], clear:clearAtPoint(pts[0],edges,far)}];
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], c=pts[i], n=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/WALK_SAMPLE));
      for(let k=1;k<=n;k++){
        const pt = k===n ? c : [a[0]+(c[0]-a[0])*k/n, a[1]+(c[1]-a[1])*k/n];
        out.push({pt, clear:clearAtPoint(pt,edges,far)});
      }
    }
    return out;
  };
  const out=[];
  const route=(from,to)=>{ const pts=walkRoute(from,to,R,obstacles,WALK_OBJ_BUFFER); return pts&&pts.length>1 ? annotate(pts) : null; };
  if(doors.length>=2){
    for(let i=0;i<doors.length;i++) for(let j=i+1;j<doors.length;j++){
      const p=route(doorEntry(doors[i]), doorEntry(doors[j]));
      if(p) out.push(p);
    }
  } else {
    // farthest point to route to: reuse the shading grid's Dijkstra purely to
    // pick a target — the route itself is still the raycast graph above
    const grid=walkGrid(), from=doorEntry(doors[0]);
    if(grid.cols){
      const solved=walkSolve(grid, from);
      if(solved){
        let farI=-1, fd=-1;
        for(let i=0;i<solved.dist.length;i++) if(solved.dist[i]!==Infinity && solved.dist[i]>fd){ fd=solved.dist[i]; farI=i; }
        if(farI!==-1){
          const ix=farI%grid.cols, iy=(farI-ix)/grid.cols;
          const p=route(from, [grid.x0+(ix+.5)*grid.res, grid.y0+(iy+.5)*grid.res]);
          if(p) out.push(p);
        }
      }
    }
  }
  return out;
}
function walkBand(clear){ return clear>=WALK.comfortable?'comfortable':clear>=WALK.tight?'tight':clear>=WALK.narrow?'narrow':'impossible'; }

export {WALK, walkGrid, walkPaths, walkBand};
