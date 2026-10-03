/* Measure-tool state: whether the tool is on and which anchors are in hand.
   Each is a signal (core/signals.js): the measure bar and the canvas
   subscribe by reading `.value`. Where each measurement was last drawn is
   the measures layer's own (canvas/layers/measures.js, hitTest). */

import {signal} from '../core/signals.js';

const measureOn = signal(false),     // the Measure tool is active: clicks pick anchors instead of editing
      measureStart = signal(null),   // the first anchor, once picked
      measureHover = signal(null),   // the anchor under the pointer
      measureHoverId = signal(null), // the measurement under the pointer
      measureSel = signal(null),     // the selected measurement's id
      measureCursor = signal(null);  // world point under the pointer, for the preview line

export {measureOn, measureStart, measureHover, measureHoverId, measureSel,
        measureCursor};
