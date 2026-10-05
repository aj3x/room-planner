// @ts-check
/* The Measure button on the canvas, and the bar beside it while the tool is
   on: what the next click does, and Remove / Clear all… / Done. Each reads
   the tool's state (and the room's measurements) while it renders. */
import {L} from '../../kernel/state.js';
import {rev} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {askConfirm} from '../../ui-kit/modal.jsx';
import {Icon} from '../../ui-kit/parts.jsx';
import {measureOn, measureSel, measureStart} from './measure-state.js';
import {liveMeasures, removeMeasure, resetMeasureState, setMeasure} from './measure.js';

function MeasureButton(){
  const on=measureOn.value;
  return <button type="button" class="btn quiet" id="btnMeasure" aria-pressed={on} title="Measure the distance between two things (M)"
    onClick={()=>setMeasure(!measureOn.value)}><Icon name="ruler"/>Measure</button>;
}

function clearAll(){
  const n=liveMeasures().length;
  askConfirm('Clear measurements', 'Remove '+(n===1?'the measurement':'all '+n+' measurements')+' from '+L().name+'?', 'Clear measurements', ()=>{
    transact('room', ()=>{ L().measures=[]; resetMeasureState(); }, {history:false});   // no undo for measurements
  });
}

function MeasureBar(){
  rev.room.value; rev.project.value;
  const on=measureOn.value, start=measureStart.value, picked=measureSel.value;
  if(!on) return <span id="measureBar" aria-live="polite" hidden></span>;
  const msg = start ? 'Now pick the second one'
    : picked ? 'Measurement selected'
    : 'Pick a corner, side, centre or door swing';
  return <span id="measureBar" aria-live="polite">
    <span class="mb-msg">{msg}</span>
    {picked ? <button type="button" class="btn quiet sm danger" onClick={()=>{ if(measureSel.value) removeMeasure(measureSel.value); }}>Remove</button>
      : !start && liveMeasures().length ? <button type="button" class="btn quiet sm" onClick={clearAll}>Clear all…</button> : null}
    <button type="button" class="btn sm" onClick={()=>setMeasure(false)}>Done</button>
  </span>;
}

export {MeasureButton, MeasureBar};
