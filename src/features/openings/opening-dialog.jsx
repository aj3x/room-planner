// @ts-check
/* The door/window editor: a new one on a wall, or one already in the room. */
import {useState} from 'preact/hooks';
import {roomSel} from '../../kernel/selection.js';
import {L, RP, S, openOf, roomMode, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fmtLen, parseLen} from '../../kernel/units.js';
import {KIND, openingDispOffset} from '../../kernel/model/openings.js';
import {wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {moError, openDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {setMode} from '../mode/index.js';

/** @typedef {import('../../kernel/types.js').Opening} Opening */
/** @typedef {import('preact').RefObject<HTMLInputElement>} BoxRef */
/** @typedef {import('preact').RefObject<HTMLSelectElement>} PickRef */

/* ------------------------- opening dialog ------------------------- */
/* The door's type, and the hinge and swing that only mean something for a
   hinged or bi-fold door. The only part of the dialog that changes as you
   use it, so the only part with state: the boxes around it are rendered
   once and are the user's from then on. */
/** @param {{type: string, hingeAt: string, swingTo: string, typeBox: PickRef, hinge: PickRef, swing: PickRef}} p what the door is to start with */
function DoorType({type, hingeAt, swingTo, typeBox, hinge, swing}){
  const [dtype, setDtype] = useState(type);
  return <>
    <div class="field"><label for="dType">Type</label><select id="dType" ref={typeBox} value={dtype} onChange={e=>setDtype(/** @type {Opening['dtype']} */(e.currentTarget.value))}>
      <option value="hinge">Hinged</option><option value="bifold">Bi-fold</option><option value="slide">Sliding</option><option value="open">Open doorway</option></select></div>
    <div id="hingeBits" hidden={dtype!=='hinge' && dtype!=='bifold'}>
      <div class="field"><label for="dHinge">Hinge</label><select id="dHinge" ref={hinge}>
        <option value="start" selected={hingeAt==='start'}>Near corner</option><option value="end" selected={hingeAt==='end'}>Far corner</option></select></div>
      <div class="field"><label for="dSwing">Swings</label><select id="dSwing" ref={swing}>
        <option value="in" selected={swingTo==='in'}>Into room</option><option value="out" selected={swingTo==='out'}>Out of room</option></select></div>
    </div>
  </>;
}

/* Rendered once, as the dialog's body: its boxes are the user's from then
   on, and OK reads them. */
/** @param {{id: string|null, kind: 'door'|'window', wi: number}} p the opening (none for a new one), its kind and its wall */
function OpeningBody({id, kind, wi}){
  const o = id ? openOf(id) : null;
  const k = kind;
  const corner = o?(o.corner==='ccw'?'ccw':'cw'):'cw';
  const dispOff = o ? openingDispOffset(o, wallOf(wi).len) : 600;
  /* what OK reads */
  const boxes = {wall: /** @type {PickRef} */({current: null}), width: /** @type {BoxRef} */({current: null}),
    corner: /** @type {PickRef} */({current: null}), offset: /** @type {BoxRef} */({current: null}),
    type: /** @type {PickRef} */({current: null}), hinge: /** @type {PickRef} */({current: null}),
    swing: /** @type {PickRef} */({current: null}), sill: /** @type {BoxRef} */({current: null})};
  /** @param {{current: HTMLInputElement|HTMLSelectElement|null}} r */
  const read = r => r.current ? r.current.value : '';
  useDialogOk(() => {
    const wall=+read(boxes.wall), len=wallOf(wall).len;
    let width=parseLen(read(boxes.width),S.unit);
    const cnr=read(boxes.corner)==='ccw'?'ccw':'cw';
    let dispOffset=parseLen(read(boxes.offset),S.unit);
    if(!isFinite(width)||width<100){ moError('Give it a width of at least 100 mm'); return false; }
    if(width>len){ moError('That is wider than the wall ('+fmtLen(len,S.unit)+')'); return false; }
    if(!isFinite(dispOffset)) dispOffset=0;
    let offset = cnr==='ccw' ? (len-width-dispOffset) : dispOffset;
    offset=Math.max(0,Math.min(offset,len-width));
    /** @type {Opening} */
    const rec={
      id:id||uid(), kind:k, wall, width, offset, corner:cnr,
      dtype: k==='door' ? /** @type {Opening['dtype']} */(read(boxes.type)) : 'open',   // the select's options
      hinge: k==='door' ? /** @type {Opening['hinge']} */(read(boxes.hinge)) : 'start',   // the select's options
      swing: k==='door' ? /** @type {Opening['swing']} */(read(boxes.swing)) : 'in',      // the select's options
      sill:  k==='window' ? (parseLen(read(boxes.sill),S.unit)||900) : undefined
    };
    transact('room', ()=>{
      if(id){ const i=L().openings.findIndex(x=>x.id===id); L().openings[i]=rec; }
      else L().openings.push(rec);
      roomSel.value = {kind:'opening', id:rec.id};
      if(!roomMode()) setMode('room');
    });
  });
  return <>
    <div class="field"><label for="dWall">Wall</label><select id="dWall" ref={boxes.wall}>{RP().map((_,i)=>wallIsOff(L().room,i)&&i!==wi ? null
      : <option key={i} value={i} selected={i===wi}>{'Wall '+(i+1)+' ('+fmtLen(wallOf(i).len,S.unit)+')'}</option>)}</select></div>
    <div class="field"><label for="dWidth">Width</label><input type="text" class="len" id="dWidth" ref={boxes.width} value={fmtLen(o?o.width:(k==='window'?1200:813),S.unit)}/></div>
    <div class="field"><label for="dCorner">From</label><select id="dCorner" ref={boxes.corner}>
      <option value="cw" selected={corner==='cw'}>Near corner (clockwise)</option>
      <option value="ccw" selected={corner==='ccw'}>Far corner (counter-clockwise)</option></select></div>
    <div class="field"><label for="dOffset">Offset</label><input type="text" class="len" id="dOffset" ref={boxes.offset} value={fmtLen(dispOff,S.unit)}/></div>
    {k==='door' ? <>
      <DoorType type={o ? o.dtype : 'hinge'} hingeAt={(o && o.hinge)||'start'} swingTo={(o && o.swing)||'in'} typeBox={boxes.type} hinge={boxes.hinge} swing={boxes.swing}/>
    </> : <>
      <div class="field"><label for="dSill">Sill height</label><input type="text" class="len" id="dSill" ref={boxes.sill} value={fmtLen(o&&o.sill?o.sill:900,S.unit)}/></div>
      <p class="hint">Sill height is a note for you; it doesn't change the plan.</p>
    </>}
    <p class="hint">The offset is measured along the wall from the corner you pick. You can also drag it in the plan.</p>
  </>;
}

/** New (no id) or edit an opening. @param {string|null} [id] @param {'door'|'window'} [kind] @param {number} [wallIdx] */
function openingDialog(id, kind, wallIdx){
  const o = id?openOf(id):null;
  const k = o?o.kind:(kind||'door');
  const wi = o?o.wall:(wallIdx!==undefined?wallIdx:0);
  openDialog({title: o?('Edit '+KIND(o).toLowerCase()):(k==='window'?'Add window':'Add door'), ok: 'Save',
    body: <OpeningBody id={o ? o.id : null} kind={k} wi={wi}/>});
}
export {openingDialog};
