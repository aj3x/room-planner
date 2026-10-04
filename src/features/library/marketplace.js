/* The Marketplace tab's commands and dialogs: a subscription's menu, an
   item's preview, adding a marketplace, and the folders a subscription's
   index is browsed by (derived from id paths). The views are
   market-views.jsx. Opening something here changes `nav` and calls
   navChanged() (nav.js); the page follows. */
import {idParts} from '../../kernel/ids.js';
import {S} from '../../kernel/state.js';
import {marketIndexCache, fetchMarketItem, loadRegistry, reloadMarketSub, removeMarketSub, subscribeMarket} from '../marketplace/index.js';
import {nav, navChanged} from './nav.js';
import {drawPreview} from './preview.js';
import {esc} from '../../ui-kit/panels.js';
import {sizeLabel} from './items.js';
import {libFlash} from '../../ui-kit/flash.js';
import {openMenu} from '../../ui-kit/menu.js';
import {$, askConfirm, closeModal, moError, openModal} from '../../ui-kit/modal.js';
import {addMarketItemToInventory} from './add-to-inventory.js';

function marketPathChildren(items, prefix){
  const folders=new Map(), leaves=[];
  const plen=prefix?prefix.split('/').length:0;
  for(const it of items){
    const parts=idParts(it.id);
    if(prefix && it.id!==prefix && !it.id.startsWith(prefix+'/')) continue;
    if(parts.length>plen+1){ const seg=parts[plen]; if(!folders.has(seg)) folders.set(seg,0); folders.set(seg, folders.get(seg)+1); }
    else if(parts.length===plen+1) leaves.push(it);
  }
  return {folders:[...folders.entries()].map(([name,n])=>({name,n})), leaves};
}

/* ------------------------- marketplace tab: subscribed markets + ad hoc listings ------------------------- */
function addMarketDialog(){
  openModal('Add a marketplace', `
    <p class="hint">Paste a <code>market.json</code> URL, or pick one from the registry below. See <code>MARKET_SCHEMA.md</code> for the format — anyone can publish one as a plain git repo.</p>
    <input type="url" id="mUrl" placeholder="https://…/market.json">
    <div id="mRegistry"></div>`,
    'Subscribe',
    ()=>{
      const url=($('mUrl').value||'').trim();
      if(!/^https?:\/\//i.test(url)){ moError('Enter a valid http(s) link to a market.json'); return false; }
      if(S.marketSubs.some(s=>s.url===url)){ moError('You already subscribe to that marketplace'); return false; }
      $('moOk').disabled=true;
      subscribeMarket(url).then(()=>{ closeModal(); })
        .catch(e=>{ moError(e.message); $('moOk').disabled=false; });
      return false;   // keep the dialog open until the fetch settles; the .then() above closes it
    },
    ()=>{
      loadRegistry('registry.json').then(list=>{
        const box=$('mRegistry'); if(!box) return;
        if(!list.length){ box.innerHTML='<p class="hint">The default registry is empty right now — paste a URL above, or see <code>CONTRIBUTING.md</code> to add one.</p>'; return; }
        box.innerHTML='<p class="hint">Or pick one:</p><div class="registry">'+list.map(m=>
          `<button type="button" class="btn sm" data-pick="${esc(m.url)}">${esc(m.name||m.url)}</button>`).join('')+'</div>';
        box.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click', ()=>{ $('mUrl').value=b.dataset.pick; }));
      }).catch(()=>{ const box=$('mRegistry'); if(box) box.innerHTML=''; });
    });
}

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
/* a preview opens where you're looking (a dialog), not appended below hundreds of tiles */
function renderMarketItemPreview(sub, id){
  nav.marketSelItemId=null;
  const entry=(marketIndexCache.get(sub.id)||[]).find(x=>x.id===id);
  let loaded=null;
  openModal(entry?entry.name:'Item', `
    <div class="preview"><canvas id="mPrevCv"></canvas></div>
    <div class="listing-status" id="mPrevInfo">Loading…</div>`,
    'Add to library',
    ()=>{
      if(!loaded){ moError('Still loading — try again in a moment'); return false; }
      setTimeout(()=>addMarketItemToInventory(loaded));   // after this dialog closes, in case it opens its own
    },
    ()=>{
      $('moOk').disabled=true;
      fetchMarketItem(sub, id).then(it=>{
        if(!$('mPrevInfo')) return;
        loaded=it;
        $('moTitle').textContent=it.name;
        $('mPrevInfo').innerHTML=`${esc(sizeLabel(it))}${(it.tags||[]).length?' · '+(it.tags||[]).map(esc).join(', '):''}<br><code>${esc(it.id)}</code>`;
        drawPreview($('mPrevCv'), it);
        $('moOk').disabled=false;
      }).catch(e=>{ const st=$('mPrevInfo'); if(st){ st.className='hint warn'; st.textContent=e.message; } });
    });
}
export {marketPathChildren, addMarketDialog, subMenu, renderMarketItemPreview};
