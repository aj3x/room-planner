// @ts-check
/* The Measure tool: while it is on, a click picks a measurement's label or
   an anchor (the first end, then the second, which saves the measurement),
   a press on nothing pans, and the pointer's hover shows what a click would
   take. Escape backs out one step at a time; Delete removes the selected
   measurement. */

import {uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {anchorKey, measuresOf} from './measures.js';
import {mo} from '../../ui-kit/modal.js';
import {draw, scheduleDraw, cv, wx, wy, startPan} from '../canvas/index.js';
import {measureCursor, measureHover, measureHoverId, measureOn, measureSel, measureStart} from './measure-state.js';
import {measureTargetAt, removeMeasure, resetMeasureState, setMeasure} from './measure.js';

/** @type {import('../canvas/types.js').Tool['onDown']} */
function measureDown(e,px,py){
  const t=measureTargetAt(px,py);
  if(t && t.id){ measureSel.value = t.id; draw(); return null; }
  measureSel.value = null;
  let cap=null;
  if(t && t.a){
    if(!measureStart.value) measureStart.value = t.a;
    else if(anchorKey(t.a)!==anchorKey(measureStart.value)){
      transact('room', ()=>{ measuresOf().push({id:uid(), a:/** @type {import('../../kernel/types.js').Anchor} */(measureStart.value), b:t.a}); measureStart.value = null; }, {history:false});
    }
  } else cap = startPan(px,py);
  draw();
  return cap;
}
/** @type {NonNullable<import('../canvas/types.js').Tool['onHover']>} */
function measureHoverAt(px,py){
  measureCursor.value = [wx(px),wy(py)];
  const t=measureTargetAt(px,py);
  measureHover.value = t&&t.a || null;
  measureHoverId.value = t&&t.id || null;
  cv.style.cursor = t ? 'pointer' : '';
  scheduleDraw();
}
/** @type {NonNullable<import('../canvas/types.js').Tool['onLeave']>} */
function measureLeave(){
  measureHover.value = null; measureHoverId.value = null; measureCursor.value = null; scheduleDraw();
}
/** @type {NonNullable<import('../canvas/types.js').Tool['onKey']>} */
function measureKey(e){
  if(!mo.hidden) return false;
  // Escape backs out one step at a time: the first end, then the selection, then the tool
  if(e.key==='Escape'){
    if(measureStart.value) measureStart.value = null;
    else if(measureSel.value) measureSel.value = null;
    else setMeasure(false);
    return true;
  }
  if((e.key==='Delete'||e.key==='Backspace') && measureSel.value){ e.preventDefault(); removeMeasure(measureSel.value); return true; }
  return false;
}

/** @satisfies {import('../canvas/types.js').Tool} */
const measureTool = {
  id:'measure',
  active: () => measureOn.value,
  onDown: measureDown, onHover: measureHoverAt, onLeave: measureLeave, onKey: measureKey,
  stop(){ setMeasure(false); },
  /* measurements belong to one room, so Floor mode and the Library places leave the tool behind */
  modes: ['room', 'furniture'],
  reset: resetMeasureState,
};

export {measureTool};
