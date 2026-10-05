// @ts-check
/* [ and ] turn the room picked on the floor a quarter at a time, which is
   what arranging rooms actually needs. */
import {floorSel} from '../../kernel/selection.js';
import {S} from '../../kernel/state.js';
import {isModalOpen} from '../../ui-kit/modal.jsx';
import {KEY_ORDER} from '../../ui-kit/shortcuts.js';
import {turnFloorRoom} from './floors.js';

/** @type {import('../../ui-kit/shortcuts.js').Shortcut[]} */
const shortcuts = [
  {id: 'floors.turn', priority: KEY_ORDER.mode, modes: ['floor'], keys: ['[', ']'],
    run: e => {
      if(isModalOpen() || !floorSel.value || e.ctrlKey || e.metaKey) return false;
      const l=S.layouts.find(x=>x.id===floorSel.value);
      if(l){ e.preventDefault(); turnFloorRoom(l, e.key==='[' ? -90 : 90); }
    }},
];

export {shortcuts};
