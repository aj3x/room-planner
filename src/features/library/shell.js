/* The Library/Marketplace shell: the whole rebuild (renderLibAll) and the
   toolbar above the grid.

   renderLibAll runs as an effect on the library, the project and the view
   settings (mountLibrary): a library edit commits through transact('lib')
   and the page follows. Browsing within the content — a subscription, a
   listing, a marketplace sub-folder — changes `nav` and calls navChanged()
   (features/library/nav.js); the content is an effect on that too.
*/
import {S, isCanvasMode, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {$, askText, svgI} from '../../ui-kit/modal.js';
import {addListingDialog} from './adhoc-listings.js';
import {askNewLibFolder} from './folder-menus.js';
import {createLibItem} from './grid.js';
import {addMarketDialog} from './marketplace.js';
import {libTreeOpen, nav, navRev} from './nav.js';
import {renderLibContent} from './router.js';
import {renderLibTree} from './tree.js';
import {effect, rev, untracked} from '../../kernel/signals.js';
import {mountPanel} from '../../ui-kit/mount.js';

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
        transact('lib', ()=>{
          S.itemFolders.push({id:uid(),name:n,parentId:nav.libFolderId,tags});
          if(nav.libFolderId) libTreeOpen.add(nav.libFolderId);
        });
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
        transact('lib', ()=>{
          S.marketFolders.push({id:uid(),name:n,parentId:nav.marketFolderId});
          if(nav.marketFolderId) libTreeOpen.add('m:'+nav.marketFolderId);
        });
      });
    });
    $('btnAddListing').addEventListener('click', addListingDialog);
  }
}
/* The Library page, as an effect (ui-kit/mount.js). It runs on every library,
   project or settings commit, and does nothing while a Plan mode is showing;
   setMode() into a Library place is a prefs commit, so it paints on arrival.
   It holds while a folder is being renamed in the tree. */
function mountLibrary(){
  mountPanel('tree', () => { rev.lib.value; rev.prefs.value; rev.project.value; }, renderLibAll);
  /* Browsing repaints only the content, at once, as the direct call it
     replaces did. The first run is the subscription; the page is already
     painted. */
  let first=true;
  effect(() => { navRev.value; if(first){ first=false; return; } untracked(renderLibContent); });
}
export {mountLibrary, renderLibAll, renderLibTools};
