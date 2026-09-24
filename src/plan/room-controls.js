/* The Room pane's two little input helpers: the length field binding every
   dimension box uses, and the floor-colour swatch.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added. The listeners around them stay in index.html, per
   rule 6.
*/
import {draw} from '../canvas/draw.js';
import {commitRoom} from '../core/history.js';
import {L, S} from '../core/state.js';
import {save} from '../core/store.js';
import {parseLen} from '../core/units.js';
import {$} from '../ui/modal.js';
import {renderRoom, renderWalls} from './room-panel.js';
/* ------------------------- room controls ------------------------- */
function bindLen(id,set){
  $(id).addEventListener('change', e=>{
    const mm=parseLen(e.target.value,S.unit);
    if(isFinite(mm)&&mm>0) set(mm);
    renderRoom(); renderWalls(); draw(); save(); commitRoom();
  });
}

function setFloorColor(hex){ L().room.floor=hex; $('floorCol').value=hex; draw(); save(); }
export {bindLen, setFloorColor};
