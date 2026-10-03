/* Geometry. Pure polygon maths: no state, no DOM, no canvas.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. The `open state` sub-block that sat between `worldPoly` and
   `shrink` did not come along — `openSizeLabel` reads `S.unit`; it moved
   separately once core/state.js existed. */

/* ------------------------- geometry ------------------------- */
const EPS = 2;
const norm360 = d => ((d%360)+360)%360;

const shapePolyCache=new WeakMap();
function shapePoly(shape){
  const cached=shapePolyCache.get(shape);
  if(cached) return cached;
  const p=shapePolyCompute(shape);
  shapePolyCache.set(shape,p);
  return p;
}
function shapePolyCompute(shape){
  const t = shape.type;
  if(t==='rect'){ const w=shape.w/2,d=shape.d/2; return [[-w,-d],[w,-d],[w,d],[-w,d]]; }
  if(t==='ellipse'){
    const a=shape.w/2,b=shape.d/2,N=44,p=[];
    for(let i=0;i<N;i++){const th=i/N*Math.PI*2;p.push([Math.cos(th)*a,Math.sin(th)*b]);}
    return p;
  }
  if(t==='lshape'){
    const w=shape.w,d=shape.d,cw=Math.min(shape.cw,w-1),cd=Math.min(shape.cd,d-1);
    let p;
    switch(shape.corner){
      case 'ne': p=[[0,0],[w-cw,0],[w-cw,cd],[w,cd],[w,d],[0,d]]; break;
      case 'se': p=[[0,0],[w,0],[w,d-cd],[w-cw,d-cd],[w-cw,d],[0,d]]; break;
      case 'sw': p=[[0,0],[w,0],[w,d],[cw,d],[cw,d-cd],[0,d-cd]]; break;
      default:   p=[[cw,0],[w,0],[w,d],[0,d],[0,cd],[cw,cd]]; break;
    }
    return recenter(p);
  }
  return recenter(shape.points.map(p=>[p[0],p[1]]));
}
function recenter(p){ const b=bbox(p),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2; return p.map(q=>[q[0]-cx,q[1]-cy]); }
function bbox(p){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const q of p){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};
}
function worldPoly(inst,item){
  const local=shapePoly(item.shape), r=(inst.rot||0)*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  return local.map(([x,y])=>[inst.x+x*c-y*s, inst.y+x*s+y*c]);
}
function shrink(poly,amt){
  const b=bbox(poly),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
  return poly.map(([x,y])=>{
    const dx=x-cx,dy=y-cy,Lm=Math.hypot(dx,dy);
    if(Lm<=amt) return [cx,cy];
    const k=(Lm-amt)/Lm; return [cx+dx*k,cy+dy*k];
  });
}
function pointInPoly(pt,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if(((yi>pt[1])!==(yj>pt[1])) && (pt[0] < (xj-xi)*(pt[1]-yi)/((yj-yi)||1e-12)+xi)) inside=!inside;
  }
  return inside;
}
function segHit(a,b,c,d){
  const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
  return o(a,b,c)!==o(a,b,d) && o(c,d,a)!==o(c,d,b);
}
function polyHit(A,B){
  for(let i=0;i<A.length;i++){
    const a=A[i],b=A[(i+1)%A.length];
    for(let j=0;j<B.length;j++) if(segHit(a,b,B[j],B[(j+1)%B.length])) return true;
  }
  return pointInPoly(A[0],B)||pointInPoly(B[0],A);
}
function ptSegDist(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;
  let t = L2 ? ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2 : 0;
  t = Math.max(0,Math.min(1,t));
  return {d:Math.hypot(p[0]-(a[0]+dx*t), p[1]-(a[1]+dy*t)), t};
}
function segDist(a,b,c,d){
  if(segHit(a,b,c,d)) return 0;
  return Math.min(ptSegDist(a,c,d).d, ptSegDist(b,c,d).d, ptSegDist(c,a,b).d, ptSegDist(d,a,b).d);
}
function centroid(p){
  let a=0,cx=0,cy=0;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const f=p[j][0]*p[i][1]-p[i][0]*p[j][1];
    a+=f; cx+=(p[j][0]+p[i][0])*f; cy+=(p[j][1]+p[i][1])*f;
  }
  a*=0.5;
  if(Math.abs(a)<1e-9) return null;
  return [cx/(6*a), cy/(6*a)];
}
/* positive is clockwise here, because y runs down the screen: the shoelace over
   rectPts(w,d) comes out +2wd. room.points is stored clockwise, so anything built
   from scratch can be checked against the sign rather than against a winding rule
   written out longhand. */
function signedArea(p){
  let s=0;
  for(let i=0,j=p.length-1;i<p.length;j=i++) s+=(p[j][0]*p[i][1]-p[i][0]*p[j][1]);
  return s/2;
}
function polyArea(p){ return Math.abs(signedArea(p)); }
function bbHit(a,b){ return !(a.x1<b.x0-EPS||b.x1<a.x0-EPS||a.y1<b.y0-EPS||b.y1<a.y0-EPS); }
/* a polygon is usable only if no two non-adjacent walls cross */
function polySimple(P){
  const n=P.length;
  if(n<3) return false;
  for(let i=0;i<n;i++){
    if(Math.hypot(P[(i+1)%n][0]-P[i][0], P[(i+1)%n][1]-P[i][1]) < 50) return false;
    for(let j=i+1;j<n;j++){
      if(i===j || (i+1)%n===j || (j+1)%n===i) continue;
      if(segHit(P[i],P[(i+1)%n],P[j],P[(j+1)%n])) return false;
    }
  }
  return polyArea(P) > 1e5;
}

export {EPS, norm360, shapePolyCache, shapePoly, shapePolyCompute, recenter, bbox, worldPoly, shrink, pointInPoly, segHit, polyHit, ptSegDist, segDist, centroid, signedArea, polyArea, bbHit, polySimple};
