/* Ad hoc market folders and listings: the older upload/paste/flat-link path
   for sharing a one-off bundle, unrelated to MARKET_SCHEMA.md. The folder
   lookups, plus the one place a listing reaches the network.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   What renders or edits a listing did not come -- renderAdhocFolder,
   listingMenu, addListingDialog, moveListingDialog and renderListingDetail
   all reach renderLibAll, which is in the reference cycle between the Plan
   side panels and the Library UI.
*/
import {normItem} from '../core/migrate.js';
import {S, clone} from '../core/state.js';
import {fetchJSON} from './market-subs.js';

/* ------------------------- ad hoc market folders & listings (upload/paste/link a one-off bundle) ------------------------- */
const childMarketFolders = pid => S.marketFolders.filter(f=>(f.parentId||null)===(pid||null));
const marketFolderOf = id => id ? S.marketFolders.find(f=>f.id===id) : null;
const listingsInFolder = fid => S.marketListings.filter(l=>(l.parentId||null)===(fid||null));
function marketFolderDescendant(id,parentId){
  let f=marketFolderOf(parentId);
  while(f){ if(f.id===id) return true; f=marketFolderOf(f.parentId); }
  return false;
}
function marketFolderPath(id){
  const out=[]; let f=marketFolderOf(id);
  while(f){ out.unshift(f); f=marketFolderOf(f.parentId); }
  return out;
}
const adhocCache=new Map();   // listingId -> {items, error} — never persisted, refetched per session
/* the one place an ad hoc listing reaches out over the network, and only when it's opened */
async function loadListing(l){
  if(l.kind==='file') return {items:(l.content&&l.content.inventory)||[]};
  if(adhocCache.has(l.id)) return adhocCache.get(l.id);
  try{
    const data=await fetchJSON(l.url);
    if(!data||!Array.isArray(data.inventory)) throw new Error('No "inventory" array in that file');
    const out={items:data.inventory.filter(i=>i&&typeof i==='object'&&i.shape).map(i=>normItem(clone(i)))};
    adhocCache.set(l.id, out);
    return out;
  }catch(e){
    return {error:'Couldn’t load this link (' + e.message + '). The site may not allow cross-origin requests — try Paste JSON instead when adding a listing.'};
  }
}
export {childMarketFolders, marketFolderOf, listingsInFolder, marketFolderDescendant, marketFolderPath, adhocCache, loadListing};
