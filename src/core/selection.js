/* The selection. Nine mutable lets saying what is picked, what is being dragged
   onto what, and what the guide readout should say — plus the setter for each.
   A leaf: this module imports nothing.

   Extracted from index.html in Phase 3, move-only: the two chunks below are
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. The setters landed in index.html in their own commits
   first, precisely so this one could stay a move.

   They live here rather than in core/state.js because they are not part of the
   saved project — S is what `save()` serialises, and none of this is. They are
   the canvas's own scratch state, and draw() reads all nine of them, which is
   why they had to come out of index.html before draw() could.

   treeOpen, the tenth let declared beside them, stayed behind: it is the
   layout tree's expanded-folder set, nothing on the canvas reads it, and it is
   not reassigned from anywhere the tree itself does not own. */

let selSet = new Set(); // placed furniture ids (multi-select), source of truth
let sel = null;         // last-added/primary placed furniture id; null when selSet is empty
let roomSel = null;    // {kind:'wall'|'corner'|'opening', i} / {kind:'opening', id}
let floorSel = null;   // id of the room picked up in Floor mode
let mergeSel = new Set();  // up to 2 layout ids marked for merge/delete (Floor canvas + room list, shift+click)
let floorGuides = [];  // edges a dragged room is currently lining up with
let floorSnapNote = ''; // what that alignment is, shown while dragging
let alignGuides = [];  // lines a dragged corner is currently latched onto
let alignNote = '';    // what that alignment is, shown in the readout

/* Setters for the selection lets above. You cannot assign to an imported
   binding, so every one of these that is reassigned from outside the module it
   ends up in needs a function to do it — the same pattern setS uses in
   src/core/state.js. Each setter does exactly what the assignment did: a bare
   assignment, nothing else. They are added here, ahead of the draw() move, so
   that move can stay move-only. */
function setSel(v){ sel = v; }
function setSelSet(v){ selSet = v; }
function setRoomSel(v){ roomSel = v; }
function setFloorSel(v){ floorSel = v; }
function setMergeSel(v){ mergeSel = v; }
function setFloorGuides(v){ floorGuides = v; }
function setFloorSnapNote(v){ floorSnapNote = v; }
function setAlignGuides(v){ alignGuides = v; }
function setAlignNote(v){ alignNote = v; }

export {sel, selSet, roomSel, floorSel, mergeSel,
        floorGuides, floorSnapNote, alignGuides, alignNote,
        setSel, setSelSet, setRoomSel, setFloorSel, setMergeSel,
        setFloorGuides, setFloorSnapNote, setAlignGuides, setAlignNote};
