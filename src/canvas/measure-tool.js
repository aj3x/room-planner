/* The Measure tool's canvas half: which anchor is under the pointer, which
   measurement is, the live preview, the readout bar, and the pointer entry
   points the interaction region calls.

   The arithmetic half is model/measures.js and the tool's state is the
   canvas/measure-state.js signals; this is what sits between them. The bar
   (renderMeasureBar) is an effect on those signals and on the room's
   measurements (mountMeasureBar), so nothing here repaints it by hand.
*/
import {$} from '../ui/modal.js';
import {S, L, uid} from '../core/state.js';
import {transact} from '../core/tx.js';
import {pointInPoly, ptSegDist} from '../core/geometry.js';
import {cv, view, sx, sy, wx, wy} from './view.js';
import {draw, scheduleDraw} from './draw.js';
import {drag} from './interaction-state.js';
import {measuresOf, anchorKey, measureObjs, anchorGeom} from '../model/measures.js';
import {measureOn, measureStart, measureSel, measureBoxes, measureHover, measureHoverId, measureCursor} from './measure-state.js';
import {roomSel, sel} from '../core/selection.js';
import {isCanvasMode} from '../core/state.js';
import {drawState, splitDrawState, wallDrawState} from './interaction-state.js';

import {cancelCustomDraw} from './room-draw.js';
import {cancelSplitDraw} from './split-room.js';
import {cancelWallDraw} from './wall-draw.js';
import {batch, rev} from '../core/signals.js';
import {mountPanel} from '../ui/mount.js';


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
  if(!measureStart.value){ const id=pickMeasure(px,py,false); if(id) return {id}; }
  const a=measurePick(px,py);
  if(a) return {a};
  if(!measureStart.value){ const id=pickMeasure(px,py,true); if(id) return {id}; }
  return null;
}

function liveMeasures(){
  const objs=measureObjs();
  return measuresOf().filter(m=>anchorGeom(m.a,objs)&&anchorGeom(m.b,objs));
}
function renderMeasureBar(){
  const bar=$('measureBar');
  $('btnMeasure').setAttribute('aria-pressed', String(measureOn.value));
  cv.classList.toggle('measuring', measureOn.value);
  bar.hidden=!measureOn.value;
  if(!measureOn.value){ cv.style.cursor=''; return; }
  const msg = measureStart.value ? 'Now pick the second one'
    : measureSel.value ? 'Measurement selected'
    : 'Pick a corner, side, centre or door swing';
  const acts = [];
  if(measureSel.value) acts.push('<button type="button" class="btn quiet sm danger" data-act="remove">Remove</button>');
  else if(!measureStart.value && liveMeasures().length) acts.push('<button type="button" class="btn quiet sm" data-act="clear">Clear all…</button>');
  acts.push('<button type="button" class="btn sm" data-act="done">Done</button>');
  bar.innerHTML=`<span class="mb-msg">${msg}</span>${acts.join('')}`;
}

function resetMeasureState(){ batch(()=>{ measureStart.value = null; measureHover.value = null; measureHoverId.value = null; measureSel.value = null; measureCursor.value = null; }); }
/* Measurements have no undo history, hence history:false on both writes. */
function removeMeasure(id){
  transact('room', ()=>{
    L().measures=measuresOf().filter(m=>m.id!==id);
    if(measureSel.value===id) measureSel.value = null;
    measureHoverId.value = null;
  }, {history:false});
}
function measurePointerDown(px,py){
  const t=measureTargetAt(px,py);
  if(t && t.id){ measureSel.value = t.id; draw(); return; }
  measureSel.value = null;
  if(t && t.a){
    if(!measureStart.value) measureStart.value = t.a;
    else if(anchorKey(t.a)!==anchorKey(measureStart.value)){
      transact('room', ()=>{ measuresOf().push({id:uid(), a:measureStart.value, b:t.a}); measureStart.value = null; }, {history:false});
    }
  } else drag.value = {mode:'pan', px, py, ox:view.ox, oy:view.oy};
  draw();
}
function measureHoverAt(px,py){
  measureCursor.value = [wx(px),wy(py)];
  const t=measureTargetAt(px,py);
  measureHover.value = t&&t.a || null;
  measureHoverId.value = t&&t.id || null;
  cv.style.cursor = t ? 'pointer' : '';
  scheduleDraw();
}


/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function setMeasure(on){
  if(on){
    if(!isCanvasMode(S.mode)) return;
    if(drawState.value) cancelCustomDraw();
    if(wallDrawState.value) cancelWallDraw();
    if(splitDrawState.value) cancelSplitDraw();
    // a click now measures, so nothing stays selected for editing
    sel.value = null; roomSel.value = null;
  }
  batch(()=>{ measureOn.value = !!on; resetMeasureState(); });
}
/* The bar over the canvas, as an effect on the tool's state and the room's
   measurements (ui/mount.js). */
function mountMeasureBar(){
  mountPanel(null, () => { rev.room.value; rev.project.value; measureOn.value; measureStart.value; measureSel.value; }, renderMeasureBar);
}
export {mountMeasureBar, measurePick, pickMeasure, measureTargetAt, liveMeasures, renderMeasureBar, resetMeasureState, removeMeasure, measurePointerDown, measureHoverAt, setMeasure};
