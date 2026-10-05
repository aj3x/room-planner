// @ts-check
/* Side panels: text helpers for lists (plural, normSearch), collapsing a
   section of a pane or a whole pane, and which half of the page shows.

   Which sections are shut is an effect on the settings (mountSections), so
   toggleSection only commits the change. Collapsing a whole pane is driven
   by the mode effect (features/mode/mode.js), because it changes the canvas's size
   and setMode/togglePane resize the canvas after it. */
import {S} from '../kernel/state.js';
import {transact} from '../kernel/tx.js';
import {$} from './dom.js';
import {effect, rev, signal} from '../kernel/signals.js';

/** @param {number} n @param {string} w */
const plural = (n,w) => n+' '+w+(n===1?'':'s');
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
  const sec=/** @type {HTMLElement|null} */(h.closest('.pane-body section[data-sec]'));
  if(!sec) return;
  const k=/** @type {string} */(sec.dataset.sec);   // the selector requires it
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
/** Which side panels are shut, as applyPanes() last left them; the pane heads (PaneHead, parts.jsx) show it. */
const paneShut = signal({left: false, right: false});
function applyPanes(){
  const wide=wideLayout(), m=/** @type {HTMLElement} */(document.querySelector('main'));   // the shell's
  const lShut = wide && !S.leftOpen, rShut = wide && !S.rightOpen;
  $('paneRoom').classList.toggle('collapsed', lShut);
  $('paneStuff').classList.toggle('collapsed', rShut);
  m.classList.toggle('lc', lShut);
  m.classList.toggle('rc', rShut);
  if(paneShut.value.left!==lShut || paneShut.value.right!==rShut) paneShut.value = {left: lShut, right: rShut};
}

/** The Library page (#paneLibrary) in place of the plan (<main>), or the plan with its panes.
    @param {boolean} lib */
function showLibrary(lib){
  /** @type {HTMLElement} */(document.querySelector('main')).style.display = lib ? 'none' : '';   // the shell's
  $('paneLibrary').classList.toggle('on', lib);
  if(!lib) applyPanes();
}

export {showLibrary, plural, normSearch, applySections, mountSections, toggleSection, wideLayout, applyPanes, paneShut};
