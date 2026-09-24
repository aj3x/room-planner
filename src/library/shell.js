/* The Library/Marketplace shell: which folder is being browsed, the whole
   rebuild (renderLibAll) and the toolbar above the grid.

   renderLibAll is the far side of the cycle that made this a single
   strongly-connected component with the Plan side panels: setMode() and
   itemDialog() call it, and four library functions call back into
   itemDialog()/renderSel().

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only.
*/
import {S, isCanvasMode, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {$, askText, svgI} from '../ui/modal.js';
import {addListingDialog} from './adhoc-listings.js';
import {askNewLibFolder} from './folder-menus.js';
import {createLibItem} from './grid.js';
import {addMarketDialog} from './marketplace.js';
import {libTreeOpen, nav} from './nav.js';
import {renderLibContent} from './router.js';
import {renderLibTree} from './tree.js';

function goLibFolder(kind,id){
  if(kind==='library'){ nav.libFolderId=id; S.uiLib.libFolderId=id; }
  else { nav.marketFolderId=id; S.uiLib.marketFolderId=id; nav.marketSubId=null; nav.subPath=null; nav.marketSelListingId=null; }
  nav.searching=false; $('searchBox').value='';
  save(); renderLibAll();
}

/* ------------------------- rendering: shell ------------------------- */
function renderLibAll(){
  if(isCanvasMode(S.mode)) return;
  nav.tab = S.mode==='marketplace' ? 'market' : 'library';
  $('libTitle').textContent = nav.tab==='library' ? 'Library' : 'Marketplace';
  $('searchBox').placeholder = nav.tab==='library' ? 'Search items and tags' : 'Search the marketplace';
  $('searchBox').setAttribute('aria-label', $('searchBox').placeholder);
  renderLibTools();
  renderLibTree();
  renderLibContent();
}
function renderLibTools(){
  const box=$('explTools');
  if(nav.tab==='library'){
    box.innerHTML=`<button class="btn sm primary" id="btnNewLibItem">${svgI('plus')}New item</button>
      <button class="btn sm" id="btnNewLibFolder">${svgI('folder-plus')}New folder</button>`;
    $('btnNewLibFolder').addEventListener('click', ()=>{
      askNewLibFolder('New folder', (n,tags)=>{
        S.itemFolders.push({id:uid(),name:n,parentId:nav.libFolderId,tags});
        if(nav.libFolderId) libTreeOpen.add(nav.libFolderId);
        save(); renderLibAll();
      });
    });
    $('btnNewLibItem').addEventListener('click', createLibItem);
  } else {
    box.innerHTML=`<button class="btn sm primary" id="btnAddMarket">${svgI('plus')}Add marketplace…</button>
      <button class="btn sm" id="btnAddListing">Add listing…</button>
      <button class="btn sm icon" id="btnNewMFolder" title="New folder for listings" aria-label="New folder for listings">${svgI('folder-plus')}</button>`;
    $('btnAddMarket').addEventListener('click', addMarketDialog);
    $('btnNewMFolder').addEventListener('click', ()=>{
      askText('New folder','Name','Folder', n=>{
        S.marketFolders.push({id:uid(),name:n,parentId:nav.marketFolderId});
        if(nav.marketFolderId) libTreeOpen.add('m:'+nav.marketFolderId);
        save(); renderLibAll();
      });
    });
    $('btnAddListing').addEventListener('click', addListingDialog);
  }
}
export {goLibFolder, renderLibAll, renderLibTools};
