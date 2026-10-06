// @ts-check
/* The keyboard: a registry of shortcuts, and the one listener on `document`
   for each phase that runs them.

   A shortcut says which keys it is for (`e.key`, or `e.code` for Space; none
   means every key), which modes it works in (`modes`; none means all), how
   it ranks, and what it does. A key goes to the
   shortcuts for it from the highest priority down; `run` returning false
   passes the key on, anything else claims it and stops there. So the order
   is written as numbers, not as the order listeners happen to be added, and
   two shortcuts that could both take a key may not share a priority —
   bindShortcuts() refuses them.

   What owns the key comes in bands (KEY_ORDER): a gesture in flight (its
   Escape), Space for panning, then the live canvas tool (drawing a room, a
   wall, a split line; measuring), then commands that work in every mode
   (undo, Measure, the shortcuts list, Escape), then a mode's own (turning a
   room on a floor, deleting a part of a room), then what acts on the
   selected items. A shortcut is skipped outside its `modes`, and while the
   user is typing in a box unless it says `inFields`. A mode's keys say so
   with `modes` rather than checking S.mode in `run`: Delete belongs to the
   room's parts in Room mode and to the selected items everywhere else, and
   that is two entries with disjoint `modes`, not one that must remember to
   step aside for the other. Capture-phase shortcuts run before any element
   sees the key (closing an open menu on Escape) and form a list of their
   own.

   Features export the shortcuts they own; app/shortcuts.js collects them
   and calls bindShortcuts() once, from the shell. */

import {S} from '../kernel/state.js';

/** @typedef {{id: string, priority: number, keys?: string[], modes?: import('../kernel/types.js').Mode[],
      phase?: 'down'|'up', capture?: boolean, inFields?: boolean, run: (e: KeyboardEvent) => boolean|void}} Shortcut */

const KEY_ORDER = {gesture: 900, pan: 800, tool: 700, command: 600, mode: 500, selection: 400};

/** @param {KeyboardEvent} e */
function typing(e){
  const tag=(/** @type {Element} */(e.target).tagName||'').toLowerCase();
  return tag==='input'||tag==='textarea'||tag==='select';
}
/** @param {Shortcut} s @param {KeyboardEvent} e */
const forKey = (s, e) => !s.keys || s.keys.includes(e.key) || s.keys.includes(e.code);

/** Check, order and listen. @param {Shortcut[]} all */
function bindShortcuts(all){
  /** @param {Shortcut} s */
  const slot = s => (s.phase||'down')+(s.capture?'/capture':'');
  for(const a of all) for(const b of all){
    if(a===b || slot(a)!==slot(b) || a.priority!==b.priority) continue;
    const modes = !a.modes || !b.modes || a.modes.some(m=>/** @type {string[]} */(b.modes).includes(m));
    const overlap = modes && (!a.keys || !b.keys || a.keys.some(k=>/** @type {string[]} */(b.keys).includes(k)));
    if(overlap) throw new Error(`shortcuts "${a.id}" and "${b.id}" could both take a key at priority ${a.priority}: give one of them its own`);
  }
  const sorted = all.slice().sort((a,b)=>b.priority-a.priority);
  /** @param {'down'|'up'} phase @param {boolean} capture */
  const dispatch = (phase, capture) => {
    const list = sorted.filter(s=>(s.phase||'down')===phase && !!s.capture===capture);
    return /** @param {KeyboardEvent} e */ e => {
      const inField = typing(e);
      for(const s of list){
        if(!forKey(s, e) || (inField && !s.inFields) || (s.modes && !s.modes.includes(S.mode))) continue;
        if(s.run(e)!==false) return;
      }
    };
  };
  document.addEventListener('keydown', dispatch('down', true), true);
  document.addEventListener('keydown', dispatch('down', false));
  document.addEventListener('keyup', dispatch('up', false));
}

export {KEY_ORDER, bindShortcuts};
