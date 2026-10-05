// @ts-check
/* The folder-path and file-name helpers Export and Import share. The
   tick-box list they share is picker.jsx. */
import {S} from '../../kernel/state.js';

/** @typedef {{id: string, name: string, parentId: string|null}} AnyFolder */

/** @param {unknown} s */
const fileSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'export';
/* folder path of a room, read out of whichever folder list it belongs to */
/** @param {{folderId: string|null}} l @param {AnyFolder[]} [folders] */
function folderLine(l, folders){
  const list = folders || S.folders;
  const names=[];
  let f = l.folderId ? list.find(x=>x.id===l.folderId) : null;
  while(f){ names.unshift(f.name); f = f.parentId ? list.find(x=>x.id===/** @type {AnyFolder} */(f).parentId) : null; }
  return names.join(' / ');
}
/** @param {AnyFolder[]} folders @param {string|null|undefined} id @returns {Set<string>} */
function ancestorFolderIds(folders, id){
  /** @type {Set<string>} */
  const out=new Set();
  let f = id ? folders.find(x=>x.id===id) : null;
  while(f && !out.has(f.id)){ out.add(f.id); f = f.parentId ? folders.find(x=>x.id===/** @type {AnyFolder} */(f).parentId) : null; }
  return out;
}
export {fileSlug, folderLine, ancestorFolderIds};
