/* ---- blueprint: rectify ----
   Traced faces land a pixel or two apart, never exactly. floorEdgeDepths tolerates that
   and the plan DRAWS correctly straight from measurement — but snapFloorPlace aims at
   exactly max(wallA,wallB), so a room a few millimetres out jumps the first time anyone
   drags it. Pull every near-axis edge onto a shared line, then set facing pairs to exactly
   one wall apart, and the import arrives already snapped.

   The clustering tolerance has to stay well under half a partition, or the two faces of
   one wall collapse onto a single line and the rooms either side fuse. */
function bpRectify(regions, tPart){
  const tol=Math.min(tPart*0.4, 40);
  const recs=[], lines={x:[], y:[]};
  for(const r of regions){
    const P=r.polyPx, n=P.length, kind=[], coord=[];
    for(let i=0;i<n;i++){
      const a=P[i], b=P[(i+1)%n];
      const dx=Math.abs(b[0]-a[0]), dy=Math.abs(b[1]-a[1]), len=Math.hypot(dx,dy);
      if(dy<=tol && dx>dy){ kind[i]='h'; coord[i]=(a[1]+b[1])/2; lines.y.push({v:coord[i],len,r:recs.length,i}); }
      else if(dx<=tol && dy>dx){ kind[i]='v'; coord[i]=(a[0]+b[0])/2; lines.x.push({v:coord[i],len,r:recs.length,i}); }
      else { kind[i]='f'; coord[i]=0; }
    }
    recs.push({r,P,kind,coord});
  }
  for(const ax of ['x','y']){
    const arr=lines[ax].sort((p,q)=>p.v-q.v), groups=[];
    let g=null;
    for(const e of arr){
      if(g && e.v-g.last<=tol){ g.items.push(e); g.last=e.v; }
      else { g={items:[e], last:e.v}; groups.push(g); }
    }
    for(const gr of groups){
      let num=0, den=0;
      for(const e of gr.items){ num+=e.v*e.len; den+=e.len; }
      gr.c=den?num/den:gr.items[0].v;
    }
    for(let i=0;i<groups.length-1;i++){
      if(groups[i].paired||groups[i+1].paired) continue;
      const d=groups[i+1].c-groups[i].c;
      if(d>=tPart*0.5 && d<=tPart*1.6){
        const mid=(groups[i].c+groups[i+1].c)/2;
        groups[i].c=mid-tPart/2; groups[i+1].c=mid+tPart/2;
        groups[i].paired=groups[i+1].paired=true;
      }
    }
    for(const gr of groups) for(const e of gr.items) recs[e.r].coord[e.i]=gr.c;
  }
  for(const rec of recs){
    const {P,kind,coord}=rec, n=P.length, out=[];
    for(let i=0;i<n;i++){
      const prev=(i-1+n)%n, a=P[i];
      if(kind[prev]==='v'&&kind[i]==='h') out.push([coord[prev],coord[i]]);
      else if(kind[prev]==='h'&&kind[i]==='v') out.push([coord[i],coord[prev]]);
      else if(kind[prev]==='h') out.push([a[0],coord[prev]]);
      else if(kind[prev]==='v') out.push([coord[prev],a[1]]);
      else if(kind[i]==='h') out.push([a[0],coord[i]]);
      else if(kind[i]==='v') out.push([coord[i],a[1]]);
      else out.push(a.slice());
    }
    rec.r.polyPx=out;
  }
  return regions;
}

export {bpRectify};
