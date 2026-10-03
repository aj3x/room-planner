/* The right-hand Room pane's wiring: the inventory scope select, the two
   length boxes, the floor colour swatch and its hex field, the trim toggle,
   the three outline presets, and the view/appearance switches.

   One of the per-pane bind modules; src/bind/header.js carries the full
   rationale for the pattern. The short version: each src/html/ partial ends
   with a module script that imports its bind function and calls it, so a pane's
   markup and the list of things listening to it sit in the same file, and it is
   a function rather than registrations at import time because nothing in src/
   may have a top-level side effect.

   The two bindLen() calls came with the seventeen addEventListener calls.
   bindLen registers a change listener on #wallT and #trimD, so it is this
   pane's wiring by any reading, and leaving it in the shell would have left
   the file claiming to hold nothing but app-global listeners while holding two
   that are not.

   Ordering: floorCol has two listeners and floorHex three, and each group is
   whole and in index.html's order. Do not reorder them — floorHex's change
   and blur both snap the box back, and its input handler must keep running
   ahead of neither. */

import { parseLen, fmtLen } from '../core/units.js';
import { shapePoly, bbox } from '../core/geometry.js';
import { rectPts, S, L, RP } from '../core/state.js';
import {roomSel} from '../core/selection.js';
import { transact } from '../core/tx.js';
import { syncWallOff, clampOpenings } from '../model/walls.js';
import { $, openModal, moError } from '../ui/modal.js';
import { esc } from '../ui/panels.js';
import {drawState} from '../canvas/interaction-state.js';
import { fit } from '../canvas/camera.js';
import { normHex } from '../core/color.js';
import { startCustomDraw, cancelCustomDraw } from '../canvas/room-draw.js';
import { bindLen, setFloorColor } from '../plan/room-controls.js';

function bindPaneRight(){
  $('invScope').addEventListener('change', e=>transact('prefs', ()=>{ S.invScope=e.target.value; }, {canvas:false}));

  bindLen('wallT', v=>{ L().room.wall=v; });
  bindLen('trimD', v=>{ L().room.trim=v; });
  $('floorCol').addEventListener('input', e=>{ setFloorColor(e.target.value); $('floorHex').value=e.target.value; $('floorHex').classList.remove('bad'); });
  // the colour has been live (setFloorColor) all along; letting go of it is the undo step
  $('floorCol').addEventListener('change', ()=>transact('room'));
  $('floorHex').addEventListener('input', e=>{
    const c=normHex(e.target.value);
    e.target.classList.toggle('bad', !c);
    if(c) setFloorColor(c);
  });
  /* typing an unfinished/bad code leaves the plan alone — snap the box back on the way out */
  $('floorHex').addEventListener('change', e=>{ e.target.value=L().room.floor; e.target.classList.remove('bad'); transact('room'); });
  $('floorHex').addEventListener('blur', e=>{ e.target.value=L().room.floor; e.target.classList.remove('bad'); });
  $('trimOn').addEventListener('change', e=>transact('room', ()=>{ L().room.trimOn=e.target.checked; }));

  $('btnPreRect').addEventListener('click', ()=>{
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
  });
  $('btnPreL').addEventListener('click', ()=>{
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
  });
  $('btnDrawCustom').addEventListener('click', ()=>{
    if(drawState.value) cancelCustomDraw(); else startCustomDraw();   // starting stops every other tool
  });

  $('snapSel').addEventListener('change', e=>transact('prefs', ()=>{ S.snap=e.target.value; }, {canvas:false}));
  $('zoomSpeedSel').addEventListener('change', e=>transact('prefs', ()=>{ S.zoomSpeed=parseFloat(e.target.value)||1; }, {canvas:false}));
  $('showSwing').addEventListener('change', e=>transact('prefs', ()=>{ S.showSwing=e.target.checked; }));
  $('showWalk').addEventListener('change', e=>transact('prefs', ()=>{ S.showWalk=e.target.checked; }));
  $('showMeasure').addEventListener('change', e=>transact('prefs', ()=>{ S.showMeasure=e.target.checked; }));
  $('showDims').addEventListener('change', e=>transact('prefs', ()=>{ S.showDims=e.target.checked; }));
  $('showOpen').addEventListener('change', e=>transact('prefs', ()=>{ S.showOpen=e.target.checked; }));
}

export {bindPaneRight};
