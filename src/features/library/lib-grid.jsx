// @ts-check
/* The Library tab's content, as components: a folder's view (breadcrumbs,
   what it holds, its tags, its folders and items as tiles) and search
   results. The page (page.jsx) renders the one `nav` names and re-renders
   it on every library, project or settings commit and every navChanged();
   these read S and `nav` as they are and subscribe to nothing themselves.

   A tile's click edits the item; its ⋯ opens the item's menu; dragging it
   onto a folder tile, or onto a folder in the tree (lib-tree.jsx), files it
   there. The breadcrumbs, the ad hoc ones too, are Crumbs. */
import {Fragment} from 'preact';
import {useLayoutEffect, useRef, useState} from 'preact/hooks';
import {S} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {libFlash} from '../../ui-kit/flash.js';
import {normSearch, plural} from '../../ui-kit/panels.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {marketFolderPath} from '../marketplace/index.js';
import {exportLibFolder, exportLibraryDialog} from './export.js';
import {libFolderTagsDialog} from './folder-menus.js';
import {createLibItem, folderCountLabel, libItemMenu} from './grid.js';
import {itemDialog} from './item-dialog.js';
import {ancestorTags, childItemFolders, itemFolderOf, itemFolderPath, itemFolderSubtreeIds, itemsInFolder, moveItemToFolder} from './item-folders.js';
import {sizeLabel} from './items.js';
import {gridDragItem, goLibFolder, libDropMark, nav, setGridDragItem} from './nav.js';
import {drawPreview} from './preview.js';

/** @typedef {import('../../kernel/types.js').Item} Item */
/** @typedef {import('../../kernel/types.js').Folder} Folder */
/** @typedef {import('preact').ComponentChildren} Children */

/** An item's footprint in a tile's canvas, drawn again on every render.
    @param {{it: Item}} p */
function Preview({it}){
  const ref = useRef(/** @type {HTMLCanvasElement|null} */(null));
  useLayoutEffect(() => { if(ref.current) drawPreview(ref.current, it); });
  return <canvas ref={ref}/>;
}

/** The breadcrumb bar over a Library folder or an ad hoc listings folder;
    `children` go on the end of it.
    @param {{kind: 'library'|'market', folderId: string|null, children?: Children}} p */
function Crumbs({kind, folderId, children}){
  const isLib=kind==='library';
  /** @type {{id: string, name: string}[]} */
  const path = isLib ? itemFolderPath(folderId) : marketFolderPath(folderId);
  return <div class="crumbs"><button onClick={()=>goLibFolder(kind, null)}>{isLib ? 'All items' : 'Listings'}</button>
    {path.map(f=><Fragment key={f.id}><span class="sep">/</span><button onClick={()=>goLibFolder(kind, f.id)}>{f.name}</button></Fragment>)}
    {children}</div>;
}

/** The search crumb on the end of the breadcrumbs. @param {{q: string}} p */
function SearchCrumb({q}){
  return <><span class="sep">/</span><button>{'Search: "'+q+'"'}</button></>;
}

/** @param {{it: Item}} p */
function ItemTile({it}){
  const [dragging, setDragging] = useState(false);
  const tags=it.tags||[];
  /** @param {Event} e */
  const menu = e => { e.stopPropagation(); libItemMenu(it.id, e.currentTarget); };
  return <div class={'tile'+(dragging?' dragging':'')} role="button" tabIndex={0} draggable={true} aria-label={'Edit '+it.name}
    onClick={()=>itemDialog(it.id)}
    onKeyDown={e=>{
      if(e.target!==e.currentTarget || (e.key!=='Enter'&&e.key!==' ')) return;
      e.preventDefault(); itemDialog(it.id);
    }}
    onDragStart={e=>{
      setGridDragItem(it.id); setDragging(true);
      if(!e.dataTransfer) return;
      e.dataTransfer.effectAllowed='move';
      try{ e.dataTransfer.setData('text/plain',it.id); }catch(err){}
    }}
    onDragEnd={()=>{ setGridDragItem(null); setDragging(false); libDropMark.value=null; }}>
    <span class="more" role="button" tabIndex={0} title="More actions" aria-label="More actions" onClick={menu}
      onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); menu(e); } }}><Icon name="more"/></span>
    <div class="thumb"><Preview it={it}/></div>
    <div class="body"><div class="nm" title={it.name}>{it.name}</div>
      <div class="dim">{sizeLabel(it)}</div>
      {tags.length ? <div class="chips">{tags.slice(0,3).map(t=>{
        const inherited = !it.manualTags || !it.manualTags.includes(t);
        return <span key={t} class={'tagchip'+(inherited?' inherit':'')}>{t}</span>;
      })}{tags.length>3 ? <span class="tagchip">{'+'+(tags.length-3)}</span> : null}</div> : null}</div>
  </div>;
}

/** A library folder in the grid: opens it, and takes an item dropped on it.
    @param {{f: Folder}} p */
function FolderTile({f}){
  const [over, setOver] = useState(false);
  return <button type="button" class={'tile folder'+(over?' dragover':'')} onClick={()=>goLibFolder('library', f.id)}
    onDragOver={e=>{ if(!gridDragItem) return; e.preventDefault(); setOver(true); }}
    onDragLeave={()=>setOver(false)}
    onDrop={e=>{
      e.preventDefault(); setOver(false);
      if(!gridDragItem) return;
      const it=S.inventory.find(x=>x.id===gridDragItem); if(!it) return;
      setGridDragItem(null);
      transact('lib', ()=>moveItemToFolder(it, f.id));
      libFlash('Moved “'+it.name+'”');
    }}>
    <div class="thumb"><Icon name="folder"/></div>
    <div class="body"><div class="nm" title={f.name}>{f.name}</div>
      <div class="dim">{folderCountLabel(f.id)}</div></div>
  </button>;
}

/** @param {{folderId: string|null}} p */
function LibraryFolder({folderId}){
  const f=itemFolderOf(folderId);
  const subs=childItemFolders(folderId), items=itemsInFolder(folderId);
  const bits=[]; if(subs.length) bits.push(plural(subs.length,'folder')); if(items.length) bits.push(plural(items.length,'item'));
  const inherited = f ? ancestorTags(folderId) : [];
  return <>
    <Crumbs kind="library" folderId={folderId}/>
    <div class="viewhead"><span class="hint grow">{bits.join(', ')}</span>
      {f ? <button class="btn sm" onClick={()=>libFolderTagsDialog(f.id)}>Folder tags…</button> : null}
      {subs.length||items.length ? <button class="btn sm" onClick={()=> f ? exportLibFolder(folderId) : exportLibraryDialog()}>{f?'Export folder':'Export…'}</button> : null}</div>
    {f && inherited.length ? <div class="foldertagbar"><span class="lbl">Everything here is tagged</span>
      {inherited.map(t=><span key={t} class="tagchip">{t}</span>)}</div> : null}
    {!subs.length && !items.length
      ? <div class="grid"><div class="empty">{f?'This folder is empty. Drag items onto it in the tree, or':'Your library is empty.'}
          <div class="row"><button class="btn sm primary" onClick={createLibItem}><Icon name="plus"/>New item</button></div></div></div>
      : <div class="grid">{subs.map(s=><FolderTile key={s.id} f={s}/>)}{items.map(it=><ItemTile key={it.id} it={it}/>)}</div>}
  </>;
}

/** Search, scoped to the Library folder being browsed. @param {{q: string}} p */
function LibrarySearch({q}){
  const nq=normSearch(q);
  const ids=itemFolderSubtreeIds(nav.libFolderId);
  const scope=S.inventory.filter(it=>ids.has(it.folderId||null));
  const hits=scope.filter(it=>normSearch(it.name).includes(nq) || (it.tags||[]).some(t=>normSearch(t).includes(nq)));
  return <>
    <Crumbs kind="library" folderId={nav.libFolderId}><SearchCrumb q={q}/></Crumbs>
    {hits.length
      ? <div class="grid">{hits.map(it=><ItemTile key={it.id} it={it}/>)}</div>
      : <div class="grid"><div class="empty">{'Nothing matches “'+q+'” here.'}</div></div>}
  </>;
}

export {Preview, Crumbs, SearchCrumb, LibraryFolder, LibrarySearch};
