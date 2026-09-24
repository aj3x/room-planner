/* Library folder dialogs: new folder, folder tags, move an item, and the two
   "what is inside this folder" counts the delete confirmations read.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only. libFolderMenu, deleteLibFolder, moveLibFolderDialog and their ad
   hoc twins are NOT here: they are downstream of the SCC, not in it, and
   follow in a later commit.
*/
import {save} from '../core/store.js';
import {$, moError, openModal} from '../ui/modal.js';
import {esc} from '../ui/panels.js';
import {mountTagField, tagFieldHTML, tagFieldValue} from '../ui/tag-input.js';
import {childMarketFolders, listingsInFolder} from './adhoc-folders.js';
import {childItemFolders, itemFolderOf, moveItemToFolder, recomputeFolderSubtree} from './item-folders.js';
import {libTreeOpen} from './nav.js';
import {renderLibAll} from './shell.js';
import {S, uid} from '../core/state.js';
import {renderInv} from '../plan/item-list.js';
import {inlineEdit} from '../ui/inline-edit.js';
import {openMenu} from '../ui/menu.js';
import {askConfirm, askText} from '../ui/modal.js';
import {marketFolderDescendant, marketFolderOf} from './adhoc-folders.js';
import {applyTags, itemFolderDescendant, itemsInFolder, purgeItem} from './item-folders.js';
import {nav} from './nav.js';
import {goLibFolder} from './shell.js';
import {libTreeBox} from './tree.js';

/* ------------------------- folder menus & dialogs ------------------------- */
function askNewLibFolder(title,onOk){
  openModal(title, `
    <label class="stack-label">Name</label>
    <input type="text" id="moText" value="Folder">
    <label class="stack-label mt">Tags</label>
    ${tagFieldHTML('fNewTags','living room, seating, IKEA')}
    <p class="hint">Every item filed in this folder — or in any subfolder underneath it — carries these tags automatically.</p>`,
    'Save',
    ()=>{ const v=$('moText').value.trim(); if(!v){ moError('Enter a name'); return false; } onOk(v, tagFieldValue('fNewTags')); },
    ()=>{ mountTagField('fNewTags', []); });
}

function libFolderTagsDialog(id){
  const f=itemFolderOf(id); if(!f) return;
  openModal('Tag everything in “'+f.name+'”', `
    <label class="stack-label">Tags</label>
    ${tagFieldHTML('fTags','living room, seating, IKEA')}
    <p class="hint">Every item filed in this folder — or any subfolder underneath it — carries these tags automatically, alongside whatever tags you put on the item itself. They show up in Furniture mode's own tag filter too.</p>`,
    'Save', ()=>{
      f.tags=tagFieldValue('fTags');
      recomputeFolderSubtree(id);
      save(); renderLibAll();
    },
    ()=>{ mountTagField('fTags', f.tags||[]); });
}

function adhocFolderContents(id){
  const folders=[], listings=[];
  (function walk(pid){
    for(const f of childMarketFolders(pid)){ folders.push(f); walk(f.id); }
    for(const l of listingsInFolder(pid)) listings.push(l);
  })(id);
  return {folders,listings};
}

function moveLibItemDialog(item){
  const cur=item.folderId||'';
  let opts=`<option value="" ${cur?'':'selected'}>No folder (top level)</option>`;
  (function walk(pid,depth){
    for(const f of childItemFolders(pid)){
      opts+=`<option value="${f.id}" ${f.id===cur?'selected':''}>${' '.repeat(depth)}${esc(f.name)}</option>`;
      walk(f.id,depth+1);
    }
  })(null,0);
  openModal('Move “'+item.name+'”', `<label class="stack-label">Folder</label>
    <select id="moFolder">${opts}</select>`, 'Move', ()=>{
      const v=$('moFolder').value||null;
      moveItemToFolder(item, v);
      if(v) libTreeOpen.add(v);
      save(); renderLibAll();
    });
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function renameLibFolder(id){
  const f=itemFolderOf(id), row=libTreeBox.querySelector('[data-folder="'+id+'"]');
  if(!f||!row) return;
  inlineEdit(row.querySelector('.nm'), f.name, v=>{ if(v){ f.name=v; save(); } renderLibAll(); });
}
function renameAdhocFolder(id){
  const f=marketFolderOf(id), row=libTreeBox.querySelector('[data-mfolder="'+id+'"]');
  if(!f||!row) return;
  inlineEdit(row.querySelector('.nm'), f.name, v=>{ if(v){ f.name=v; save(); } renderLibAll(); });
}

function libFolderMenu(id, anchor){
  const f=itemFolderOf(id); if(!f) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>goLibFolder('library',id)},
    {label:'Rename', fn:()=>renameLibFolder(id)},
    {label:'New subfolder', fn:()=>askNewLibFolder('New folder', (n,tags)=>{
      S.itemFolders.push({id:uid(),name:n,parentId:id,tags}); libTreeOpen.add(id); save(); renderLibAll();
    })},
    {sep:true},
    {label:'Move to folder…', fn:()=>moveLibFolderDialog(id)},
    {label:'Set folder tags…', fn:()=>libFolderTagsDialog(id)},
    {sep:true},
    {label:'Delete folder…', danger:true, fn:()=>deleteLibFolder(id)},
  ], f.name);
}
function adhocFolderMenu(id, anchor){
  const f=marketFolderOf(id); if(!f) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>goLibFolder('market',id)},
    {label:'Rename', fn:()=>renameAdhocFolder(id)},
    {label:'New subfolder', fn:()=>askText('New folder','Name','Folder', n=>{
      S.marketFolders.push({id:uid(),name:n,parentId:id}); libTreeOpen.add('m:'+id); save(); renderLibAll();
    })},
    {sep:true},
    {label:'Move to folder…', fn:()=>moveAdhocFolderDialog(id)},
    {sep:true},
    {label:'Delete folder…', danger:true, fn:()=>deleteAdhocFolder(id)},
  ], f.name);
}
function itemFolderContents(id){
  const folders=[], items=[];
  (function walk(pid){
    for(const f of childItemFolders(pid)){ folders.push(f); walk(f.id); }
    for(const it of itemsInFolder(pid)) items.push(it);
  })(id);
  return {folders,items};
}
function deleteLibFolder(id){
  const f=itemFolderOf(id); if(!f) return;
  const up=itemFolderOf(f.parentId) ? '“'+itemFolderOf(f.parentId).name+'”' : 'the top level';
  const {folders,items}=itemFolderContents(id);
  const drop=keep=>{
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
    save(); renderInv(); renderLibAll();
  };
  if(!folders.length && !items.length){
    askConfirm('Delete this folder?', '“'+f.name+'” is empty.', 'Delete folder', ()=>drop(false));
    return;
  }
  const bits=[];
  if(items.length) bits.push(items.length+' item'+(items.length>1?'s':''));
  if(folders.length) bits.push(folders.length+' folder'+(folders.length>1?'s':''));
  openModal('Delete “'+f.name+'”?', `
    <p>It holds ${esc(bits.join(' and '))}. Deleting the folder deletes all of that too, including anywhere those items are placed.</p>
    <label class="check"><input type="checkbox" id="keepKids">Keep everything inside — move it up to ${esc(up)}</label>`,
    'Delete folder', ()=>drop($('keepKids').checked), null, {danger:true});
}
function deleteAdhocFolder(id){
  const f=marketFolderOf(id); if(!f) return;
  const up=marketFolderOf(f.parentId) ? '“'+marketFolderOf(f.parentId).name+'”' : 'the top level';
  const {folders,listings}=adhocFolderContents(id);
  const drop=keep=>{
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
    save(); renderLibAll();
  };
  if(!folders.length && !listings.length){
    askConfirm('Delete this folder?', '“'+f.name+'” is empty.', 'Delete folder', ()=>drop(false));
    return;
  }
  const bits=[];
  if(listings.length) bits.push(listings.length+' listing'+(listings.length>1?'s':''));
  if(folders.length) bits.push(folders.length+' folder'+(folders.length>1?'s':''));
  openModal('Delete “'+f.name+'”?', `
    <p>It holds ${esc(bits.join(' and '))}.</p>
    <label class="check"><input type="checkbox" id="keepKids">Keep everything inside — move it up to ${esc(up)}</label>`,
    'Delete folder', ()=>drop($('keepKids').checked), null, {danger:true});
}
function moveLibFolderDialog(id){
  const obj=itemFolderOf(id); if(!obj) return;
  const cur=obj.parentId||'';
  let opts=`<option value="" ${cur?'':'selected'}>No folder (top level)</option>`;
  (function walk(pid,depth){
    for(const f of childItemFolders(pid)){
      const bad = f.id===id || itemFolderDescendant(id,f.id);
      if(!bad) opts+=`<option value="${f.id}" ${f.id===cur?'selected':''}>${' '.repeat(depth)}${esc(f.name)}</option>`;
      walk(f.id,depth+1);
    }
  })(null,0);
  openModal('Move “'+obj.name+'”', `<label class="stack-label">Folder</label>
    <select id="moFolder">${opts}</select>`, 'Move', ()=>{
      const v=$('moFolder').value||null;
      obj.parentId=v;
      if(v) libTreeOpen.add(v);
      recomputeFolderSubtree(id);
      save(); renderLibAll();
    });
}
function moveAdhocFolderDialog(id){
  const obj=marketFolderOf(id); if(!obj) return;
  const cur=obj.parentId||'';
  let opts=`<option value="" ${cur?'':'selected'}>No folder (top level)</option>`;
  (function walk(pid,depth){
    for(const f of childMarketFolders(pid)){
      const bad = f.id===id || marketFolderDescendant(id,f.id);
      if(!bad) opts+=`<option value="${f.id}" ${f.id===cur?'selected':''}>${' '.repeat(depth)}${esc(f.name)}</option>`;
      walk(f.id,depth+1);
    }
  })(null,0);
  openModal('Move “'+obj.name+'”', `<label class="stack-label">Folder</label>
    <select id="moFolder">${opts}</select>`, 'Move', ()=>{
      const v=$('moFolder').value||null;
      obj.parentId=v;
      if(v) libTreeOpen.add('m:'+v);
      save(); renderLibAll();
    });
}
export {askNewLibFolder, libFolderTagsDialog, adhocFolderContents, moveLibItemDialog, renameLibFolder, renameAdhocFolder, itemFolderContents, deleteLibFolder, deleteAdhocFolder, moveLibFolderDialog, moveAdhocFolderDialog, libFolderMenu, adhocFolderMenu};
