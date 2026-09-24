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
export {gridDragItem, setGridDragItem, itemTile, folderTile, folderCountLabel, crumbsHTML};
