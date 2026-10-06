// @ts-check
/* M switches the Measure tool on and off, in Room and Furniture mode. */
import {isModalOpen} from '../../ui-kit/modal.jsx';
import {KEY_ORDER} from '../../ui-kit/shortcuts.js';
import {measureOn} from './measure-state.js';
import {setMeasure} from './measure.js';

/** @type {import('../../ui-kit/shortcuts.js').Shortcut[]} */
const shortcuts = [
  {id: 'measure.toggle', priority: KEY_ORDER.command, modes: ['room', 'furniture'], keys: ['m', 'M'],
    run: e => {
      if(isModalOpen() || e.ctrlKey || e.metaKey || e.altKey) return false;
      setMeasure(!measureOn.value);
    }},
];

export {shortcuts};
