// @ts-check
/* Floor mode's two sections in the Properties pane: the picked room on the
   floor (or the two picked for a merge), and the floor itself. Each fill
   renders the section's markup into the <section data-sec> the shell
   provides and returns what mounts the effect that fills it (floors.js)
   once the project is loaded. app/slots.js calls them at boot. */
import {mountComponent} from '../../ui-kit/component.js';
import {SecHead} from '../../ui-kit/parts.jsx';
import {mountFloorPropsPanel, mountFloorSelPanel} from './floors.js';

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  floorsel(el){
    mountComponent(el, <>
      <div class="sec-head"><h2 id="floorSelTitle">Selection</h2></div>
      <div id="floorSelBox"></div>
    </>);
    return () => mountFloorSelPanel(el);
  },
  floorprops(el){
    mountComponent(el, <>
      <SecHead title="Floor"/>
      <div id="floorPropsBox"></div>
    </>);
    return () => mountFloorPropsPanel(el);
  },
};

export {sections};
