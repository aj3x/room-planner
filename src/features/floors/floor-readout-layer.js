// @ts-check
/* The floor scene's status corner: how many rooms, their total area, or
   what the magnet is doing while a room is dragged. */

import {$} from '../../ui-kit/dom.js';
import {plural} from '../../ui-kit/panels.js';
import {polyArea} from '../../kernel/geometry.js';
import {floorSnapNote} from '../../kernel/selection.js';
import {S} from '../../kernel/state.js';
import {fmtArea} from '../../kernel/units.js';

/** @param {import('../../kernel/types.js').Floor|null|undefined} fl @param {import('../../kernel/model/floor-place.js').Member[]} members */
function updateFloorReadout(fl, members){
  const el=$('readout'); if(!el) return;
  if(!fl || !members.length){ el.textContent = fl ? 'No rooms on this floor' : 'Not on a floor'; return; }
  if(floorSnapNote.value){ el.textContent = floorSnapNote.value; return; }
  let area=0; for(const m of members) area+=Math.abs(polyArea(m.P));
  el.textContent = plural(members.length,'room')+' · '+fmtArea(area,S.unit);
}

/** @satisfies {import('../canvas/types.js').Layer} */
const floorReadoutLayer = {
  id:'floor-readout', z:1000, scene:'floor',
  deps(){ floorSnapNote.value; },
  draw(ctx, view, {fl, members}){ updateFloorReadout(fl, members); }
};

export {floorReadoutLayer};
