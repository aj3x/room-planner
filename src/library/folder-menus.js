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
export {askNewLibFolder, libFolderTagsDialog, adhocFolderContents, moveLibItemDialog};
