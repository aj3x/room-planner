/* Measure-tool state: whether the tool is on, which anchors are in hand, and
   where each measurement was last drawn. Each is a signal (core/signals.js):
   the measure bar and the canvas subscribe by reading `.value`.

   measureBoxes is the odd one -- it is not input to the drawing but output
   from it, rebuilt each pass so a click can hit-test a label. draw() writes
   it outside any effect, and nothing subscribes to it. */

import {signal} from '../core/signals.js';

const measureOn = signal(false),     // the Measure tool is active: clicks pick anchors instead of editing
      measureStart = signal(null),   // the first anchor, once picked
      measureHover = signal(null),   // the anchor under the pointer
      measureHoverId = signal(null), // the measurement under the pointer
      measureSel = signal(null),     // the selected measurement's id
      measureCursor = signal(null),  // world point under the pointer, for the preview line
      measureBoxes = signal([]);     // where each measurement was last drawn, in screen px, for hit-testing

export {measureOn, measureStart, measureHover, measureHoverId, measureSel,
        measureCursor, measureBoxes};
