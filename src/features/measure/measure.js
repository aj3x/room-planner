// @ts-check
/* The Measure tool's canvas half: which anchor is under the pointer, which
   measurement is, the readout bar, and turning the tool on and off. Its
   pointer and key handling is features/measure/measure-tool.js.

   The arithmetic half is features/measure/measures.js and the tool's state is the
   features/measure/measure-state.js signals; this is what sits between them. The bar
   (renderMeasureBar) is an effect on those signals and on the room's
   measurements (mountMeasureBar), so nothing here repaints it by hand.
*/
import {$} from '../../ui-kit/modal.js';
import {S, L} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {pointInPoly, ptSegDist} from '../../kernel/geometry.js';
import {cv, view, sx, sy, wx, wy, stopOtherTools} from '../canvas/index.js';
import {measuresOf, measureObjs, anchorGeom} from './measures.js';
import {measureOn, measureStart, measureSel, measureHover, measureHoverId, measureCursor} from './measure-state.js';
import {measuresLayer} from './measures-layer.js';
import {roomSel, sel} from '../../kernel/selection.js';
import {isCanvasMode} from '../../kernel/state.js';

import {batch, effect, rev} from '../../kernel/signals.js';


/* the anchor under a screen point: a corner or centre point beats a side, which beats the
   inside of a footprint (or the band of a wall, door or window), then a door's swing */
/* An object's k and id are an Anchor's pair by construction (measureObjs builds
   both from the same thing), which is what the casts below say. */
/** @typedef {import('../../kernel/types.js').Anchor} Anchor */
/** @param {number} px @param {number} py @returns {Anchor|null} */
function measurePick(px,py){
  const pt=[wx(px),wy(py)], objs=measureObjs();
  /** @type {{tier: number, d: number, a: Anchor}|null} */
  let best=null;
  const offer = (/** @type {number} */tier,/** @type {number} */d,/** @type {Anchor} */a) => { if(!best || tier<best.tier || (tier===best.tier && d<best.d)) best={tier,d,a}; };
  for(const o of objs){
    o.corners.forEach((c,n)=>{ const d=Math.hypot(px-sx(c[0]),py-sy(c[1])); if(d<10) offer(0,d,/** @type {Anchor} */({k:o.k,id:o.id,part:'corner',n})); });
    const dc=Math.hypot(px-sx(o.center[0]),py-sy(o.center[1]));
    if(dc<9) offer(0,dc,/** @type {Anchor} */({k:o.k,id:o.id,part:'whole'}));
    o.sides.forEach((s,n)=>{ const d=ptSegDist(pt,s[0],s[1]).d*view.scale; if(d<7) offer(1,d,/** @type {Anchor} */({k:o.k,id:o.id,part:'side',n})); });
  }
  if(best) return /** @type {{a: Anchor}} */(best).a;   // set inside offer(), which flow analysis does not follow
  for(const o of objs){
    const on = o.whole.area ? pointInPoly(pt,o.whole.pts)
      : ptSegDist(pt,o.whole.pts[0],o.whole.pts[1]).d*view.scale < Math.max(8,(o.band||0)*view.scale+2);
    if(on) return /** @type {Anchor} */({k:o.k, id:o.id, part:'whole'});
    // only while door swings are shown, so there's never an invisible target
    if(o.swing && S.showSwing && pointInPoly(pt,o.swing.pts)) return /** @type {Anchor} */({k:o.k, id:o.id, part:'swing'});
  }
  return null;
}
/* a drawn measurement under a screen point: its label, or with `lines` its line too */
/** @param {number} px @param {number} py @param {boolean} lines @returns {string|null} */
function pickMeasure(px,py,lines){ return measuresLayer.hitTest(px,py,lines); }
/* what a click would act on. A label wins over the anchors beneath it, but once the first
   end is down every click is for the second end. */
/** @param {number} px @param {number} py @returns {{id: string, a?: undefined}|{a: Anchor, id?: undefined}|null} */
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
/** @param {string} id */
function removeMeasure(id){
  transact('room', ()=>{
    L().measures=measuresOf().filter(m=>m.id!==id);
    if(measureSel.value===id) measureSel.value = null;
    measureHoverId.value = null;
  }, {history:false});
}


/** @param {boolean} on */
function setMeasure(on){
  if(on){
    if(!isCanvasMode(S.mode)) return;
    stopOtherTools('measure');
    // a click now measures, so nothing stays selected for editing
    sel.value = null; roomSel.value = null;
  }
  batch(()=>{ measureOn.value = !!on; resetMeasureState(); });
}
/* The bar over the canvas, as an effect on the tool's state and the room's
   measurements. */
function mountMeasureBar(){
  effect(() => { rev.room.value; rev.project.value; measureOn.value; measureStart.value; measureSel.value; renderMeasureBar(); });
}
export {mountMeasureBar, measurePick, pickMeasure, measureTargetAt, liveMeasures, renderMeasureBar, resetMeasureState, removeMeasure, setMeasure};
