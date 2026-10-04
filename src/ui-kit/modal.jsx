// @ts-check
/* The modal dialog. A plain <div>, never <dialog>/<form>: both are blocked
   in the sandboxed iframes this app may run in.

   One dialog at a time. openDialog() shows it with a title, a body (a
   component, or any vnode) and the footer's choices; opening another while
   one is up replaces it, which is how the blueprint wizard steps from stage
   to stage. It renders at once (Preact's render() is synchronous), so the
   dialog is on screen, and its first box focused, when openDialog returns.

   OK runs the dialog's handler — the body's own, registered with
   useDialogOk() when the body holds what OK reads, else `onOk` — and the
   dialog closes unless the handler returns false: a refused value stays
   open over moError()'s message, and a wizard stage that has opened the
   next one returns false to keep it. `onClose` runs however the dialog goes
   away (OK, Cancel, the backdrop, Esc), and is where a dialog holding an
   object URL or a worker cleans up; `onBack` turns Cancel into Back, which
   leaves without it. Enter anywhere in the dialog but a textarea is OK.

   mountModal() is given the shell's (empty) host element by boot(). */
import {Fragment} from 'preact';
import {mountComponent} from './component.js';
import {tagInputs} from './tag-input.js';

/** @typedef {import('preact').ComponentChildren} Children */
/** What a dialog is made of.
    @typedef {{title: string, body: Children,
      ok?: string|null, onOk?: (() => unknown)|null, okDisabled?: boolean, okHidden?: boolean, danger?: boolean,
      actions?: Children, wide?: boolean, xwide?: boolean, stepper?: Children,
      onBack?: (() => void)|null, onClose?: (() => void)|null, html?: string, stepperHtml?: string}} Dialog */

/** @type {HTMLElement|null} */
let host = null;
/** @type {Dialog|null} the dialog on screen */
let cur = null;
/* Bumped on every open: the body is keyed by it, so a dialog never inherits
   the state of the one it replaced, even one made by the same component. */
let seq = 0;
let err = '';
/** @type {(() => unknown)|null} what OK runs, as the body registered it */
let bodyOk = null;

function paint(){
  if(host) mountComponent(host, cur ? <Modal d={cur} seq={seq} err={err}/> : null);
}

/** Show a dialog, replacing any that is up (without running its onClose).
    @param {Dialog} d */
function openDialog(d){
  cur = d; seq++; err = ''; bodyOk = null;
  paint();
  const f = host && /** @type {HTMLInputElement|null} */(host.querySelector('#moBody input, #moBody select, #moBody textarea'));
  if(f){ f.focus(); if(f.select) try{ f.select(); }catch(e){} }
}
/** Change what the open dialog shows — its OK button's state, its title — without touching its body.
    @param {Partial<Dialog>} patch */
function updateDialog(patch){
  if(!cur) return;
  cur = Object.assign({}, cur, patch);
  paint();
}
/* onClose is taken off before it runs: a handler that opens the next stage
   of a wizard must not have its own close hook fire again on the way in */
function closeModal(){
  const f = cur && cur.onClose;
  cur = null; bodyOk = null; err = '';
  paint();
  if(f) f();
}
/** @param {string} m */
function moError(m){ if(!cur) return; err = m; paint(); }
const isModalOpen = () => !!cur;

/** The body's OK: what the OK button (and Enter) runs while this body is
    showing. Called while the body renders, so it is always the latest
    closure over the body's state. @param {() => unknown} fn */
function useDialogOk(fn){ bodyOk = fn; }

function ok(){
  if(!cur || cur.okDisabled) return;
  const f = bodyOk || cur.onOk;
  if(!f){ closeModal(); return; }
  if(f() === false) return;
  closeModal();
}

/** @param {{d: Dialog, seq: number, err: string}} p */
function Modal({d, seq, err}){
  const hasOk = d.ok != null;
  return <div id="modal" onClick={e=>{ if(e.target===e.currentTarget) closeModal(); }}
    onKeyDown={e=>{ if(e.key==='Enter' && /** @type {Element} */(e.target).tagName!=='TEXTAREA'){ e.preventDefault(); ok(); } }}>
    <div id="modalCard" class={[d.wide&&'wide', d.xwide&&'xwide'].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby="moTitle">
      <div id="moTitle">{d.title}</div>
      {d.stepperHtml != null
        ? <div id="moStepper" hidden={!d.stepperHtml} dangerouslySetInnerHTML={{__html: d.stepperHtml}}/>
        : <div id="moStepper" hidden={!d.stepper}>{d.stepper}</div>}
      {d.html != null
        ? <div id="moBody" key={seq} dangerouslySetInnerHTML={{__html: d.html}}/>
        : <div id="moBody"><Fragment key={seq}>{d.body}</Fragment></div>}
      <div id="moFoot">
        <span id="moErr" role="alert">{err}</span>
        <button type="button" class="btn" id="moCancel" onClick={()=>{ if(d.onBack) d.onBack(); else closeModal(); }}>
          {d.onBack ? 'Back' : hasOk ? 'Cancel' : 'Close'}</button>
        <button type="button" class={'btn primary'+(d.danger?' danger':'')} id="moOk" hidden={!hasOk || !!d.okHidden} disabled={!!d.okDisabled} onClick={ok}>{d.ok}</button>
        {d.actions}
      </div>
    </div>
  </div>;
}

/* Transitional: a dialog whose body is still an HTML string, mounted by
   hand. Goes once the last such dialog is a component. */
/** @param {string} title @param {string} bodyHTML @param {string|null} [okLabel]
    @param {(() => unknown)|null} [onOk] @param {(() => void)|null} [onMount]
    @param {{danger?: boolean, wide?: boolean, xwide?: boolean, stepper?: string, onBack?: () => void, onClose?: () => void}} [opts] */
function openModal(title, bodyHTML, okLabel, onOk, onMount, opts){
  const o = opts || {};
  tagInputs.clear();
  cur = {title, body: null, html: bodyHTML, stepperHtml: o.stepper || '', ok: onOk ? (okLabel||'Save') : null, onOk: onOk||null,
    danger: o.danger, wide: o.wide, xwide: o.xwide, onBack: o.onBack||null, onClose: o.onClose||null};
  seq++; err = ''; bodyOk = null;
  paint();
  /* these dialogs change the footer by hand, which Preact does not see:
     put it back the way this one wants it */
  const okB = /** @type {HTMLButtonElement} */(document.getElementById('moOk'));
  okB.hidden = !onOk; okB.disabled = false; okB.textContent = onOk ? (okLabel||'Save') : '';
  okB.classList.toggle('danger', !!o.danger);
  /** @type {HTMLElement} */(document.getElementById('moTitle')).textContent = title;
  if(onMount) onMount();
  const f = host && /** @type {HTMLInputElement|null} */(host.querySelector('#moBody input, #moBody select, #moBody textarea'));
  if(f){ f.focus(); if(f.select) try{ f.select(); }catch(e){} }
}

/** @param {HTMLElement} el the shell's empty host for the dialog */
function mountModal(el){ host = el; paint(); }

/* ------------------------- the stock dialogs ------------------------- */
/** @param {{label: string, value: string, box: import('preact').RefObject<HTMLInputElement>}} p */
function TextAsk({label, value, box}){
  return <>
    <label class="stack-label" for="moText">{label}</label>
    <input type="text" id="moText" value={value} ref={box}/>
  </>;
}
/** @param {string} title @param {string} label @param {string|null|undefined} value @param {(v: string) => void} onOk */
function askText(title, label, value, onOk){
  /** @type {import('preact').RefObject<HTMLInputElement>} */
  const box = {current: null};
  openDialog({title, ok: 'Save', body: <TextAsk label={label} value={value||''} box={box}/>,
    onOk: ()=>{ const v=(box.current ? box.current.value : '').trim(); if(!v){ moError('Enter a name'); return false; } onOk(v); }});
}
/* every confirmation in the app guards something destructive */
/** @param {string} title @param {string} msg @param {string|null|undefined} okLabel @param {() => void} onOk */
function askConfirm(title, msg, okLabel, onOk){
  openDialog({title, ok: okLabel||'Delete', danger: true, body: <p>{msg}</p>, onOk: ()=>onOk()});
}
/** @param {{children: Children}} p */
const K = ({children}) => <kbd>{children}</kbd>;
function showShortcuts(){
  openDialog({title: 'Keyboard shortcuts', body:
    <dl class="kbd">
      <dt>Select</dt><dd>Click</dd>
      <dt>Add/remove from selection</dt><dd><K>Shift</K>+click</dd>
      <dt>Select multiple</dt><dd>Drag on empty space</dd>
      <dt>Move</dt><dd>Drag</dd>
      <dt>Duplicate &amp; drag</dt><dd><K>Alt</K>+drag (furniture only)</dd>
      <dt>Drag without snap</dt><dd><K>Alt</K>+drag</dd>
      <dt>Nudge</dt><dd><K>←</K> <K>→</K> <K>↑</K> <K>↓</K></dd>
      <dt>Turn 90°</dt><dd><K>R</K> / <K>Shift</K>+<K>R</K></dd>
      <dt>Remove</dt><dd><K>Del</K></dd>
      <dt>Pan</dt><dd><K>Space</K>+drag</dd>
      <dt>Zoom</dt><dd>Scroll / pinch</dd>
      <dt>Measure tool</dt><dd><K>M</K></dd>
      <dt>Undo / redo</dt><dd><K>Ctrl</K>+<K>Z</K> / <K>Ctrl</K>+<K>Shift</K>+<K>Z</K></dd>
      <dt>Cancel / deselect</dt><dd><K>Esc</K></dd>
      <dt>This list</dt><dd><K>?</K></dd>
    </dl>});
}

export {openModal, mountModal, openDialog, updateDialog, closeModal, moError, isModalOpen, useDialogOk, askText, askConfirm, showShortcuts};
