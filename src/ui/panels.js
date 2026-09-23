/* Side panels: escaping text for the render* functions, and collapsing a
   section of a pane.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. It arrives in two pieces, because the two halves of the
   "panels" banner sit either side of code that cannot move yet:

     applyPanes    reads $() and svgI() -> ui/modal.js, so it arrived in the
                   second part, once ui/modal.js existed
     togglePane    calls resize()       -> canvas/view.js, a later phase, so it
                   is still in the monolith
     renderAll, setMode, renderMode and the nav listeners belong to the same
                   banner but call draw() and every render*() -> canvas/, plan/ */
import {S} from '../core/state.js';
import {save} from '../core/store.js';
import {$, svgI} from './modal.js';

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

/* ------------------------- collapsing the side panels -------------------------
   Only on wide screens: narrow ones already swap the panels with the tab bar,
   so collapsing there would leave nothing to look at. */
const wideLayout = () => !window.matchMedia('(max-width:900px)').matches;
function applyPanes(){
  const wide=wideLayout(), m=document.querySelector('main');
  const lShut = wide && !S.leftOpen, rShut = wide && !S.rightOpen;
  $('paneRoom').classList.toggle('collapsed', lShut);
  $('paneStuff').classList.toggle('collapsed', rShut);
  m.classList.toggle('lc', lShut);
  m.classList.toggle('rc', rShut);
  // the head is the button; its chevron always points the way the panel would move
  const set=(headId,chevId,shut,isLeft,name)=>{
    const h=$(headId), label=(shut?'Show ':'Hide ')+name;
    $(chevId).innerHTML = svgI((shut===isLeft) ? 'chev-r' : 'chev-l');
    h.title=label; h.setAttribute('aria-label',label);
    h.setAttribute('aria-expanded', String(!shut));
  };
  set('headLeft', 'tglLeft', lShut, true, 'the plan panel');
  set('headRight', 'tglRight', rShut, false, 'the properties panel');
}

export {esc, normSearch, applySections, toggleSection, wideLayout, applyPanes};
