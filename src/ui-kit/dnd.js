// @ts-check
/* Drag to reorder: the splice that moves a row, and where in a row a drag
   is (which half, for the drop marks the lists render).

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. */

/* ------------------------- drag to reorder ------------------------- */
/** Move the entry with id movedId to just before (or after) targetId; to the end with no target.
    @param {{id: string}[]} arr @param {string} movedId @param {string|null|undefined} targetId @param {boolean} [after] */
function moveBefore(arr, movedId, targetId, after){
  const i=arr.findIndex(x=>x.id===movedId); if(i<0) return;
  const [o]=arr.splice(i,1);
  const j=targetId ? arr.findIndex(x=>x.id===targetId) : -1;
  if(j<0) arr.push(o); else arr.splice(after?j+1:j, 0, o);
}
/** @param {MouseEvent} e @param {Element} el @returns {number} how far down el the pointer is, 0..1 */
function dropHalf(e,el){
  const r=el.getBoundingClientRect();
  return (e.clientY-r.top)/Math.max(1,r.height);
}

export {moveBefore, dropHalf};
