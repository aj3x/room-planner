// @ts-check
/* The reactive core: what a view subscribes to so that nothing which changes
   the project has to know which views exist.

   A view (a side panel, the canvas, the undo buttons) runs inside an `effect`
   and reads the signals it depends on; when one of them changes, it runs
   again. A mutation writes state and stops there: transact() (kernel/tx.js)
   bumps the revision of the scope it touched, the selection setters write
   their signals (kernel/selection.js), and the effects that read those decide
   for themselves whether they are stale.

   The document itself, S, is not made of signals. It is serialised whole by
   save(), replaced whole on load and import, and mutated in place everywhere,
   so it is observed by scope instead: `rev[scope]` is a counter transact()
   bumps once per commit (and preview() once per gesture frame) for each scope
   the edit touched. A panel that shows room geometry reads `rev.room.value`
   and that is its whole subscription. `planRev` is the canvas's: transact()
   bumps it unless every call in the commit passed {canvas:false}.

   `pref(key)` narrows that for the few view settings panels read (unit, mode):
   a computed over rev.prefs that only notifies when that one key's value
   changed, so typing in the item search box (a prefs edit) does not repaint
   every panel that formats a length. Primitive keys only — an array pref is
   mutated in place and would compare equal to itself.

   Effects run synchronously when a signal they read is written, unless the
   write is inside batch(); transact() batches, so a panel never renders
   halfway through an edit. Effects are created by mount functions called
   from boot(), never at import time — a unit test that imports a panel module
   gets no effect and no DOM work. */

import {batch, computed, effect, signal, untracked} from '@preact/signals-core';
import {S} from './state.js';

/** @typedef {import('./types.js').Scope} Scope */
/** @type {readonly Scope[]} */
const SCOPES = ['room','furn','floor','lib','prefs','project'];
const rev = /** @type {Record<Scope, import('@preact/signals-core').Signal<number>>} */(Object.fromEntries(SCOPES.map(s => [s, signal(0)])));   // fromEntries cannot say its keys are exactly SCOPES
const planRev = signal(0);
/* Whether boot() has put the saved project into S. Views that are on the
   page before then (the pane sections, filled ahead of the storage read so
   their headings show at once) render their contents only once it is true. */
const loaded = signal(false);

/* Mark `scopes` changed, and the plan stale if `canvas`. One batch, so a view
   that reads several of them runs once. */
/** @param {Iterable<Scope>} scopes @param {boolean} canvas */
function bump(scopes, canvas){
  batch(() => {
    for(const s of scopes) rev[s].value++;
    if(canvas) planRev.value++;
  });
}

/** @type {Map<string, import('@preact/signals-core').ReadonlySignal<unknown>>} */
const prefs = new Map();
/** @template {keyof import('./types.js').State} K @param {K} key @returns {import('./types.js').State[K]} */
function pref(key){
  let c = prefs.get(key);
  if(!c){ c = computed(() => { rev.prefs.value; rev.project.value; return S[key]; }); prefs.set(key, c); }
  return /** @type {import('./types.js').State[K]} */(c.value);   // the Map is keyed by K; one computed per key
}

/* A message for the person from code that does not own a toast: the domain
   layer refusing an edit (tryRoomEdit). report() writes it; the app shows it
   (app/boot.js mounts the effect that flashes it). A fresh object each time, so
   the same message twice is still two notices. */
/** @type {import('@preact/signals-core').Signal<{msg: string}|null>} */
const notice = signal(null);
/** @param {string} msg */
function report(msg){ notice.value = {msg}; }

export {SCOPES, rev, planRev, loaded, bump, pref, notice, report, batch, computed, effect, signal, untracked};
