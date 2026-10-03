/* The Room mode panels for the room itself: its properties (size, wall
   thickness, floor colour, trim, area) and the Selection panel, which shows
   whichever part of the room is selected through that part's own renderer
   (walls-panel.js, openings-panel.js). Each is an effect on what it shows
   (mountRoomPanels). */
import {S, L, RP, roomMode} from '../core/state.js';
import {roomSel} from '../core/selection.js';
import {fmtArea, fmtLen, parseLen} from '../core/units.js';
import {bbox, polyArea} from '../core/geometry.js';
import {transact} from '../core/tx.js';
import {pref, rev} from '../core/signals.js';
import {isRectRoom, setRectSize} from '../model/walls.js';
import {$} from '../ui/modal.js';
import {mountPanel} from '../ui/mount.js';
import {esc} from '../ui/panels.js';
import {renderOpeningProps} from './openings-panel.js';
import {renderCornerProps, renderIWallProps, renderPillarProps, renderWallProps} from './walls-panel.js';

function renderRoom(){
  const r=L().room;
  const box=$('rectDims');
  if(isRectRoom()){
    const b=bbox(RP());
    box.innerHTML=`<div class="field"><label for="roomW">Width</label><input type="text" class="len" id="roomW" value="${esc(fmtLen(b.w,S.unit))}"></div>
      <div class="field"><label for="roomD">Depth</label><input type="text" class="len" id="roomD" value="${esc(fmtLen(b.h,S.unit))}"></div>`;
    const go=()=>{
      const w=parseLen($('roomW').value,S.unit), d=parseLen($('roomD').value,S.unit);
      transact('room', ()=>{ if(isFinite(w)&&isFinite(d)&&w>200&&d>200) setRectSize(w,d); });
    };
    $('roomW').addEventListener('change',go);
    $('roomD').addEventListener('change',go);
  } else {
    const b=bbox(RP());
    box.innerHTML=`<div class="field"><label>Bounds</label><span>${esc(fmtLen(b.w,S.unit))} × ${esc(fmtLen(b.h,S.unit))}</span></div>`;
  }
  $('wallT').value=fmtLen(r.wall,S.unit);
  $('floorCol').value=r.floor;
  $('floorHex').value=r.floor; $('floorHex').classList.remove('bad');
  $('trimOn').checked=!!r.trimOn;
  $('trimD').value=fmtLen(r.trim,S.unit);
  $('trimD').disabled=!r.trimOn;
  $('areaOut').textContent=fmtArea(polyArea(RP()),S.unit);
}
function renderRoomSel(){
  const box=$('roomSelBox'), t=$('roomSelTitle');
  box.closest('section').classList.toggle('is-empty', !(roomMode()&&roomSel.value));
  if(!roomMode() || !roomSel.value){
    t.textContent='Selection';
    box.innerHTML='<p class="hint">Click a wall, corner, door or pillar in the plan to change it here.</p>';
    return;
  }
  /* a part's props renderer returns false when the part has gone from under
     the selection; then there is nothing selected */
  const k=roomSel.value.kind;
  const shown = k==='wall' ? renderWallProps() : k==='corner' ? renderCornerProps() : k==='pillar' ? renderPillarProps()
              : k==='iwall' ? renderIWallProps() : renderOpeningProps();
  if(shown===false){ roomSel.value = null; return renderRoomSel(); }
}
/* The room's properties and the Selection panel, as effects (ui/mount.js). */
function mountRoomPanels(){
  const geometry = () => { rev.room.value; rev.project.value; pref('unit'); };
  mountPanel($('rectDims').closest('section'), geometry, renderRoom);
  mountPanel($('roomSelBox').closest('section'), () => { geometry(); pref('mode'); roomSel.value; }, renderRoomSel);
}
export {mountRoomPanels, renderRoom, renderRoomSel};
