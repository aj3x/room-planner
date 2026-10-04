// @ts-check
/* Deleting a door or window — the command its Selection panel view
   (opening-props.jsx) and its list (openings-list.jsx) share. */
import {L} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {transact} from '../../kernel/tx.js';

/** @param {string} id */
function deleteOpening(id){
  transact('room', ()=>{
    L().openings=L().openings.filter(o=>o.id!==id);
    if(roomSel.value&&roomSel.value.id===id) roomSel.value = null;
  });
}
export {deleteOpening};
