// @ts-check
/* The Marketplace tab's content, as components: the subscribed marketplaces
   on top, one subscription's index browsed by id path, the ad hoc listings
   and their folders, a listing's detail, and search over the listings. The
   page (page.jsx) renders the one `nav` names and re-renders it on every
   library, project or settings commit and every navChanged(), passing
   `epoch`, which counts those renders; these read S and `nav` as they are
   and subscribe to nothing themselves.

   Every render of a view that shows a subscription with no index yet asks
   for it again (reloadMarketSub runs one fetch at a time) and shows
   "Loading…", or why it failed, until it is in. A listing's detail loads
   its items on every render as well; its "Added" marks last until the
   next one, which an add brings at once by committing. */
import {useEffect, useRef, useState} from 'preact/hooks';
import {idParts} from '../../kernel/ids.js';
import {S} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {libFlash} from '../../ui-kit/flash.js';
import {askConfirm} from '../../ui-kit/modal.jsx';
import {normSearch, plural} from '../../ui-kit/panels.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {childMarketFolders, fetchMarketItem, listingsInFolder, loadListing, marketIndexCache, reloadMarketSub} from '../marketplace/index.js';
import {addMarketItemToInventory} from './add-to-inventory.js';
import {addListingDialog} from './adhoc-listings.js';
import {adhocFolderContents, listingMenu} from './folder-menus.js';
import {sizeLabel} from './items.js';
import {Crumbs, Preview, SearchCrumb} from './lib-grid.jsx';
import {addMarketDialog, marketPathChildren, renderMarketItemPreview, subMenu} from './marketplace.js';
import {goLibFolder, nav, navChanged, selectListing} from './nav.js';

/** @typedef {import('../../kernel/types.js').MarketSub} MarketSub */
/** @typedef {import('../../kernel/types.js').MarketListing} MarketListing */
/** @typedef {import('../../kernel/types.js').MarketFolder} MarketFolder */
/** @typedef {import('../../kernel/types.js').Item} Item */
/** @typedef {import('../marketplace/index.js').MarketEntry} MarketEntry */
/** @typedef {import('../marketplace/index.js').ListingLoad} ListingLoad */

/** Ask for a subscription's index on every render that shows it missing;
    what went wrong, if the last ask failed during this render.
    @param {MarketSub} sub @param {number} epoch @param {boolean} missing @returns {string|null} */
function useIndex(sub, epoch, missing){
  const [err, setErr] = useState(/** @type {{epoch: number, msg: string}|null} */(null));
  useEffect(() => {
    if(missing) reloadMarketSub(sub)?.catch((/** @type {Error} */e)=>setErr({epoch, msg:e.message}));
  }, [epoch, missing]);
  return err && err.epoch===epoch ? err.msg : null;
}

/** A subscribed marketplace, with its contents as chips if they are asked for.
    @param {{sub: MarketSub, epoch: number}} p */
function SubTile({sub, epoch}){
  const items=marketIndexCache.get(sub.id);
  const err=useIndex(sub, epoch, nav.showMarketContents && !items);
  /** @param {Event} e @param {string|null} folder @param {string|null} item */
  const open=(e, folder, item)=>{
    e.stopPropagation();
    nav.marketSubId=sub.id; nav.subPath=folder; nav.marketSelItemId=item; navChanged();
  };
  let inner=null;
  if(nav.showMarketContents){
    if(!items) inner=<div class="sub" onClick={e=>e.stopPropagation()}>{err || 'Loading…'}</div>;
    else {
      /** @type {Map<string, {folder: string|null, name: string, id: string, n: number}>} */
      const groups=new Map();
      for(const it of items){
        const seg=it.id.includes('/') ? idParts(it.id)[0] : null;
        const key=seg||('\0'+it.id);
        let g=groups.get(key);
        if(!g){ g={folder:seg, name:seg||it.name, id:it.id, n:0}; groups.set(key, g); }
        g.n++;
      }
      inner=<div class="chips">{[...groups.values()].slice(0,8).map(g=>
        g.folder ? <span key={'f'+g.folder} class="tagchip" onClick={e=>open(e, g.folder, null)}>{g.folder+'/'}</span>
                 : <span key={'i'+g.id} class="tagchip" onClick={e=>open(e, null, g.id)}>{g.name}</span>)}</div>;
    }
  }
  return <button type="button" class="tile subtile" onClick={()=>{ nav.marketSubId=sub.id; nav.subPath=null; navChanged(); }}>
    <span class="more" title="More actions" aria-label="More actions" onClick={e=>{ e.stopPropagation(); subMenu(sub, e.currentTarget); }}><Icon name="more"/></span>
    <div class="thumb"><Icon name="store"/></div>
    <div class="body"><div class="nm" title={sub.name}>{sub.name}</div>
      <div class="dim" title={sub.url}>{items?plural(items.length,'item'):sub.url}</div>{inner}</div>
  </button>;
}

/** @param {{epoch: number}} p */
function MarketTop({epoch}){
  return <>
    <div class="crumbs"><button onClick={()=>goLibFolder('market', null)}>Marketplaces</button></div>
    <div class="viewhead"><span class="hint grow">Browse a marketplace and add what you want to your library. Nothing is added until you choose it.</span>
      {S.marketSubs.length ? <label class="check"><input type="checkbox" checked={nav.showMarketContents}
        onChange={e=>{ nav.showMarketContents=e.currentTarget.checked; navChanged(); }}/>Preview contents</label> : null}</div>
    {!S.marketSubs.length
      ? <div class="grid"><div class="empty">You haven't added a marketplace yet.
          <div class="row"><button class="btn sm primary" onClick={addMarketDialog}><Icon name="plus"/>Add marketplace…</button></div></div></div>
      : <div class="grid">{S.marketSubs.map(sub=><SubTile key={sub.id} sub={sub} epoch={epoch}/>)}</div>}
  </>;
}

/** An item in a subscription's index: opens its preview, or adds it.
    @param {{sub: MarketSub, it: MarketEntry}} p */
function MarketItemTile({sub, it}){
  const have=S.inventory.some(x=>x.id===it.id);
  const preview=()=>{ nav.marketSelItemId=it.id; navChanged(); };
  return <div class="ttile" role="button" tabIndex={0} aria-label={'Preview '+it.name} onClick={preview}
    onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); preview(); } }}>
    <div class="tmain"><div class="tname" title={it.name}>{it.name}</div></div>
    <button type="button" class={'btn sm'+(have?' quiet':'')} title={'Add “'+it.name+'” to your library'} onClick={e=>{
      e.stopPropagation();
      fetchMarketItem(sub, it.id).then(x=>addMarketItemToInventory(x)).catch((/** @type {Error} */err)=>libFlash(err.message,true));
    }}>{have?'Added':'Add'}</button>
  </div>;
}

/* the folder tree inside one marketplace is derived from id path segments, not a stored folder list */
/** @param {{sub: MarketSub, epoch: number, q: string}} p */
function MarketSub({sub, epoch, q}){
  const items=marketIndexCache.get(sub.id);
  const err=useIndex(sub, epoch, !items);
  /* a preview opens where you're looking (a dialog), once the index is in */
  useEffect(() => { if(items && nav.marketSelItemId) renderMarketItemPreview(sub, nav.marketSelItemId); });
  const backToTop=()=>{ nav.marketSubId=null; nav.subPath=null; nav.marketTagFilter=null; navChanged(); };
  /** @param {string|null} path */
  const go=path=>{ nav.subPath=path; navChanged(); };
  if(!items) return <>
    <div class="crumbs"><button onClick={backToTop}>Marketplaces</button><span class="sep">/</span><button>{sub.name}</button></div>
    <div class="grid"><div class="empty">{err || 'Loading…'}</div></div>
  </>;
  const subPath=nav.subPath;
  /** @type {{acc: string, p: string}[]} */
  const crumbs=[];
  if(subPath){ let acc=''; for(const p of idParts(subPath)){ acc=acc?acc+'/'+p:p; crumbs.push({acc, p}); } }
  // scope search/filter to the folder currently being browsed, not the whole marketplace
  const scoped=subPath ? items.filter(it=>it.id===subPath||it.id.startsWith(subPath+'/')) : items;
  const allTagsHere=[...new Set(scoped.flatMap(it=>it.tags))].sort();
  /** @type {MarketEntry[]|undefined} */
  let matches;
  if(q){ const nq=normSearch(q); matches=scoped.filter(it=>normSearch(it.name).includes(nq)||normSearch(it.id).includes(nq)||it.tags.some(t=>normSearch(t).includes(nq))); }
  else if(nav.marketTagFilter){ const tf=nav.marketTagFilter; matches=scoped.filter(it=>it.tags.includes(tf)); }
  /** @type {{folders: {name: string, n: number}[], leaves: MarketEntry[]}} */
  const here = matches ? {folders:[], leaves:[]} : marketPathChildren(items, subPath);
  return <>
    <div class="crumbs"><button onClick={backToTop}>Marketplaces</button><span class="sep">/</span>
      {subPath ? <button onClick={()=>go(null)}>{sub.name}</button> : <button>{sub.name}</button>}
      {crumbs.map(c=>[<span key={'s'+c.acc} class="sep">/</span>, <button key={'b'+c.acc} onClick={()=>go(c.acc)}>{c.p}</button>])}</div>
    {allTagsHere.length ? <div class="viewhead"><div class="chips">{allTagsHere.slice(0,20).map(t=>
      <button key={t} type="button" aria-pressed={nav.marketTagFilter===t} onClick={()=>{
        nav.marketTagFilter = nav.marketTagFilter===t ? null : t; navChanged();
      }}>{t}</button>)}</div></div> : null}
    {matches
      ? (matches.length ? <div class="grid text">{matches.map(it=><MarketItemTile key={it.id} sub={sub} it={it}/>)}</div>
        : <div class="grid"><div class="empty">No matches.</div></div>)
      : (here.folders.length||here.leaves.length)
        ? <div class="grid text">{here.folders.map(f=>{
            const full=subPath?subPath+'/'+f.name:f.name;
            return <button key={'f'+full} type="button" class="ttile" onClick={()=>go(full)}><span class="ico"><Icon name="folder"/></span><span class="tmain"><span class="tname">{f.name}</span><span class="dim">{plural(f.n,'item')}</span></span></button>;
          })}{here.leaves.map(it=><MarketItemTile key={it.id} sub={sub} it={it}/>)}</div>
        : <div class="grid"><div class="empty">Nothing in here.</div></div>}
  </>;
}

/** @param {{l: MarketListing}} p */
function ListingTile({l}){
  const sub = l.kind==='link' ? 'Link' : (l.content&&Array.isArray(l.content.inventory) ? plural(l.content.inventory.length,'item') : 'File');
  return <button type="button" class="tile" onClick={()=>selectListing(l.id)}>
    <span class="more" title="More actions" aria-label="More actions" onClick={e=>{ e.stopPropagation(); listingMenu(l.id, e.currentTarget); }}><Icon name="more"/></span>
    <div class="thumb"><Icon name={l.kind==='link'?'link':'box'}/></div>
    <div class="body"><div class="nm" title={l.name}>{l.name}</div><div class="dim">{sub}</div></div>
  </button>;
}

/** @param {{f: MarketFolder}} p */
function AdhocFolderTile({f}){
  const n=childMarketFolders(f.id).length, m=listingsInFolder(f.id).length;
  const bits=[]; if(n) bits.push(n+' folder'+(n>1?'s':'')); if(m) bits.push(m+' listing'+(m>1?'s':''));
  return <button type="button" class="tile folder" onClick={()=>goLibFolder('market', f.id)}>
    <div class="thumb"><Icon name="folder"/></div>
    <div class="body"><div class="nm">{f.name}</div><div class="dim">{bits.length?bits.join(', '):'Empty'}</div></div>
  </button>;
}

/** An ad hoc folder's listings: on its own page (`standalone`, with its
    breadcrumbs), or under the marketplaces on top.
    @param {{folderId: string|null, standalone?: boolean}} p */
function AdhocFolder({folderId, standalone}){
  const subs=childMarketFolders(folderId), listings=listingsInFolder(folderId);
  const body=<>
    {standalone ? <Crumbs kind="market" folderId={folderId}/> : <div class="lib-section">Listings — one-off bundles from a file, link or pasted JSON</div>}
    {!subs.length && !listings.length
      ? <div class="grid"><div class="empty">No listings yet.
          <div class="row"><button class="btn sm" onClick={addListingDialog}>Add listing…</button></div></div></div>
      : <div class="grid">{subs.map(f=><AdhocFolderTile key={f.id} f={f}/>)}{listings.map(l=><ListingTile key={l.id} l={l}/>)}</div>}
  </>;
  return standalone ? body : <div>{body}</div>;
}

/** @param {{l: MarketListing, epoch: number}} p */
function ListingDetail({l, epoch}){
  const [res, setRes] = useState(/** @type {ListingLoad|null} */(null));
  const [added, setAdded] = useState(/** @type {{epoch: number, ids: Set<number>, all: boolean}} */({epoch, ids:new Set(), all:false}));
  const live=useRef(true);
  useEffect(() => () => { live.current=false; }, []);
  useEffect(() => {
    loadListing(l).then(r=>{ if(live.current && nav.marketSelListingId===l.id) setRes(r); });
  }, [epoch]);
  const ad = added.epoch===epoch ? added : {epoch, ids:new Set(), all:false};
  const del=()=>askConfirm('Delete this listing?', '“'+l.name+'” will be removed.', 'Delete', ()=>{
    transact('lib', ()=>{ S.marketListings=S.marketListings.filter(x=>x.id!==l.id); nav.marketSelListingId=null; });
  });
  const addAll=()=>{
    if(!res || !res.items || !res.items.length) return;
    for(const it of res.items) addMarketItemToInventory(it);
    libFlash('Added '+res.items.length+' item'+(res.items.length===1?'':'s')+' to your library');
    setAdded({...ad, all:true});
  };
  let body;
  if(!res) body=<div class="listing-status">Loading…</div>;
  else if(!res.items) body=<p class="hint warn">{res.error}</p>;   // a load has items or says why not
  else if(!res.items.length) body=<div class="empty">This listing has no items.</div>;
  else {
    const items=res.items;
    body=<div class="grid flush">{items.map((it,i)=>{
      const one=ad.ids.has(i), done=one||ad.all;
      return <div key={i} class="tile static">
        <div class="thumb"><Preview it={it}/></div>
        <div class="body"><div class="nm" title={it.name}>{it.name}</div>
          <div class="tile-foot"><span class="dim">{sizeLabel(it)}</span>
          <button class={'btn sm'+(one?' quiet':'')} disabled={done} onClick={()=>{
            addMarketItemToInventory(it);
            setAdded({...ad, ids:new Set([...ad.ids, i])});
          }}>{done?'Added':'Add'}</button></div></div>
      </div>;
    })}</div>;
  }
  return <>
    <Crumbs kind="market" folderId={l.parentId}/>
    <div class="detail wide">
      <div class="dhead"><div class="grow"><h1>{l.name}</h1>
        <div class="dim">{l.kind==='link'?l.url:'Uploaded file'}</div></div>
        <div class="row">
          <button class="btn sm danger" onClick={del}>Delete listing…</button>
          <button class="btn sm primary" onClick={addAll}>Add all to library</button>
        </div></div>
      <div>{body}</div>
    </div>
  </>;
}

/** Search over the ad hoc listings in the folder being browsed. @param {{q: string}} p */
function MarketSearch({q}){
  const nq=normSearch(q);
  const {listings}=adhocFolderContents(nav.marketFolderId);
  const hits=listings.filter((/** @type {MarketListing} */l)=>normSearch(l.name).includes(nq));
  return <>
    <Crumbs kind="market" folderId={nav.marketFolderId}><SearchCrumb q={q}/></Crumbs>
    {hits.length
      ? <div class="grid">{hits.map((/** @type {MarketListing} */l)=><ListingTile key={l.id} l={l}/>)}</div>
      : <div class="grid"><div class="empty">{'Nothing matches “'+q+'” here.'}</div></div>}
  </>;
}

export {MarketTop, MarketSub, AdhocFolder, ListingDetail, MarketSearch};
