// @ts-check
/* The panes' slots. A pane partial (app/html/pane-left.html,
   pane-right.html) lists its sections as empty
   `<section data-sec="…" class="for-…">` elements: where each sits, which
   mode shows it, and the key its collapsed state and its narrow-layout order
   go by. The feature that owns a section fills it — its index exports a
   `sections` map from that key to a fill function, which renders the
   section's head and body into the element and mounts what keeps it
   current. So panel work inside a feature touches no file here; a new
   section is one line in a pane partial (and, for a feature with no
   sections yet, one line below).

   fillSlots() runs from boot(), once the project is loaded and before the
   section toggles are applied (ui-kit/panels.js mountSections), since those
   set attributes on the headings the fills render. It fails loudly on a
   section no feature fills, a key two features claim, and a key with no
   section, rather than leaving a pane silently empty. */
import {sections as canvas} from '../features/canvas/host.js';
import {sections as floors} from '../features/floors/index.js';
import {sections as furniture} from '../features/furniture/index.js';
import {sections as room} from '../features/room/index.js';

/** @type {import('../ui-kit/component.js').Sections[]} */
const FEATURES = [furniture, room, floors, canvas];

function fillSlots(){
  /** @type {import('../ui-kit/component.js').Sections} */
  const fills = {};
  for(const f of FEATURES) for(const [k, fill] of Object.entries(f)){
    if(fills[k]) throw new Error(`app/slots.js: two features fill section "${k}"`);
    fills[k] = fill;
  }
  const filled = new Set();
  for(const el of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('.pane-body > section[data-sec]'))){
    const k = /** @type {string} */(el.dataset.sec);   // the selector requires it
    if(fills[k]){ fills[k](el); filled.add(k); }
    else if(!el.children.length) throw new Error(`app/slots.js: no feature fills section "${k}"`);
  }
  for(const k of Object.keys(fills)) if(!filled.has(k)) throw new Error(`app/slots.js: no section[data-sec="${k}"] in a pane for its fill`);
}

export {fillSlots};
