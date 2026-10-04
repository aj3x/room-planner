// @ts-check
/* The furniture's sections: Items in the Plan pane (items-list.jsx), and in
   the Properties pane the Selection panel (the picked items) and Stock
   (which rooms an item's count is shared across). Each fill renders into the
   <section data-sec> the shell provides (the Selection panel's effect is
   mounted once the project is loaded); app/slots.js calls them at boot. */
import {mountComponent} from '../../ui-kit/component.js';
import {SecHead} from '../../ui-kit/parts.jsx';
import {ItemsSection, StockSection} from './items-list.jsx';
import {mountSelPanel} from './selection-panel.js';

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  things(el){ mountComponent(el, <ItemsSection/>); },
  sel(el){
    mountComponent(el, <>
      <SecHead title="Selection"/>
      <div id="selBox"></div>
    </>);
    return () => mountSelPanel(el);
  },
  stock(el){ mountComponent(el, <StockSection/>); },
};

export {sections};
