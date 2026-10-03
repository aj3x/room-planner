// @ts-check
/* Measure-tool state: whether the tool is on and which anchors are in hand.
   Each is a signal (kernel/signals.js): the measure bar and the canvas
   subscribe by reading `.value`. Where each measurement was last drawn is
   the measures layer's own (features/measure/measures-layer.js, hitTest). */

import {signal} from '../../kernel/signals.js';

/** @typedef {import('../../kernel/types.js').Anchor} Anchor */
/** @template T @typedef {import('@preact/signals-core').Signal<T>} Signal */

const measureOn = signal(false),     // the Measure tool is active: clicks pick anchors instead of editing
      measureStart = /** @type {Signal<Anchor|null>} */(signal(null)),   // the first anchor, once picked
      measureHover = /** @type {Signal<Anchor|null>} */(signal(null)),   // the anchor under the pointer
      measureHoverId = /** @type {Signal<string|null>} */(signal(null)), // the measurement under the pointer
      measureSel = /** @type {Signal<string|null>} */(signal(null)),     // the selected measurement's id
      measureCursor = /** @type {Signal<import('../../kernel/types.js').Pt|null>} */(signal(null));  // world point under the pointer, for the preview line

export {measureOn, measureStart, measureHover, measureHoverId, measureSel,
        measureCursor};
