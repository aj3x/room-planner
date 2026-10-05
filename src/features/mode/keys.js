// @ts-check
/* Undo and redo, on the stack the mode edits: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
   and Ctrl/Cmd+Y, while no dialog is up. */
import {isModalOpen} from '../../ui-kit/modal.jsx';
import {KEY_ORDER} from '../../ui-kit/shortcuts.js';
import {redo, undo} from './mode.js';

/** @type {import('../../ui-kit/shortcuts.js').Shortcut[]} */
const shortcuts = [
  {id: 'mode.undo', priority: KEY_ORDER.command, keys: ['z', 'Z'],
    run: e => {
      if(isModalOpen() || !(e.ctrlKey||e.metaKey)) return false;
      e.preventDefault();
      if(e.shiftKey) redo(); else undo();
    }},
  {id: 'mode.redo', priority: KEY_ORDER.command, keys: ['y', 'Y'],
    run: e => {
      if(isModalOpen() || !(e.ctrlKey||e.metaKey)) return false;
      e.preventDefault();
      redo();
    }},
];

export {shortcuts};
