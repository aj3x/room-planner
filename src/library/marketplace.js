/* Marketplace tiles and the item preview canvas.

   Extracted from index.html in Phase 3, move-only: the four blocks below are
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   drawPreview takes its canvas as an argument, so nothing here reads
   canvas/view.js; the only canvas import is hexA.

   What renders a marketplace did not come -- renderMarketTop,
   renderMarketSub, renderMarketItemPreview, addMarketDialog, subMenu and
   selectListing all reach renderLibContent or renderLibAll, and are inside
   the Plan-panels/Library SCC.
*/
import {hexA} from '../canvas/draw.js';
import {bbox, shapePoly} from '../core/geometry.js';
import {idParts} from '../core/ids.js';
import {hasOpen, openLocalBox} from '../core/open-state.js';
import {S} from '../core/state.js';
import {marketIndexCache} from './market-subs.js';
import {nav} from './nav.js';
import {svgI} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';
import {sizeLabel} from '../canvas/draw.js';
import {libFlash} from '../ui/flash.js';
import {openMenu} from '../ui/menu.js';
import {$, askConfirm, closeModal, moError, openModal} from '../ui/modal.js';
import {normSearch} from '../ui/panels.js';
import {addMarketItemToInventory} from './add-to-inventory.js';
import {bindCrumbs} from './grid.js';
import {fetchMarketItem, loadRegistry, reloadMarketSub, removeMarketSub, subscribeMarket} from './market-subs.js';
import {renderLibContent} from './router.js';
import {renderLibAll} from './shell.js';

function marketSubTile(sub){
  const items=marketIndexCache.get(sub.id);
  let inner='';
  if(nav.showMarketContents){
    if(!items){ inner='<div class="sub" data-loadsub="'+sub.id+'">Loading…</div>'; }
    else {
      const groups=new Map();
      for(const it of items){
        const seg=it.id.includes('/') ? idParts(it.id)[0] : null;
        const key=seg||('\0'+it.id);
        if(!groups.has(key)) groups.set(key,{folder:seg, name:seg||it.name, id:it.id, n:0});
        groups.get(key).n++;
      }
      inner='<div class="chips">'+[...groups.values()].slice(0,8).map(g=>
        g.folder ? `<span class="tagchip" data-openmsub="${sub.id}" data-mfolder2="${esc(g.folder)}">${esc(g.folder)}/</span>`
                 : `<span class="tagchip" data-openmsub="${sub.id}" data-mitem="${esc(g.id)}">${esc(g.name)}</span>`
      ).join('')+'</div>';
    }
  }
  return `<button type="button" class="tile subtile" data-opensub="${sub.id}">
    <span class="more" data-act="more" title="More actions" aria-label="More actions">${svgI('more')}</span>
    <div class="thumb">${svgI('store')}</div>
    <div class="body"><div class="nm" title="${esc(sub.name)}">${esc(sub.name)}</div>
      <div class="dim" title="${esc(sub.url)}">${items?plural(items.length,'item'):esc(sub.url)}</div>${inner}</div>
  </button>`;
}

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

function marketItemTile(it){
  const have=S.inventory.some(x=>x.id===it.id);
  return `<div class="ttile" data-mitemopen="${esc(it.id)}" role="button" tabindex="0" aria-label="Preview ${esc(it.name)}">
    <div class="tmain"><div class="tname" title="${esc(it.name)}">${esc(it.name)}</div></div>
    <button type="button" class="btn sm${have?' quiet':''}" data-add="${esc(it.id)}" title="Add “${esc(it.name)}” to your library">${have?'Added':'Add'}</button>
  </div>`;
}

function drawPreview(cv,it){
  const ctx=cv.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1,2.5);
  const W=cv.clientWidth||260, H=cv.clientHeight||150;
  cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  if(!it||!it.shape) return;
  const ob=hasOpen(it)?openLocalBox(it):null;
  const b=ob?{x0:ob.x0,y0:ob.y0,x1:ob.x1,y1:ob.y1,w:ob.x1-ob.x0,h:ob.y1-ob.y0}:bbox(shapePoly(it.shape));
  const pad=18, s=Math.min((W-pad*2)/Math.max(b.w,1),(H-pad*2)/Math.max(b.h,1));
  const cx=W/2-((b.x0+b.x1)/2)*s, cy=H/2-((b.y0+b.y1)/2)*s;
  const toPx=([x,y])=>[cx+x*s, cy+y*s];
  if(ob){
    ctx.beginPath();
    [[ob.x0,ob.y0],[ob.x1,ob.y0],[ob.x1,ob.y1],[ob.x0,ob.y1]].forEach((p,i)=>{const [x,y]=toPx(p); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.closePath();
    ctx.setLineDash([4,3]); ctx.strokeStyle=it.color; ctx.lineWidth=1.3; ctx.stroke(); ctx.setLineDash([]);
  }
  const poly=shapePoly(it.shape);
  ctx.beginPath();
  poly.forEach((p,i)=>{const [x,y]=toPx(p); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.closePath();
  ctx.fillStyle=hexA(it.color,.85); ctx.fill();
  ctx.strokeStyle=it.color; ctx.lineWidth=1.5; ctx.stroke();
}

/* ---- Phase 3, the SCC commit: the rest of this file's region, which could
   not move until the whole 49-name component could. Move-only. ---- */
/* ------------------------- marketplace tab: subscribed markets + ad hoc listings ------------------------- */
function selectListing(id){ nav.marketSelListingId=id; renderLibContent(); }
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
      subscribeMarket(url).then(()=>{ closeModal(); renderLibAll(); })
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
    {label:'Open', fn:()=>{ nav.marketSubId=sub.id; nav.subPath=null; renderLibContent(); }},
    {label:'Reload', fn:()=>{ reloadMarketSub(sub).then(()=>{ libFlash('Reloaded'); renderLibAll(); }).catch(e=>libFlash(e.message,true)); }},
    {sep:true},
    {label:'Remove…', danger:true, fn:()=>askConfirm('Remove this marketplace?', '“'+sub.name+'” and its cached index will be forgotten. Your library isn’t affected.', 'Remove', ()=>{
      removeMarketSub(sub); renderLibAll();
    })},
  ], sub.name);
}
function renderMarketTop(box){
  let html=`<div class="crumbs"><button data-crumb="">Marketplaces</button></div>`;
  html+=`<div class="viewhead"><span class="hint grow">Browse a marketplace and add what you want to your library. Nothing is added until you choose it.</span>
    ${S.marketSubs.length?`<label class="check"><input type="checkbox" id="chkContents" ${nav.showMarketContents?'checked':''}>Preview contents</label>`:''}</div>`;
  if(!S.marketSubs.length){
    html+=`<div class="grid"><div class="empty">You haven't added a marketplace yet.
      <div class="row"><button class="btn sm primary" data-addmarket>${svgI('plus')}Add marketplace…</button></div></div></div>`;
  } else {
    html+=`<div class="grid">${S.marketSubs.map(marketSubTile).join('')}</div>`;
  }
  box.innerHTML=html;
  bindCrumbs(box,'market');
  const chk=box.querySelector('#chkContents'); if(chk) chk.addEventListener('change', ()=>{ nav.showMarketContents=chk.checked; renderLibContent(); });
  const am=box.querySelector('[data-addmarket]'); if(am) am.addEventListener('click', addMarketDialog);
  box.querySelectorAll('[data-opensub]').forEach(t=>{
    t.addEventListener('click', e=>{
      if(e.target.closest('[data-act=more],[data-loadsub],[data-openmsub]')) return;
      const sub=S.marketSubs.find(s=>s.id===t.dataset.opensub); if(!sub) return;
      nav.marketSubId=sub.id; nav.subPath=null; renderLibContent();
    });
    const more=t.querySelector('[data-act=more]');
    if(more) more.addEventListener('click', e=>{ e.stopPropagation(); const sub=S.marketSubs.find(s=>s.id===t.dataset.opensub); if(sub) subMenu(sub, e.currentTarget); });
  });
  box.querySelectorAll('[data-loadsub]').forEach(el=>{
    const sub=S.marketSubs.find(s=>s.id===el.dataset.loadsub); if(!sub) return;
    reloadMarketSub(sub).then(()=>renderLibContent()).catch(e=>{ el.textContent=e.message; });
  });
  box.querySelectorAll('[data-openmsub]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      nav.marketSubId=el.dataset.openmsub;
      nav.subPath=el.dataset.mfolder2||null;
      nav.marketSelItemId=el.dataset.mitem||null;
      renderLibContent();
    });
  });
}
/* the folder tree inside one marketplace is derived from id path segments, not a stored folder list */
function renderMarketSub(box, sub){
  const items=marketIndexCache.get(sub.id);
  const q=nav.searching ? $('searchBox').value.trim().toLowerCase() : '';
  const backToTop=()=>{ nav.marketSubId=null; nav.subPath=null; nav.marketTagFilter=null; renderLibContent(); };
  if(!items){
    box.innerHTML=`<div class="crumbs"><button data-back>Marketplaces</button><span class="sep">/</span><button>${esc(sub.name)}</button></div><div class="grid"><div class="empty">Loading…</div></div>`;
    box.querySelector('[data-back]').addEventListener('click', backToTop);
    reloadMarketSub(sub).then(()=>renderLibContent()).catch(e=>{ box.querySelector('.empty').textContent=e.message; });
    return;
  }
  let html=`<div class="crumbs"><button data-back>Marketplaces</button><span class="sep">/</span>`;
  html+=nav.subPath ? `<button data-toroot>${esc(sub.name)}</button>` : `<button>${esc(sub.name)}</button>`;
  if(nav.subPath){
    const parts=idParts(nav.subPath);
    let acc='';
    for(const p of parts){ acc=acc?acc+'/'+p:p; html+=`<span class="sep">/</span><button data-mcrumb="${esc(acc)}">${esc(p)}</button>`; }
  }
  html+='</div>';
  // scope search/filter to the folder currently being browsed, not the whole marketplace
  const scoped=nav.subPath ? items.filter(it=>it.id===nav.subPath||it.id.startsWith(nav.subPath+'/')) : items;
  const allTagsHere=[...new Set(scoped.flatMap(it=>it.tags))].sort();
  if(allTagsHere.length) html+=`<div class="viewhead"><div class="chips">${allTagsHere.slice(0,20).map(t=>
    `<button type="button" data-mtag="${esc(t)}" aria-pressed="${(nav.marketTagFilter===t)}">${esc(t)}</button>`).join('')}</div></div>`;
  let matches;
  if(q){ const nq=normSearch(q); matches=scoped.filter(it=>normSearch(it.name).includes(nq)||normSearch(it.id).includes(nq)||it.tags.some(t=>normSearch(t).includes(nq))); }
  else if(nav.marketTagFilter){ matches=scoped.filter(it=>it.tags.includes(nav.marketTagFilter)); }
  if(matches){
    html+= matches.length ? `<div class="grid text">${matches.map(marketItemTile).join('')}</div>`
      : `<div class="grid"><div class="empty">No matches.</div></div>`;
  } else {
    const {folders,leaves}=marketPathChildren(items, nav.subPath);
    html+= (folders.length||leaves.length)
      ? `<div class="grid text">${folders.map(f=>{
          const full=nav.subPath?nav.subPath+'/'+f.name:f.name;
          return `<button type="button" class="ttile" data-mopenfolder="${esc(full)}"><span class="ico">${svgI('folder')}</span><span class="tmain"><span class="tname">${esc(f.name)}</span><span class="dim">${plural(f.n,'item')}</span></span></button>`;
        }).join('')}${leaves.map(marketItemTile).join('')}</div>`
      : `<div class="grid"><div class="empty">Nothing in here.</div></div>`;
  }
  box.innerHTML=html;
  box.querySelector('[data-back]').addEventListener('click', backToTop);
  const toRoot=box.querySelector('[data-toroot]');
  if(toRoot) toRoot.addEventListener('click', ()=>{ nav.subPath=null; renderLibContent(); });
  box.querySelectorAll('[data-mcrumb]').forEach(b=>b.addEventListener('click', ()=>{ nav.subPath=b.dataset.mcrumb; renderLibContent(); }));
  box.querySelectorAll('[data-mopenfolder]').forEach(t=>t.addEventListener('click', ()=>{ nav.subPath=t.dataset.mopenfolder; renderLibContent(); }));
  box.querySelectorAll('[data-mtag]').forEach(b=>b.addEventListener('click', ()=>{
    nav.marketTagFilter = nav.marketTagFilter===b.dataset.mtag ? null : b.dataset.mtag; renderLibContent();
  }));
  box.querySelectorAll('[data-mitemopen]').forEach(t=>{
    t.addEventListener('click', e=>{
      if(e.target.closest('[data-add]')) return;
      nav.marketSelItemId = t.dataset.mitemopen; renderLibContent();
    });
    t.addEventListener('keydown', e=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); nav.marketSelItemId = t.dataset.mitemopen; renderLibContent(); }
    });
  });
  box.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click', e=>{
    e.stopPropagation();
    fetchMarketItem(sub, b.dataset.add).then(it=>addMarketItemToInventory(it)).catch(err=>libFlash(err.message,true));
  }));
  if(nav.marketSelItemId) renderMarketItemPreview(box, sub, nav.marketSelItemId);
}
/* a preview opens where you're looking (a dialog), not appended below hundreds of tiles */
function renderMarketItemPreview(box, sub, id){
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
export {marketSubTile, marketPathChildren, marketItemTile, drawPreview, selectListing, addMarketDialog, subMenu, renderMarketTop, renderMarketSub, renderMarketItemPreview};
