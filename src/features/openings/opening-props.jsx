// @ts-check
/* The Selection panel's view of a door or a window, as a component. The
   Selection panel (room/sections.jsx) renders it under openingTitle() and
   re-renders it whenever the room or the unit changes.

   Committing the wall, the width, the corner it is measured from or the
   offset commits all four as the form shows them, as reading the boxes back
   did: so choosing the other corner keeps the offset's number and moves the
   door to it. */
import {S, L, RP, openOf} from '../../kernel/state.js';
import {fmtLen, parseLen} from '../../kernel/units.js';
import {transact} from '../../kernel/tx.js';
import {KIND, openingDispOffset, setOpeningDispOffset} from '../../kernel/model/openings.js';
import {clampOpenings, wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {Field, Select} from '../../ui-kit/parts.jsx';
import {deleteOpening} from './openings-panel.js';

/** @typedef {import('../../kernel/types.js').Opening} Opening */

/** The Selection panel's title for an opening, or null when it has gone.
    @param {string} id */
function openingTitle(id){
  const o=openOf(id);
  return o ? KIND(o) : null;
}

/** @param {{id: string}} p */
function OpeningProps({id}){
  const o=/** @type {Opening} */(openOf(id));   // openingTitle() said it is there
  const len=wallOf(o.wall).len;
  o.corner = o.corner==='ccw' ? 'ccw' : 'cw';
  const isDoor=o.kind==='door';
  const hingeBits = isDoor && (o.dtype==='hinge'||o.dtype==='bifold');
  const cur={wall:String(o.wall), w:fmtLen(o.width,S.unit), corner:o.corner, off:fmtLen(openingDispOffset(o,len),S.unit)};
  /** @param {Partial<typeof cur>} ch */
  const go=ch=>{
    const v={...cur, ...ch};
    const wv=parseLen(v.w,S.unit), ov=parseLen(v.off,S.unit);
    transact('room', ()=>{
      o.wall=+v.wall;
      o.corner=v.corner==='ccw'?'ccw':'cw';
      const l2=wallOf(o.wall).len;
      if(isFinite(wv)&&wv>=100) o.width=Math.min(wv,l2);
      if(isFinite(ov)) setOpeningDispOffset(o,l2,ov);
      clampOpenings();
    });
  };
  return <>
    <div class="field"><label for="oWall">Wall</label><Select id="oWall" value={cur.wall} onCommit={t=>go({wall:t})}>
      {RP().map((_,i)=>wallIsOff(L().room,i)&&i!==o.wall ? null : <option key={i} value={String(i)}>{'Wall '+(i+1)}</option>)}
    </Select></div>
    <div class="field"><label for="oW">Width</label><Field class="len" id="oW" value={cur.w} onCommit={t=>go({w:t})}/></div>
    <div class="field"><label for="oCorner">From</label><Select id="oCorner" value={cur.corner} onCommit={t=>go({corner:/** @type {'cw'|'ccw'} */(t)})}>
      <option value="cw">Near corner</option>
      <option value="ccw">Far corner</option></Select></div>
    <div class="field"><label for="oOff">Offset</label><Field class="len" id="oOff" value={cur.off} onCommit={t=>go({off:t})}/></div>
    {isDoor ? <>
      <div class="field"><label for="oType">Type</label><Select id="oType" value={o.dtype} onCommit={t=>transact('room', ()=>{ o.dtype=/** @type {Opening['dtype']} */(t); })}>
        <option value="hinge">Hinged</option>
        <option value="bifold">Bi-fold</option>
        <option value="slide">Sliding</option>
        <option value="open">Open doorway</option></Select></div>
      <div hidden={!hingeBits}>
        <div class="field"><label for="oHinge">Hinge</label><Select id="oHinge" value={o.hinge||'start'} onCommit={t=>transact('room', ()=>{ o.hinge=/** @type {Opening['hinge']} */(t); })}>
          <option value="start">Near corner</option>
          <option value="end">Far corner</option></Select></div>
        <div class="field"><label for="oSwing">Swings</label><Select id="oSwing" value={o.swing||'in'} onCommit={t=>transact('room', ()=>{ o.swing=/** @type {Opening['swing']} */(t); })}>
          <option value="in">Into room</option>
          <option value="out">Out of room</option></Select></div>
      </div>
    </> : <>
      <div class="field"><label for="oSill">Sill height</label><Field class="len" id="oSill" value={fmtLen(o.sill||900,S.unit)} onCommit={t=>{
        const v=parseLen(t,S.unit);
        transact('room', ()=>{ o.sill = isFinite(v) ? v : 900; });
      }}/></div>
      <p class="hint">Sill height is a note for you; it doesn't change the plan.</p>
    </>}
    <p class="hint">{`Wall ${o.wall+1} is ${fmtLen(len,S.unit)} long. Drag the circle in the plan to slide it along, or onto another wall.`}</p>
    <div class="row actions"><button class="btn sm danger" onClick={()=>deleteOpening(o.id)}>Delete</button></div>
  </>;
}

export {openingTitle, OpeningProps};
