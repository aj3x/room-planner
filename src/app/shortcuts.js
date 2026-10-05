// @ts-check
/* The app's keyboard: every feature's shortcuts, plus the two that belong
   to no one feature — `?` for the list of shortcuts, and Escape, which
   closes the dialog or else clears every selection — handed to the
   registry (ui-kit/shortcuts.js), whose priorities say who gets a key
   first. A feature adds a shortcut to its own list; a feature with no list
   yet is one line in FEATURES. bindKeys() is called once, from the shell. */
import {floorSel, roomSel, selectClear, mergeClear} from '../kernel/selection.js';
import {S, isCanvasMode} from '../kernel/state.js';
import {batch} from '../kernel/signals.js';
import {closeMenu, menuEl} from '../ui-kit/menu.js';
import {closeModal, isModalOpen, showShortcuts} from '../ui-kit/modal.jsx';
import {KEY_ORDER, bindShortcuts} from '../ui-kit/shortcuts.js';
import {isGesturing, shortcuts as canvas} from '../features/canvas/host.js';
import {shortcuts as floors} from '../features/floors/index.js';
import {shortcuts as furniture} from '../features/furniture/index.js';
import {shortcuts as measure} from '../features/measure/index.js';
import {shortcuts as mode} from '../features/mode/index.js';
import {shortcuts as room} from '../features/room/index.js';

const FEATURES = [canvas, measure, mode, floors, room, furniture];

/** @type {import('../ui-kit/shortcuts.js').Shortcut[]} */
const APP = [
  /* an open menu closes on Escape before anything else sees the key, and the key goes on */
  {id: 'menu.close', priority: KEY_ORDER.command, keys: ['Escape'], capture: true, inFields: true,
    run: () => { if(menuEl) closeMenu(); return false; }},
  {id: 'app.shortcuts', priority: KEY_ORDER.command, keys: ['?'],
    run: e => { if(isModalOpen() || isGesturing() || !isCanvasMode(S.mode)) return false; e.preventDefault(); showShortcuts(); }},
  {id: 'app.escape', priority: KEY_ORDER.command, keys: ['Escape'],
    run: () => {
      if(isModalOpen()){ closeModal(); return; }
      batch(()=>{ selectClear(); roomSel.value = null; floorSel.value = null; mergeClear(); });
    }},
];

function bindKeys(){ bindShortcuts(APP.concat(...FEATURES)); }

export {bindKeys};
