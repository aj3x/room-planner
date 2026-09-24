import {uid} from '../core/state.js';
import {bpOrtho, bpRDP, bpTrace} from './outlines.js';
import {bpLabel8, bpLeak} from './pixels.js';
import {bpRectify} from './rectify.js';

/* ---- blueprint: regions ---- */
function bpIdentify(regions){
  for(const r of regions) r.id=uid();
}
/* A component that fails the width/area floor below isn't automatically hatching or a
   wall cavity with nothing on the far side of it. On the real photo, a plumbing chase
   behind a tub and the sliver a doorway leaves beside it both trace as their own
   too-narrow components sitting flush against a real room and nothing else — dropping
   them silently leaves a hole in that room's own floor exactly where a person would
   expect it to keep going to the real wall. Absorbed only when unambiguous: each of the
   sliver's two long sides leads to at most one thing found by piercing straight out
   through the barrier, and at most one of those two things is an accepted room. Anything
   murkier — two different rooms facing each other across it, as at a real doorway wide
   enough to fail the floor on its own — is left exactly as it was, not guessed at, and
   the exterior wall itself is never a target since "outside" doesn't carry a label. */
function bpAbsorbSlivers(bar, w, h, tPart, rl, accepted){
  const reach=Math.ceil(tPart*2.5), steps=5;
  const sideLabel=(x0,y0,x1,y1,dx,dy)=>{
    const tally=new Map();
    let inconclusive=false;
    for(let i=0;i<steps;i++){
      const t=steps===1?0.5:i/(steps-1);
      const px=Math.round(x0+(x1-x0)*t), py=Math.round(y0+(y1-y0)*t);
      let found=null;
      for(let s=1;s<=reach;s++){
        const x=px+dx*s, y=py+dy*s;
        if(x<0||y<0||x>=w||y>=h){ inconclusive=true; break; }
        if(!bar[y*w+x]){ found=y*w+x; break; }
      }
      if(found==null) continue;
      const lab=rl.lab[found];
      if(!lab) inconclusive=true;
      else tally.set(lab,(tally.get(lab)||0)+1);
    }
    let best=null, bestN=0;
    tally.forEach((n,l)=>{ if(n>bestN){ bestN=n; best=l; } });
    return {label:best, inconclusive};
  };
  /* Opens the WHOLE shared border, not a few sample points — a comb of narrow slits
     leaves barrier remnants between them, and a boundary trace over that teeth-like
     shape doesn't simplify back down to a simple polygon (bpOrtho starts failing
     polySimple on it). One real doorway's worth of opening is what a merge should look
     like, not several. */
  const pierce=(x0,y0,x1,y1,dx,dy)=>{
    const n=Math.max(Math.abs(x1-x0), Math.abs(y1-y0));
    for(let i=0;i<=n;i++){
      const t=n===0?0:i/n;
      const px=Math.round(x0+(x1-x0)*t), py=Math.round(y0+(y1-y0)*t);
      for(let s=1;s<=reach;s++){
        const x=px+dx*s, y=py+dy*s;
        if(x<0||y<0||x>=w||y>=h) break;
        const idx=y*w+x;
        if(!bar[idx]) break;
        bar[idx]=0;
      }
    }
  };
  let dissolved=false;
  const touched=[];   // padded bboxes of merged slivers, to scope the spur cleanup below
  for(const c of rl.comps){
    if(accepted.has(c.id)) continue;
    if(c.area<tPart*tPart) continue;   // pure noise, not a real gap
    const vertical=c.bw<=c.bh;
    const a = vertical ? sideLabel(c.x0,c.y0,c.x0,c.y1,-1,0) : sideLabel(c.x0,c.y0,c.x1,c.y0,0,-1);
    const b = vertical ? sideLabel(c.x1,c.y0,c.x1,c.y1,1,0)  : sideLabel(c.x0,c.y1,c.x1,c.y1,0,1);
    const targets=[a,b].filter(s=>s.label!=null && accepted.has(s.label));
    const distinct=new Set(targets.map(s=>s.label));
    if(distinct.size!==1) continue;
    const targetLabel=[...distinct][0];
    if(a.label===targetLabel){
      if(vertical) pierce(c.x0,c.y0,c.x0,c.y1,-1,0);
      else pierce(c.x0,c.y0,c.x1,c.y0,0,-1);
    }
    if(b.label===targetLabel){
      if(vertical) pierce(c.x1,c.y0,c.x1,c.y1,1,0);
      else pierce(c.x0,c.y1,c.x1,c.y1,0,1);
    }
    dissolved=true;
    touched.push([Math.max(0,c.x0-reach), Math.max(0,c.y0-reach), Math.min(w-1,c.x1+reach), Math.min(h-1,c.y1+reach)]);
  }
  /* A merge can expose a fixture detail that was already touching the wall — the tub's
     own faucet icon, on the real photo — as a thin barrier peninsula poking into the
     floor it was just joined to. It never mattered while the two sides traced apart;
     joined into one longer boundary, the trace has to detour around it, and that detour
     doesn't always simplify back down to a simple polygon. Shaving off any barrier pixel
     that's mostly surrounded by open floor is the same "casework must not dent a room"
     rule bpAnalyse's own barrier comment already states, applied after the fact — and
     only inside a merged sliver's own small neighbourhood, never to a wall nothing
     merged into. */
  for(const [bx0,by0,bx1,by1] of touched){
    for(let pass=0; pass<3; pass++){
      const spurs=[];
      for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){
        const i=y*w+x;
        if(!bar[i]) continue;
        let openN=0;
        if(x>0 && !bar[i-1]) openN++;
        if(x<w-1 && !bar[i+1]) openN++;
        if(y>0 && !bar[i-w]) openN++;
        if(y<h-1 && !bar[i+w]) openN++;
        if(openN>=3) spurs.push(i);
      }
      if(!spurs.length) break;
      for(const i of spurs) bar[i]=0;
    }
  }
  return dissolved;
}
function bpDeriveRegions(barrier, w, h, tPart, blocks){
  const bar = barrier;
  /* Matches the width floor below, not a stricter one of its own — a real closet can be
     exactly as narrow as this pipeline already allows a room to be, just short, and an
     area threshold a partition-width wider than that (tPart*5) rejects one for its
     length rather than its width. Confirmed against the real photo: a linen closet and
     the entry nook beside it both measure a hair over 3*tPart wide and neither reaches
     5*tPart squared, so a stricter area floor drops both, not just hatching. */
  const minArea=Math.pow(tPart*3,2), minDim=tPart*3;
  const deriveInner=()=>{
    const out=bpLeak(bar,w,h);
    const inner=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) inner[i]=(!bar[i] && !out.outside[i])?1:0;
    return {out, rl:bpLabel8(inner,w,h)};
  };
  let {out, rl}=deriveInner();
  const accepted=new Set(rl.comps.filter(c=>c.area>=minArea && Math.min(c.bw,c.bh)>=minDim).map(c=>c.id));
  if(bpAbsorbSlivers(bar, w, h, tPart, rl, accepted)) ({out, rl}=deriveInner());
  const regions=[];
  for(const c of rl.comps){
    /* a room is not eleven inches wide — that is a wall cavity or a hatching gap */
    if(c.area<minArea || Math.min(c.bw,c.bh)<minDim) continue;
    let start=-1;
    for(let y=c.y0;y<=c.y1 && start<0;y++)
      for(let x=c.x0;x<=c.x1;x++) if(rl.lab[y*w+x]===c.id){ start=y*w+x; break; }
    if(start<0) continue;
    const chain=bpTrace(rl.lab,c.id,w,h,start, 8*(c.bw+c.bh)+64);
    if(chain.length<8) continue;
    const eps=Math.max(1.5, tPart*0.35);
    const poly=bpOrtho(bpRDP(chain,eps), eps);
    if(poly.length<3) continue;
    regions.push({id:null, cid:c.id, name:'', polyPx:poly, areaPx:c.area,
                  bboxPx:[c.x0,c.y0,c.x1,c.y1], labels:[]});
  }
  for(let i=0;i<(blocks||[]).length;i++){
    const b=blocks[i], x=Math.round(b.cx), y=Math.round(b.cy);
    if(x<0||y<0||x>=w||y>=h) continue;
    const id=rl.lab[y*w+x]; if(!id) continue;
    const r=regions.find(q=>q.cid===id); if(r) r.labels.push(i);
  }
  bpIdentify(regions);
  bpRectify(regions, tPart);
  regions.sort((a,b)=>b.areaPx-a.areaPx);
  return {regions, leak:out.frac};
}

export {bpIdentify, bpAbsorbSlivers, bpDeriveRegions};
