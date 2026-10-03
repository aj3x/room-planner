// @ts-check
/* The Room pane's two little input helpers: the length field binding every
   dimension box uses, and the floor-colour swatch.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added. The listeners around them stay in index.html, per
   rule 6.
*/
import {L, S} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {parseLen} from '../../kernel/units.js';
import {$} from '../../ui-kit/modal.js';

/** @typedef {import('../../ui-kit/dom.js').FieldEvent} FieldEvent */
/* ------------------------- room controls ------------------------- */
/** @param {string} id a length field @param {(mm: number) => void} set */
function bindLen(id,set){
  $(id).addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const mm=parseLen(e.target.value,S.unit);
    transact('room', ()=>{ if(isFinite(mm)&&mm>0) set(mm); });
  });
}

/* Called on every `input` of the colour picker, so it is no undo step of its
   own; the next room commit carries it. */
/** @param {string} hex */
function setFloorColor(hex){ transact('room', ()=>{ L().room.floor=hex; }, {history:false}); $('floorCol').value=hex; }
export {bindLen, setFloorColor};
