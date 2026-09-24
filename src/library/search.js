/* Library search, scoped to the folder currently being browsed.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only.
*/
import {S} from '../core/state.js';
import {$} from '../ui/modal.js';
import {esc, normSearch} from '../ui/panels.js';
import {listingTile} from './adhoc-listings.js';
import {adhocFolderContents} from './folder-menus.js';
import {bindCrumbs, bindLibGrid, crumbsHTML, itemTile} from './grid.js';
import {itemFolderSubtreeIds} from './item-folders.js';
import {nav} from './nav.js';

/* ------------------------- search, scoped to the folder currently being browsed ------------------------- */
function renderLibSearchResults(box){
  const qRaw=$('searchBox').value.trim();
  const nq=normSearch(qRaw);
  if(nav.tab==='library'){
    const ids=itemFolderSubtreeIds(nav.libFolderId);
    const scope=S.inventory.filter(it=>ids.has(it.folderId||null));
    const hits=scope.filter(it=>normSearch(it.name).includes(nq) || (it.tags||[]).some(t=>normSearch(t).includes(nq)));
    let html=crumbsHTML('library', nav.libFolderId).replace('</div>', `<span class="sep">/</span><button>Search: "${esc(qRaw)}"</button></div>`);
    html += hits.length
      ? `<div class="grid">${hits.map(itemTile).join('')}</div>`
      : `<div class="grid"><div class="empty">Nothing matches “${esc(qRaw)}” here.</div></div>`;
    box.innerHTML=html;
    bindCrumbs(box,'library');
    bindLibGrid(box,'library');
  } else {
    const {listings}=adhocFolderContents(nav.marketFolderId);
    const hits=listings.filter(l=>normSearch(l.name).includes(nq));
    let html=crumbsHTML('market', nav.marketFolderId).replace('</div>', `<span class="sep">/</span><button>Search: "${esc(qRaw)}"</button></div>`);
    html += hits.length
      ? `<div class="grid">${hits.map(listingTile).join('')}</div>`
      : `<div class="grid"><div class="empty">Nothing matches “${esc(qRaw)}” here.</div></div>`;
    box.innerHTML=html;
    bindCrumbs(box,'market');
    bindLibGrid(box,'market');
  }
}
export {renderLibSearchResults};
