/* ---- blueprint: pixels ----
   Nothing in here may be a function of the image's pixel count. Every parameter is a
   multiple of a quantity measured off the drawing itself — the wall stroke weight, the
   glyph size — so the same plan gives the same answer at any zoom. Scaling constants
   off image size is what made the previous attempt find different doors in the same
   photo at two resolutions. */
function bpGray(cv){
  const w=cv.width, h=cv.height;
  const d=cv.getContext('2d').getImageData(0,0,w,h).data;
  const g=new Uint8Array(w*h);
  for(let i=0,p=0;i<g.length;i++,p+=4) g[i]=(d[p]*0.299+d[p+1]*0.587+d[p+2]*0.114)|0;
  return {gray:g,w,h};
}
function bpHist(g){ const H=new Float64Array(256); for(let i=0;i<g.length;i++) H[g[i]]++; return H; }
function bpOtsu(g){
  const H=bpHist(g), N=g.length;
  let sum=0; for(let t=0;t<256;t++) sum+=t*H[t];
  let sumB=0, wB=0, best=-1, thr=128;
  for(let t=0;t<256;t++){
    wB+=H[t]; if(!wB) continue;
    const wF=N-wB; if(wF<=0) break;
    sumB+=t*H[t];
    const mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF);
    if(v>best){ best=v; thr=t; }
  }
  return thr;
}
/* Two thresholds, because one will not do. Otsu separates solid black from paper, but
   downscaling turns a 1px window mullion into mid-grey — and those faint lines are
   structural: they are what seals the outer wall. So the strict mask feeds the stroke
   thickness histogram, where haloes would inflate the reading, and the lenient one
   feeds component labelling and the barrier, where the mullions have to survive. */
function bpThresholds(g){
  const H=bpHist(g), hi=bpOtsu(g);
  let bg=hi; for(let v=hi;v<256;v++) if(H[v]>H[bg]) bg=v;
  return {hi, lo:Math.round(bg-0.35*(bg-hi)), bg};
}
const bpMaskOf=(g,thr)=>{ const m=new Uint8Array(g.length); for(let i=0;i<g.length;i++) m[i]=g[i]<thr?1:0; return m; };

/* 8-connected, because that is what keeps a hairline and a door arc attached to the
   wall they spring from. Iterative: a recursive fill blows the stack on a real plan. */
function bpLabel8(mask,w,h){
  const lab=new Int32Array(w*h), st=new Int32Array(w*h), comps=[];
  let n=0;
  for(let s=0;s<mask.length;s++){
    if(!mask[s]||lab[s]) continue;
    n++; let sp=0; st[sp++]=s; lab[s]=n;
    let area=0, x0=w, y0=h, x1=0, y1=0;
    while(sp){
      const p=st[--sp], px=p%w, py=(p/w)|0;
      area++;
      if(px<x0)x0=px; if(px>x1)x1=px; if(py<y0)y0=py; if(py>y1)y1=py;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy) continue;
        const nx=px+dx, ny=py+dy;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        const q=ny*w+nx;
        if(mask[q]&&!lab[q]){ lab[q]=n; st[sp++]=q; }
      }
    }
    comps.push({id:n, area, x0, y0, x1, y1, bw:x1-x0+1, bh:y1-y0+1});
  }
  return {lab, comps, n};
}
/* The crop step's own default box, guessed from where the ink actually is rather than a
   blind inset off the photo's own edges — a fixed percentage trims a fixed amount no
   matter how tightly the plan fills the frame, and on a plan drawn close to the edge it
   was cropping real walls off before the person ever got a chance to see them. Same
   largest-connected-component idea `bpAnalyse` uses for `structure`: the wall/text network
   is by far the biggest connected mass of dark pixels on a clean photo of a plan, so its
   bbox is a far more reliable "here's the drawing" guess than "here's every dark pixel,"
   which a shadow or a scanner's own border would also answer to. Padded a little past that
   bbox so an edge wall's outer stroke isn't sitting exactly on the crop line. Falls back to
   null (the caller's old fixed-inset guess) when nothing looks big enough to trust — a
   near-blank or very noisy photo shouldn't get auto-cropped to a speck. */
function bpAutoCropRect(full){
  const w=full.width, h=full.height;
  const {gray}=bpGray(full);
  const mask=bpMaskOf(gray, bpOtsu(gray));
  const {comps}=bpLabel8(mask, w, h);
  if(!comps.length) return null;
  let big=comps[0];
  for(const c of comps) if(c.area>big.area) big=c;
  if(big.area < w*h*0.01) return null;
  const pad=Math.round(Math.min(w,h)*0.02);
  const x0=Math.max(0,big.x0-pad), y0=Math.max(0,big.y0-pad);
  const x1=Math.min(w,big.x1+pad), y1=Math.min(h,big.y1+pad);
  return {x:x0, y:y0, w:x1-x0, h:y1-y0};
}
/* What fraction of the image the outside reaches. The cheapest, most scale-free check
   in the pipeline: a sealed plan sits near a fifth, a leaking one swallows everything
   and a decorative border that won the largest-component contest swallows almost none. */
function bpLeak(barrier,w,h){
  const seen=new Uint8Array(w*h), st=new Int32Array(w*h);
  let sp=0, a=0;
  const push=q=>{ if(!barrier[q]&&!seen[q]){ seen[q]=1; st[sp++]=q; } };
  for(let x=0;x<w;x++){ push(x); push((h-1)*w+x); }
  for(let y=0;y<h;y++){ push(y*w); push(y*w+w-1); }
  while(sp){
    const p=st[--sp], px=p%w, py=(p/w)|0;
    a++;
    if(px>0) push(p-1);
    if(px<w-1) push(p+1);
    if(py>0) push(p-w);
    if(py<h-1) push(p+w);
  }
  return {frac:a/(w*h), outside:seen};
}
function bpRuns(mask,w,h){
  const hR=new Uint16Array(w*h), vR=new Uint16Array(w*h);
  for(let y=0;y<h;y++){
    let x=0;
    while(x<w){
      if(mask[y*w+x]){ const s=x; while(x<w&&mask[y*w+x]) x++; for(let i=s;i<x;i++) hR[y*w+i]=x-s; }
      else x++;
    }
  }
  for(let x=0;x<w;x++){
    let y=0;
    while(y<h){
      if(mask[y*w+x]){ const s=y; while(y<h&&mask[y*w+x]) y++; for(let j=s;j<y;j++) vR[j*w+x]=y-s; }
      else y++;
    }
  }
  return {hR,vR};
}
const bpMedian=a=>{ if(!a.length) return 0; const b=a.slice().sort((p,q)=>p-q); return b[b.length>>1]; };
/* Otsu is the wrong tool for the thickness histogram and picks a threshold two to three
   times too high, which classifies every interior partition as "not a wall". Use
   prominence instead, and take the SMALLEST valley that is deep enough: over-including
   arcs and casework is undone by the stroke classifier, but deleting a partition merges
   two rooms into one and nothing downstream can recover that. */
function bpValley(hist){
  const h=new Float64Array(hist.length);
  for(let pass=0;pass<2;pass++){
    const src=pass?h.slice():hist;
    for(let i=0;i<h.length;i++){
      const a=src[i-1]||0, b=src[i]||0, c=src[i+1]||0;
      h[i]=(a+2*b+c)/4;
    }
  }
  let total=0; for(let i=0;i<h.length;i++) total+=h[i];
  let acc=0, hiEnd=h.length-1;
  for(let i=0;i<h.length;i++){ acc+=h[i]; if(acc>=total*0.95){ hiEnd=i; break; } }
  let peak=0; for(let i=2;i<hiEnd;i++) if(h[i]>h[peak]) peak=i;
  let p1=2;
  for(let t=2;t<hiEnd;t++) if(h[t]>=h[t-1] && h[t]>h[t+1] && h[t]>=0.05*h[peak]){ p1=t; break; }
  const maxOver=(a,b)=>{ let m=0; for(let i=a;i<=b;i++) if(h[i]>m) m=h[i]; return m; };
  let best=null;
  for(let t=p1+1;t<hiEnd;t++){
    const L=maxOver(p1,t), R=maxOver(t,hiEnd);
    const floor=Math.min(L,R);
    if(floor<=0) continue;
    const depth=1-h[t]/floor;
    if(!best||depth>best.depth) best={t,depth};
  }
  if(!best) return 3;
  let pick=best.t;
  for(let t=p1+1;t<best.t;t++){
    const L=maxOver(p1,t), R=maxOver(t,hiEnd), floor=Math.min(L,R);
    if(floor>0 && 1-h[t]/floor >= 0.75*best.depth){ pick=t; break; }
  }
  return Math.max(3, pick);
}

export {bpGray, bpHist, bpOtsu, bpThresholds, bpMaskOf, bpLabel8, bpAutoCropRect, bpLeak, bpRuns, bpMedian, bpValley};
