import {parseLen} from '../core/units.js';
import {bpRunSeq, bpState} from './state.js';

/* ---- blueprint: OCR ----
   Reads the name and the printed dimensions straight off the photo, pinned to one
   Tesseract.js version rather than feature-sniffed across three majors. Four layers of
   graceful degradation, each one leaving the regions exactly as bpAnalyse found them
   rather than a wrong answer: file:// never even tries, because there is no network
   there and a stalled fetch is a 15-second hang for nothing; the library or the worker
   failing to load skips OCR for the whole photo; one block's crop failing (or running
   long) skips that block and keeps going; a recognised line that doesn't parse into a
   name or a dimension pair is just left blank. */
const BP_TESS_VER='7.0.0';
const BP_TESS_JS=`https://cdn.jsdelivr.net/npm/tesseract.js@${BP_TESS_VER}/dist/tesseract.min.js`;
const BP_TESS_WORKER=`https://cdn.jsdelivr.net/npm/tesseract.js@${BP_TESS_VER}/dist/worker.min.js`;
const BP_TESS_CORE=`https://cdn.jsdelivr.net/npm/tesseract.js-core@${BP_TESS_VER}`;
const BP_TESS_LANG='https://tessdata.projectnaptha.com/4.0.0';
function bpTimeout(p, ms){
  return new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error('timed out')), ms);
    p.then(v=>{ clearTimeout(t); resolve(v); }, e=>{ clearTimeout(t); reject(e); });
  });
}
let bpTessLoad=null;
function bpLoadTesseract(){
  if(location.protocol==='file:') return Promise.reject(new Error('file://'));
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(bpTessLoad) return bpTessLoad;
  bpTessLoad=bpTimeout(new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=BP_TESS_JS;
    s.onload=()=> window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Tesseract.js loaded but didn't define itself"));
    s.onerror=()=>reject(new Error('Could not load Tesseract.js'));
    document.head.appendChild(s);
  }), 8000).catch(e=>{ bpTessLoad=null; throw e; });
  return bpTessLoad;
}
async function bpOcrOpen(){
  const T=await bpLoadTesseract();
  const worker=await bpTimeout(T.createWorker('eng', 1, {
    workerPath:BP_TESS_WORKER, corePath:BP_TESS_CORE, langPath:BP_TESS_LANG
  }), 15000);
  /* PSM 6: a uniform block of text, not a single line — a room's block spans the name
     and the dimension line under it, and it's Tesseract's own line-break detection that
     tells them apart, not bpLabelBlocks's glyph candidates (see bpOcrCrop). */
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  return worker;
}
/* The crop comes from the original photo, not the downsampled/cropped "work" canvas the
   rest of detection runs on — a name that's 9px tall in work-space is unreadable no
   matter what Tesseract does with it, and the source photo usually has the resolution to
   spare. Upscaled toward a ~32px glyph height, comfortably within what Tesseract expects,
   capped at 4x so a tiny label doesn't turn into a blurry mess.

   Padded well past the block's own top edge, not evenly on all sides: a block is built
   entirely out of GLYPH-sized candidate components (bpLabelBlocks's own candidate cap is
   tPart*6), and bold, closely-kerned room-name lettering routinely binarises into one
   blob per word that blows straight through that cap — so the name is invisible to the
   glyph pipeline and only the dimension line under it, and the rule between them, ever
   becomes a block. Confirmed against the real photo: every block's y0 lands right at that
   rule, with the name itself sitting entirely above it. Extending upward by several glyph
   heights brings the name into the crop without a second detection pass, and it's Tesseract
   — not the glyph pipeline — that has to segment it from here. */
function bpOcrCrop(box, gh){
  const st=bpState, img=st.img, s=st.full.width/img.naturalWidth;
  const padSide=Math.max(2, gh*0.5), padTop=gh*3, ox=st.cropRect.x, oy=st.cropRect.y;
  const ix0=Math.max(0,(box.x0+ox-padSide)/s), iy0=Math.max(0,(box.y0+oy-padTop)/s);
  const ix1=Math.min(img.naturalWidth,(box.x1+ox+padSide)/s), iy1=Math.min(img.naturalHeight,(box.y1+oy+padSide)/s);
  const iw=Math.max(1,ix1-ix0), ih=Math.max(1,iy1-iy0);
  const up=Math.min(4, Math.max(1, 32*s/Math.max(1,gh)));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(iw*up)); c.height=Math.max(1,Math.round(ih*up));
  const x=c.getContext('2d');
  x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
  x.drawImage(img, ix0,iy0,iw,ih, 0,0,c.width,c.height);
  return c;
}
/* A name is letters (BEDROOM, W.I.C.); a dimension line is mostly digits, quotes and
   fraction slashes. Cheap enough to just count characters rather than a real classifier. */
function bpLineKind(text){
  const t=(text||'').trim(); if(!t) return null;
  const letters=(t.match(/[A-Za-z]/g)||[]).length;
  const digits=(t.match(/[0-9]/g)||[]).length;
  if(digits>=2 && digits>=letters) return 'dim';
  if(letters>=2) return 'name';
  return null;
}
/* "12'-4" x 14'-11"" -> a pair of lengths. Reuses parseLen rather than a bespoke
   fraction/quote parser, since UNIT_RE already accepts the curly quotes OCR tends to
   produce for ' and ". Bounded to what a room dimension can plausibly be — OCR drops
   punctuation often enough (11'10" misread as 1110") that an unchecked reading can be
   out by a factor of ten, and that's worse for bpSolveScale than no reading at all. */
function bpParseDimPair(text){
  const t=(text||'').replace(/[×✕✖xX]/g,' x ').replace(/\s+/g,' ').trim();
  const m=t.match(/^(.+?)\sx\s(.+)$/);
  if(!m) return null;
  const a=parseLen(m[1],'ftin'), b=parseLen(m[2],'ftin');
  if(!isFinite(a)||!isFinite(b)) return null;
  if(a<150||a>15000||b<150||b>15000) return null;
  return [a,b];
}
/* Tesseract returns a block's lines top to bottom, so the first name-shaped line wins —
   a plan names a room once, above its dimensions, never the other way round — and the
   first line that parses as a dimension pair wins the same way. */
function bpReadBlockText(text){
  let name='', dimText='', dims=null;
  for(const raw of (text||'').split(/\r?\n/)){
    const ln=raw.trim(); if(!ln) continue;
    const kind=bpLineKind(ln);
    if(kind==='name' && !name) name=ln;
    else if(kind==='dim' && !dims){
      const pair=bpParseDimPair(ln);
      if(pair){ dimText=ln; dims=pair; }
    }
  }
  return {name, dimText, dims};
}
/* A printed dimension only means what its bbox says when the room IS that bbox — a
   simple rectangle. A room that opens straight into its neighbour (the living area into
   the foyer, say) traces as one merged, irregular outline, and the number printed in the
   living area was never describing that outline's own bbox in the first place. Boxy
   enough means the traced polygon fills most of its own bbox and reads as a plain
   rectangle, not an L or a union of two rooms. */
function bpRegionIsBoxy(r){
  const bw=r.bboxPx[2]-r.bboxPx[0], bh=r.bboxPx[3]-r.bboxPx[1], bboxArea=bw*bh;
  if(bboxArea<=0) return false;
  return (r.areaPx/bboxArea)>=0.9 && r.polyPx.length<=6;
}
/* Fits each recognised dimension pair against the region's own pixel bbox, in both
   orientations — OCR reading order doesn't necessarily match width-then-height — picks
   whichever orientation the two axes agree on more closely, then pools the per-room
   estimates with a median so one mis-read label can't set the scale for the whole plan.
   Only boxy rooms are trusted for this at all: a blueprint already runs a bit loose
   against real-world scale, and an irregular room's printed number is exactly the case
   where that slack is worst, so it's left as a label rather than fed into the fit.
   Spread is reported so the caller can warn rather than silently trust a shaky pool. */
function bpSolveScale(regions){
  const samples=[];
  for(const r of regions){
    if(!r.ocrDims || !bpRegionIsBoxy(r)) continue;
    const [Lx,Ly]=r.ocrDims;
    const bw=r.bboxPx[2]-r.bboxPx[0], bh=r.bboxPx[3]-r.bboxPx[1];
    if(bw<4||bh<4) continue;
    const a=[Lx/bw, Ly/bh], b=[Lx/bh, Ly/bw];
    const spreadOf=p=>Math.abs(p[0]-p[1])/((p[0]+p[1])/2);
    const pick = spreadOf(a)<=spreadOf(b) ? a : b;
    samples.push((pick[0]+pick[1])/2);
  }
  if(!samples.length) return null;
  samples.sort((x,y)=>x-y);
  const mid=samples.length/2;
  const median = samples.length%2 ? samples[Math.floor(mid)] : (samples[mid-1]+samples[mid])/2;
  const spread = samples.length>1 ? (samples[samples.length-1]-samples[0])/median : 0;
  return {mmPerPx:median, source:'read', n:samples.length, spread};
}
/* Runs once, on the freshly-derived regions, before the wizard ever shows Scale or
   Review — so both open pre-filled instead of racing an async pass against the user.
   One crop per block (region.labels — already resolved by bpDeriveRegions, so no need to
   re-test containment here), read as a whole with PSM 6 rather than split into individual
   lines first: letting Tesseract find the line break itself, inside a crop that's already
   known to hold real text, is more reliable than trying to re-derive that break from the
   glyph pipeline's own candidate boxes. Mutates the region objects in place
   (ocrName/ocrDimText/ocrDims); every failure layer above just leaves those unset, same as
   if OCR had never been attempted. */
async function bpRunOcr(regions, blocks, gh, runId){
  if(!blocks.length) return null;
  let worker;
  try{ worker=await bpOcrOpen(); }
  catch(e){ return null; }
  const deadline=Date.now()+20000;
  try{
    for(const r of regions){
      if(bpRunSeq!==runId || Date.now()>deadline) break;
      const mine=(r.labels||[]).map(i=>blocks[i]).filter(Boolean);
      if(!mine.length) continue;
      let name='', dimText='', dims=null;
      for(const b of mine){
        try{
          const crop=bpOcrCrop(b, gh);
          const {data}=await bpTimeout(worker.recognize(crop), 8000);
          const read=bpReadBlockText(data&&data.text);
          if(read.name && !name) name=read.name;
          if(read.dims && !dims){ dimText=read.dimText; dims=read.dims; }
        }catch(e){ /* skip this one block, keep going */ }
      }
      if(name) r.ocrName=name;
      if(dimText) r.ocrDimText=dimText;
      if(dims) r.ocrDims=dims;
    }
  } finally {
    try{ await worker.terminate(); }catch(e){}
  }
  return bpSolveScale(regions);
}

export {BP_TESS_VER, BP_TESS_JS, BP_TESS_WORKER, BP_TESS_CORE, BP_TESS_LANG, bpTimeout, bpTessLoad, bpLoadTesseract, bpOcrOpen, bpOcrCrop, bpLineKind, bpParseDimPair, bpReadBlockText, bpRegionIsBoxy, bpSolveScale, bpRunOcr};
