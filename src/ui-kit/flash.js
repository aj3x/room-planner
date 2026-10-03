/* Toasts. Two of them: flash() on the canvas, libFlash() on the Library and
   Marketplace tabs. Both stay up for readTime(msg).

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   flash() joined this file in the canvas/ round. It was left behind by the
   ui/ round because its timer handle was declared `let drag=null,
   flashT=null;` at the head of the interaction region, sharing one declarator
   list with `drag`, which is reassigned from all over canvas/. Splitting that
   declarator was a one-line sanctioned code change, made in its own commit
   immediately before this move; `let flashT=null;` and flash() then moved
   byte-identically.

   That in turn unblocked four functions of model/walls.js: tryRoomEdit (it
   calls flash) and setWallAngle / setWallLen / setRectSize (they call
   tryRoomEdit). */

import {$} from './modal.js';

/* long enough to read: ~60ms a character, never under 1.6s or over 5s */
const readTime = msg => Math.max(1600, Math.min(5000, String(msg).length*60));

let flashT=null;
function flash(msg){
  if(!msg) return;
  const el=$('flash');
  el.textContent=msg; el.classList.add('on');
  clearTimeout(flashT); flashT=setTimeout(()=>el.classList.remove('on'),readTime(msg));
}

/* ------------------------- library flash (Inventory/Marketplace tabs) ------------------------- */
let libFlashT=null;
function libFlash(msg,warn){
  if(!msg) return;
  const el=$('libFlash');
  el.textContent=msg; el.classList.toggle('warn',!!warn); el.classList.add('on');
  clearTimeout(libFlashT); libFlashT=setTimeout(()=>el.classList.remove('on'),readTime(msg));
}

export {readTime, flash, libFlash};
