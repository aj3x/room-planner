import {ptSegDist} from '../core/geometry.js';

/* ---- blueprint: outlines ----
   Real Moore-neighbour border following. The previous attempt took the leftmost and
   rightmost pixel of each row instead, which cannot represent a U-shape or any
   horizontal notch — and a floor plan is made of those. */
const BP_DIRS=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
/* `limit` is bounded by the region's own perimeter, not by the image. A border walk that
   fails to close must fail cheaply — bounding it by w*h grows a multi-million-point
   array before giving up, which is slow enough to look like a hang. */
function bpTrace(lab,target,w,h,start,limit){
  const sx=start%w, sy=(start/w)|0;
  const out=[[sx,sy]];
  let cx=sx, cy=sy, b=4, guard=0;
  if(!limit) limit=w*h*4;
  for(;;){
    let moved=false;
    for(let k=1;k<=8;k++){
      const d=(b+k)%8, nx=cx+BP_DIRS[d][0], ny=cy+BP_DIRS[d][1];
      if(nx<0||ny<0||nx>=w||ny>=h) continue;
      if(lab[ny*w+nx]===target){ b=(d+4)%8; cx=nx; cy=ny; out.push([cx,cy]); moved=true; break; }
    }
    if(!moved || (cx===sx&&cy===sy) || ++guard>limit) break;
  }
  if(out.length>1 && out[out.length-1][0]===sx && out[out.length-1][1]===sy) out.pop();
  return out;
}
function bpRDP(pts,eps){
  if(pts.length<3) return pts.slice();
  const keep=new Uint8Array(pts.length); keep[0]=keep[pts.length-1]=1;
  const stack=[[0,pts.length-1]];
  while(stack.length){
    const [a,b]=stack.pop();
    let far=-1, fd=eps;
    for(let i=a+1;i<b;i++){
      const d=ptSegDist(pts[i],pts[a],pts[b]).d;
      if(d>fd){ fd=d; far=i; }
    }
    if(far>0){ keep[far]=1; stack.push([a,far],[far,b]); }
  }
  return pts.filter((_,i)=>keep[i]);
}
/* Partial rectilinearisation, degrading per edge. The previous attempt bailed out to raw
   jagged output whenever the vertex count was odd or any edge ran diagonally; here a
   diagonal simply keeps its own endpoints and its neighbours still snap. */
function bpOrtho(P,eps){
  const n=P.length;
  if(n<4) return P;
  const kind=[], coord=[];
  for(let i=0;i<n;i++){
    const a=P[i], b=P[(i+1)%n];
    const dx=Math.abs(b[0]-a[0]), dy=Math.abs(b[1]-a[1]);
    if(dy<=eps && dx>dy){ kind[i]='h'; coord[i]=(a[1]+b[1])/2; }
    else if(dx<=eps && dy>dx){ kind[i]='v'; coord[i]=(a[0]+b[0])/2; }
    else { kind[i]='f'; coord[i]=0; }
  }
  /* three fragments of one wall should agree on one coordinate, so cluster them,
     weighting by edge length — the long run is the one that knows where the wall is */
  const cluster=k=>{
    const idx=[]; for(let i=0;i<n;i++) if(kind[i]===k) idx.push(i);
    idx.sort((p,q)=>coord[p]-coord[q]);
    let g=[];
    const flush=()=>{
      if(!g.length) return;
      let num=0, den=0;
      for(const i of g){
        const a=P[i], b=P[(i+1)%n];
        const len=Math.hypot(b[0]-a[0], b[1]-a[1])||1;
        num+=coord[i]*len; den+=len;
      }
      const v=num/den;
      for(const i of g) coord[i]=v;
      g=[];
    };
    for(const i of idx){
      if(g.length && Math.abs(coord[i]-coord[g[g.length-1]])>eps) flush();
      g.push(i);
    }
    flush();
  };
  cluster('h'); cluster('v');
  const out=[];
  for(let i=0;i<n;i++){
    const prev=(i-1+n)%n, a=P[i];
    if(kind[prev]==='v' && kind[i]==='h') out.push([coord[prev], coord[i]]);
    else if(kind[prev]==='h' && kind[i]==='v') out.push([coord[i], coord[prev]]);
    else if(kind[prev]==='h' && kind[i]==='f') out.push([a[0], coord[prev]]);
    else if(kind[prev]==='v' && kind[i]==='f') out.push([coord[prev], a[1]]);
    else if(kind[prev]==='f' && kind[i]==='h') out.push([a[0], coord[i]]);
    else if(kind[prev]==='f' && kind[i]==='v') out.push([coord[i], a[1]]);
    else out.push(a.slice());
  }
  return out;
}

export {BP_DIRS, bpTrace, bpRDP, bpOrtho};
