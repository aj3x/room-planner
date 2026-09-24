/* Interaction state: what gesture is in flight. Six mutable lets and a setter
   for each. A leaf: this module imports nothing.

   Extracted from index.html in Phase 3, move-only: every line below is
   byte-identical to what stood there, in the same relative order, and the
   `export` block at the end is the only line added. The setters landed in
   index.html in their own commit first, so this one could stay a move.

   They are gathered here rather than left with the regions that own them --
   drawState/drawCursor head the custom-room-drawing region, wallDrawState/
   wallDrawShift the freestanding-wall one, splitDrawState the split, and drag
   the interaction region -- because draw() reads all six and they are the
   second half of what was keeping it in index.html. The functions that drive
   each gesture have not moved and are still in index.html; only the state has.

   `spaceDown`, declared beside drag, stayed: nothing outside the interaction
   region reads it. */

function setDrag(v){ drag = v; }
function setDrawState(v){ drawState = v; }
function setDrawCursor(v){ drawCursor = v; }
function setWallDrawState(v){ wallDrawState = v; }
function setWallDrawShift(v){ wallDrawShift = v; }
function setSplitDrawState(v){ splitDrawState = v; }

let drawState=null, drawCursor=null;
let wallDrawState=null, wallDrawShift=false;
let splitDrawState=null;   // {pts:[hit, ...world points]} — pts[0] is always a boundary hit
let drag=null;

export {drag, drawState, drawCursor, wallDrawState, wallDrawShift, splitDrawState,
        setDrag, setDrawState, setDrawCursor, setWallDrawState, setWallDrawShift,
        setSplitDrawState};
