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
import {idLeaf, retagItem, uniqueId} from '../core/ids.js';
import {S, uid} from '../core/state.js';

/* ------------------------- item folders: the Inventory tab's tree, tags inherited onto everything inside ------------------------- */
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
