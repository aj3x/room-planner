// @ts-check
/* Marketplace subscriptions: fetch and cache. A subscription is a live
   market.json URL per MARKET_SCHEMA.md; the two Maps below are in-memory only
   and are never persisted (rule 5: the caches live in a module that nothing
   reaches through).

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   What renders a subscription did not come -- renderMarketTop, renderMarketSub,
   addMarketDialog, subMenu and addMarketItemToInventory all reach
   renderLibAll, which is in the reference cycle between the Plan side panels
   and the Library UI (see .claude/plans/refactor-split.md, the plan/ round).
*/
import {idProblem} from '../../kernel/ids.js';
import {normItem} from '../../kernel/migrate.js';
import {S, clone, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';

/* ------------------------- marketplace subscriptions: fetch & cache (MARKET_SCHEMA.md) -------------------------
   A subscription is a live market.json URL. Its item index is fetched in full up front (it's just
   id/name/tags, kept small by convention); item bodies are fetched one at a time, on demand, and
   both caches are in-memory only — disposable, never persisted, never load-bearing for correctness. */
const MARKET_VERSIONS=new Set([1]);
/** @typedef {import('../../kernel/types.js').MarketSub} MarketSub */
/** An index entry: all a catalogue lists about an item. @typedef {{id: string, name: string, tags: string[]}} MarketEntry */

/* What fetchJSON returns is whatever the server sent, so it is any; every
   caller checks app/version before reading further. */
/** @param {string} url @param {number} [timeoutMs] @returns {Promise<any>} */
async function fetchJSON(url, timeoutMs){
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(), timeoutMs||10000);
  try{
    const res=await fetch(url,{signal:ctl.signal});
    clearTimeout(t);
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  }catch(e){
    clearTimeout(t);
    throw new Error(/** @type {Error} */(e).name==='AbortError' ? 'timed out' : /** @type {Error} */(e).message);
  }
}
/** @param {string} base @param {string} rel */
const resolveURL = (base,rel) => new URL(rel, base).href;
/** @type {Map<string, MarketEntry[]>} */
const marketIndexCache=new Map();   // subId -> [{id,name,tags}]
/** @type {Map<string, Map<string, import('../../kernel/types.js').Item>>} */
const marketItemCache=new Map();    // subId -> Map(itemId -> item)
const DEFAULT_MARKET_URL='https://raw.githubusercontent.com/aj3x/room-planner/main/marketplace/market.json';
async function ensureDefaultMarket(){
  if(S.defaultMarketDismissed) return;
  if(S.marketSubs.some(s=>s.url===DEFAULT_MARKET_URL)) return;
  try{
    const sub=await subscribeMarket(DEFAULT_MARKET_URL);
    transact('lib', ()=>{ sub.isDefault=true; });
  }catch(e){ /* offline, or unreachable right now — try again next launch */ }
}
/* Fetch and validate a marketplace's manifest and index. Commits nothing. */
/** @param {string} url */
async function fetchMarket(url){
  let manifest;
  try{ manifest=await fetchJSON(url); }
  catch(e){ throw new Error('Couldn’t reach that marketplace ('+/** @type {Error} */(e).message+')'); }
  if(!manifest||manifest.app!=='room-planner-marketplace') throw new Error('That doesn’t look like a Room Planner marketplace file');
  if(!MARKET_VERSIONS.has(manifest.version)) throw new Error('This marketplace uses a format this app doesn’t understand yet');
  const shardUrls=(manifest.index&&Array.isArray(manifest.index.shards))?manifest.index.shards:[];
  if(!shardUrls.length) throw new Error('That marketplace has no index');
  let shards;
  try{ shards=await Promise.all(shardUrls.map((/** @type {string} */u)=>fetchJSON(resolveURL(url,u)))); }
  catch(e){ throw new Error('Couldn’t load that marketplace’s index ('+/** @type {Error} */(e).message+')'); }
  /** @type {MarketEntry[]} */
  const items=[];
  for(const sh of shards){
    if(!sh||sh.app!=='room-planner-marketplace-index'||!MARKET_VERSIONS.has(sh.version)||!Array.isArray(sh.items))
      throw new Error('One of that marketplace’s index shards is invalid');
    for(const it of sh.items) if(it&&it.id&&!idProblem(it.id)) items.push({id:it.id, name:it.name||it.id, tags:Array.isArray(it.tags)?it.tags:[]});
  }
  return {manifest, items};
}
/** @param {string} url @returns {Promise<MarketSub>} */
async function subscribeMarket(url){
  const {manifest, items}=await fetchMarket(url);
  /** @type {MarketSub} */
  const sub={id:uid(), url, name:manifest.name||url, version:manifest.version, itemURL:manifest.itemURL||'items/{id}.json', addedAt:Date.now()};
  transact('lib', ()=>{ S.marketSubs.push(sub); marketIndexCache.set(sub.id, items); });
  return sub;
}
/* One refetch per subscription at a time. The Marketplace page asks for a
   subscription it has no index for every time it paints, and it repaints on
   every library commit (it is an effect), so without this a slow fetch would
   be asked for again on each of them. */
/** @type {Map<string, Promise<void>>} */
const reloading=new Map();
/** @param {MarketSub} sub */
function reloadMarketSub(sub){
  if(!reloading.has(sub.id)) reloading.set(sub.id, (async()=>{
    try{
      const {manifest, items}=await fetchMarket(sub.url);
      transact('lib', ()=>{
        sub.name=manifest.name||sub.url; sub.version=manifest.version; sub.itemURL=manifest.itemURL||'items/{id}.json';
        marketIndexCache.set(sub.id, items);
        marketItemCache.delete(sub.id);
      });
    } finally { reloading.delete(sub.id); }
  })());
  return /** @type {Promise<void>} */(reloading.get(sub.id));   // set just above
}
/** @param {MarketSub} sub */
function removeMarketSub(sub){
  transact('lib', ()=>{
    S.marketSubs=S.marketSubs.filter(s=>s.id!==sub.id);
    marketIndexCache.delete(sub.id);
    marketItemCache.delete(sub.id);
    if(sub.isDefault||sub.url===DEFAULT_MARKET_URL) S.defaultMarketDismissed=true;
  });
}
/** @param {MarketSub} sub @param {string} id @returns {Promise<import('../../kernel/types.js').Item>} */
async function fetchMarketItem(sub, id){
  if(!marketItemCache.has(sub.id)) marketItemCache.set(sub.id, new Map());
  const cache=/** @type {Map<string, import('../../kernel/types.js').Item>} */(marketItemCache.get(sub.id));   // set just above
  if(cache.has(id)) return /** @type {import('../../kernel/types.js').Item} */(cache.get(id));
  const url=resolveURL(sub.url, sub.itemURL.replace('{id}', encodeURIComponent(id).replace(/%2F/g,'/')));
  let raw;
  try{ raw=await fetchJSON(url); }
  catch(e){ throw new Error('Couldn’t load that item ('+/** @type {Error} */(e).message+')'); }
  if(!raw||raw.app!=='room-planner-item') throw new Error('That item file is invalid');
  if(!MARKET_VERSIONS.has(raw.version)) throw new Error('This item uses a format this app doesn’t understand yet');
  const it=normItem(clone(raw));
  it.id=id;   // trust the index entry's id, the one the user actually clicked
  cache.set(id, it);
  return it;
}
/** @param {string} url @returns {Promise<{name?: string, url: string}[]>} */
async function loadRegistry(url){
  const data=await fetchJSON(url);
  if(!data||data.app!=='room-planner-registry'||!MARKET_VERSIONS.has(data.version)||!Array.isArray(data.marketplaces))
    throw new Error('That doesn’t look like a Room Planner registry file');
  return data.marketplaces.filter((/** @type {any} */m)=>m&&m.url);
}
export {MARKET_VERSIONS, fetchJSON, resolveURL, marketIndexCache, marketItemCache, DEFAULT_MARKET_URL, ensureDefaultMarket, subscribeMarket, reloadMarketSub, removeMarketSub, fetchMarketItem, loadRegistry};
