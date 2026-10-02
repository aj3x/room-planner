/* mountPanel(): run a panel's render as an effect, without rebuilding a field
   while the user is typing in it.

   `deps()` reads the signals the panel shows (core/signals.js `rev.*`,
   `pref(...)`, the selection); `render()` may read more, and those are
   tracked too. Either changing re-runs the render. Nothing that changes the
   project names the panel: it subscribes.

   The focus rule. A render rebuilds its markup (innerHTML) or resets field
   values, so running one mid-keystroke would throw away what is being typed —
   a hex code half-entered in the floor colour box, which commits on every
   `input`. So a render that arrives while a text-entry control inside `root`
   has focus is held, and it runs as soon as the user is done with that
   field, which is the first of:
     - `change` inside `root`: the field committed (Enter, or leaving it). The
       panel then shows what the model holds — including when the edit was
       refused and nothing changed, so a value the model turned down does not
       stay on screen;
     - a click inside `root` on anything but the focused field (a button in
       the panel: Safari does not move focus to a clicked button);
     - focus leaving `root`.
   Moving focus between fields inside `root` keeps a hold, so tabbing through
   a form does not tear it down under the next field. When a render rebuilds
   the field that had focus, focus goes back to its replacement (same id), so
   Enter in a field, or stepping a select with the arrow keys, keeps your
   place. A checkbox, colour swatch or button never holds.

   `root` is the smallest element whose fields the render rewrites — the list
   for a list, the section for a form — and not the whole pane: the item
   search box sits outside #invList so that typing in it can still refilter
   the list live. A null root never holds.

   Mount functions call this from boot(), after the saved project is loaded
   and the DOM exists; never at import time. */

import {effect, signal} from '../core/signals.js';

const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=color])'
             + ':not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file])';

function typingIn(root){
  const a = root && document.activeElement;
  return !!a && root.contains(a) && a.matches(TYPING);
}

function mountPanel(root, deps, render){
  const el = typeof root === 'string' ? document.getElementById(root) : root;
  const retry = signal(0);
  let held = false, force = false;
  function release(){ if(held){ held = false; force = true; retry.value++; } }
  if(el){
    el.addEventListener('change', release);
    el.addEventListener('click', e => { if(e.target !== document.activeElement) release(); });
    el.addEventListener('focusout', e => { if(!(e.relatedTarget && el.contains(e.relatedTarget))) release(); });
  }
  return effect(() => {
    retry.value;
    deps();
    if(!force && typingIn(el)){ held = true; return; }
    force = held = false;
    const a = el && document.activeElement, id = a && el.contains(a) && a.id;
    render();
    if(id && !el.contains(document.activeElement)){
      const n = document.getElementById(id);
      if(n && el.contains(n)) n.focus();
    }
  });
}

export {mountPanel};
