/* The modal shell's wiring: the footer's two buttons, and the two ways to
   dismiss a dialog without them — a click on the backdrop, and Enter.

   One of the per-pane bind modules; src/bind/header.js carries the full
   rationale for the pattern. The short version: each src/html/ partial ends
   with a module script that imports its bind function and calls it, so a pane's
   markup and the list of things listening to it sit in the same file, and it is
   a function rather than registrations at import time because nothing in src/
   may have a top-level side effect.

   Ordering: mo's two listeners are both here and in index.html's order, which
   is what registration order can actually decide. */

import { mo, moOkFn, moBackFn, closeModal, $ } from './modal.js';

function bindModal(){
  /* a wizard's Back replaces the footer's meaning of "leave" with "go to the previous
     step" — it must not run the dialog's onClose, unlike Cancel/Esc/backdrop */
  $('moCancel').addEventListener('click', ()=>{ if(moBackFn) moBackFn(); else closeModal(); });
  $('moOk').addEventListener('click', ()=>{ if(!moOkFn) return closeModal(); if(moOkFn()===false) return; closeModal(); });
  mo.addEventListener('click', e=>{ if(e.target===mo) closeModal(); });
  mo.addEventListener('keydown', e=>{
    if(e.key==='Enter' && e.target.tagName!=='TEXTAREA'){ e.preventDefault(); $('moOk').click(); }
  });
}

export {bindModal};
