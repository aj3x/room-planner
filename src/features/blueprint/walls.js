import {bpLabel8, bpMedian} from './pixels.js';

/* ---- blueprint: walls ----
   A horizontal band is where the horizontal run is the long one; a vertical band is the
   other way round. Pixels where the two are comparable are junctions and belong to BOTH,
   so a band runs through its corners instead of being chopped at them. Thickness is then
   measured only where one run clearly dominates, which is what stops a corner block
   reading as a two-foot-thick wall. */
function bpBands(wall,w,h,hR,vR,minLen){
  const out=[];
  for(const axis of ['h','v']){
    const m=new Uint8Array(w*h);
    for(let i=0;i<wall.length;i++){
      if(!wall[i]) continue;
      m[i] = axis==='h' ? (hR[i]>=vR[i]*0.8?1:0) : (vR[i]>=hR[i]*0.8?1:0);
    }
    const {lab,comps}=bpLabel8(m,w,h);
    for(const c of comps){
      const long = axis==='h' ? c.bw : c.bh;
      if(long < minLen) continue;
      const cs=[], ts=[];
      const a0 = axis==='h' ? c.x0 : c.y0, a1 = axis==='h' ? c.x1 : c.y1;
      for(let a=a0;a<=a1;a++){
        let lo=-1, hiV=-1;
        const cross = axis==='h' ? c.bh : c.bw;
        const b0 = axis==='h' ? c.y0 : c.x0;
        for(let b=b0;b<b0+cross;b++){
          const idx = axis==='h' ? b*w+a : a*w+b;
          if(lab[idx]===c.id){ if(lo<0) lo=b; hiV=b; }
        }
        if(lo<0) continue;
        cs.push((lo+hiV)/2); ts.push(hiV-lo+1);
      }
      if(!cs.length) continue;
      out.push({axis, c:bpMedian(cs), t:Math.max(1,bpMedian(ts)), a0, a1, area:c.area});
    }
  }
  return out;
}
/* Where a wall actually runs, read straight off the mask rather than off component
   topology. Bands say where the lines ARE and how thick; they are a poor witness to how
   far each one reaches, because a short stub meeting a tall wall has its pixels claimed
   by the tall one and the surviving fragment is too short to look like a wall at all.
   That loses the pilaster beside a door, and losing it loses the door. */
function bpLineProfile(wall,w,h,L,minSeg){
  const N = L.axis==='h' ? w : h;
  const half = Math.max(1, Math.round(L.t*0.45));
  const c = Math.round(L.c);
  const segs=[];
  let a=0, runStart=-1;
  const hit=q=>{
    for(let d=-half;d<=half;d++){
      const x = L.axis==='h' ? q : c+d, y = L.axis==='h' ? c+d : q;
      if(x<0||y<0||x>=w||y>=h) continue;
      if(wall[y*w+x]) return true;
    }
    return false;
  };
  for(a=0;a<=N;a++){
    const on = a<N && hit(a);
    if(on && runStart<0) runStart=a;
    else if(!on && runStart>=0){
      /* bridge a one or two pixel nick rather than calling it an opening */
      const last=segs[segs.length-1];
      if(last && runStart-last[1] <= 3) last[1]=a-1;
      else segs.push([runStart,a-1]);
      runStart=-1;
    }
  }
  return segs.filter(s=>s[1]-s[0]+1 >= minSeg);
}
/* Collinear bands are one wall with holes in it. Grouping them first is what turns "this
   component stops here" into "there is an opening here". */
function bpWallLines(bands,wall,w,h,minSeg,joinMax){
  const lines=[];
  for(const axis of ['h','v']){
    const bs=bands.filter(b=>b.axis===axis).sort((p,q)=>q.area-p.area);
    for(const b of bs){
      const hit=lines.find(L=>L.axis===axis && Math.abs(L.c-b.c) <= 0.75*Math.max(L.t,b.t));
      if(hit){ hit.t=Math.max(hit.t,b.t); hit.a0=Math.min(hit.a0,b.a0); hit.a1=Math.max(hit.a1,b.a1); }
      else lines.push({axis, c:b.c, t:b.t, a0:b.a0, a1:b.a1});
    }
  }
  for(const L of lines){
    const all=bpLineProfile(wall,w,h,L,minSeg);
    /* The profile sees every wall that crosses this row, not just this one. Two pieces of
       the SAME wall are never further apart than an opening can be — so split at anything
       wider and keep the stretch the bands actually found. Without this, a horizontal line
       picks up the exterior wall on the far side of the room and "closes the gap" straight
       through the middle of the living area. */
    const runs=[]; let cur=null;
    for(const s of all){
      if(cur && s[0]-cur[cur.length-1][1] <= joinMax) cur.push(s);
      else { cur=[s]; runs.push(cur); }
    }
    const core=runs.find(r=>r[r.length-1][1]>=L.a0 && r[0][0]<=L.a1) || [];
    L.segs=core;
    L.gaps=[];
    for(let i=0;i<core.length-1;i++) L.gaps.push([core[i][1]+1, core[i+1][0]-1]);
  }
  return lines.filter(L=>L.segs.length);
}
/* Where a wall's own drawn extent simply stops — no ink, no corner, nothing — with no
   perpendicular line crossing it there. Most dead ends are exactly that: the plan's own
   exterior, or a room the crop cut off, and mean nothing. But a real closet drawn with no
   jamb stub at all on its open side (common for a shallow reach-in) leaves the identical
   mark: a wall that just stops. `bpProposeArcCuts` is what tells that case apart from an
   ordinary dead end. */
function bpFreeEnds(lines, tPart){
  const free=[];
  for(const L of lines){
    if(!L.segs.length) continue;
    const ptFor=a => L.axis==='h' ? [a, L.c] : [L.c, a];
    for(const a of [L.segs[0][0], L.segs[L.segs.length-1][1]]){
      const [px,py]=ptFor(a);
      let junction=false;
      for(const o of lines){
        if(o===L || o.axis===L.axis || !o.segs.length) continue;
        const perp = o.axis==='h' ? py : px;
        if(Math.abs(o.c-perp) > tPart*1.5) continue;
        const along = o.axis==='h' ? px : py;
        if(along >= o.segs[0][0]-tPart*1.5 && along <= o.segs[o.segs.length-1][1]+tPart*1.5){ junction=true; break; }
      }
      if(!junction) free.push({axis:L.axis, c:L.c, t:L.t, px, py});
    }
  }
  return free;
}
/* Two wall dead ends, of the SAME axis (both the stubs of a would-be closet's header and
   sill, say), whose facing coordinate lines up and whose gap reads as door width, are
   exactly what a closet drawn with no jamb on its open side looks like from the wall data
   alone — the missing side is the OPPOSITE axis from the two stubs bracketing it. A door
   width closer than the real ones (`bpCloseGaps` allows up to 40 partitions, a whole
   wall's worth) on purpose: this is inventing a wall from silence, not reading one off the
   page, so it only reaches as far as an actual closet plausibly does. Proposed here, not
   stamped — `bpClassifyCuts` still has to find a real swing arc spanning it before this
   earns a wall; a coincidental alignment with nothing drawn between the two stubs must be
   left exactly as open as an ordinary wide doorway into a room. */
function bpProposeArcCuts(lines, tPart){
  const free=bpFreeEnds(lines, tPart);
  const out=[], gMin=Math.max(2, tPart*1.2), gMax=tPart*16;
  for(let i=0;i<free.length;i++) for(let j=i+1;j<free.length;j++){
    const A=free[i], B=free[j];
    if(A.axis!==B.axis) continue;
    const tol=Math.max(A.t,B.t)*1.2;
    if(A.axis==='h'){
      if(Math.abs(A.px-B.px) > tol) continue;
      const len=Math.abs(A.py-B.py);
      if(len<gMin || len>gMax) continue;
      out.push({axis:'v', c:(A.px+B.px)/2, t:Math.max(A.t,B.t),
                 a0:Math.min(A.py,B.py), a1:Math.max(A.py,B.py), widthPx:len, wide:false, freeArc:true});
    } else {
      if(Math.abs(A.py-B.py) > tol) continue;
      const len=Math.abs(A.px-B.px);
      if(len<gMin || len>gMax) continue;
      out.push({axis:'h', c:(A.py+B.py)/2, t:Math.max(A.t,B.t),
                 a0:Math.min(A.px,B.px), a1:Math.max(A.px,B.px), widthPx:len, wide:false, freeArc:true});
    }
  }
  return out;
}
/* Stamp a wall across every gap before filling, so a doorway stops leaking one room into
   the next. A gap wider than a room is not an opening, it is a wall that simply does not
   continue, so it is left alone. */
function bpCloseGaps(barrier,w,h,lines,tPart){
  const cuts=[], gMin=Math.max(2, tPart*1.2), gMax=tPart*40;
  for(const L of lines){
    for(const g of L.gaps){
      const len=g[1]-g[0]+1;
      if(len<gMin || len>gMax) continue;
      const half=Math.max(1, Math.round(L.t/2));
      const c=Math.round(L.c);
      for(let a=g[0];a<=g[1];a++)
        for(let d=-half;d<=half;d++){
          const x = L.axis==='h' ? a : c+d, y = L.axis==='h' ? c+d : a;
          if(x>=0&&y>=0&&x<w&&y<h) barrier[y*w+x]=1;
        }
      cuts.push({axis:L.axis, c:L.c, t:L.t, a0:g[0], a1:g[1], widthPx:len,
                 wide: len > tPart*13});
    }
  }
  return cuts;
}

export {bpBands, bpLineProfile, bpWallLines, bpFreeEnds, bpProposeArcCuts, bpCloseGaps};
