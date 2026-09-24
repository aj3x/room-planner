/* The Library/Marketplace content router: which view renderLibAll paints into
   #libContent.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only. §3 files this at src/router.js; it routes library content and
   nothing else, so it lives with the rest of library/.
*/
import {S} from '../core/state.js';
import {$} from '../ui/modal.js';
import {renderAdhocFolder, renderListingDetail} from './adhoc-listings.js';
import {renderLibraryFolder} from './grid.js';
import {renderMarketSub, renderMarketTop} from './marketplace.js';
import {nav} from './nav.js';
import {renderLibSearchResults} from './search.js';

/* ------------------------- main content router ------------------------- */
function renderLibContent(){
  const box=$('libContent');
  // a marketplace subscription owns search/filter within itself (scoped to the folder you're
  // browsing there), so route to it before the generic search view even while nav.searching is set
  if(nav.tab==='market' && nav.marketSubId){
    const sub=S.marketSubs.find(s=>s.id===nav.marketSubId);
    if(sub){ renderMarketSub(box, sub); return; }
    nav.marketSubId=null;
  }
  if(nav.searching){ renderLibSearchResults(box); return; }
  if(nav.tab==='library'){ renderLibraryFolder(box, nav.libFolderId); return; }
  if(nav.marketSelListingId){ renderListingDetail(box, nav.marketSelListingId); return; }
  if(nav.marketFolderId!=null){ renderAdhocFolder(box, nav.marketFolderId, true); return; }
  renderMarketTop(box);
  renderAdhocFolder(box, null);
}
export {renderLibContent};
