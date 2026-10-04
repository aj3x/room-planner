// @ts-check
/* The Library/Marketplace page's folder tree, as a component: on the
   Library tab the item folders, on the Marketplace tab the ad hoc folders
   and the listings in them. It reads what the page does (the library, the
   project, the settings, navRev) and the rename in progress and the drop
   mark (nav.js), and re-renders on any of them: it reads signals and holds
   drag state, so its parent's re-render would skip it (ui-kit/component.js),
   and it has to say what it shows.

   A row's click is held back a moment (singleClick) so that a second click
   can make it a double-click, which renames a folder in place; the caret and
   the ⋯ act at once. Dragging a folder moves it: onto a folder puts it
   inside, the upper or lower edge of a row drops it beside that row, the
   root row takes it to the top level. An item dragged out of the Library
   grid (lib-grid.jsx) drops into a library folder, or onto the root row. */
import {useState} from 'preact/hooks';
import {S} from '../../kernel/state.js';
import {rev} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {moveBefore, dropHalf} from '../../ui-kit/dnd.js';
import {libFlash} from '../../ui-kit/flash.js';
import {cancelSingleClick, singleClick} from '../../ui-kit/inline-edit.js';
import {closeMenu} from '../../ui-kit/menu.js';
import {plural} from '../../ui-kit/panels.js';
import {Icon, MoreButton, RenameField} from '../../ui-kit/parts.jsx';
import {childMarketFolders, listingsInFolder, marketFolderDescendant, marketFolderOf} from '../marketplace/index.js';
import {adhocFolderMenu, libFolderMenu, listingMenu, renameAdhocFolder, renameLibFolder, renamedFolder} from './folder-menus.js';
import {childItemFolders, itemCountInSubtree, itemFolderDescendant, itemFolderOf, moveItemToFolder, recomputeFolderSubtree} from './item-folders.js';
import {gridDragItem, goLibFolder, libDropMark, libRenaming, libTreeOpen, nav, navChanged, navRev, selectListing, setGridDragItem} from './nav.js';

/** @typedef {import('../../kernel/types.js').Folder} Folder */
/** @typedef {import('../../kernel/types.js').MarketFolder} MarketFolder */
/** @typedef {import('../../kernel/types.js').MarketListing} MarketListing */
/** One row of the flattened tree, in the order it shows.
    @typedef {{type: 'folder', f: Folder, depth: number}
            | {type: 'mfolder', f: MarketFolder, depth: number}
            | {type: 'listing', l: MarketListing, depth: number}} Row */

/** The folder being dragged in the tree. @typedef {{kind: 'folder', id: string, realm: 'library'|'market'}} DragLib */
/** @type {DragLib|null} */
let dragLib=null;

/** @param {string|null} parentId @param {number} depth @param {Row[]} out */
function libRows(parentId, depth, out){
  for(const f of childItemFolders(parentId)){
    out.push({type:'folder', f, depth});
    if(libTreeOpen.has(f.id)) libRows(f.id, depth+1, out);
  }
  return out;
}
/** @param {string|null} parentId @param {number} depth @param {Row[]} out */
function marketRows(parentId, depth, out){
  for(const f of childMarketFolders(parentId)){
    out.push({type:'mfolder', f, depth});
    if(libTreeOpen.has('m:'+f.id)) marketRows(f.id, depth+1, out);
  }
  for(const l of listingsInFolder(parentId)) out.push({type:'listing', l, depth});
  return out;
}

/** Where a drop at this event would land, or null for nowhere.
    @param {DragEvent} e
    @returns {{mode: 'root'} | {mode: 'into'|'before'|'after', id: string, isLib: boolean, key: string} | null} */
function libDropSpot(e){
  const t=/** @type {Element} */(e.target);
  const row=/** @type {HTMLElement|null} */(t.closest('.tree-row[data-folder],.tree-row[data-mfolder]'));
  if(t.closest('[data-root]')) return {mode:'root'};
  if(!row) return null;
  const isLib=!!row.dataset.folder;
  if(gridDragItem && !isLib) return null;
  const id=/** @type {string} */(isLib?row.dataset.folder:row.dataset.mfolder);   // the selector requires one
  if(dragLib && dragLib.kind==='folder' && id===dragLib.id) return null;
  const key=(isLib?'f:':'m:')+id;
  const h=dropHalf(e,row);
  if(h>=0.25 && h<=0.75) return {mode:'into',id,isLib,key};
  return {mode:h<0.5?'before':'after',id,isLib,key};
}

/** @param {DragEvent} e */
function drop(e){
  const spot=libDropSpot(e);
  libDropMark.value=null;
  if(!spot) return;
  e.preventDefault();
  if(gridDragItem){
    if(spot.mode!=='root' && !spot.isLib) return;
    const it=S.inventory.find(x=>x.id===gridDragItem); if(!it) return;
    setGridDragItem(null);
    transact('lib', ()=>moveItemToFolder(it, spot.mode==='root'?null:spot.id));
    libFlash('Moved “'+it.name+'”');
    return;
  }
  const d=dragLib; if(!d) return;
  /** @type {string|null} */
  let parent=null, targetId=null;
  let after=false;
  if(d.realm==='library'){
    const f=itemFolderOf(d.id); if(!f) return;
    if(spot.mode==='into'){ parent=spot.id; libTreeOpen.add(parent); }
    else if(spot.mode!=='root' && spot.isLib){
      const t=itemFolderOf(spot.id); if(!t) return;
      parent=t.parentId||null; targetId=spot.id; after=(spot.mode==='after');
    } else if(spot.mode!=='root') return;
    if(parent===d.id || itemFolderDescendant(d.id,parent)){ libFlash("A folder can't go inside itself",true); return; }
    const p=parent, tid=targetId;
    transact('lib', ()=>{
      f.parentId=p;
      moveBefore(S.itemFolders, d.id, tid, after);
      recomputeFolderSubtree(d.id);
    });
  } else {
    const f=marketFolderOf(d.id); if(!f) return;
    if(spot.mode==='into'){ parent=spot.id; libTreeOpen.add('m:'+parent); }
    else if(spot.mode!=='root' && !spot.isLib){
      const t=marketFolderOf(spot.id); if(!t) return;
      parent=t.parentId||null; targetId=spot.id; after=(spot.mode==='after');
    } else if(spot.mode!=='root') return;
    if(parent===d.id || marketFolderDescendant(d.id,parent)){ libFlash("A folder can't go inside itself",true); return; }
    const p=parent, tid=targetId;
    transact('lib', ()=>{ f.parentId=p; moveBefore(S.marketFolders, d.id, tid, after); });
  }
  dragLib=null;
}

/** @param {string} key a folder's libTreeOpen key */
function toggleOpen(key){
  cancelSingleClick();
  if(libTreeOpen.has(key)) libTreeOpen.delete(key); else libTreeOpen.add(key);
  navChanged();
}

/** @param {...(string|false|null|undefined)} parts */
function cls(...parts){ return parts.filter(Boolean).join(' '); }

/** @param {Folder} f */
function tagsInline(f){
  if(!f.tags||!f.tags.length) return null;
  return <span class="tagchip inherit" title={'Everything inside is tagged: '+f.tags.join(', ')}>{f.tags[0]+(f.tags.length>1?' +'+(f.tags.length-1):'')}</span>;
}

function LibTree(){
  rev.lib.value; rev.prefs.value; rev.project.value; navRev.value;
  const renaming=libRenaming.value, mark=libDropMark.value;
  const [dragging, setDragging] = useState(/** @type {string|null} */(null));
  const markOn = /** @param {string} key */ key => mark && mark.startsWith(key+' ') ? mark.slice(key.length+1) : '';
  const lib=nav.tab==='library';
  const rows = lib ? libRows(null, 1, []) : marketRows(null, 1, []);
  const rootActive = !nav.searching && (lib ? nav.libFolderId===null : nav.marketFolderId===null);
  const n0=S.inventory.length;

  /** @param {string} key the folder's libRenaming key (its libTreeOpen key too) @param {string} name */
  const name = (key, name) => renaming===key
    ? <RenameField value={name} done={v=>renamedFolder(key, v)}/>
    : <span class="nm">{name}</span>;
  /** @param {'library'|'market'} realm @param {string} id @param {string} key @param {DragEvent} e */
  function dragStart(realm, id, key, e){
    cancelSingleClick(); closeMenu();
    dragLib={kind:'folder', id, realm};
    setDragging(key);
    if(!e.dataTransfer) return;
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',id); }catch(err){}
  }
  /** @param {() => void} rename @param {MouseEvent} e */
  function dblClick(rename, e){
    cancelSingleClick();
    if(/** @type {Element} */(e.target).closest('button')) return;
    rename();
  }

  /** @param {Row} r */
  function row(r){
    const pad='width:'+(r.depth*12+16)+'px';
    if(r.type==='listing'){
      const l=r.l;
      return <div key={'l:'+l.id} class="tree-row" draggable={false} data-listing={l.id}
        onClick={()=>singleClick(()=>selectListing(l.id))} onDblClick={cancelSingleClick}>
        <span class="caret-zone" style={pad}></span>
        <span class="ico"><Icon name={l.kind==='link'?'link':'box'}/></span><span class="nm">{l.name}</span>
        <MoreButton cls="tree-more" onClick={e=>{ e.stopPropagation(); cancelSingleClick(); listingMenu(l.id, e.currentTarget); }}/>
      </div>;
    }
    const isLib=r.type==='folder', f=r.f, key=(isLib?'f:':'m:')+f.id, openKey=isLib?f.id:key, open=libTreeOpen.has(openKey);
    const active=!nav.searching && (isLib ? nav.libFolderId===f.id : nav.marketFolderId===f.id);
    const n = isLib ? itemCountInSubtree(f.id) : 0;
    return <div key={key} class={cls('tree-row', active&&'active', dragging===key&&'dragging', markOn(key))} draggable={renaming!==openKey}
      data-folder={isLib?f.id:undefined} data-mfolder={isLib?undefined:f.id} aria-expanded={open}
      onClick={()=>singleClick(()=>goLibFolder(isLib?'library':'market', f.id))}
      onDblClick={e=>dblClick(()=> isLib ? renameLibFolder(f.id) : renameAdhocFolder(f.id), e)}
      onDragStart={e=>dragStart(isLib?'library':'market', f.id, key, e)}>
      <span class="caret-zone" data-act="toggle" style={pad} onClick={e=>{ e.stopPropagation(); toggleOpen(openKey); }}><Icon name={open?'chev-d':'chev-r'}/></span>
      <span class="ico"><Icon name="folder"/></span>{name(openKey, f.name)}{isLib ? tagsInline(/** @type {Folder} */(f)) : null}
      {n ? <span class="count" title={plural(n,'item')+' in this folder'}>{n}</span> : null}
      <MoreButton cls="tree-more" onClick={e=>{
        e.stopPropagation(); cancelSingleClick();
        if(isLib) libFolderMenu(f.id, e.currentTarget); else adhocFolderMenu(f.id, e.currentTarget);
      }}/>
    </div>;
  }

  return <div class={cls('lib-tree', mark==='root'&&'drop-root')}
    onDragEnd={()=>{ dragLib=null; libDropMark.value=null; setDragging(null); }}
    onDragOver={e=>{
      if(!dragLib && !gridDragItem) return;
      const spot=libDropSpot(e); if(!spot) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect='move';
      libDropMark.value = spot.mode==='root' ? 'root'
        : gridDragItem ? (spot.isLib ? spot.key+' drop-into' : null)
        : spot.key+' '+(spot.mode==='into'?'drop-into':spot.mode==='before'?'drop-before':'drop-after');
    }}
    onDragLeave={e=>{ if(e.target===e.currentTarget) libDropMark.value=null; }}
    onDrop={drop}>
    <div class={cls('tree-row root-row', rootActive&&'active')} data-root="1"
      onClick={()=>singleClick(()=>goLibFolder(lib?'library':'market', null))} onDblClick={cancelSingleClick}>
      <span class="caret-zone"></span><span class="ico"><Icon name={lib?'library':'store'}/></span>
      <span class="nm">{lib ? 'All items' : 'Marketplaces & listings'}</span>
      {lib && n0 ? <span class="count" title={plural(n0,'item')}>{n0}</span> : null}
    </div>
    {rows.map(row)}
  </div>;
}

export {LibTree};
