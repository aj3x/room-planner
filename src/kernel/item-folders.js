/* The Inventory-tab folder tree, as data: the tree walks, and the tag
   inheritance that materialises a folder's tags onto everything filed under
   it. A near-leaf — it reads S and nothing else.

   It lived in src/library/item-folders.js until the decoupling pass
   (.claude/plans/decoupling.md §4, step 2). It had to move because
   core/migrate.js calls reconcileTags on every load, and that import made the
   core layer depend on the Library UI. Nothing here touches the DOM; what
   does — rehoming ids, moving items between folders, purging — stayed behind
   in library/item-folders.js, which imports this file.
*/
import {S} from './state.js';

const childItemFolders = pid => S.itemFolders.filter(f=>(f.parentId||null)===(pid||null));
const itemFolderOf = id => id ? S.itemFolders.find(f=>f.id===id) : null;
const itemsInFolder = fid => S.inventory.filter(i=>(i.folderId||null)===(fid||null));
function itemFolderDescendant(id,parentId){
  let f=itemFolderOf(parentId);
  while(f){ if(f.id===id) return true; f=itemFolderOf(f.parentId); }
  return false;
}
function itemFolderPath(id){
  const out=[]; let f=itemFolderOf(id);
  while(f){ out.unshift(f); f=itemFolderOf(f.parentId); }
  return out;
}
function itemFolderSubtreeIds(id){
  const out=new Set([id]);
  (function walk(pid){ for(const f of childItemFolders(pid)){ out.add(f.id); walk(f.id); } })(id);
  return out;
}
function itemCountInSubtree(fid){
  let n=itemsInFolder(fid).length;
  for(const f of childItemFolders(fid)) n+=itemCountInSubtree(f.id);
  return n;
}
function ancestorTags(folderId){
  const s=new Set();
  for(const f of itemFolderPath(folderId)) for(const t of (f.tags||[])) s.add(t);
  return [...s];
}
/* item.tags is what the Furniture-mode Things pane filters by, so it keeps carrying both the
   hand-picked tags and whatever the item's folder chain imposes. manualTags is the authoritative
   hand-picked half; tags is always just their union with the current folder chain. */
function applyTags(item){
  item.tags=[...new Set([...(item.manualTags||[]), ...ancestorTags(item.folderId)])];
}
/* run once after loading a possibly stale save: anything in item.tags that the CURRENT folder
   chain doesn't explain is folded back into manualTags, so nothing picked by hand is lost. */
function reconcileTags(item){
  const inherited=ancestorTags(item.folderId);
  const manual=new Set(item.manualTags||[]);
  for(const t of (item.tags||[])) if(!inherited.includes(t)) manual.add(t);
  item.manualTags=[...manual];
  applyTags(item);
}
function recomputeFolderSubtree(folderId){
  const ids=itemFolderSubtreeIds(folderId);
  for(const it of S.inventory) if(it.folderId && ids.has(it.folderId)) applyTags(it);
}

export {childItemFolders, itemFolderOf, itemsInFolder, itemFolderDescendant, itemFolderPath, itemFolderSubtreeIds, itemCountInSubtree, ancestorTags, applyTags, reconcileTags, recomputeFolderSubtree};
