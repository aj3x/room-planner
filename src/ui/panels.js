/* Side panels: escaping text for the render* functions, and collapsing a
   section of a pane.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. It arrives in two pieces, because the two halves of the
   "panels" banner sit either side of code that cannot move yet:

     applyPanes    reads $() and svgI() -> ui/modal.js, so it follows later
     togglePane    calls resize()       -> canvas/view.js, a later phase
     wideLayout    only applyPanes and togglePane use it, so it waits with them
     renderAll, setMode, renderMode and the nav listeners belong to the same
                   banner but call draw() and every render*() -> canvas/, plan/ */
import {S} from '../core/state.js';
import {save} from '../core/store.js';

function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
/* strip diacritics so "a" also finds "ä", "café" also finds "cafe", etc. */
function normSearch(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }

/* ------------------------- collapsing sections ------------------------- */
function applySections(){
  for(const sec of document.querySelectorAll('.pane-body section[data-sec]')){
    const shut=S.secClosed.includes(sec.dataset.sec);
    sec.classList.toggle('collapsed', shut);
    const h=sec.querySelector('.sec-head h2');
    if(h){ h.tabIndex=0; h.setAttribute('role','button'); h.setAttribute('aria-expanded', String(!shut)); }
  }
}
function toggleSection(h){
  const k=h.closest('section[data-sec]').dataset.sec;
  S.secClosed = S.secClosed.includes(k) ? S.secClosed.filter(x=>x!==k) : S.secClosed.concat(k);
  applySections(); save();
}

export {esc, normSearch, applySections, toggleSection};
