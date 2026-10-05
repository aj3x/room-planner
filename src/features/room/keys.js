// @ts-check
/* Delete or Backspace removes the part of the room that is picked: a door
   or window, a corner, a pillar or an interior wall. */
import {roomSel} from '../../kernel/selection.js';
import {roomMode} from '../../kernel/state.js';
import {KEY_ORDER} from '../../ui-kit/shortcuts.js';
import {deleteOpening} from '../openings/index.js';
import {deleteCorner, deleteIWall, deletePillar} from '../walls/index.js';

/** @type {import('../../ui-kit/shortcuts.js').Shortcut[]} */
const shortcuts = [
  {id: 'room.delete', priority: KEY_ORDER.mode, keys: ['Delete', 'Backspace'],
    run: e => {
      const s=roomSel.value;
      if(!roomMode() || !s) return false;
      e.preventDefault();
      if(s.kind==='opening') deleteOpening(s.id);
      else if(s.kind==='corner') deleteCorner(s.i);
      else if(s.kind==='pillar') deletePillar(s.id);
      else if(s.kind==='iwall') deleteIWall(s.id);
    }},
];

export {shortcuts};
