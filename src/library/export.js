/* The Inventory tab's own Export: one item, one folder, or a ticked list.
   It writes the {app, version, exported, inventory} shape ITEM_SCHEMA.md
   documents, so it round-trips through the app's main Import.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.
*/
import {S, clone} from '../core/state.js';
import {downloadJSON} from '../io/export.js';
import {fileSlug, pickValues, pickerHTML, pickerMount} from '../io/pickers.js';
import {itemFolderOf, itemFolderPath, itemFolderSubtreeIds} from './item-folders.js';
import {libFlash} from '../ui/flash.js';
import {moError, openModal} from '../ui/modal.js';

/* ------------------------- library export ------------------------- */
function itemsExportPayload(items){
  return {app:'room-planner', version:2, exported:new Date().toISOString(), inventory:items.map(clone)};
}
function exportLibItems(items, name){
  if(!items.length){ libFlash('Nothing to export',true); return; }
  downloadJSON(itemsExportPayload(items), name);
  libFlash('Exported '+items.length+' item'+(items.length===1?'':'s'));
}
function exportLibFolder(folderId){
  const ids=itemFolderSubtreeIds(folderId);
  const items=S.inventory.filter(i=>ids.has(i.folderId||null));
  const f=itemFolderOf(folderId);
  exportLibItems(items, 'room-planner-'+fileSlug(f?f.name:'library')+'.json');
}
function exportLibraryDialog(){
  const rows=S.inventory.map(i=>({value:i.id, label:i.name, sub:i.folderId?itemFolderPath(i.folderId).map(f=>f.name).join(' / '):'Top level', checked:true}));
  openModal('Export items', `
    <p class="hint">Tick what should go in the file. See <code>ITEM_SCHEMA.md</code> for the format.</p>
    ${pickerHTML('xLibItems','Items',rows,'Your library is empty')}`,
    'Export',
    ()=>{
      const ids=new Set(pickValues('xLibItems'));
      if(!ids.size){ moError('Tick at least one item'); return false; }
      const items=S.inventory.filter(i=>ids.has(i.id));
      downloadJSON(itemsExportPayload(items), ids.size===S.inventory.length ? 'room-planner-library.json' : 'room-planner-items.json');
    },
    ()=>pickerMount('xLibItems'));
}
export {itemsExportPayload, exportLibItems, exportLibFolder, exportLibraryDialog};
