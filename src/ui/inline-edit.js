/* Rename in place, and the single-click delay that lets a double-click land.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. */

/* ------------------------- rename in place -------------------------
   Double-clicking a name swaps it for a text box. Enter keeps it, Esc and
   an empty box both leave the name alone.

   The box gives up focus before `done` runs, so the list's own effect (a
   panel holds its render while someone types in it — ui/mount.js) is free to
   repaint the row the moment the caller commits the new name. When there is
   nothing to commit, the original name goes back where it was and `done`
   gets null. */
function inlineEdit(el, value, done){
  if(!el) return;
  const row=el.closest('[draggable]');
  if(row) row.draggable=false;          // so the text stays selectable
  const inp=document.createElement('input');
  inp.type='text'; inp.className='inline-edit'; inp.value=value;
  el.replaceWith(inp);
  inp.focus(); try{ inp.select(); }catch(e){}
  let closed=false;
  const finish=ok=>{
    if(closed) return;
    closed=true;
    const v=inp.value.trim();
    inp.blur();
    if(!(ok&&v)){ if(inp.isConnected) inp.replaceWith(el); if(row) row.draggable=true; }
    done(ok&&v ? v : null);
  };
  inp.addEventListener('keydown', e=>{
    e.stopPropagation();
    if(e.key==='Enter'){ e.preventDefault(); finish(true); }
    else if(e.key==='Escape'){ e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', ()=>finish(true));
  for(const ev of ['click','dblclick','pointerdown']) inp.addEventListener(ev, e=>e.stopPropagation());
}
/* A plain click and the first click of a double-click look identical, so hold
   the single-click action back long enough to see whether a second one lands.
   Rows that re-render themselves on click need this or the second click would
   arrive at a fresh element and never become a dblclick. */
let clickT=null;
function singleClick(fn){ clearTimeout(clickT); clickT=setTimeout(()=>{ clickT=null; fn(); }, 190); }
function cancelSingleClick(){ clearTimeout(clickT); clickT=null; }

export {inlineEdit, singleClick, cancelSingleClick};
