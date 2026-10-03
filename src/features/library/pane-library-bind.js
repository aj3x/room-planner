// @ts-check
/* The Library pane's wiring: the search box's debounce, and the folder tree —
   click routing, rename on double-click, and the drag that either reparents a
   folder or drops a grid item into one.

   One of the per-pane bind modules; src/app/bind/header.js carries the full
   rationale for the pattern. The short version: each HTML partial ends
   with a module script that imports its bind function and calls it, so a pane's
   markup and the list of things listening to it sit in the same file, and it is
   a function rather than registrations at import time because nothing in src/
   may have a top-level side effect.

   Ordering: libTreeBox carries seven of these eight and every one of them is
   here, in index.html's order — which is the only thing registration order can
   decide. Do not reorder them.

   libSearchT, the search debounce handle, came along: it was index.html's only
   `let`, and the handler that reads it is the only reader it ever had. */

import { singleClick, cancelSingleClick } from '../../ui-kit/inline-edit.js';
import { closeMenu } from '../../ui-kit/menu.js';
import { moveBefore, clearDropMarks } from '../../ui-kit/dnd.js';
import { libFlash } from '../../ui-kit/flash.js';
import { $ } from '../../ui-kit/modal.js';
import { S } from '../../kernel/state.js';
import { transact } from '../../kernel/tx.js';
import { itemFolderOf, itemFolderDescendant, recomputeFolderSubtree, moveItemToFolder } from './item-folders.js';
import { marketFolderOf, marketFolderDescendant } from '../marketplace/index.js';
import { nav, libTreeOpen, gridDragItem, setGridDragItem, goLibFolder, selectListing } from './nav.js';
import { renderLibTree, markActiveTreeRow, libTreeBox, dragLib, setDragLib, libDropSpot } from './tree.js';
import { renameLibFolder, renameAdhocFolder, libFolderMenu, adhocFolderMenu, listingMenu } from './folder-menus.js';
import { renderLibContent } from './router.js';

/** @typedef {import('../../ui-kit/dom.js').FieldEvent} FieldEvent */

/* The tree's events are read through e.target.closest(...).dataset on rows
   whose markup is a template string, the same untyped DOM $ hands out (see
   ui-kit/dom.js); typing them would be a cast at every read in code Phase 6
   replaces with a component. So they are any, here and only here. */
/** @typedef {any} TreeEvent */

function bindPaneLibrary(){
  /** @type {number|undefined} */
  let libSearchT=undefined;
  $('searchBox').addEventListener('input', (/** @type {FieldEvent} */e)=>{
    clearTimeout(libSearchT);
    const q=e.target.value;
    libSearchT=setTimeout(()=>{ nav.searching=!!q.trim(); markActiveTreeRow(); renderLibContent(); }, 120);
  });

  libTreeBox.addEventListener('click', (/** @type {TreeEvent} */e)=>{
    const more=e.target.closest('[data-act=more]');
    const root=e.target.closest('[data-root]');
    const toggle=e.target.closest('[data-act=toggle]');
    const row=e.target.closest('.tree-row[data-folder],.tree-row[data-mfolder],.tree-row[data-listing]');
    if(more && row){
      cancelSingleClick();
      if(row.dataset.folder) libFolderMenu(row.dataset.folder, more);
      else if(row.dataset.mfolder) adhocFolderMenu(row.dataset.mfolder, more);
      else if(row.dataset.listing) listingMenu(row.dataset.listing, more);
      return;
    }
    if(root){ singleClick(()=>goLibFolder(nav.tab==='library'?'library':'market', null)); return; }
    if(!row) return;
    if(toggle){
      cancelSingleClick();
      if(row.dataset.folder){
        const id=row.dataset.folder;
        if(libTreeOpen.has(id)) libTreeOpen.delete(id); else libTreeOpen.add(id);
      } else if(row.dataset.mfolder){
        const key='m:'+row.dataset.mfolder;
        if(libTreeOpen.has(key)) libTreeOpen.delete(key); else libTreeOpen.add(key);
      }
      renderLibTree();
      return;
    }
    if(row.dataset.folder){ singleClick(()=>goLibFolder('library', row.dataset.folder)); return; }
    if(row.dataset.mfolder){ singleClick(()=>goLibFolder('market', row.dataset.mfolder)); return; }
    if(row.dataset.listing){ singleClick(()=>selectListing(row.dataset.listing)); return; }
  });
  libTreeBox.addEventListener('dblclick', (/** @type {TreeEvent} */e)=>{
    cancelSingleClick();
    if(e.target.closest('button')) return;
    const row=e.target.closest('.tree-row[data-folder],.tree-row[data-mfolder]'); if(!row) return;
    if(row.dataset.folder) renameLibFolder(row.dataset.folder);
    else renameAdhocFolder(row.dataset.mfolder);
  });

  /* ---- drag: reparent a library folder, or drop a library item onto one ---- */
  libTreeBox.addEventListener('dragstart', (/** @type {TreeEvent} */e)=>{
    const row=e.target.closest('.tree-row[data-folder],.tree-row[data-mfolder]'); if(!row) return;
    cancelSingleClick(); closeMenu();
    setDragLib(row.dataset.folder ? {kind:'folder',id:row.dataset.folder,realm:'library'} : {kind:'folder',id:row.dataset.mfolder,realm:'market'});
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',/** @type {{id: string}} */(dragLib).id); }catch(err){}
  });
  libTreeBox.addEventListener('dragend', ()=>{
    setDragLib(null); clearDropMarks(libTreeBox);
    for(const r of libTreeBox.querySelectorAll('.dragging')) r.classList.remove('dragging');
  });
  libTreeBox.addEventListener('dragover', (/** @type {TreeEvent} */e)=>{
    if(!dragLib && !gridDragItem) return;
    const spot=libDropSpot(e); if(!spot) return;
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    clearDropMarks(libTreeBox);
    if(spot.mode==='root'){ libTreeBox.classList.add('drop-root'); return; }
    if(gridDragItem){ if(spot.isLib) spot.row.classList.add('drop-into'); return; }
    spot.row.classList.add(spot.mode==='into'?'drop-into':spot.mode==='before'?'drop-before':'drop-after');
  });
  libTreeBox.addEventListener('dragleave', (/** @type {TreeEvent} */e)=>{ if(e.target===libTreeBox) clearDropMarks(libTreeBox); });
  libTreeBox.addEventListener('drop', (/** @type {TreeEvent} */e)=>{
    const spot=libDropSpot(e);
    clearDropMarks(libTreeBox);
    if(!spot) return;
    e.preventDefault();
    if(gridDragItem){
      if(spot.mode!=='root' && !spot.isLib) return;
      const it=S.inventory.find(x=>x.id===gridDragItem); if(!it) return;
      setGridDragItem(null);
      transact('lib', ()=>moveItemToFolder(it, spot.mode==='root'?null:spot.id));
      libFlash('Moved “'+it.name+'”');
      return;
    }
    const d=dragLib; if(!d) return;
    if(d.realm==='library'){
      const f=itemFolderOf(d.id); if(!f) return;
      let parent=null, targetId=null, after=false;
      if(spot.mode==='into'){ parent=spot.id; libTreeOpen.add(parent); }
      else if(spot.mode!=='root' && spot.isLib){
        const t=itemFolderOf(spot.id); if(!t) return;
        parent=t.parentId||null; targetId=spot.id; after=(spot.mode==='after');
      } else if(spot.mode!=='root') return;
      if(parent===d.id || itemFolderDescendant(d.id,parent)){ libFlash("A folder can't go inside itself",true); return; }
      transact('lib', ()=>{
        f.parentId=parent;
        moveBefore(S.itemFolders, d.id, targetId, after);
        recomputeFolderSubtree(d.id);
      });
    } else {
      const f=marketFolderOf(d.id); if(!f) return;
      let parent=null, targetId=null, after=false;
      if(spot.mode==='into'){ parent=spot.id; libTreeOpen.add('m:'+parent); }
      else if(spot.mode!=='root' && !spot.isLib){
        const t=marketFolderOf(spot.id); if(!t) return;
        parent=t.parentId||null; targetId=spot.id; after=(spot.mode==='after');
      } else if(spot.mode!=='root') return;
      if(parent===d.id || marketFolderDescendant(d.id,parent)){ libFlash("A folder can't go inside itself",true); return; }
      transact('lib', ()=>{ f.parentId=parent; moveBefore(S.marketFolders, d.id, targetId, after); });
    }
    setDragLib(null);
  });
}

export {bindPaneLibrary};
