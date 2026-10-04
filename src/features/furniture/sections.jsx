// @ts-check
/* The furniture's sections: Items in the Plan pane (items-list.jsx), and in
   the Properties pane the Selection panel (the picked items) and Stock
   (which rooms an item's count is shared across). Each fill renders its
   component into the <section data-sec> the shell provides; app/slots.js
   calls them at boot. */
import {mountComponent} from '../../ui-kit/component.js';
import {ItemsSection, StockSection} from './items-list.jsx';
import {SelSection} from './selection-section.jsx';

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  things(el){ mountComponent(el, <ItemsSection/>); },
  sel(el){ mountComponent(el, <SelSection section={el}/>); },
  stock(el){ mountComponent(el, <StockSection/>); },
};

export {sections};
