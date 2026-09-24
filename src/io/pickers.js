/* The tick-box lists Export and Import share, plus the two folder-path
   helpers that sit with them.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   §3 files this range under `io/samples.js`, but the samples half of that
   banner is a single `$('btnSamples').addEventListener(...)` registration,
   which stays in index.html under rule 6 like every other listener. What is
   left is the picker, so that is what the file is called.

   One line of the original range did NOT come: `import {plural} from
   './src/ui/panels.js'` sat between pickValues and fileSlug, and seventeen
   call sites outside this range still need it, so it stays where it was.
*/
import {esc} from '../ui/panels.js';
import {$} from '../ui/modal.js';
import {S} from '../core/state.js';

/* ---- tick-box lists ----
   Export and import are both "tick what you mean", so they share this. A row can be
   locked: ticked and not un-tickable, which is how a room drags its things along. */
function pickerHTML(id, title, rows, emptyMsg){
  const body = rows.length
    ? rows.map(r=>`<label class="pick${r.locked?' locked':''}">
        <input type="checkbox" value="${esc(r.value)}" ${r.checked?'checked':''} ${r.locked?'disabled':''}>
        <span class="nm" title="${esc(r.label)}">${esc(r.label)}</span>
        ${r.sub?`<span class="dim" title="${esc(r.sub)}">${esc(r.sub)}</span>`:''}
      </label>`).join('')
    : `<div class="empty">${esc(emptyMsg||'Nothing here')}</div>`;
  return `<div class="picker" id="${id}">
    <div class="picker-head"><span class="grow">${esc(title)}</span>
      <button type="button" class="btn quiet sm" data-all="1">All</button>
      <button type="button" class="btn quiet sm" data-all="0">None</button></div>
    <div class="picker-body">${body}</div></div>`;
}
function pickerMount(id, onChange){
  const el=$(id); if(!el) return;
  el.addEventListener('click', e=>{
    const b=e.target.closest('button[data-all]'); if(!b) return;
    for(const c of el.querySelectorAll('input[type=checkbox]:not(:disabled)')) c.checked = b.dataset.all==='1';
    if(onChange) onChange();
  });
  el.addEventListener('change', ()=>{ if(onChange) onChange(); });
}
/* a locked row is disabled but still ticked, and :checked matches it — so it counts */
const pickValues = id => [...$(id).querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
const fileSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'export';
/* folder path of a room, read out of whichever folder list it belongs to */
function folderLine(l, folders){
  const list = folders || S.folders;
  const names=[];
  let f = l.folderId ? list.find(x=>x.id===l.folderId) : null;
  while(f){ names.unshift(f.name); f = f.parentId ? list.find(x=>x.id===f.parentId) : null; }
  return names.join(' / ');
}
function ancestorFolderIds(folders, id){
  const out=new Set();
  let f = id ? folders.find(x=>x.id===id) : null;
  while(f && !out.has(f.id)){ out.add(f.id); f = f.parentId ? folders.find(x=>x.id===f.parentId) : null; }
  return out;
}
export {pickerHTML, pickerMount, pickValues, fileSlug, folderLine, ancestorFolderIds};
