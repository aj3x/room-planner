/* The floor scene's status corner: how many rooms, their total area, or
   what the magnet is doing while a room is dragged. */

import {$} from '../../ui/modal.js';
import {plural} from '../../ui/panels.js';
import {polyArea} from '../../core/geometry.js';
import {floorSnapNote} from '../../core/selection.js';
import {S} from '../../core/state.js';
import {fmtArea} from '../../core/units.js';

function updateFloorReadout(fl, members){
  const el=$('readout'); if(!el) return;
  if(!fl || !members.length){ el.textContent = fl ? 'No rooms on this floor' : 'Not on a floor'; return; }
  if(floorSnapNote.value){ el.textContent = floorSnapNote.value; return; }
  let area=0; for(const m of members) area+=Math.abs(polyArea(m.P));
  el.textContent = plural(members.length,'room')+' · '+fmtArea(area,S.unit);
}

const floorReadoutLayer = {
  id:'floor-readout', z:1000, scene:'floor',
  deps(){ floorSnapNote.value; },
  draw(ctx, view, {fl, members}){ updateFloorReadout(fl, members); }
};

export {floorReadoutLayer};
