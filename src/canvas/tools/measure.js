/* The Measure tool: while it is on, a click picks a measurement's label or
   an anchor (the first end, then the second, which saves the measurement),
   a press on nothing pans, and the pointer's hover shows what a click would
   take. Escape backs out one step at a time; Delete removes the selected
   measurement. */

import {uid} from '../../core/state.js';
import {transact} from '../../core/tx.js';
import {anchorKey, measuresOf} from '../../model/measures.js';
import {mo} from '../../ui/modal.js';
import {draw, scheduleDraw} from '../draw.js';
import {measureCursor, measureHover, measureHoverId, measureOn, measureSel, measureStart} from '../measure-state.js';
import {measureTargetAt, removeMeasure, setMeasure} from '../measure-tool.js';
import {cv, wx, wy} from '../view.js';
import {startPan} from './pan.js';

function measureDown(e,px,py){
  const t=measureTargetAt(px,py);
  if(t && t.id){ measureSel.value = t.id; draw(); return null; }
  measureSel.value = null;
  let cap=null;
  if(t && t.a){
    if(!measureStart.value) measureStart.value = t.a;
    else if(anchorKey(t.a)!==anchorKey(measureStart.value)){
      transact('room', ()=>{ measuresOf().push({id:uid(), a:measureStart.value, b:t.a}); measureStart.value = null; }, {history:false});
    }
  } else cap = startPan(px,py);
  draw();
  return cap;
}
function measureHoverAt(px,py){
  measureCursor.value = [wx(px),wy(py)];
  const t=measureTargetAt(px,py);
  measureHover.value = t&&t.a || null;
  measureHoverId.value = t&&t.id || null;
  cv.style.cursor = t ? 'pointer' : '';
  scheduleDraw();
}
function measureLeave(){
  measureHover.value = null; measureHoverId.value = null; measureCursor.value = null; scheduleDraw();
}
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

const measureTool = {
  id:'measure',
  active: () => measureOn.value,
  onDown: measureDown, onHover: measureHoverAt, onLeave: measureLeave, onKey: measureKey,
};

export {measureTool};
