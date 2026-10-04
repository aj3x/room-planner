/* Replacing the room's outline: the Room section's three buttons (a
   rectangle or an L-shape typed in, or drawn by hand). The two typed ones
   are dialogs (ui-kit/modal.js). */

import { parseLen, fmtLen } from '../../kernel/units.js';
import { shapePoly, bbox } from '../../kernel/geometry.js';
import { rectPts, S, L, RP } from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import { transact } from '../../kernel/tx.js';
import { syncWallOff, clampOpenings } from '../../kernel/model/walls.js';
import { openModal, moError } from '../../ui-kit/modal.jsx';
import { $ } from '../../ui-kit/dom.js';
import { esc } from '../../ui-kit/panels.js';
import {drawState, fit} from '../canvas/index.js';
import { startCustomDraw, cancelCustomDraw } from './room-draw.js';

function presetRect(){
    const b=bbox(RP());
    openModal('Rectangular room',
      `<div class="field"><label for="pW">Width</label><input type="text" class="len" id="pW" value="${esc(fmtLen(b.w,S.unit))}"></div>
       <div class="field"><label for="pD">Depth</label><input type="text" class="len" id="pD" value="${esc(fmtLen(b.h,S.unit))}"></div>
       <p class="hint">This replaces the current outline. Doors and windows move to the nearest wall.</p>`,
      'Use this shape', ()=>{
        const w=parseLen($('pW').value,S.unit), d=parseLen($('pD').value,S.unit);
        if(!isFinite(w)||!isFinite(d)||w<500||d<500){ moError('Give a width and depth of at least 500 mm'); return false; }
        transact('room', ()=>{
          L().room.points=rectPts(w,d);
          L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
          clampOpenings(); roomSel.value = null;
        });
        fit();
      });
}
function presetL(){
    const b=bbox(RP());
    openModal('L-shaped room',
      `<div class="field"><label for="pW">Width</label><input type="text" class="len" id="pW" value="${esc(fmtLen(b.w,S.unit))}"></div>
       <div class="field"><label for="pD">Depth</label><input type="text" class="len" id="pD" value="${esc(fmtLen(b.h,S.unit))}"></div>
       <div class="field"><label for="pCW">Notch across</label><input type="text" class="len" id="pCW" value="${esc(fmtLen(b.w/3,S.unit))}"></div>
       <div class="field"><label for="pCD">Notch down</label><input type="text" class="len" id="pCD" value="${esc(fmtLen(b.h/3,S.unit))}"></div>
       <div class="field"><label for="pC">Notch at</label><select id="pC">
         <option value="ne">Top right</option><option value="nw">Top left</option>
         <option value="se">Bottom right</option><option value="sw">Bottom left</option></select></div>`,
      'Use this shape', ()=>{
        const w=parseLen($('pW').value,S.unit), d=parseLen($('pD').value,S.unit);
        const cw=parseLen($('pCW').value,S.unit), cd=parseLen($('pCD').value,S.unit);
        if(![w,d,cw,cd].every(v=>isFinite(v)&&v>100)){ moError('Fill in all four measurements'); return false; }
        if(cw>=w-100||cd>=d-100){ moError('The notch has to be smaller than the room'); return false; }
        transact('room', ()=>{
          L().room.points=shapePoly({type:'lshape',w,d,cw,cd,corner:$('pC').value}).map(([x,y])=>[x+w/2,y+d/2]);
          L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
          clampOpenings(); roomSel.value = null;
        });
        fit();
      });
}
function toggleCustomDraw(){
  if(drawState.value) cancelCustomDraw(); else startCustomDraw();   // starting stops every other tool
}

export {presetRect, presetL, toggleCustomDraw};
