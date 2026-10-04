/* The View section's switches: snap size, zoom speed and what the plan
   shows. Bound by the section's fill (sections.jsx) once its markup is on
   the page; mountViewPrefs (view-prefs.js) sets them from S. */

import { S } from '../../kernel/state.js';
import { transact } from '../../kernel/tx.js';
import { $ } from '../../ui-kit/modal.js';

function bindViewSection(){
  $('snapSel').addEventListener('change', e=>transact('prefs', ()=>{ S.snap=e.target.value; }, {canvas:false}));
  $('zoomSpeedSel').addEventListener('change', e=>transact('prefs', ()=>{ S.zoomSpeed=parseFloat(e.target.value)||1; }, {canvas:false}));
  $('showSwing').addEventListener('change', e=>transact('prefs', ()=>{ S.showSwing=e.target.checked; }));
  $('showWalk').addEventListener('change', e=>transact('prefs', ()=>{ S.showWalk=e.target.checked; }));
  $('showMeasure').addEventListener('change', e=>transact('prefs', ()=>{ S.showMeasure=e.target.checked; }));
  $('showDims').addEventListener('change', e=>transact('prefs', ()=>{ S.showDims=e.target.checked; }));
  $('showOpen').addEventListener('change', e=>transact('prefs', ()=>{ S.showOpen=e.target.checked; }));
}

export {bindViewSection};
