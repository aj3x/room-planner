/* The library grid: the tiles it is built from, the breadcrumb bar above it,
   and the id of the tile currently being dragged.

   Extracted from index.html in Phase 3, move-only: the three blocks below
   are byte-identical to what stood there, and the `export` block at the end
   is the only line added.

   gridDragItem is written both from bindLibGrid, which is coming here with
   the SCC, and from the libTreeBox drop listener, which stays in index.html
   under rule 6 -- hence setGridDragItem, landed as a declared code change in
   its own commit just before this one.

   renderLibraryFolder, bindLibGrid, bindCrumbs, createLibItem,
   duplicateLibItem, deleteLibItem and libItemMenu did not come: they are
   inside the Plan-panels/Library SCC.
*/
import {sizeLabel} from '../canvas/draw.js';
import {marketFolderPath} from './adhoc-folders.js';
import {childItemFolders, itemFolderPath, itemsInFolder} from './item-folders.js';
import {svgI} from '../ui/modal.js';
import {esc} from '../ui/panels.js';
import {draw} from '../canvas/draw.js';
import {uniqueId} from '../core/ids.js';
import {selectClear} from '../core/selection.js';
import {S, clone} from '../core/state.js';
import {save} from '../core/store.js';
import {fileSlug} from '../io/pickers.js';
import {itemDialog} from '../plan/item-dialog.js';
import {renderInv} from '../plan/item-list.js';
import {renderSel} from '../plan/selection-panel.js';
import {clearDropMarks} from '../ui/dnd.js';
import {libFlash} from '../ui/flash.js';
import {openMenu} from '../ui/menu.js';
import {$, askConfirm} from '../ui/modal.js';
import {plural} from '../ui/panels.js';
import {listingMenu} from './adhoc-listings.js';
import {exportLibFolder, exportLibItems, exportLibraryDialog} from './export.js';
import {libFolderTagsDialog, moveLibItemDialog} from './folder-menus.js';
import {ancestorTags, itemFolderOf, moveItemToFolder, purgeItem} from './item-folders.js';
import {drawPreview, selectListing} from './marketplace.js';
import {goLibFolder, renderLibAll} from './shell.js';

let gridDragItem=null;
function setGridDragItem(v){ gridDragItem = v; }

function itemTile(it){
  const chips=(it.tags&&it.tags.length) ? `<div class="chips">${it.tags.slice(0,3).map(t=>{
      const inherited = !it.manualTags || !it.manualTags.includes(t);
      return `<span class="tagchip${inherited?' inherit':''}">${esc(t)}</span>`;
    }).join('')}${it.tags.length>3?`<span class="tagchip">+${it.tags.length-3}</span>`:''}</div>` : '';
  return `<div class="tile" role="button" tabindex="0" draggable="true" data-item="${it.id}" aria-label="Edit ${esc(it.name)}">
    <span class="more" role="button" tabindex="0" data-act="more" title="More actions" aria-label="More actions">${svgI('more')}</span>
    <div class="thumb"><canvas data-prev="${esc(it.id)}"></canvas></div>
    <div class="body"><div class="nm" title="${esc(it.name)}">${esc(it.name)}</div>
      <div class="dim">${esc(sizeLabel(it))}</div>${chips}</div>
  </div>`;
}
function folderTile(f){
  return `<button type="button" class="tile folder" data-openfolder="${f.id}">
    <div class="thumb">${svgI('folder')}</div>
    <div class="body"><div class="nm" title="${esc(f.name)}">${esc(f.name)}</div>
      <div class="dim">${esc(folderCountLabel(f.id))}</div></div>
  </button>`;
}
function folderCountLabel(fid){
  const n=childItemFolders(fid).length, m=itemsInFolder(fid).length;
  const bits=[];
  if(n) bits.push(n+' folder'+(n>1?'s':''));
  if(m) bits.push(m+' item'+(m>1?'s':''));
  return bits.length?bits.join(', '):'Empty';
}

function crumbsHTML(kind, folderId){
  const isLib=kind==='library';
  const path = isLib ? itemFolderPath(folderId) : marketFolderPath(folderId);
  const rootLabel = isLib ? 'All items' : 'Listings';
  let html=`<div class="crumbs"><button data-crumb="">${esc(rootLabel)}</button>`;
  for(const f of path) html+=`<span class="sep">/</span><button data-crumb="${f.id}">${esc(f.name)}</button>`;
  html+='</div>';
  return html;
}

/* ---- Phase 3, the SCC commit: the rest of this file's region, which could
   not move until the whole 49-name component could. Move-only. ---- */
/* ------------------------- library: item/folder tiles + grid ------------------------- */
/* nothing is created until Save, so cancelling a new item leaves no "Untitled" behind */
function createLibItem(){ itemDialog(null); }
function duplicateLibItem(id){
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  const c=clone(it);
  c.id=uniqueId(it.id+'-copy', new Set(S.inventory.map(x=>x.id)));
  c.name=it.name+' copy';
  S.inventory.push(c);
  save(); renderLibAll();
  libFlash('Duplicated');
}
function deleteLibItem(id){
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  const n=S.layouts.reduce((a,l)=>a+l.placed.filter(p=>p.itemId===id).length,0);
  const kill=()=>{
    purgeItem(id); selectClear();
    save(); renderInv(); renderSel(); draw(); renderLibAll();
  };
  if(n) askConfirm('Delete this item?', 'It is placed in '+n+' spot'+(n>1?'s':'')+' across your rooms. Those will be removed too.', 'Delete', kill);
  else askConfirm('Delete this item?', '“'+it.name+'” will be removed for good.', 'Delete', kill);
}
function libItemMenu(id, anchor){
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  openMenu(anchor, [
    {label:'Edit…', fn:()=>itemDialog(id)},
    {label:'Move to folder…', fn:()=>moveLibItemDialog(it)},
    {label:'Duplicate', fn:()=>duplicateLibItem(id)},
    {label:'Export…', fn:()=>exportLibItems([it], 'room-planner-'+fileSlug(it.name)+'.json')},
    {sep:true},
    {label:'Delete…', danger:true, fn:()=>deleteLibItem(id)},
  ], it.name);
}
function renderLibraryFolder(box, folderId){
  const f=itemFolderOf(folderId);
  const subs=childItemFolders(folderId), items=itemsInFolder(folderId);
  let html=crumbsHTML('library', folderId);
  const bits=[]; if(subs.length) bits.push(plural(subs.length,'folder')); if(items.length) bits.push(plural(items.length,'item'));
  html+=`<div class="viewhead"><span class="hint grow">${bits.join(', ')}</span>
    ${f?'<button class="btn sm" id="btnFolderTags">Folder tags…</button>':''}
    ${(subs.length||items.length)?`<button class="btn sm" id="btnFolderExport">${f?'Export folder':'Export…'}</button>`:''}</div>`;
  const inherited = f ? ancestorTags(folderId) : [];
  if(f && inherited.length){
    html+=`<div class="foldertagbar"><span class="lbl">Everything here is tagged</span>
      ${inherited.map(t=>`<span class="tagchip">${esc(t)}</span>`).join('')}</div>`;
  }
  if(!subs.length && !items.length){
    html+=`<div class="grid"><div class="empty">${f?'This folder is empty. Drag items onto it in the tree, or':'Your library is empty.'}
      <div class="row"><button class="btn sm primary" data-newitem>${svgI('plus')}New item</button></div></div></div>`;
  } else {
    html+=`<div class="grid">${subs.map(folderTile).join('')}${items.map(itemTile).join('')}</div>`;
  }
  box.innerHTML=html;
  bindCrumbs(box,'library');
  if(f) $('btnFolderTags').addEventListener('click', ()=>libFolderTagsDialog(f.id));
  if($('btnFolderExport')) $('btnFolderExport').addEventListener('click', ()=> f ? exportLibFolder(folderId) : exportLibraryDialog());
  const ni=box.querySelector('[data-newitem]'); if(ni) ni.addEventListener('click', createLibItem);
  bindLibGrid(box,'library');
}
function bindLibGrid(box, kind){
  box.querySelectorAll('[data-openfolder]').forEach(t=>{
    t.addEventListener('click', ()=>goLibFolder(kind, t.dataset.openfolder));
  });
  if(kind==='library'){
    box.querySelectorAll('[data-item]').forEach(t=>{
      const it=S.inventory.find(x=>x.id===t.dataset.item);
      const cvp=t.querySelector('canvas[data-prev]'); if(cvp&&it) drawPreview(cvp,it);
      t.addEventListener('click', e=>{
        if(e.target.closest('[data-act=more]')) return;
        itemDialog(t.dataset.item);
      });
      t.addEventListener('keydown', e=>{
        if(e.target!==t || (e.key!=='Enter'&&e.key!==' ')) return;
        e.preventDefault(); itemDialog(t.dataset.item);
      });
      const more=t.querySelector('[data-act=more]');
      more.addEventListener('click', e=>{ e.stopPropagation(); libItemMenu(t.dataset.item, e.currentTarget); });
      more.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); libItemMenu(t.dataset.item, more); } });
      t.addEventListener('dragstart', e=>{
        setGridDragItem(t.dataset.item); t.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        try{ e.dataTransfer.setData('text/plain',gridDragItem); }catch(err){}
      });
      t.addEventListener('dragend', ()=>{ setGridDragItem(null); t.classList.remove('dragging'); clearDropMarks(); });
    });
    box.querySelectorAll('[data-openfolder]').forEach(t=>{
      t.addEventListener('dragover', e=>{ if(!gridDragItem) return; e.preventDefault(); t.classList.add('dragover'); });
      t.addEventListener('dragleave', ()=>t.classList.remove('dragover'));
      t.addEventListener('drop', e=>{
        e.preventDefault(); t.classList.remove('dragover');
        if(!gridDragItem) return;
        const it=S.inventory.find(x=>x.id===gridDragItem); if(!it) return;
        moveItemToFolder(it, t.dataset.openfolder);
        setGridDragItem(null); save(); renderLibAll();
        libFlash('Moved “'+it.name+'”');
      });
    });
  } else {
    box.querySelectorAll('[data-listing]').forEach(t=>{
      t.addEventListener('click', e=>{
        if(e.target.closest('[data-act=more]')) return;
        selectListing(t.dataset.listing);
      });
      const more=t.querySelector('[data-act=more]');
      if(more) more.addEventListener('click', e=>{ e.stopPropagation(); listingMenu(t.dataset.listing, e.currentTarget); });
    });
  }
}
function bindCrumbs(box, kind){
  box.querySelectorAll('[data-crumb]').forEach(b=>{
    b.addEventListener('click', ()=>goLibFolder(kind, b.dataset.crumb||null));
  });
}
export {gridDragItem, setGridDragItem, itemTile, folderTile, folderCountLabel, crumbsHTML, createLibItem, duplicateLibItem, deleteLibItem, libItemMenu, renderLibraryFolder, bindLibGrid, bindCrumbs};
