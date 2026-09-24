/* Measure-tool state: whether the tool is on, which anchors are in hand, and
   where each measurement was last drawn. Seven mutable lets and a setter for
   each. A leaf: this module imports nothing.

   Extracted from index.html in Phase 3, move-only: every line below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. The setters landed in index.html one commit earlier so this
   one could stay a move.

   Same reasoning as canvas/interaction-state.js next door: drawMeasures reads
   five of these, and drawMeasures is the last draw*() helper draw() needs.
   measureBoxes is the odd one -- it is not input to the drawing but output
   from it, rebuilt each pass so a click can hit-test a label. */

let measureOn=false,     // the Measure tool is active: clicks pick anchors instead of editing
    measureStart=null,   // the first anchor, once picked
    measureHover=null,   // the anchor under the pointer
    measureHoverId=null, // the measurement under the pointer
    measureSel=null,     // the selected measurement's id
    measureCursor=null,  // world point under the pointer, for the preview line
    measureBoxes=[];     // where each measurement was last drawn, in screen px, for hit-testing
/* Setters for the measure lets above, for the same reason the selection and
   interaction lets got them: you cannot assign to an imported binding, and
   drawMeasures is the last of the four draw*() helpers draw() needs. Each body
   is a bare assignment. */
function setMeasureOn(v){ measureOn = v; }
function setMeasureStart(v){ measureStart = v; }
function setMeasureHover(v){ measureHover = v; }
function setMeasureHoverId(v){ measureHoverId = v; }
function setMeasureSel(v){ measureSel = v; }
function setMeasureCursor(v){ measureCursor = v; }
function setMeasureBoxes(v){ measureBoxes = v; }

export {measureOn, measureStart, measureHover, measureHoverId, measureSel,
        measureCursor, measureBoxes,
        setMeasureOn, setMeasureStart, setMeasureHover, setMeasureHoverId,
        setMeasureSel, setMeasureCursor, setMeasureBoxes};
