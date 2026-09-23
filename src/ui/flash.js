/* Toasts. Two of them: flash() on the canvas, libFlash() on the Library and
   Marketplace tabs. Both stay up for readTime(msg).

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   flash() itself could NOT come along, and that is not a dependency of its own
   making: its timer handle is declared as `let drag=null, flashT=null;` at the
   head of the interaction region, sharing one declarator list with `drag` —
   which is reassigned from all over canvas/ and cannot move until that phase
   does. Separating flashT from drag would be an edit to a line of index.html
   rather than a move of it, so flash() waits for canvas/interaction.js.

   That in turn is why model/walls.js still has tryRoomEdit (it calls flash())
   and setWallAngle / setWallLen / setRectSize (they call tryRoomEdit) sitting
   in the monolith. Those four are unblocked by flash(), not by this file. */

import {$} from './modal.js';

/* long enough to read: ~60ms a character, never under 1.6s or over 5s */
const readTime = msg => Math.max(1600, Math.min(5000, String(msg).length*60));

/* ------------------------- library flash (Inventory/Marketplace tabs) ------------------------- */
let libFlashT=null;
function libFlash(msg,warn){
  if(!msg) return;
  const el=$('libFlash');
  el.textContent=msg; el.classList.toggle('warn',!!warn); el.classList.add('on');
  clearTimeout(libFlashT); libFlashT=setTimeout(()=>el.classList.remove('on'),readTime(msg));
}

export {readTime, libFlash};
