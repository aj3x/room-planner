// @ts-check
/* Side panels: text helpers for the render* functions (esc is ui-kit/dom.js's,
   re-exported here), and collapsing a section of a pane or a whole pane.

   Which sections are shut is an effect on the settings (mountSections), so
   toggleSection only commits the change. Collapsing a whole pane is driven
   by the mode effect (features/mode/mode.js), because it changes the canvas's size
   and setMode/togglePane resize the canvas after it. */
import {S} from '../kernel/state.js';
import {transact} from '../kernel/tx.js';
import {$, esc, svgI} from './dom.js';
import {effect, rev} from '../kernel/signals.js';

/** @param {number} n @param {string} w */
const plural = (n,w) => n+' '+w+(n===1?'':'s');
/** @param {string} msg */
const emptyRow = msg => `<li class="list-empty"><div class="empty">${msg}</div></li>`;
/* strip diacritics so "a" also finds "ä", "café" also finds "cafe", etc. */
/** @param {unknown} s */
function normSearch(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }

/* ------------------------- collapsing sections ------------------------- */
function applySections(){
  for(const sec of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('.pane-body section[data-sec]'))){
    const shut=S.secClosed.includes(/** @type {string} */(sec.dataset.sec));   // the selector requires it
    sec.classList.toggle('collapsed', shut);
    const h=/** @type {HTMLElement|null} */(sec.querySelector('.sec-head h2'));
    if(h){ h.tabIndex=0; h.setAttribute('role','button'); h.setAttribute('aria-expanded', String(!shut)); }
  }
}
/** @param {Element} h a section's heading */
function toggleSection(h){
  const k=/** @type {string} */(/** @type {HTMLElement} */(h.closest('section[data-sec]')).dataset.sec);   // every heading is in one
  transact('prefs', ()=>{ S.secClosed = S.secClosed.includes(k) ? S.secClosed.filter(x=>x!==k) : S.secClosed.concat(k); }, {canvas:false});
}
/* Which sections are shut, as an effect on the settings. */
function mountSections(){
  effect(() => { rev.prefs.value; rev.project.value; applySections(); });
}

/* ------------------------- collapsing the side panels -------------------------
   Only on wide screens: narrow ones already swap the panels with the tab bar,
   so collapsing there would leave nothing to look at. */
const wideLayout = () => !window.matchMedia('(max-width:900px)').matches;
function applyPanes(){
  const wide=wideLayout(), m=/** @type {HTMLElement} */(document.querySelector('main'));   // the shell's
  const lShut = wide && !S.leftOpen, rShut = wide && !S.rightOpen;
  $('paneRoom').classList.toggle('collapsed', lShut);
  $('paneStuff').classList.toggle('collapsed', rShut);
  m.classList.toggle('lc', lShut);
  m.classList.toggle('rc', rShut);
  // the head is the button; its chevron always points the way the panel would move
  const set=(/** @type {string} */headId,/** @type {string} */chevId,/** @type {boolean} */shut,/** @type {boolean} */isLeft,/** @type {string} */name)=>{
    const h=$(headId), label=(shut?'Show ':'Hide ')+name;
    $(chevId).innerHTML = svgI((shut===isLeft) ? 'chev-r' : 'chev-l');
    h.title=label; h.setAttribute('aria-label',label);
    h.setAttribute('aria-expanded', String(!shut));
  };
  set('headLeft', 'tglLeft', lShut, true, 'the plan panel');
  set('headRight', 'tglRight', rShut, false, 'the properties panel');
}

export {esc, plural, emptyRow, normSearch, applySections, mountSections, toggleSection, wideLayout, applyPanes};
