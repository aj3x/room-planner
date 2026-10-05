// @ts-check
/* Ad hoc market folders and listings: the older upload/paste/flat-link path
   for sharing a one-off bundle, unrelated to MARKET_SCHEMA.md. The folder
   lookups, plus the one place a listing reaches the network. What shows or
   edits a listing is the Library's (features/library/). */
import {normItem} from '../../kernel/migrate.js';
import {S, clone} from '../../kernel/state.js';
import {fetchJSON} from './market-subs.js';

/* ------------------------- ad hoc market folders & listings (upload/paste/link a one-off bundle) ------------------------- */
/** @typedef {import('../../kernel/types.js').Item} Item */
/** @typedef {import('../../kernel/types.js').MarketFolder} MarketFolder */
/** @typedef {{items: Item[], error?: undefined} | {error: string, items?: undefined}} ListingLoad */

/** @param {string|null|undefined} pid */
const childMarketFolders = pid => S.marketFolders.filter(f=>(f.parentId||null)===(pid||null));
/** @param {string|null|undefined} id */
const marketFolderOf = id => id ? S.marketFolders.find(f=>f.id===id) : null;
/** @param {string|null|undefined} fid */
const listingsInFolder = fid => S.marketListings.filter(l=>(l.parentId||null)===(fid||null));
/** @param {string} id @param {string|null|undefined} parentId */
function marketFolderDescendant(id,parentId){
  let f=marketFolderOf(parentId);
  while(f){ if(f.id===id) return true; f=marketFolderOf(f.parentId); }
  return false;
}
/** @param {string|null|undefined} id @returns {MarketFolder[]} root first */
function marketFolderPath(id){
  /** @type {MarketFolder[]} */
  const out=[]; let f=marketFolderOf(id);
  while(f){ out.unshift(f); f=marketFolderOf(f.parentId); }
  return out;
}
/** @type {Map<string, ListingLoad>} */
const adhocCache=new Map();   // listingId -> {items, error} — never persisted, refetched per session
/* the one place an ad hoc listing reaches out over the network, and only when it's opened */
/** @param {import('../../kernel/types.js').MarketListing} l @returns {Promise<ListingLoad>} */
async function loadListing(l){
  if(l.kind==='file') return {items:(l.content&&l.content.inventory)||[]};
  if(adhocCache.has(l.id)) return /** @type {ListingLoad} */(adhocCache.get(l.id));
  try{
    const data=await fetchJSON(/** @type {string} */(l.url));   // a link listing has one
    if(!data||!Array.isArray(data.inventory)) throw new Error('No "inventory" array in that file');
    const out={items:data.inventory.filter((/** @type {any} */i)=>i&&typeof i==='object'&&i.shape).map((/** @type {any} */i)=>normItem(clone(i)))};
    adhocCache.set(l.id, out);
    return out;
  }catch(e){
    return {error:'Couldn’t load this link (' + /** @type {Error} */(e).message + '). The site may not allow cross-origin requests — try Paste JSON instead when adding a listing.'};
  }
}
export {childMarketFolders, marketFolderOf, listingsInFolder, marketFolderDescendant, marketFolderPath, adhocCache, loadListing};
