// @ts-check
/* The Library's own Export: one item, one folder, or a ticked list. It
   writes the {app, version, exported, inventory} shape ITEM_SCHEMA.md
   documents, so it round-trips through the app's main Import. */
import {useState} from 'preact/hooks';
import {S, clone} from '../../kernel/state.js';
import {Picker, downloadJSON, fileSlug} from '../io/index.js';
import {itemFolderOf, itemFolderPath, itemFolderSubtreeIds} from './item-folders.js';
import {libFlash} from '../../ui-kit/flash.js';
import {moError, openDialog, useDialogOk} from '../../ui-kit/modal.jsx';

/** @typedef {import('../../kernel/types.js').Item} Item */

/* ------------------------- library export ------------------------- */
/** @param {Item[]} items */
function itemsExportPayload(items){
  return {app:'room-planner', version:2, exported:new Date().toISOString(), inventory:items.map(clone)};
}
/** @param {Item[]} items @param {string} name */
function exportLibItems(items, name){
  if(!items.length){ libFlash('Nothing to export',true); return; }
  downloadJSON(itemsExportPayload(items), name);
  libFlash('Exported '+items.length+' item'+(items.length===1?'':'s'));
}
/** @param {string|null} folderId */
function exportLibFolder(folderId){
  const ids=itemFolderSubtreeIds(folderId);
  const items=S.inventory.filter(i=>ids.has(i.folderId||null));
  const f=itemFolderOf(folderId);
  exportLibItems(items, 'room-planner-'+fileSlug(f?f.name:'library')+'.json');
}
function ExportItemsBody(){
  const [ticked, setTicked] = useState(() => new Set(S.inventory.map(i=>i.id)));
  useDialogOk(() => {
    if(!ticked.size){ moError('Tick at least one item'); return false; }
    const items=S.inventory.filter(i=>ticked.has(i.id));
    downloadJSON(itemsExportPayload(items), ticked.size===S.inventory.length ? 'room-planner-library.json' : 'room-planner-items.json');
  });
  return <>
    <p class="hint">Tick what should go in the file. See <code>ITEM_SCHEMA.md</code> for the format.</p>
    <Picker title="Items" emptyMsg="Your library is empty" ticked={ticked} onChange={setTicked}
      rows={S.inventory.map(i=>({value:i.id, label:i.name, sub:i.folderId?itemFolderPath(i.folderId).map(f=>f.name).join(' / '):'Top level'}))}/>
  </>;
}
function exportLibraryDialog(){
  openDialog({title: 'Export items', ok: 'Export', body: <ExportItemsBody/>});
}
export {itemsExportPayload, exportLibItems, exportLibFolder, exportLibraryDialog};
