/* The door/window editor.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only.
*/
import {draw} from '../canvas/draw.js';
import {commitRoom} from '../core/history.js';
import {setRoomSel} from '../core/selection.js';
import {L, RP, S, openOf, roomMode, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {fmtLen, parseLen} from '../core/units.js';
import {openingDispOffset} from '../model/openings.js';
import {wallIsOff, wallOf} from '../model/walls.js';
import {$, moError, openModal} from '../ui/modal.js';
import {esc} from '../ui/panels.js';
import {setMode} from './mode.js';
import {KIND, renderOpen, renderRoomSel} from './room-panel.js';

/* ------------------------- opening dialog ------------------------- */
function openingDialog(id, kind, wallIdx){
  const o = id?openOf(id):null;
  const k = o?o.kind:(kind||'door');
  const wi = o?o.wall:(wallIdx!==undefined?wallIdx:0);
  const corner = o?(o.corner==='ccw'?'ccw':'cw'):'cw';
  const dispOff = o ? openingDispOffset(o, wallOf(wi).len) : 600;
  openModal(o?('Edit '+KIND(o).toLowerCase()):(k==='window'?'Add window':'Add door'), `
    <div class="field"><label for="dWall">Wall</label><select id="dWall">${RP().map((_,i)=>wallIsOff(L().room,i)&&i!==wi?'':`<option value="${i}" ${i===wi?'selected':''}>Wall ${i+1} (${esc(fmtLen(wallOf(i).len,S.unit))})</option>`).join('')}</select></div>
    <div class="field"><label for="dWidth">Width</label><input type="text" class="len" id="dWidth" value="${esc(fmtLen(o?o.width:(k==='window'?1200:813),S.unit))}"></div>
    <div class="field"><label for="dCorner">From</label><select id="dCorner">
      <option value="cw" ${corner==='cw'?'selected':''}>Near corner (clockwise)</option>
      <option value="ccw" ${corner==='ccw'?'selected':''}>Far corner (counter-clockwise)</option></select></div>
    <div class="field"><label for="dOffset">Offset</label><input type="text" class="len" id="dOffset" value="${esc(fmtLen(dispOff,S.unit))}"></div>
    ${k==='door' ? `
      <div class="field"><label for="dType">Type</label><select id="dType">
        <option value="hinge">Hinged</option><option value="bifold">Bi-fold</option><option value="slide">Sliding</option><option value="open">Open doorway</option></select></div>
      <div id="hingeBits">
        <div class="field"><label for="dHinge">Hinge</label><select id="dHinge">
          <option value="start">Near corner</option><option value="end">Far corner</option></select></div>
        <div class="field"><label for="dSwing">Swings</label><select id="dSwing">
          <option value="in">Into room</option><option value="out">Out of room</option></select></div>
      </div>` : `
      <div class="field"><label for="dSill">Sill height</label><input type="text" class="len" id="dSill" value="${esc(fmtLen(o&&o.sill?o.sill:900,S.unit))}"></div>
      <p class="hint">Sill height is a note for you; it doesn't change the plan.</p>`}
    <p class="hint">The offset is measured along the wall from the corner you pick. You can also drag it in the plan.</p>`,
    'Save',
    ()=>{
      const wall=+$('dWall').value, len=wallOf(wall).len;
      let width=parseLen($('dWidth').value,S.unit);
      const cnr=$('dCorner').value==='ccw'?'ccw':'cw';
      let dispOffset=parseLen($('dOffset').value,S.unit);
      if(!isFinite(width)||width<100){ moError('Give it a width of at least 100 mm'); return false; }
      if(width>len){ moError('That is wider than the wall ('+fmtLen(len,S.unit)+')'); return false; }
      if(!isFinite(dispOffset)) dispOffset=0;
      let offset = cnr==='ccw' ? (len-width-dispOffset) : dispOffset;
      offset=Math.max(0,Math.min(offset,len-width));
      const rec={
        id:id||uid(), kind:k, wall, width, offset, corner:cnr,
        dtype: k==='door' ? $('dType').value : 'open',
        hinge: k==='door' ? $('dHinge').value : 'start',
        swing: k==='door' ? $('dSwing').value : 'in',
        sill:  k==='window' ? (parseLen($('dSill').value,S.unit)||900) : undefined
      };
      if(id){ const i=L().openings.findIndex(x=>x.id===id); L().openings[i]=rec; }
      else L().openings.push(rec);
      setRoomSel({kind:'opening', id:rec.id});
      if(!roomMode()) setMode('room');
      renderOpen(); renderRoomSel(); draw(); save(); commitRoom();
    },
    ()=>{
      if(k!=='door') return;
      if(o){ $('dType').value=o.dtype; $('dHinge').value=o.hinge||'start'; $('dSwing').value=o.swing||'in'; }
      const t=()=>{
        const v=$('dType').value;
        $('hingeBits').hidden = v!=='hinge' && v!=='bifold';
      };
      $('dType').addEventListener('change',t);
      t();
    });
}
export {openingDialog};
