/* The modal dialog. A plain <div>, never <dialog>/<form> — both are blocked in
   the sandboxed iframes this app may run in, which is what the banner below
   records.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   Two things stayed behind in index.html:

     the four addEventListener calls on #moCancel / #moOk / #modal — top-level
       side effects, which only boot.js may have (plan §4 rule 6). They read
       moBackFn / moOkFn / mo as live imported bindings.
     readTime — it belongs to ui/flash.js per §3, and goes there next.

   `const mo = $('modal')` is the one piece of top-level DOM access in this
   module. It is a lookup, not a mutation and not a listener; the bundle still
   runs after the document is parsed, so it resolves exactly as it did inline.

   This module and ui/tag-input.js import each other — openModal() clears
   tagInputs, mountTagField() calls $(). Both uses are inside function bodies,
   so neither is read during module evaluation and the cycle is safe. They had
   to be extracted in the same commit for that reason. */

import {esc} from './panels.js';
import {tagInputs} from './tag-input.js';

/* ------------------------- modal (no <dialog>, no <form>) ------------------------- */
const $ = id => document.getElementById(id);
const mo=$('modal');
let moOkFn=null, moCloseFn=null;
/* opts.danger styles the action as destructive, so a delete never wears the encouraging primary look.
   opts.wide widens the card for a dialog built around a picture rather than a form.
   opts.onClose runs however the modal goes away — the OK button, Cancel, the backdrop or Esc — which
   is what a dialog holding an object URL or a worker needs to clean up after itself. */
function openModal(title, bodyHTML, okLabel, onOk, onMount, opts){
  $('moTitle').textContent=title;
  tagInputs.clear();
  $('moStepper').innerHTML=(opts&&opts.stepper)||'';
  $('moStepper').hidden=!(opts&&opts.stepper);
  $('moBody').innerHTML=bodyHTML;
  $('moErr').textContent='';
  $('moOk').textContent=okLabel||'Save';
  $('moOk').hidden = !onOk;
  $('moOk').disabled = false;
  $('moOk').classList.toggle('danger', !!(opts&&opts.danger));
  $('modalCard').classList.toggle('wide', !!(opts&&opts.wide));
  $('modalCard').classList.toggle('xwide', !!(opts&&opts.xwide));
  moBackFn=(opts&&opts.onBack)||null;
  $('moCancel').textContent = moBackFn ? 'Back' : (onOk ? 'Cancel' : 'Close');
  moOkFn=onOk||null;
  moCloseFn=(opts&&opts.onClose)||null;
  mo.hidden=false;
  if(onMount) onMount();
  const f=$('moBody').querySelector('input,select,textarea');
  if(f){ f.focus(); if(f.select) try{f.select();}catch(e){} }
}
/* clear moCloseFn before running it: a handler that opens the next stage of a wizard
   must not have its own close hook fire again on the way in */
function closeModal(){ const f=moCloseFn; moCloseFn=null; mo.hidden=true; moOkFn=null; moBackFn=null; if(f) f(); }
const moError = m => { $('moErr').textContent=m; };
let moBackFn=null;

function askText(title,label,value,onOk){
  openModal(title,
    `<label class="stack-label" for="moText">${esc(label)}</label>
     <input type="text" id="moText" value="${esc(value||'')}">`, 'Save',
    ()=>{ const v=$('moText').value.trim(); if(!v){ moError('Enter a name'); return false; } onOk(v); });
}
/* every confirmation in the app guards something destructive */
function askConfirm(title,msg,okLabel,onOk){
  openModal(title, `<p>${esc(msg)}</p>`, okLabel||'Delete', ()=>onOk(), null, {danger:true});
}
function showShortcuts(){
  openModal('Keyboard shortcuts', `
    <dl class="kbd">
      <dt>Select</dt><dd>Click</dd>
      <dt>Add/remove from selection</dt><dd><kbd>Shift</kbd>+click</dd>
      <dt>Select multiple</dt><dd>Drag on empty space</dd>
      <dt>Move</dt><dd>Drag</dd>
      <dt>Duplicate &amp; drag</dt><dd><kbd>Alt</kbd>+drag (furniture only)</dd>
      <dt>Drag without snap</dt><dd><kbd>Alt</kbd>+drag</dd>
      <dt>Nudge</dt><dd><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dd>
      <dt>Turn 90°</dt><dd><kbd>R</kbd> / <kbd>Shift</kbd>+<kbd>R</kbd></dd>
      <dt>Remove</dt><dd><kbd>Del</kbd></dd>
      <dt>Pan</dt><dd><kbd>Space</kbd>+drag</dd>
      <dt>Zoom</dt><dd>Scroll / pinch</dd>
      <dt>Measure tool</dt><dd><kbd>M</kbd></dd>
      <dt>Undo / redo</dt><dd><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dd>
      <dt>Cancel / deselect</dt><dd><kbd>Esc</kbd></dd>
      <dt>This list</dt><dd><kbd>?</kbd></dd>
    </dl>`, 'Close', null);
}
/* icons come from the <symbol> sprite at the top of <body> */
const svgI = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export {$, mo, moOkFn, moBackFn, openModal, closeModal, moError,
        askText, askConfirm, showShortcuts, svgI};
