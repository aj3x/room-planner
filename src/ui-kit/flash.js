// @ts-check
/* Toasts. Two of them: flash() on the canvas, libFlash() on the Library and
   Marketplace tabs. Both stay up for readTime(msg). The canvas's is a
   signal its component (Toast, toast.jsx) shows; the Library's is the
   shell's #libFlash (ui-kit/modal.html). */

import {$} from './dom.js';
import {signal} from '../kernel/signals.js';
/* long enough to read: ~60ms a character, never under 1.6s or over 5s */
/** @param {unknown} msg */
const readTime = msg => Math.max(1600, Math.min(5000, String(msg).length*60));

/** What the canvas's toast says, and whether it is up (its text stays while it fades). */
const toast = signal({msg: '', on: false});
/** @type {number|undefined} */
let flashT;
/** @param {string|null|undefined} msg */
function flash(msg){
  if(!msg) return;
  toast.value = {msg, on: true};
  clearTimeout(flashT); flashT=setTimeout(()=>{ toast.value = {msg, on: false}; },readTime(msg));
}

/* ------------------------- library flash (Inventory/Marketplace tabs) ------------------------- */
/** @type {number|undefined} */
let libFlashT;
/** @param {string|null|undefined} msg @param {boolean} [warn] */
function libFlash(msg,warn){
  if(!msg) return;
  const el=$('libFlash');
  el.textContent=msg; el.classList.toggle('warn',!!warn); el.classList.add('on');
  clearTimeout(libFlashT); libFlashT=setTimeout(()=>el.classList.remove('on'),readTime(msg));
}

export {readTime, flash, libFlash, toast};
