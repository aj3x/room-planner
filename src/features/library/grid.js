/* What the library grid's tiles do (grid.jsx renders them): create, edit,
   duplicate, delete an item, and an item tile's menu; and what a folder
   tile says it holds. */
import {itemDialog} from './item-dialog.js';
import {childItemFolders, itemsInFolder} from './item-folders.js';
import {uniqueId} from '../../kernel/ids.js';
import {selectClear} from '../../kernel/selection.js';
import {S, clone} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fileSlug} from '../io/index.js';
import {libFlash} from '../../ui-kit/flash.js';
import {openMenu} from '../../ui-kit/menu.js';
import {askConfirm} from '../../ui-kit/modal.jsx';
import {exportLibItems} from './export.js';
import {moveLibItemDialog} from './folder-menus.js';
import {purgeItem} from './item-folders.js';

function folderCountLabel(fid){
  const n=childItemFolders(fid).length, m=itemsInFolder(fid).length;
  const bits=[];
  if(n) bits.push(n+' folder'+(n>1?'s':''));
  if(m) bits.push(m+' item'+(m>1?'s':''));
  return bits.length?bits.join(', '):'Empty';
}

/* ------------------------- library: item/folder tiles + grid ------------------------- */
/* nothing is created until Save, so cancelling a new item leaves no "Untitled" behind */
function createLibItem(){ itemDialog(null); }
function duplicateLibItem(id){
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  const c=clone(it);
  c.id=uniqueId(it.id+'-copy', new Set(S.inventory.map(x=>x.id)));
  c.name=it.name+' copy';
  transact('lib', ()=>{ S.inventory.push(c); });
  libFlash('Duplicated');
}
function deleteLibItem(id){
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  const n=S.layouts.reduce((a,l)=>a+l.placed.filter(p=>p.itemId===id).length,0);
  const kill=()=>{
    transact('lib', ()=>{ purgeItem(id); selectClear(); });
  };
  if(n) askConfirm('Delete this item?', 'It is placed in '+n+' spot'+(n>1?'s':'')+' across your rooms. Those will be removed too.', 'Delete', kill);
  else askConfirm('Delete this item?', '“'+it.name+'” will be removed for good.', 'Delete', kill);
}
function libItemMenu(id, anchor){
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  openMenu(anchor, [
    {label:'Edit…', fn:()=>itemDialog(id)},
    {label:'Move to folder…', fn:()=>moveLibItemDialog(it)},
    {label:'Duplicate', fn:()=>duplicateLibItem(id)},
    {label:'Export…', fn:()=>exportLibItems([it], 'room-planner-'+fileSlug(it.name)+'.json')},
    {sep:true},
    {label:'Delete…', danger:true, fn:()=>deleteLibItem(id)},
  ], it.name);
}
export {folderCountLabel, createLibItem, duplicateLibItem, deleteLibItem, libItemMenu};
