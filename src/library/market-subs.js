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
import {idProblem} from '../core/ids.js';
import {normItem} from '../core/migrate.js';
import {S, clone, uid} from '../core/state.js';
import {save} from '../core/store.js';

/* ------------------------- marketplace subscriptions: fetch & cache (MARKET_SCHEMA.md) -------------------------
   A subscription is a live market.json URL. Its item index is fetched in full up front (it's just
   id/name/tags, kept small by convention); item bodies are fetched one at a time, on demand, and
   both caches are in-memory only — disposable, never persisted, never load-bearing for correctness. */
const MARKET_VERSIONS=new Set([1]);
async function fetchJSON(url, timeoutMs){
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(), timeoutMs||10000);
  try{
    const res=await fetch(url,{signal:ctl.signal});
    clearTimeout(t);
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  }catch(e){
    clearTimeout(t);
    throw new Error(e.name==='AbortError' ? 'timed out' : e.message);
  }
}
const resolveURL = (base,rel) => new URL(rel, base).href;
const marketIndexCache=new Map();   // subId -> [{id,name,tags}]
const marketItemCache=new Map();    // subId -> Map(itemId -> item)
const DEFAULT_MARKET_URL='https://raw.githubusercontent.com/aj3x/room-planner/main/marketplace/market.json';
async function ensureDefaultMarket(){
  if(S.defaultMarketDismissed) return;
  if(S.marketSubs.some(s=>s.url===DEFAULT_MARKET_URL)) return;
  try{
    const sub=await subscribeMarket(DEFAULT_MARKET_URL);
    sub.isDefault=true;
    save();
  }catch(e){ /* offline, or unreachable right now — try again next launch */ }
}
async function subscribeMarket(url){
  let manifest;
  try{ manifest=await fetchJSON(url); }
  catch(e){ throw new Error('Couldn’t reach that marketplace ('+e.message+')'); }
  if(!manifest||manifest.app!=='room-planner-marketplace') throw new Error('That doesn’t look like a Room Planner marketplace file');
  if(!MARKET_VERSIONS.has(manifest.version)) throw new Error('This marketplace uses a format this app doesn’t understand yet');
  const shardUrls=(manifest.index&&Array.isArray(manifest.index.shards))?manifest.index.shards:[];
  if(!shardUrls.length) throw new Error('That marketplace has no index');
  let shards;
  try{ shards=await Promise.all(shardUrls.map(u=>fetchJSON(resolveURL(url,u)))); }
  catch(e){ throw new Error('Couldn’t load that marketplace’s index ('+e.message+')'); }
  const items=[];
  for(const sh of shards){
    if(!sh||sh.app!=='room-planner-marketplace-index'||!MARKET_VERSIONS.has(sh.version)||!Array.isArray(sh.items))
      throw new Error('One of that marketplace’s index shards is invalid');
    for(const it of sh.items) if(it&&it.id&&!idProblem(it.id)) items.push({id:it.id, name:it.name||it.id, tags:Array.isArray(it.tags)?it.tags:[]});
  }
  const sub={id:uid(), url, name:manifest.name||url, version:manifest.version, itemURL:manifest.itemURL||'items/{id}.json', addedAt:Date.now()};
  S.marketSubs.push(sub);
  marketIndexCache.set(sub.id, items);
  save();
  return sub;
}
async function reloadMarketSub(sub){
  const fresh=await subscribeMarket(sub.url);        // validates + refetches fully under a new id
  sub.name=fresh.name; sub.version=fresh.version; sub.itemURL=fresh.itemURL;
  marketIndexCache.set(sub.id, marketIndexCache.get(fresh.id));
  marketIndexCache.delete(fresh.id);
  marketItemCache.delete(sub.id);
  S.marketSubs=S.marketSubs.filter(s=>s.id!==fresh.id);
  save();
}
function removeMarketSub(sub){
  S.marketSubs=S.marketSubs.filter(s=>s.id!==sub.id);
  marketIndexCache.delete(sub.id);
  marketItemCache.delete(sub.id);
  if(sub.isDefault||sub.url===DEFAULT_MARKET_URL) S.defaultMarketDismissed=true;
  save();
}
async function fetchMarketItem(sub, id){
  if(!marketItemCache.has(sub.id)) marketItemCache.set(sub.id, new Map());
  const cache=marketItemCache.get(sub.id);
  if(cache.has(id)) return cache.get(id);
  const url=resolveURL(sub.url, sub.itemURL.replace('{id}', encodeURIComponent(id).replace(/%2F/g,'/')));
  let raw;
  try{ raw=await fetchJSON(url); }
  catch(e){ throw new Error('Couldn’t load that item ('+e.message+')'); }
  if(!raw||raw.app!=='room-planner-item') throw new Error('That item file is invalid');
  if(!MARKET_VERSIONS.has(raw.version)) throw new Error('This item uses a format this app doesn’t understand yet');
  const it=normItem(clone(raw));
  it.id=id;   // trust the index entry's id, the one the user actually clicked
  cache.set(id, it);
  return it;
}
async function loadRegistry(url){
  const data=await fetchJSON(url);
  if(!data||data.app!=='room-planner-registry'||!MARKET_VERSIONS.has(data.version)||!Array.isArray(data.marketplaces))
    throw new Error('That doesn’t look like a Room Planner registry file');
  return data.marketplaces.filter(m=>m&&m.url);
}
export {MARKET_VERSIONS, fetchJSON, resolveURL, marketIndexCache, marketItemCache, DEFAULT_MARKET_URL, ensureDefaultMarket, subscribeMarket, reloadMarketSub, removeMarketSub, fetchMarketItem, loadRegistry};
