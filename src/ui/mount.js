/* mountPanel(): run a panel's render as an effect, without rebuilding a field
   the user is typing in.

   `deps()` reads the signals the panel shows (core/signals.js `rev.*`,
   `pref(...)`, the selection); `render()` may read more, and those are
   tracked too. Either changing re-runs the render. Nothing that changes the
   project names the panel: it subscribes.

   The focus rule. A render rebuilds its markup (innerHTML) or resets field
   values, so running one under the caret would throw away what is being
   typed — the hex code half-entered in the floor colour box, the name in an
   inline rename, a select being stepped through with the arrow keys. So
   while a text-entry control inside `root` has focus, the render is held,
   and it runs once focus leaves `root` (moving between fields inside it
   keeps holding, so tabbing through a form does not tear it down under the
   next field). A checkbox, colour swatch or button does not hold: those are
   not typed into, and the panel should answer them at once (the Baseboard
   tick enabling its depth box).

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
  let held = false;
  function release(e){
    if(e.relatedTarget && el.contains(e.relatedTarget)) return;   // still working inside the panel
    el.removeEventListener('focusout', release);
    held = false;
    retry.value++;
  }
  return effect(() => {
    retry.value;
    deps();
    if(typingIn(el)){
      if(!held){ held = true; el.addEventListener('focusout', release); }
      return;
    }
    if(held){ held = false; el.removeEventListener('focusout', release); }
    render();
  });
}

export {mountPanel};
