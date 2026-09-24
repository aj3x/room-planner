/* The Measure tool's canvas half: which anchor is under the pointer, which
   measurement is, the live preview, the readout bar, and the pointer entry
   points the interaction region calls.

   Extracted from index.html in Phase 3, move-only: the two chunks below are
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   The arithmetic half is model/measures.js and the seven mutable lets are the
   canvas/measure-state.js leaf; this is what sits between them. setMeasure(),
   which turns the tool on and off, is the one member of the region that did
   not come: it calls renderRoomSel() and renderSel(), both inside the
   plan/library reference cycle.
*/
import {$} from '../ui/modal.js';
import {S, L, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {pointInPoly, ptSegDist} from '../core/geometry.js';
import {cv, view, sx, sy, wx, wy} from './view.js';
import {draw, scheduleDraw} from './draw.js';
import {setDrag} from './interaction-state.js';
import {measuresOf, anchorKey, measureObjs, anchorGeom} from '../model/measures.js';
import {measureOn, measureStart, measureSel, measureBoxes,
        setMeasureStart, setMeasureHover, setMeasureHoverId,
        setMeasureSel, setMeasureCursor} from './measure-state.js';
import {setRoomSel, setSel} from '../core/selection.js';
import {isCanvasMode} from '../core/state.js';
import {renderOpen, renderRoomSel, renderWalls} from '../plan/room-panel.js';
import {renderSel} from '../plan/selection-panel.js';
import {drawState, splitDrawState, wallDrawState} from './interaction-state.js';
import {setMeasureOn} from './measure-state.js';
import {cancelCustomDraw} from './room-draw.js';
import {cancelSplitDraw} from './split-room.js';
import {cancelWallDraw} from './wall-draw.js';


/* the anchor under a screen point: a corner or centre point beats a side, which beats the
   inside of a footprint (or the band of a wall, door or window), then a door's swing */
function measurePick(px,py){
  const pt=[wx(px),wy(py)], objs=measureObjs();
  let best=null;
  const offer = (tier,d,a) => { if(!best || tier<best.tier || (tier===best.tier && d<best.d)) best={tier,d,a}; };
  for(const o of objs){
    o.corners.forEach((c,n)=>{ const d=Math.hypot(px-sx(c[0]),py-sy(c[1])); if(d<10) offer(0,d,{k:o.k,id:o.id,part:'corner',n}); });
    const dc=Math.hypot(px-sx(o.center[0]),py-sy(o.center[1]));
    if(dc<9) offer(0,dc,{k:o.k,id:o.id,part:'whole'});
    o.sides.forEach((s,n)=>{ const d=ptSegDist(pt,s[0],s[1]).d*view.scale; if(d<7) offer(1,d,{k:o.k,id:o.id,part:'side',n}); });
  }
  if(best) return best.a;
  for(const o of objs){
    const on = o.whole.area ? pointInPoly(pt,o.whole.pts)
      : ptSegDist(pt,o.whole.pts[0],o.whole.pts[1]).d*view.scale < Math.max(8,(o.band||0)*view.scale+2);
    if(on) return {k:o.k, id:o.id, part:'whole'};
    // only while door swings are shown, so there's never an invisible target
    if(o.swing && S.showSwing && pointInPoly(pt,o.swing.pts)) return {k:o.k, id:o.id, part:'swing'};
  }
  return null;
}
/* a drawn measurement under a screen point: its label, or with `lines` its line too */
function pickMeasure(px,py,lines){
  for(let i=measureBoxes.length-1;i>=0;i--){
    const b=measureBoxes[i];
    if(px>=b.x-2 && px<=b.x+b.w+2 && py>=b.y-2 && py<=b.y+b.h+2) return b.id;
    if(lines && ptSegDist([px,py],b.p,b.q).d<6) return b.id;
  }
  return null;
}
/* what a click would act on. A label wins over the anchors beneath it, but once the first
   end is down every click is for the second end. */
function measureTargetAt(px,py){
  if(!measureStart){ const id=pickMeasure(px,py,false); if(id) return {id}; }
  const a=measurePick(px,py);
  if(a) return {a};
  if(!measureStart){ const id=pickMeasure(px,py,true); if(id) return {id}; }
  return null;
}

function liveMeasures(){
  const objs=measureObjs();
  return measuresOf().filter(m=>anchorGeom(m.a,objs)&&anchorGeom(m.b,objs));
}
function renderMeasureBar(){
  const bar=$('measureBar');
  $('btnMeasure').setAttribute('aria-pressed', String(measureOn));
  cv.classList.toggle('measuring', measureOn);
  bar.hidden=!measureOn;
  if(!measureOn){ cv.style.cursor=''; return; }
  const msg = measureStart ? 'Now pick the second one'
    : measureSel ? 'Measurement selected'
    : 'Pick a corner, side, centre or door swing';
  const acts = [];
  if(measureSel) acts.push('<button type="button" class="btn quiet sm danger" data-act="remove">Remove</button>');
  else if(!measureStart && liveMeasures().length) acts.push('<button type="button" class="btn quiet sm" data-act="clear">Clear all…</button>');
  acts.push('<button type="button" class="btn sm" data-act="done">Done</button>');
  bar.innerHTML=`<span class="mb-msg">${msg}</span>${acts.join('')}`;
}

function resetMeasureState(){ setMeasureStart(null); setMeasureHover(null); setMeasureHoverId(null); setMeasureSel(null); setMeasureCursor(null); }
function removeMeasure(id){
  L().measures=measuresOf().filter(m=>m.id!==id);
  if(measureSel===id) setMeasureSel(null);
  setMeasureHoverId(null);
  renderMeasureBar(); draw(); save();
}
function measurePointerDown(px,py){
  const t=measureTargetAt(px,py);
  if(t && t.id){ setMeasureSel(t.id); renderMeasureBar(); draw(); return; }
  setMeasureSel(null);
  if(t && t.a){
    if(!measureStart) setMeasureStart(t.a);
    else if(anchorKey(t.a)!==anchorKey(measureStart)){
      measuresOf().push({id:uid(), a:measureStart, b:t.a});
      setMeasureStart(null); save();
    }
  } else setDrag({mode:'pan', px, py, ox:view.ox, oy:view.oy});
  renderMeasureBar(); draw();
}
function measureHoverAt(px,py){
  setMeasureCursor([wx(px),wy(py)]);
  const t=measureTargetAt(px,py);
  setMeasureHover(t&&t.a || null);
  setMeasureHoverId(t&&t.id || null);
  cv.style.cursor = t ? 'pointer' : '';
  scheduleDraw();
}


/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function setMeasure(on){
  if(on){
    if(!isCanvasMode(S.mode)) return;
    if(drawState) cancelCustomDraw();
    if(wallDrawState) cancelWallDraw();
    if(splitDrawState) cancelSplitDraw();
    // a click now measures, so nothing stays selected for editing
    setSel(null); setRoomSel(null); renderSel(); renderRoomSel(); renderWalls(); renderOpen();
  }
  setMeasureOn(!!on);
  resetMeasureState();
  renderMeasureBar(); draw();
}
export {measurePick, pickMeasure, measureTargetAt, liveMeasures, renderMeasureBar, resetMeasureState, removeMeasure, measurePointerDown, measureHoverAt, setMeasure};
