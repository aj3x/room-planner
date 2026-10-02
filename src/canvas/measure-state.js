/* Measure-tool state: whether the tool is on, which anchors are in hand, and
   where each measurement was last drawn. Each is a signal (core/signals.js):
   the measure bar and the canvas subscribe by reading `.value`.

   measureBoxes is the odd one, and not a signal: it is not input to the
   drawing but output from it, rebuilt by each draw() so a click can hit-test
   a label. Nothing subscribes to it. */

import {signal} from '../core/signals.js';

const measureOn = signal(false),     // the Measure tool is active: clicks pick anchors instead of editing
      measureStart = signal(null),   // the first anchor, once picked
      measureHover = signal(null),   // the anchor under the pointer
      measureHoverId = signal(null), // the measurement under the pointer
      measureSel = signal(null),     // the selected measurement's id
      measureCursor = signal(null);  // world point under the pointer, for the preview line
let measureBoxes = [];               // where each measurement was last drawn, in screen px, for hit-testing
function setMeasureBoxes(v){ measureBoxes = v; }

export {measureOn, measureStart, measureHover, measureHoverId, measureSel,
        measureCursor, measureBoxes, setMeasureBoxes};
