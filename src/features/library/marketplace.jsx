// @ts-check
/* The Marketplace tab's commands and dialogs: a subscription's menu, an
   item's preview, adding a marketplace, and the folders a subscription's
   index is browsed by (derived from id paths). The views are
   market-views.jsx. Opening something here changes `nav` and calls
   navChanged() (nav.js); the page follows. */
import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
import {idParts} from '../../kernel/ids.js';
import {S} from '../../kernel/state.js';
import {marketIndexCache, fetchMarketItem, loadRegistry, reloadMarketSub, removeMarketSub, subscribeMarket} from '../marketplace/index.js';
import {nav, navChanged} from './nav.js';
import {drawPreview} from './preview.js';
import {sizeLabel} from './items.js';
import {libFlash} from '../../ui-kit/flash.js';
import {openMenu} from '../../ui-kit/menu.js';
import {askConfirm, closeModal, moError, openDialog, updateDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {addMarketItemToInventory} from './add-to-inventory.jsx';

/** @typedef {import('../../kernel/types.js').Item} Item */
/** @typedef {import('../../kernel/types.js').MarketSub} MarketSub */
/** @typedef {import('../marketplace/index.js').MarketEntry} MarketEntry */

/** The folders and items one level under `prefix` in a catalogue's id paths.
    @param {MarketEntry[]} items @param {string|null} prefix */
function marketPathChildren(items, prefix){
  /** @type {Map<string, number>} */
  const folders=new Map();
  const leaves=/** @type {MarketEntry[]} */([]);
  const plen=prefix?prefix.split('/').length:0;
  for(const it of items){
    const parts=idParts(it.id);
    if(prefix && it.id!==prefix && !it.id.startsWith(prefix+'/')) continue;
    if(parts.length>plen+1){ const seg=parts[plen]; folders.set(seg, (folders.get(seg)||0)+1); }
    else if(parts.length===plen+1) leaves.push(it);
  }
  return {folders:[...folders.entries()].map(([name,n])=>({name,n})), leaves};
}

/* ------------------------- marketplace tab: subscribed markets + ad hoc listings ------------------------- */
function AddMarketBody(){
  const url = useRef(/** @type {HTMLInputElement|null} */(null));
  /* null until the registry is in, and when it could not be read */
  const [list, setList] = useState(/** @type {{name?: string, url: string}[]|null} */(null));
  useEffect(() => {
    let live=true;
    loadRegistry('registry.json').then(l=>{ if(live) setList(l); }).catch(()=>{ if(live) setList(null); });
    return () => { live=false; };
  }, []);
  useDialogOk(() => {
    const u=((url.current && url.current.value)||'').trim();
    if(!/^https?:\/\//i.test(u)){ moError('Enter a valid http(s) link to a market.json'); return false; }
    if(S.marketSubs.some(s=>s.url===u)){ moError('You already subscribe to that marketplace'); return false; }
    updateDialog({okDisabled: true});
    subscribeMarket(u).then(()=>{ closeModal(); })
      .catch(e=>{ moError(e.message); updateDialog({okDisabled: false}); });
    return false;   // keep the dialog open until the fetch settles; the .then() above closes it
  });
  return <>
    <p class="hint">Paste a <code>market.json</code> URL, or pick one from the registry below. See <code>MARKET_SCHEMA.md</code> for the format — anyone can publish one as a plain git repo.</p>
    <input type="url" id="mUrl" placeholder="https://…/market.json" ref={url}/>
    <div id="mRegistry">{!list ? null : !list.length
      ? <p class="hint">The default registry is empty right now — paste a URL above, or see <code>CONTRIBUTING.md</code> to add one.</p>
      : <><p class="hint">Or pick one:</p><div class="registry">{list.map(m=>
          <button key={m.url} type="button" class="btn sm" onClick={()=>{ if(url.current) url.current.value=m.url; }}>{m.name||m.url}</button>)}</div></>}</div>
  </>;
}
function addMarketDialog(){
  openDialog({title: 'Add a marketplace', ok: 'Subscribe', body: <AddMarketBody/>});
}

/** @param {MarketSub} sub @param {Element} anchor */
function subMenu(sub, anchor){
  openMenu(anchor, [
    {label:'Open', fn:()=>{ nav.marketSubId=sub.id; nav.subPath=null; navChanged(); }},
    {label:'Reload', fn:()=>{ reloadMarketSub(sub).then(()=>{ libFlash('Reloaded'); }).catch(e=>libFlash(e.message,true)); }},
    {sep:true},
    {label:'Remove…', danger:true, fn:()=>askConfirm('Remove this marketplace?', '“'+sub.name+'” and its cached index will be forgotten. Your library isn’t affected.', 'Remove', ()=>{
      removeMarketSub(sub);
    })},
  ], sub.name);
}

/** @param {{sub: MarketSub, id: string}} p */
function PreviewBody({sub, id}){
  const [it, setIt] = useState(/** @type {Item|null} */(null));
  const [failed, setFailed] = useState(/** @type {string|null} */(null));
  const cv = useRef(/** @type {HTMLCanvasElement|null} */(null));
  useEffect(() => {
    let live=true;
    fetchMarketItem(sub, id).then(item=>{
      if(!live) return;
      setIt(item);
      updateDialog({title: item.name, okDisabled: false});
    }).catch(e=>{ if(live) setFailed(e.message); });
    return () => { live=false; };
  }, []);
  useLayoutEffect(() => { if(it && cv.current) drawPreview(cv.current, it); }, [it]);
  useDialogOk(() => {
    if(!it){ moError('Still loading — try again in a moment'); return false; }
    const loaded=it;
    setTimeout(()=>addMarketItemToInventory(loaded));   // after this dialog closes, in case it opens its own
  });
  const tags=it ? it.tags||[] : [];
  return <>
    <div class="preview"><canvas id="mPrevCv" ref={cv}></canvas></div>
    {failed ? <div class="hint warn" id="mPrevInfo">{failed}</div>
      : <div class="listing-status" id="mPrevInfo">{it ? <>{sizeLabel(it)+(tags.length ? ' · '+tags.join(', ') : '')}<br/><code>{it.id}</code></> : 'Loading…'}</div>}
  </>;
}
/* a preview opens where you're looking (a dialog), not appended below hundreds of tiles */
/** @param {MarketSub} sub @param {string} id */
function renderMarketItemPreview(sub, id){
  nav.marketSelItemId=null;
  const entry=(marketIndexCache.get(sub.id)||[]).find(x=>x.id===id);
  openDialog({title: entry?entry.name:'Item', ok: 'Add to library', okDisabled: true, body: <PreviewBody sub={sub} id={id}/>});
}
export {marketPathChildren, addMarketDialog, subMenu, renderMarketItemPreview};
