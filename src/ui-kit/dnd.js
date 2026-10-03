/* Drag to reorder: the splice that moves a row, and the drop-marker classes
   the tree and the inventory list paint while a drag is in flight.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. */

/* ------------------------- drag to reorder ------------------------- */
function moveBefore(arr, movedId, targetId, after){
  const i=arr.findIndex(x=>x.id===movedId); if(i<0) return;
  const [o]=arr.splice(i,1);
  const j=targetId ? arr.findIndex(x=>x.id===targetId) : -1;
  if(j<0) arr.push(o); else arr.splice(after?j+1:j, 0, o);
}
function clearDropMarks(root){
  const box=root||document;
  for(const el of box.querySelectorAll('.drop-into,.drop-before,.drop-after'))
    el.classList.remove('drop-into','drop-before','drop-after');
  if(root) root.classList.remove('drop-root');
}
function dropHalf(e,el){
  const r=el.getBoundingClientRect();
  return (e.clientY-r.top)/Math.max(1,r.height);
}

export {moveBefore, clearDropMarks, dropHalf};
