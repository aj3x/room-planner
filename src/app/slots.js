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

   fillSlots() runs at the start of boot(), before the saved project is read,
   so each section's heading and controls are on the page at once (a host's
   storage can be slow); the fills read nothing from S then. What a fill
   returns — the effects that show the project — runs from the function
   fillSlots() returns, which boot() calls once the project is loaded and
   before the section toggles are applied (ui-kit/panels.js mountSections).
   It fails loudly on a
   section no feature fills, a key two features claim, and a key with no
   section, rather than leaving a pane silently empty. */
import {sections as canvas} from '../features/canvas/host.js';
import {sections as floors} from '../features/floors/index.js';
import {sections as openings} from '../features/openings/index.js';
import {sections as furniture} from '../features/furniture/index.js';
import {sections as layouts} from '../features/layouts/index.js';
import {sections as room} from '../features/room/index.js';
import {sections as walls} from '../features/walls/index.js';

/** @type {import('../ui-kit/component.js').Sections[]} */
const FEATURES = [layouts, walls, openings, furniture, room, floors, canvas];

function fillSlots(){
  /** @type {import('../ui-kit/component.js').Sections} */
  const fills = {};
  for(const f of FEATURES) for(const [k, fill] of Object.entries(f)){
    if(fills[k]) throw new Error(`app/slots.js: two features fill section "${k}"`);
    fills[k] = fill;
  }
  const filled = new Set();
  /** @type {(() => void)[]} */
  const later = [];
  for(const el of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('.pane-body > section[data-sec]'))){
    const k = /** @type {string} */(el.dataset.sec);   // the selector requires it
    if(!fills[k]) throw new Error(`app/slots.js: no feature fills section "${k}"`);
    const then = fills[k](el); filled.add(k);
    if(then) later.push(then);
  }
  for(const k of Object.keys(fills)) if(!filled.has(k)) throw new Error(`app/slots.js: no section[data-sec="${k}"] in a pane for its fill`);
  return () => { for(const f of later) f(); };
}

export {fillSlots};
