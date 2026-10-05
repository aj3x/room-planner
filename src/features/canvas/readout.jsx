// @ts-check
/* The status corner under the plan, and the zoom controls opposite it. What
   the corner says is a signal the readout layers (readout-layer.js, and the
   floor scene's) set as they draw, since it says what that frame shows. */
import {signal} from '../../kernel/signals.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {fit, zoomAt} from './camera.js';
import {H, W} from './view.js';

/** What the corner says: a snap note picked out first, the text, then what is wrong, each picked out.
    @typedef {{snap: string, text: string, bad: string[]}} ReadoutText */
const readout = signal(/** @type {ReadoutText} */({snap: '', text: '', bad: []}));
/** Set what the corner says, if it says something new. @param {ReadoutText} r */
function setReadout(r){
  const c=readout.peek();
  if(c.snap!==r.snap || c.text!==r.text || c.bad.join('\n')!==r.bad.join('\n')) readout.value = r;
}

function Readout(){
  const r=readout.value;
  return <div class="island" id="readout" aria-live="polite">
    {r.snap ? <><span class="snap">{r.snap}</span>{' · '}</> : null}{r.text}{r.bad.map(b=><span key={b} class="bad">{b}</span>)}
  </div>;
}

function ZoomControls(){
  return <div class="island" id="ctlZoom">
    <button class="btn quiet icon" id="btnZoomOut" title="Zoom out" aria-label="Zoom out" onClick={()=>zoomAt(1/1.25,W/2,H/2)}><Icon name="minus"/></button>
    <button class="btn quiet" id="btnFit" title="Fit the room to the view" onClick={fit}><span id="zoomPct">Fit</span></button>
    <button class="btn quiet icon" id="btnZoomIn" title="Zoom in" aria-label="Zoom in" onClick={()=>zoomAt(1.25,W/2,H/2)}><Icon name="plus"/></button>
  </div>;
}

export {setReadout, Readout, ZoomControls};
