import {uid} from '../core/state.js';
import {bpLabelBlocks} from './labels.js';
import {bpRunOcr} from './ocr.js';
import {bpClassifyCuts} from './openings.js';
import {bpGray, bpLabel8, bpLeak, bpMaskOf, bpRuns, bpThresholds, bpValley} from './pixels.js';
import {bpDeriveRegions} from './regions.js';
import {bpRunSeq} from './state.js';
import {bpBands, bpCloseGaps, bpProposeArcCuts, bpWallLines} from './walls.js';

/* ---- blueprint: detection ----
   Component labelling comes FIRST, on the raw ink, before any thickness work. Text is
   removed by topology, not by stroke weight: bold label glyphs carry the same 9-13px
   strokes as an interior partition, so a thickness filter leaves the letters of BEDROOM
   standing as a phantom wall band. Taking the largest connected component deletes every
   glyph by construction and leaves the envelope watertight. */
function bpAnalyse(work, opts){
  const runId=opts&&opts.runId, step=(opts&&opts.onStep)||(()=>{});
  return new Promise(res=>{
    const go=async ()=>{
      if(runId!==bpRunSeq) return;
      step('walls');
      const {gray,w,h}=bpGray(work);
      let g=gray;
      const th0=bpThresholds(g);
      /* a plan printed white-on-black is still a plan */
      if(th0.bg<128){ const inv=new Uint8Array(g.length); for(let i=0;i<g.length;i++) inv[i]=255-g[i]; g=inv; }
      const th=bpThresholds(g);
      const inkLo=bpMaskOf(g,th.lo), inkHi=bpMaskOf(g,th.hi);

      const {lab,comps}=bpLabel8(inkLo,w,h);
      const byArea=comps.slice().sort((a,b)=>b.area-a.area);
      let pick=null;
      for(const c of byArea.slice(0,4)){
        const fill=c.area/(c.bw*c.bh);
        if(c.bw*c.bh < w*h*0.25) continue;
        if(fill>0.6) continue;
        pick=c; break;
      }
      if(!pick) pick=byArea[0];
      const structure=new Uint8Array(w*h);
      if(pick) for(let i=0;i<lab.length;i++) if(lab[i]===pick.id) structure[i]=1;
      const leak=bpLeak(structure,w,h);

      const strict=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++) strict[i]=structure[i]&&inkHi[i]?1:0;
      const {hR,vR}=bpRuns(strict,w,h);
      const tHist=new Float64Array(256);
      for(let i=0;i<w*h;i++) if(strict[i]) tHist[Math.min(255,Math.min(hR[i],vR[i]))]++;
      const tSplit=bpValley(tHist);
      const wall=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++) wall[i]=strict[i] && Math.min(hR[i],vR[i])>=tSplit ? 1 : 0;

      step('rooms');
      const bands=bpBands(wall,w,h,hR,vR,tSplit*3);
      /* Thickness is measured ONE SAMPLE PER BAND, never per pixel. A pixel-weighted
         median reads the exterior shell, because a thick wall running the height of the
         plan simply has more pixels in it than every partition put together — which puts
         the door-width thresholds out by a factor of three. Partitions are the many, the
         shell is the few, so a low percentile finds the partition and a high one the shell. */
      const bts=bands.map(b=>b.t).sort((a,b)=>a-b);
      const pctile=p=>bts.length?bts[Math.floor((bts.length-1)*p)]:4;
      const tPart=Math.max(2, pctile(0.40));
      /* p70, not higher: the top of the distribution is junction blocks, where both runs
         are long and the thickness reading is meaningless */
      const tExt=Math.max(tPart, pctile(0.70));
      /* a 2px "line" is a fixture outline, not a wall */
      const bandsOk=bands.filter(b=>b.t>=Math.max(3,tSplit));
      /* A band this compact — its own run barely longer than its own thickness, or
         shorter — is never a wall drawn as a line; it's a blob of ink (a stove's burner
         grid, its connecting frame lines) that happened to read thick-and-long enough to
         pass the band test above. A real wall clears this by a wide margin even at its
         own stubbiest pilaster or at a room corner: checked against the real photo, the
         tightest genuine wall/corner band here still scores 1.5, the stove's own burner
         block scores 0.79. 1.2 leaves daylight on both sides. Cut from `wall` itself
         (not just left out of the line list below), so the room boundary stops denting
         around the blob — and safely, because the real wall behind it is always a
         SEPARATE band with its own reading, never this one, so nothing here can open a
         gap in it. */
      const wallish=bandsOk.filter(b=>(b.a1-b.a0)>=b.t*1.2);
      for(const b of bandsOk){
        if(wallish.indexOf(b)>=0) continue;
        const half=Math.max(1,Math.round(b.t/2));
        if(b.axis==='h'){
          for(let x=Math.max(0,b.a0); x<=Math.min(w-1,b.a1); x++)
            for(let y=Math.max(0,Math.round(b.c-half)); y<=Math.min(h-1,Math.round(b.c+half)); y++)
              wall[y*w+x]=0;
        } else {
          for(let y=Math.max(0,b.a0); y<=Math.min(h-1,b.a1); y++)
            for(let x=Math.max(0,Math.round(b.c-half)); x<=Math.min(w-1,Math.round(b.c+half)); x++)
              wall[y*w+x]=0;
        }
      }
      const lines=bpWallLines(wallish,wall,w,h,Math.max(4,Math.round(tPart*0.6)), tPart*20);
      /* the barrier is the walls plus the mullions that seal the shell, NOT the raw ink:
         built from raw ink it would dent every room around every counter and door arc */
      /* The shell has to be sealed by the STRUCTURE, not by the thick-wall mask. A long
         window is drawn as two hairlines with nothing solid behind them, so on this plan
         the thick mask has an 850px hole across the top and every room drains out through
         it. The structure component is watertight by construction, so the skin of it that
         faces outwards is the seal, whatever weight it was drawn at. */
      const outS=bpLeak(structure,w,h);
      const skin=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++){
        if(!structure[i]) continue;
        const x=i%w, y=(i/w)|0;
        if((x>0&&outS.outside[i-1])||(x<w-1&&outS.outside[i+1])||
           (y>0&&outS.outside[i-w])||(y<h-1&&outS.outside[i+w])) skin[i]=1;
      }
      /* A thin enclosed strip between two hairlines is the inside of a window, not a
         room. Filling those keeps the room's edge on the inner face of the glass. */
      const encl=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++) encl[i]=(!structure[i] && !outS.outside[i])?1:0;
      const el=bpLabel8(encl,w,h);
      const cavity=new Uint8Array(w*h);
      const cavStrips=[];
      let frontier=[];
      for(const c of el.comps){
        /* generous, because nothing a person walks into is a foot wide: a strip this
           narrow is glass, hatching or the inside of a stud wall */
        const minDim=Math.min(c.bw,c.bh), maxDim=Math.max(c.bw,c.bh);
        if(minDim >= tPart*4) continue;
        /* ...but only when it actually reads as a STRIP. A window's gap runs the length
           of the sash; a fixture's enclosed ink (a toilet bowl, the gap between two
           burners, a nested sink outline) is squarish, not a strip, and swallowing it
           punches a fixture-shaped hole clean through the room. Measured on the real
           blueprint: every window scored at least 7:1, every fixture at most 3.4:1. */
        if(maxDim < minDim*4) continue;
        cavStrips.push(c);
        for(let y=c.y0;y<=c.y1;y++) for(let x=c.x0;x<=c.x1;x++){
          const q=y*w+x; if(el.lab[q]===c.id){ cavity[q]=1; frontier.push(q); }
        }
      }
      /* Absorb the hairlines bounding each cavity. A window is drawn as two or three
         parallel lines, and leaving the lines themselves out of the barrier leaves a
         3px hole per line for the room to escape through — so the room swallows the
         glazing and comes out a foot too deep. Only thin strokes are absorbed; a thick
         wall is already barrier and must not be eaten into. */
      for(let step=0; step<4 && frontier.length; step++){
        const next=[];
        for(const p of frontier){
          const px=p%w, py=(p/w)|0;
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
            if(!dx&&!dy) continue;
            const nx=px+dx, ny=py+dy;
            if(nx<0||ny<0||nx>=w||ny>=h) continue;
            const q=ny*w+nx;
            if(structure[q] && !wall[q] && !cavity[q]){ cavity[q]=1; next.push(q); }
          }
        }
        frontier=next;
      }
      /* Walls, the outward skin and the window cavities — and deliberately NOT door arcs,
         casework or fixtures, which are structure too but must not dent a room. */
      const barrier=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++) barrier[i]=(wall[i]||skin[i]||cavity[i])?1:0;
      const gapCuts=bpCloseGaps(barrier,w,h,lines,tPart);
      const arcCandidates=bpProposeArcCuts(lines,tPart);
      let cuts=bpClassifyCuts([...gapCuts, ...arcCandidates], structure, wall, w, h, tPart);
      /* A proposed free-standing arc only earns the wall it's guessing at by actually
         reading as a swing arc above — the same test a real gap has to pass to be called
         a door rather than a doorway. Anything weaker (a plain gap, or a fill ratio high
         enough to read as a window) was a coincidental alignment between two unrelated
         dead ends, not a closet, and is dropped rather than left half-classified. */
      cuts=cuts.filter(c=>!c.freeArc || c.kind==='door');
      for(const c of cuts){
        if(!c.freeArc) continue;
        const half=Math.max(1, Math.round(c.t/2));
        for(let a=Math.round(c.a0); a<=Math.round(c.a1); a++)
          for(let d=-half; d<=half; d++){
            const x=Math.round(c.axis==='h'?a:c.c+d), y=Math.round(c.axis==='h'?c.c+d:a);
            if(x>=0&&y>=0&&x<w&&y<h) barrier[y*w+x]=1;
          }
      }
      /* A window drawn as hairlines too light to clear the wall's own ink threshold never
         becomes part of `wall`, so no band ever forms for bpWallLines/bpCloseGaps to find
         a gap in — the strip above already reads it fine, off the low threshold, so
         anything that qualified there and isn't already a cut is turned into one directly.
         A three-line sash encloses two strips, not one, so co-located strips (same axis,
         overlapping run) are merged into a single opening first. */
      for(const axis of ['h','v']){
        let strips=cavStrips
          .filter(c=> (c.bw>=c.bh) === (axis==='h'))
          .map(c=>({a0:axis==='h'?c.x0:c.y0, a1:axis==='h'?c.x1:c.y1,
                     s0:axis==='h'?c.y0:c.x0, s1:axis==='h'?c.y1:c.x1}))
          .sort((p,q)=>p.a0-q.a0);
        let merged=true;
        while(merged){
          merged=false;
          for(let i=0;i<strips.length-1 && !merged;i++){
            for(let j=i+1;j<strips.length && !merged;j++){
              /* Two gaps of the same sash sit almost on top of each other — close along
                 the wall's own thickness, not just anywhere their long runs overlap. Two
                 unrelated strips (this window, some fixture three rooms down) can share
                 an x-range by pure coincidence, so require both. */
              const ov=Math.min(strips[i].a1,strips[j].a1)-Math.max(strips[i].a0,strips[j].a0);
              const shorter=Math.min(strips[i].a1-strips[i].a0, strips[j].a1-strips[j].a0);
              if(ov < shorter*0.5) continue;
              const sgap=Math.max(strips[i].s0,strips[j].s0)-Math.min(strips[i].s1,strips[j].s1);
              if(sgap > tExt) continue;
              strips[i]={a0:Math.min(strips[i].a0,strips[j].a0), a1:Math.max(strips[i].a1,strips[j].a1),
                         s0:Math.min(strips[i].s0,strips[j].s0), s1:Math.max(strips[i].s1,strips[j].s1)};
              strips.splice(j,1);
              merged=true;
            }
          }
        }
        for(const s of strips){
          /* A real window spans most of a wall; a stray thin sliver near a fixture
             (kept round for S5's fixture-boundary fix, harmless as a barrier line) is
             nowhere near that long and must not be reported as an opening. */
          if(s.a1-s.a0 < tPart*10) continue;
          const c=(s.s0+s.s1)/2, t=Math.max(1,s.s1-s.s0);
          const covered=cuts.some(k=> k.axis===axis && Math.abs(k.c-c) < t*2 &&
            Math.min(k.a1,s.a1)-Math.max(k.a0,s.a0) > (s.a1-s.a0)*0.4);
          if(covered) continue;
          cuts.push({axis, c, t, a0:s.a0, a1:s.a1, widthPx:s.a1-s.a0+1, wide:false, kind:'window', fillRatio:1});
        }
      }

      const {blocks, gh}=bpLabelBlocks(comps, pick, tPart);
      const derived=bpDeriveRegions(barrier, w, h, tPart, blocks);
      const regions=derived.regions;
      const out={frac:derived.leak};
      /* Segments, not {wall index, offset}: every edge index is invalidated by winding
         normalisation, short-edge merging and collinear dropping, so hand over geometry
         and let the app layer re-attach to whatever edge survives. */
      const openings=[];
      for(const cut of cuts){
        if(cut.kind!=='window' && cut.kind!=='door' && cut.kind!=='doorway') continue;
        const end=(a)=> cut.axis==='h' ? [a, cut.c] : [cut.c, a];
        openings.push({id:uid(), aPx:end(cut.a0), bPx:end(cut.a1),
          kind: cut.kind==='window' ? 'window' : 'door',
          dtype: cut.kind==='door' ? (cut.bifold?'bifold':'hinge') : 'open',
          hingePx: cut.hingePx||null, arcDir: cut.arcDir||null, widthPx: cut.widthPx, tPx: cut.t});
      }

      step('text');
      const scale=await bpRunOcr(regions, blocks, gh, runId);
      if(runId!==bpRunSeq) return;
      res({
        scale, regions, openings,
        cuts, lines, tPart, tExt, labels:blocks, gh,
        barrier, w, h,
        /* raw intermediate masks, one byte per pixel each, kept only on bpState.proposal
           (never S) so #bpdebug can render exactly what the pipeline saw at each stage
           instead of a symptom being guessed at from the final polygons */
        masks:{structure, wall, skin, cavity},
        debug:{w, h, thresholds:th, compCount:comps.length, structureArea:pick?pick.area:0,
               structureFill:pick?pick.area/(pick.bw*pick.bh):0, leakFraction:leak.frac,
               tSplit, tPart, tExt, bandCount:bands.length, lineCount:lines.length,
               cutCount:cuts.length, regionCount:regions.length, barrierLeak:out.frac,
               labelCount:blocks.length}
      });
    };
    /* Double rAF so "Finding the rooms" has definitively painted before the main thread
       is tied up — but rAF never fires in a background tab, and a wizard that hangs for
       ever because someone switched tabs is worse than one that starts a frame early.
       Whichever lands first wins; the other is a no-op. */
    let started=false;
    const kick=()=>{ if(started) return; started=true; go(); };
    requestAnimationFrame(()=>requestAnimationFrame(kick));
    setTimeout(kick, 150);
  });
}

export {bpAnalyse};
