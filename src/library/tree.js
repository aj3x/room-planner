/* The Library/Marketplace left tree: folders only, for both tabs.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   libTreeBox is a top-level DOM read, the same call ui/modal.js makes for
   `mo` and plan/item-list.js for `invBox`: a lookup, no context taken, and
   nothing in ui/ or canvas/ imports this file, so it is in no cycle.

   The listeners that follow it in index.html stayed there, per rule 6, and
   read libTreeBox as an imported binding. renameLibFolder and
   renameAdhocFolder stayed too -- both call renderLibAll, and are inside the
   Plan-panels/Library SCC.
*/
import {S} from '../core/state.js';
import {childMarketFolders, listingsInFolder} from './adhoc-folders.js';
import {childItemFolders, itemCountInSubtree} from './item-folders.js';
import {libTreeOpen, nav} from './nav.js';
import {moreBtn} from '../ui/menu.js';
import {$, svgI} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';

/* ------------------------- library tree: folders only ------------------------- */
function folderTagsInline(f){
  if(!f.tags||!f.tags.length) return '';
  return `<span class="tagchip inherit" title="Everything inside is tagged: ${esc(f.tags.join(', '))}">${esc(f.tags[0])}${f.tags.length>1?' +'+(f.tags.length-1):''}</span>`;
}
function renderLibTreeLevel(parentId,depth){
  let html='';
  for(const f of childItemFolders(parentId)){
    const open=libTreeOpen.has(f.id);
    const n=itemCountInSubtree(f.id);
    html+=`<div class="tree-row" draggable="true" data-folder="${f.id}" aria-expanded="${open}">
      <span class="caret-zone" data-act="toggle" style="width:${depth*12+16}px">${svgI(open?'chev-d':'chev-r')}</span>
      <span class="ico">${svgI('folder')}</span><span class="nm">${esc(f.name)}</span>${folderTagsInline(f)}
      ${n?`<span class="count" title="${plural(n,'item')} in this folder">${n}</span>`:''}
      ${moreBtn('tree-more')}
    </div>`;
    if(open) html+=renderLibTreeLevel(f.id,depth+1);
  }
  return html;
}
function renderMarketTreeLevel(parentId,depth){
  let html='';
  for(const f of childMarketFolders(parentId)){
    const key='m:'+f.id, open=libTreeOpen.has(key);
    html+=`<div class="tree-row" draggable="true" data-mfolder="${f.id}" aria-expanded="${open}">
      <span class="caret-zone" data-act="toggle" style="width:${depth*12+16}px">${svgI(open?'chev-d':'chev-r')}</span>
      <span class="ico">${svgI('folder')}</span><span class="nm">${esc(f.name)}</span>
      ${moreBtn('tree-more')}
    </div>`;
    if(open) html+=renderMarketTreeLevel(f.id,depth+1);
  }
  for(const l of listingsInFolder(parentId)){
    html+=`<div class="tree-row ${nav.marketSelListingId===l.id?'active':''}" draggable="false" data-listing="${l.id}">
      <span class="caret-zone" style="width:${depth*12+16}px"></span>
      <span class="ico">${svgI(l.kind==='link'?'link':'box')}</span><span class="nm">${esc(l.name)}</span>
      ${moreBtn('tree-more')}
    </div>`;
  }
  return html;
}
function renderLibTree(){
  const box=$('tree');
  if(nav.tab==='library'){
    const n0=S.inventory.length;
    box.innerHTML=`<div class="tree-row root-row ${nav.libFolderId===null&&!nav.searching?'active':''}" data-root="1">
        <span class="caret-zone"></span><span class="ico">${svgI('library')}</span><span class="nm">All items</span>${n0?`<span class="count" title="${plural(n0,'item')}">${n0}</span>`:''}</div>`
      + renderLibTreeLevel(null,1);
  } else {
    box.innerHTML=`<div class="tree-row root-row ${nav.marketFolderId===null&&!nav.searching&&!nav.marketSelListingId?'active':''}" data-root="1">
        <span class="caret-zone"></span><span class="ico">${svgI('store')}</span><span class="nm">Marketplaces &amp; listings</span></div>`
      + renderMarketTreeLevel(null,1);
  }
  markActiveTreeRow();
}
function markActiveTreeRow(){
  const box=$('tree');
  for(const row of box.querySelectorAll('.tree-row')) row.classList.remove('active');
  if(nav.searching) return;
  if(nav.tab==='library'){
    if(nav.libFolderId===null){ const r=box.querySelector('[data-root]'); if(r) r.classList.add('active'); }
    else { const r=box.querySelector('[data-folder="'+nav.libFolderId+'"]'); if(r) r.classList.add('active'); }
  } else {
    if(nav.marketFolderId===null){ const r=box.querySelector('[data-root]'); if(r) r.classList.add('active'); }
    else { const r=box.querySelector('[data-mfolder="'+nav.marketFolderId+'"]'); if(r) r.classList.add('active'); }
  }
}
const libTreeBox=$('tree');
export {folderTagsInline, renderLibTreeLevel, renderMarketTreeLevel, renderLibTree, markActiveTreeRow, libTreeBox};
