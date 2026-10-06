// @ts-check
/* Replacing the room's outline: the Room section's three buttons (a
   rectangle or an L-shape typed in, or drawn by hand). The two typed ones
   are dialogs. */
import {parseLen, fmtLen} from '../../kernel/units.js';
import {shapePoly, bbox} from '../../kernel/geometry.js';
import {rectPts, S, L, RP} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {transact} from '../../kernel/tx.js';
import {syncWallOff, clampOpenings} from '../../kernel/model/walls.js';
import {moError, openDialog} from '../../ui-kit/modal.jsx';
import {drawState, fit} from '../canvas/index.js';
import {startCustomDraw, cancelCustomDraw} from './room-draw.js';

/** A length box in an outline dialog, read through `box` when OK is pressed.
    @param {{id: string, label: string, value: string, box: import('preact').RefObject<HTMLInputElement>}} p */
function LenField({id, label, value, box}){
  return <div class="field"><label for={id}>{label}</label><input type="text" class="len" id={id} value={value} ref={box}/></div>;
}
/** @returns {import('preact').RefObject<HTMLInputElement>} */
const box = () => ({current: null});
/** @param {import('preact').RefObject<HTMLInputElement|HTMLSelectElement>} r */
const read = r => r.current ? r.current.value : '';

function presetRect(){
    const b=bbox(RP());
    const w=box(), d=box();
    openDialog({title: 'Rectangular room', ok: 'Use this shape', body: <>
      <LenField id="pW" label="Width" value={fmtLen(b.w,S.unit)} box={w}/>
      <LenField id="pD" label="Depth" value={fmtLen(b.h,S.unit)} box={d}/>
      <p class="hint">This replaces the current outline. Doors and windows move to the nearest wall.</p>
    </>, onOk: ()=>{
        const wv=parseLen(read(w),S.unit), dv=parseLen(read(d),S.unit);
        if(!isFinite(wv)||!isFinite(dv)||wv<500||dv<500){ moError('Give a width and depth of at least 500 mm'); return false; }
        transact('room', ()=>{
          L().room.points=rectPts(wv,dv);
          L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
          clampOpenings(); roomSel.value = null;
        });
        fit();
    }});
}
function presetL(){
    const b=bbox(RP());
    const w=box(), d=box(), cw=box(), cd=box();
    /** @type {import('preact').RefObject<HTMLSelectElement>} */
    const corner={current: null};
    openDialog({title: 'L-shaped room', ok: 'Use this shape', body: <>
      <LenField id="pW" label="Width" value={fmtLen(b.w,S.unit)} box={w}/>
      <LenField id="pD" label="Depth" value={fmtLen(b.h,S.unit)} box={d}/>
      <LenField id="pCW" label="Notch across" value={fmtLen(b.w/3,S.unit)} box={cw}/>
      <LenField id="pCD" label="Notch down" value={fmtLen(b.h/3,S.unit)} box={cd}/>
      <div class="field"><label for="pC">Notch at</label><select id="pC" ref={corner}>
        <option value="ne">Top right</option><option value="nw">Top left</option>
        <option value="se">Bottom right</option><option value="sw">Bottom left</option></select></div>
    </>, onOk: ()=>{
        const wv=parseLen(read(w),S.unit), dv=parseLen(read(d),S.unit);
        const cwv=parseLen(read(cw),S.unit), cdv=parseLen(read(cd),S.unit);
        if(![wv,dv,cwv,cdv].every(v=>isFinite(v)&&v>100)){ moError('Fill in all four measurements'); return false; }
        if(cwv>=wv-100||cdv>=dv-100){ moError('The notch has to be smaller than the room'); return false; }
        transact('room', ()=>{
          L().room.points=shapePoly({type:'lshape',w:wv,d:dv,cw:cwv,cd:cdv,corner:/** @type {'nw'|'ne'|'se'|'sw'} */(read(corner))}).map(([x,y])=>[x+wv/2,y+dv/2]);   // the select's four options
          L().room.wallOff=[]; syncWallOff(L().room);   // a new outline starts with every wall in place
          clampOpenings(); roomSel.value = null;
        });
        fit();
    }});
}
function toggleCustomDraw(){
  if(drawState.value) cancelCustomDraw(); else startCustomDraw();   // starting stops every other tool
}

export {presetRect, presetL, toggleCustomDraw};
