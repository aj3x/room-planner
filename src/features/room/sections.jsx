// @ts-check
/* The room's two sections in the Properties pane: the Selection panel
   (whichever part of the room is picked) and the Room section (size, wall
   thickness, floor colour, baseboard, area, and replacing the outline).

   Each fill renders the section's markup into the <section data-sec> the
   shell provides and binds its controls; the function it returns mounts the
   effect that keeps it showing the model (room-panel.js) once the project
   is loaded. app/slots.js calls them at boot. */
import {mountComponent} from '../../ui-kit/component.js';
import {SecHead} from '../../ui-kit/parts.jsx';
import {mountRoomPanel, mountRoomSelPanel} from './room-panel.js';
import {bindShapeSection} from './shape-bind.js';

function RoomSelSection(){
  return <>
    <div class="sec-head"><h2 id="roomSelTitle">Selection</h2></div>
    <div id="roomSelBox"></div>
  </>;
}

function ShapeSection(){
  return <>
    <SecHead title="Room"/>
    <div id="rectDims"></div>
    <div class="field"><label for="wallT">Wall thickness</label><input type="text" class="len" id="wallT"/></div>
    <div class="field"><label for="floorCol">Floor</label><input type="color" id="floorCol" aria-label="Floor colour"/><input type="text" class="hex" id="floorHex" maxlength={7} spellcheck={false} aria-label="Floor colour hex code"/></div>
    <div class="field"><label class="check"><input type="checkbox" id="trimOn"/>Baseboard</label><input type="text" class="len" id="trimD" aria-label="Baseboard depth"/></div>
    <div class="field"><label>Area</label><span id="areaOut"></span></div>
    <div class="group">
      <p class="group-title">Replace the outline</p>
      <div class="row">
        <button class="btn sm" id="btnPreRect">Rectangle…</button>
        <button class="btn sm" id="btnPreL">L-shape…</button>
        <button class="btn sm" id="btnDrawCustom">Draw…</button>
      </div>
    </div>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  roomsel(el){ mountComponent(el, <RoomSelSection/>); return () => mountRoomSelPanel(el); },
  shape(el){ mountComponent(el, <ShapeSection/>); bindShapeSection(); return () => mountRoomPanel(el); },
};

export {sections};
