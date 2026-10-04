// @ts-check
/* The View section in the Properties pane: snap size, zoom speed and what
   the plan shows. Its fill renders the markup into the <section data-sec>
   the shell provides and binds the switches; mountViewPrefs (view-prefs.js,
   mounted by boot() because it also sets the header's unit) keeps them
   showing S. app/slots.js calls it at boot. */
import {mountComponent} from '../../ui-kit/component.js';
import {SecHead} from '../../ui-kit/parts.jsx';
import {bindViewSection} from './view-bind.js';

function ViewSection(){
  return <>
    <SecHead title="View"/>
    <div class="field"><label for="snapSel">Snap to</label><select id="snapSel"></select></div>
    <div class="field"><label for="zoomSpeedSel">Zoom speed</label>
      <select id="zoomSpeedSel">
        <option value="0.5">Slow</option>
        <option value="1">Normal</option>
        <option value="2">Fast</option>
      </select>
    </div>
    <label class="check"><input type="checkbox" id="showDims" checked/>Size of the selected item</label>
    <label class="check"><input type="checkbox" id="showSwing" checked/>Door clearance</label>
    <label class="check"><input type="checkbox" id="showOpen" checked/>Items opened out</label>
    <label class="check"><input type="checkbox" id="showWalk"/>Walk paths</label>
    <label class="check"><input type="checkbox" id="showMeasure" checked/>Measurements</label>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  drawing(el){ mountComponent(el, <ViewSection/>); bindViewSection(); },
};

export {sections};
