/* The Stock section's count scope. Bound by the section's fill
   (sections.jsx) once its markup is on the page. */

import { S } from '../../kernel/state.js';
import { transact } from '../../kernel/tx.js';
import { $ } from '../../ui-kit/modal.js';

function bindStockSection(){
  $('invScope').addEventListener('change', e=>transact('prefs', ()=>{ S.invScope=e.target.value; }, {canvas:false}));
}

export {bindStockSection};
