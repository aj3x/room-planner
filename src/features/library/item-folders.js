/* The Inventory tab's folder tree: the tree itself, the tags it materialises
   onto everything filed under it, and the id rehoming that keeps an item's id
   filed under its folder path.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   rehomeItemId is here rather than in core/ids.js, where §3 files it: it
   needs folderIdPrefix, which needs itemFolderPath, which is this tree.

   What acts on a folder did not come -- askNewLibFolder, libFolderMenu,
   deleteLibFolder, moveLibFolderDialog and the rest all reach renderLibAll,
   which is in the reference cycle between the Plan side panels and the
   Library UI (see .claude/plans/refactor-split.md, the plan/ round).
*/
import {idLeaf, retagItem, uniqueId} from '../../kernel/ids.js';
/* The tree walks and tag inheritance moved to core/ in the decoupling pass, so
   core/migrate.js could stop importing this file. Re-exported below: this
   module is still the one place the rest of the app asks about item folders. */
import {ancestorTags, applyTags, childItemFolders, itemCountInSubtree, itemFolderDescendant,
        itemFolderOf, itemFolderPath, itemFolderSubtreeIds, itemsInFolder, reconcileTags,
        recomputeFolderSubtree} from '../../kernel/item-folders.js';
import {S, uid} from '../../kernel/state.js';

function idSlug(s){
  const v=String(s||'').trim().replace(/[^A-Za-z0-9!\-_.*'()]+/g,'-').replace(/^-+|-+$/g,'');
  return (!v||v==='..')?'x':v;
}
function folderIdPrefix(folderId){ return itemFolderPath(folderId).map(f=>idSlug(f.name)).join('/'); }
/* find (or create) the itemFolder chain matching an id's own path segments, e.g.
   "ikea/kallax/4x2" -> ikea > kallax, so an imported item lands where its id says it belongs. */
function ensureItemFolderPath(parts){
  let parentId=null;
  for(const name of parts){
    let f=childItemFolders(parentId).find(x=>x.name===name);
    if(!f){ f={id:uid(), name, parentId, tags:[]}; S.itemFolders.push(f); }
    parentId=f.id;
  }
  return parentId;
}
/* keep an item's id filed under its folder's path, S3-key style */
function rehomeItemId(item, folderId){
  const leaf=idLeaf(item.id);
  const prefix=folderIdPrefix(folderId);
  const base=prefix ? prefix+'/'+leaf : leaf;
  const taken=new Set(S.inventory.filter(x=>x!==item).map(x=>x.id));
  const newId=uniqueId(base, taken);
  if(newId===item.id) return;
  retagItem(item.id, newId);
}
function moveItemToFolder(item, folderId){
  item.folderId=folderId||null;
  rehomeItemId(item, folderId);
  applyTags(item);
}
/* strip a deleted item out of every room */
function purgeItem(id){
  S.inventory=S.inventory.filter(i=>i.id!==id);
  for(const l of S.layouts) l.placed=l.placed.filter(p=>p.itemId!==id);
}
export {childItemFolders, itemFolderOf, itemsInFolder, itemFolderDescendant, itemFolderPath, itemFolderSubtreeIds, itemCountInSubtree, ancestorTags, applyTags, reconcileTags, recomputeFolderSubtree, ensureItemFolderPath, rehomeItemId, moveItemToFolder, purgeItem};
