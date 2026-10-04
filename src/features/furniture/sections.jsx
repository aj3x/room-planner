// @ts-check
/* The furniture's sections: in the Properties pane, the Selection panel
   (the picked items) and Stock (which rooms an item's count is shared
   across). Each fill renders the section's markup into the
   <section data-sec> the shell provides, binds it and mounts the effect
   that fills it. app/slots.js calls them at boot. */
import {mountComponent} from '../../ui-kit/component.js';
import {SecHead} from '../../ui-kit/parts.jsx';
import {mountSelPanel} from './selection-panel.js';
import {bindStockSection} from './stock-bind.js';

function StockSection(){
  return <>
    <SecHead title="Stock"/>
    <div class="field"><label for="invScope">Count</label>
      <select id="invScope">
        <option value="project">Across all rooms</option>
        <option value="folder">Within each folder</option>
        <option value="room">Per room</option>
      </select>
    </div>
    <p class="hint" id="invScopeHint"></p>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  sel(el){
    mountComponent(el, <>
      <SecHead title="Selection"/>
      <div id="selBox"></div>
    </>);
    mountSelPanel(el);
  },
  stock(el){ mountComponent(el, <StockSection/>); bindStockSection(); },
};

export {sections};
