// @ts-check
/* Library and ad hoc folder menus and dialogs (new, rename, tags, move,
   delete), an ad hoc listing's menu, and the "what is inside this folder"
   counts the delete confirmations read. */
import {transact} from '../../kernel/tx.js';
import {moError, openDialog} from '../../ui-kit/modal.jsx';
import {TagField} from '../../ui-kit/tag-field.jsx';
import {adhocCache, childMarketFolders, listingsInFolder, marketFolderDescendant, marketFolderOf} from '../marketplace/index.js';
import {childItemFolders, itemFolderOf, moveItemToFolder, recomputeFolderSubtree} from './item-folders.js';
import {libTreeOpen} from './nav.js';
import {S, uid} from '../../kernel/state.js';
import {openMenu} from '../../ui-kit/menu.js';
import {askChoice, askConfirm, askConfirmOption, askTags, askText} from '../../ui-kit/modal.jsx';
import {applyTags, itemFolderDescendant, itemsInFolder, purgeItem} from './item-folders.js';
import {goLibFolder, libRenaming, nav, selectListing} from './nav.js';

/** @typedef {import('../../kernel/types.js').Folder} Folder */
/** @typedef {import('../../kernel/types.js').Item} Item */
/** @typedef {import('../../kernel/types.js').MarketFolder} MarketFolder */
/** @typedef {import('../../kernel/types.js').MarketListing} MarketListing */
/** @typedef {import('preact').RefObject<HTMLInputElement>} BoxRef */
/** @typedef {import('../../ui-kit/tag-field.jsx').TagRead} TagRef */

/* ------------------------- folder menus & dialogs ------------------------- */
/** @param {{name: BoxRef, tags: TagRef}} p */
function NewFolderBody({name, tags}){
  return <>
    <label class="stack-label">Name</label>
    <input type="text" id="moText" value="Folder" ref={name}/>
    <label class="stack-label mt">Tags</label>
    <TagField id="fNewTags" initialTags={[]} placeholder="living room, seating, IKEA" read={tags}/>
    <p class="hint">Every item filed in this folder — or in any subfolder underneath it — carries these tags automatically.</p>
  </>;
}
/** @param {string} title @param {(name: string, tags: string[]) => void} onOk */
function askNewLibFolder(title,onOk){
  /** @type {BoxRef} */
  const name={current: null};
  /** @type {TagRef} */
  const tags={current: null};
  openDialog({title, ok: 'Save', body: <NewFolderBody name={name} tags={tags}/>, onOk: ()=>{
    const v=(name.current ? name.current.value : '').trim(); if(!v){ moError('Enter a name'); return false; }
    onOk(v, tags.current ? tags.current() : []);
  }});
}

/** @param {string} id */
function libFolderTagsDialog(id){
  const f=itemFolderOf(id); if(!f) return;
  askTags('Tag everything in “'+f.name+'”', f.tags||[], 'living room, seating, IKEA',
    ['Every item filed in this folder — or any subfolder underneath it — carries these tags automatically, alongside whatever tags you put on the item itself. They show up in Furniture mode\'s own tag filter too.'],
    tags=>{ transact('lib', ()=>{ f.tags=tags; recomputeFolderSubtree(id); }); });
}

/** @param {string|null} id */
function adhocFolderContents(id){
  const folders=/** @type {MarketFolder[]} */([]), listings=/** @type {MarketListing[]} */([]);
  (function walk(/** @type {string|null} */pid){
    for(const f of childMarketFolders(pid)){ folders.push(f); walk(f.id); }
    for(const l of listingsInFolder(pid)) listings.push(l);
  })(id);
  return {folders,listings};
}

/** Every folder of a tree as a choice, indented by depth, after "No folder", leaving out the ones `skip` says.
    @param {(pid: string|null) => {id: string, name: string}[]} children @param {(id: string) => boolean} [skip]
    @returns {import('../../ui-kit/modal.jsx').Choice[]} */
function folderChoices(children, skip){
  const out=[{value:'', label:'No folder (top level)'}];
  (function walk(/** @type {string|null} */pid,/** @type {number} */depth){
    for(const f of children(pid)){
      if(!(skip && skip(f.id))) out.push({value:f.id, label:' '.repeat(depth)+f.name});
      walk(f.id,depth+1);
    }
  })(null,0);
  return out;
}
/** @param {Item} item */
function moveLibItemDialog(item){
  askChoice('Move “'+item.name+'”', 'Folder', folderChoices(childItemFolders), item.folderId||'', 'Move', v=>{
    const to=v||null;
    transact('lib', ()=>{ moveItemToFolder(item, to); if(to) libTreeOpen.add(to); });
  });
}

/* Renaming in place: the tree (lib-tree.jsx) shows a rename box on the row
   libRenaming names, and hands what was typed to renamedFolder. */
/** @param {string} id */
function renameLibFolder(id){ if(itemFolderOf(id)) libRenaming.value=id; }
/** @param {string} id */
function renameAdhocFolder(id){ if(marketFolderOf(id)) libRenaming.value='m:'+id; }
/** @param {string} key a libRenaming value @param {string|null} v the new name, or null to leave it */
function renamedFolder(key, v){
  if(libRenaming.value===key) libRenaming.value=null;   // not if another row's rename has started since
  const f = key.startsWith('m:') ? marketFolderOf(key.slice(2)) : itemFolderOf(key);
  if(v && f) transact('lib', ()=>{ f.name=v; });
}

/** @param {string} id @param {Element} anchor */
function libFolderMenu(id, anchor){
  const f=itemFolderOf(id); if(!f) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>goLibFolder('library',id)},
    {label:'Rename', fn:()=>renameLibFolder(id)},
    {label:'New subfolder', fn:()=>askNewLibFolder('New folder', (n,tags)=>{
      transact('lib', ()=>{ S.itemFolders.push({id:uid(),name:n,parentId:id,tags}); libTreeOpen.add(id); });
    })},
    {sep:true},
    {label:'Move to folder…', fn:()=>moveLibFolderDialog(id)},
    {label:'Set folder tags…', fn:()=>libFolderTagsDialog(id)},
    {sep:true},
    {label:'Delete folder…', danger:true, fn:()=>deleteLibFolder(id)},
  ], f.name);
}
/** @param {string} id @param {Element} anchor */
function adhocFolderMenu(id, anchor){
  const f=marketFolderOf(id); if(!f) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>goLibFolder('market',id)},
    {label:'Rename', fn:()=>renameAdhocFolder(id)},
    {label:'New subfolder', fn:()=>askText('New folder','Name','Folder', n=>{
      transact('lib', ()=>{ S.marketFolders.push({id:uid(),name:n,parentId:id}); libTreeOpen.add('m:'+id); });
    })},
    {sep:true},
    {label:'Move to folder…', fn:()=>moveAdhocFolderDialog(id)},
    {sep:true},
    {label:'Delete folder…', danger:true, fn:()=>deleteAdhocFolder(id)},
  ], f.name);
}
/** @param {string} id */
function itemFolderContents(id){
  const folders=/** @type {Folder[]} */([]), items=/** @type {Item[]} */([]);
  (function walk(/** @type {string} */pid){
    for(const f of childItemFolders(pid)){ folders.push(f); walk(f.id); }
    for(const it of itemsInFolder(pid)) items.push(it);
  })(id);
  return {folders,items};
}
/** @param {string} id */
function deleteLibFolder(id){
  const f=itemFolderOf(id); if(!f) return;
  const parent=itemFolderOf(f.parentId);
  const up=parent ? '“'+parent.name+'”' : 'the top level';
  const {folders,items}=itemFolderContents(id);
  const drop=(/** @type {boolean} */keep)=>{
    transact('lib', ()=>{
      if(keep){
        const movedSubs=childItemFolders(id).slice(), movedItems=itemsInFolder(id).slice();
        for(const sub of movedSubs) sub.parentId=f.parentId;
        for(const it of movedItems) it.folderId=f.parentId;
        for(const it of movedItems) applyTags(it);
        for(const sub of movedSubs) recomputeFolderSubtree(sub.id);
      } else {
        const killIds=new Set(items.map(x=>x.id));
        for(const iid of killIds) purgeItem(iid);
        const killF=new Set(folders.map(x=>x.id));
        S.itemFolders=S.itemFolders.filter(x=>!killF.has(x.id));
        for(const k of killF) libTreeOpen.delete(k);
      }
      S.itemFolders=S.itemFolders.filter(x=>x.id!==id);
      libTreeOpen.delete(id);
      if(nav.libFolderId===id || (keep===false && folders.some(x=>x.id===nav.libFolderId))) goLibFolder('library',null);
    });
  };
  if(!folders.length && !items.length){
    askConfirm('Delete this folder?', '“'+f.name+'” is empty.', 'Delete folder', ()=>drop(false));
    return;
  }
  const bits=[];
  if(items.length) bits.push(items.length+' item'+(items.length>1?'s':''));
  if(folders.length) bits.push(folders.length+' folder'+(folders.length>1?'s':''));
  askConfirmOption('Delete “'+f.name+'”?', 'It holds '+bits.join(' and ')+'. Deleting the folder deletes all of that too, including anywhere those items are placed.',
    'Keep everything inside — move it up to '+up, null, 'Delete folder', drop);
}
/** @param {string} id */
function deleteAdhocFolder(id){
  const f=marketFolderOf(id); if(!f) return;
  const parent=marketFolderOf(f.parentId);
  const up=parent ? '“'+parent.name+'”' : 'the top level';
  const {folders,listings}=adhocFolderContents(id);
  const drop=(/** @type {boolean} */keep)=>{
    transact('lib', ()=>{
      if(keep){
        for(const sub of childMarketFolders(id)) sub.parentId=f.parentId;
        for(const l of listingsInFolder(id)) l.parentId=f.parentId;
      } else {
        const killL=new Set(listings.map(x=>x.id)), killF=new Set(folders.map(x=>x.id));
        S.marketListings=S.marketListings.filter(x=>!killL.has(x.id));
        S.marketFolders=S.marketFolders.filter(x=>!killF.has(x.id));
        for(const k of killF) libTreeOpen.delete('m:'+k);
      }
      S.marketFolders=S.marketFolders.filter(x=>x.id!==id);
      libTreeOpen.delete('m:'+id);
      if(nav.marketFolderId===id) goLibFolder('market',null);
    });
  };
  if(!folders.length && !listings.length){
    askConfirm('Delete this folder?', '“'+f.name+'” is empty.', 'Delete folder', ()=>drop(false));
    return;
  }
  const bits=[];
  if(listings.length) bits.push(listings.length+' listing'+(listings.length>1?'s':''));
  if(folders.length) bits.push(folders.length+' folder'+(folders.length>1?'s':''));
  askConfirmOption('Delete “'+f.name+'”?', 'It holds '+bits.join(' and ')+'.', 'Keep everything inside — move it up to '+up, null, 'Delete folder', drop);
}
/** @param {string} id */
function moveLibFolderDialog(id){
  const obj=itemFolderOf(id); if(!obj) return;
  askChoice('Move “'+obj.name+'”', 'Folder', folderChoices(childItemFolders, fid=>fid===id || itemFolderDescendant(id,fid)), obj.parentId||'', 'Move', s=>{
    const v=s||null;
    transact('lib', ()=>{ obj.parentId=v; recomputeFolderSubtree(id); if(v) libTreeOpen.add(v); });
  });
}
/** @param {string} id */
function moveAdhocFolderDialog(id){
  const obj=marketFolderOf(id); if(!obj) return;
  askChoice('Move “'+obj.name+'”', 'Folder', folderChoices(childMarketFolders, fid=>fid===id || marketFolderDescendant(id,fid)), obj.parentId||'', 'Move', s=>{
    const v=s||null;
    transact('lib', ()=>{ obj.parentId=v; if(v) libTreeOpen.add('m:'+v); });
  });
}
/** @param {string} id @param {Element} anchor */
function listingMenu(id, anchor){
  const l=S.marketListings.find(x=>x.id===id); if(!l) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>selectListing(id)},
    {label:'Move to folder…', fn:()=>moveListingDialog(l)},
    {sep:true},
    {label:'Delete…', danger:true, fn:()=>askConfirm('Delete this listing?', '“'+l.name+'” will be removed. Your library isn’t affected.', 'Delete', ()=>{
      transact('lib', ()=>{
        S.marketListings=S.marketListings.filter(x=>x.id!==id);
        adhocCache.delete(id);
        if(nav.marketSelListingId===id) nav.marketSelListingId=null;
      });
    })},
  ], l.name);
}
/** @param {MarketListing} l */
function moveListingDialog(l){
  askChoice('Move “'+l.name+'”', 'Folder', folderChoices(childMarketFolders), l.parentId||'', 'Move', v=>{
    transact('lib', ()=>{ l.parentId=v||null; });
  });
}
export {askNewLibFolder, libFolderTagsDialog, adhocFolderContents, moveLibItemDialog, renameLibFolder, renameAdhocFolder, renamedFolder, itemFolderContents, deleteLibFolder, deleteAdhocFolder, moveLibFolderDialog, moveAdhocFolderDialog, libFolderMenu, adhocFolderMenu, listingMenu, moveListingDialog};
