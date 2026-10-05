// @ts-check
/* The layout tree's commands: what the rows' menus do to the project,
   renaming (a signal the tree renders a box for), and where a drag would
   drop. The tree itself is tree-section.jsx; the menu actions commit
   through transact() and the tree, the panels and the canvas follow on
   their own. */
import {S, floorLayouts, childFolders, childLayouts,
        folderOf, floorOf} from '../../kernel/state.js';
import {treeExpand, treeCollapse} from '../../kernel/selection.js';
import {curFloorId} from '../../kernel/history.js';
import {transact} from '../../kernel/tx.js';

import {lastSplit, splitUndo, startSplitRoom} from '../room/index.js';
import {fit} from '../canvas/index.js';
import {remapMeasures} from '../../kernel/migrate.js';
import {blankLayout, uid} from '../../kernel/state.js';
import {flash} from '../../ui-kit/flash.js';
import {openMenu} from '../../ui-kit/menu.js';
import {askChoice, askConfirm, askConfirmOption, askTags, askText} from '../../ui-kit/modal.jsx';
import {deleteFloor, floorRoomsDialog, lastMerge, mergeUndo, newFloorWith, putOnFloorDialog, setLastMerge} from '../floors/index.js';
import {bpLastImport, bpUndoImport, bpUploadDialog} from '../blueprint/index.js';
import {activateLayout, setMode} from '../mode/index.js';
import {dropHalf} from '../../ui-kit/dnd.js';
import {signal} from '../../kernel/signals.js';
/* ------------------------- layout tree (folders + rooms) ------------------------- */
/** The folder, floor or room whose name is being typed over in the tree, if any (tree-section.jsx).
    @type {import('@preact/signals-core').Signal<string|null>} */
const treeRenaming = signal(null);

/** @param {string} id */
function renameFolder(id){ if(folderOf(id)) treeRenaming.value = id; }
/** @param {string} id */
function renameLayout(id){ if(S.layouts.some(x=>x.id===id)) treeRenaming.value = id; }
/** @param {string} id */
function renameFloor(id){ if(floorOf(id)) treeRenaming.value = id; }
/* What the rename box commits: the row's new name. */
/** @param {'folder'|'floor'|'layout'} kind @param {string} id @param {string|null} v */
function renamed(kind, id, v){
  if(treeRenaming.value===id) treeRenaming.value = null;   // not if another row's rename has started since
  const t = kind==='folder' ? folderOf(id) : kind==='floor' ? floorOf(id) : S.layouts.find(x=>x.id===id);
  if(v && t) transact('project', ()=>{ t.name=v; });
}


/* folder path from root to id, inclusive */
/** @param {string|null|undefined} id */
function folderPath(id){
  const out=[]; let f=folderOf(id);
  while(f){ out.unshift(f); f=folderOf(f.parentId); }
  return out;
}
/* would putting `id` under `parentId` create a cycle? */
/** is folder `id` parentId or above it? @param {string} id @param {string|null|undefined} parentId */
function folderDescendant(id,parentId){
  let f=folderOf(parentId);
  while(f){ if(f.id===id) return true; f=folderOf(f.parentId); }
  return false;
}

/* clicking a floor switches the canvas to that floor's arrangement, not just the tree
   row — Floor mode has no floor id of its own (see curFloorId), so the anchor is
   whichever room on it is already active, or its first room otherwise */
/** @param {string} id */
function enterFloor(id){
  const rooms=floorLayouts(id);
  if(!rooms.length){ flash('Add a room to this floor first'); return; }
  transact('project', ()=>{
    if(curFloorId()!==id) activateLayout(rooms.find(l=>l.id===S.active)?.id || rooms[0].id);
    setMode('floor');
  });
}

/** @param {string} id @param {Element} anchor */
function folderMenu(id, anchor){
  const f=folderOf(id); if(!f) return;
  openMenu(anchor, [
    {label:'Rename', fn:()=>renameFolder(id)},
    {label:'Add a room here', fn:()=>askText('New room','Name','Room', n=>{
      transact('project', ()=>{ const l=blankLayout(n,id); S.layouts.push(l); treeExpand(id); activateLayout(l.id); });
      fit();
    })},
    {label:'Add a subfolder', fn:()=>askText('New folder','Name','Folder', n=>{
      transact('project', ()=>{ S.folders.push({id:uid(),name:n,parentId:id,tags:[]}); treeExpand(id); });
    })},
    {sep:true},
    {label:'Move to folder\u2026', fn:()=>moveDialog('folder',id)},
    {label:'Edit tag filter\u2026', fn:()=>folderTagsDialog(id)},
    {sep:true},
    {label:'Delete folder\u2026', danger:true, fn:()=>deleteFolder(id)},
  ], f.name);
}
/** @param {string} id @param {Element} anchor */
function layoutMenu(id, anchor){
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>{ transact('project', ()=>activateLayout(id)); fit(); }},
    {label:'Rename', fn:()=>renameLayout(id)},
    {label:'Duplicate', fn:()=>duplicateLayout(id)},
    {label:'Split room\u2026', fn:()=>startSplitRoom(id)},
    {label:'Move to folder\u2026', fn:()=>moveDialog('layout',id)},
    l.floorId
      ? {label:'Take off \u201c'+(floorOf(l.floorId)||{name:'the floor'}).name+'\u201d', fn:()=>{ transact('project', ()=>{ l.floorId=null; }); }}
      : (S.floors.length
          ? {label:'Put on a floor\u2026', fn:()=>putOnFloorDialog(id)}
          : {label:'Put on a new floor\u2026', fn:()=>newFloorWith(l)}),
    ...(lastMerge && lastMerge.aId===id ? [{label:'Undo this merge\u2026', fn:mergeUndo}] : []),
    ...(lastSplit && lastSplit.aId===id ? [{label:'Undo this split\u2026', fn:splitUndo}] : []),
    {sep:true},
    {label:'Delete room\u2026', danger:true, fn:()=>deleteLayout(id)},
  ], l.name);
}

/** @param {string} id */
function folderTagsDialog(id){
  const f=/** @type {import('../../kernel/types.js').Folder} */(folderOf(id));   // asked from that folder's menu
  askTags('Tag filter for '+f.name, f.tags||[], 'living room, seating', [
    'Type to pick from tags you already use. Tab or comma adds one, backspace removes the last.',
    'When you switch into a room in this folder from a room in a different folder, the item list\'s tag filter is set to this automatically. Switching between rooms inside this same folder leaves your filter as you left it.'],
    tags=>{ transact('project', ()=>{ f.tags=tags; }); });
}
/* every folder and room under `id`, deepest last */
/** @param {string} id */
function folderContents(id){
  const folders=/** @type {import('../../kernel/types.js').Folder[]} */([]), layouts=/** @type {import('../../kernel/types.js').Layout[]} */([]);
  (function walk(/** @type {string|null} */pid){
    for(const f of childFolders(pid)){ folders.push(f); walk(f.id); }
    for(const l of childLayouts(pid)) layouts.push(l);
  })(id);
  return {folders,layouts};
}
/** @param {string} id */
function deleteFolder(id){
  const f=folderOf(id); if(!f) return;
  const up = folderOf(f.parentId) ? '\u201c'+/** @type {import('../../kernel/types.js').Folder} */(folderOf(f.parentId)).name+'\u201d' : 'the top level';
  const {folders,layouts}=folderContents(id);
  const drop=(/** @type {boolean} */keep)=>{
    transact('project', ()=>{
      if(keep){
        for(const sub of childFolders(id)) sub.parentId=f.parentId;
        for(const l of childLayouts(id)) l.folderId=f.parentId;
      } else {
        const killF=new Set(folders.map(x=>x.id)), killL=new Set(layouts.map(x=>x.id));
        S.layouts=S.layouts.filter(l=>!killL.has(l.id));
        S.folders=S.folders.filter(x=>!killF.has(x.id));
        for(const k of killF) treeCollapse(k);
      }
      S.folders=S.folders.filter(x=>x.id!==id);
      treeCollapse(id);
      if(!S.layouts.length) S.layouts=[blankLayout()];
      if(!S.layouts.some(l=>l.id===S.active)) activateLayout(S.layouts[0].id);
    });
    fit();
  };
  if(!folders.length && !layouts.length){
    askConfirm('Delete this folder?', '\u201c'+f.name+'\u201d is empty.', 'Delete folder', ()=>drop(false));
    return;
  }
  const bits=[];
  if(layouts.length) bits.push(layouts.length+' room'+(layouts.length>1?'s':''));
  if(folders.length) bits.push(folders.length+' folder'+(folders.length>1?'s':''));
  askConfirmOption('Delete \u201c'+f.name+'\u201d?', 'It holds '+bits.join(' and ')+'. Deleting the folder deletes all of that too.',
    'Keep everything inside \u2014 move it up to '+up, 'Your library is never touched, only the rooms themselves.', 'Delete folder', drop);
}
/** @param {string} id */
function duplicateLayout(id){
  const src=S.layouts.find(x=>x.id===id); if(!src) return;
  const c=/** @type {import('../../kernel/types.js').Layout} */(JSON.parse(JSON.stringify(src)));
  c.id=uid(); c.name=c.name+' copy';
  /** @type {Record<string, Record<string, string>>} */
  const map={open:{}, item:{}, pillar:{}, iwall:{}};
  const renew = (/** @type {string} */k,/** @type {{id: string}} */x) => { const id=uid(); map[k][x.id]=id; x.id=id; };
  c.openings.forEach(o=>renew('open',o));
  c.placed.forEach(p=>renew('item',p));
  c.room.pillars.forEach(p=>renew('pillar',p));
  c.room.iwalls.forEach(w=>renew('iwall',w));
  remapMeasures(c, map);
  /* a copy stays on the same floor, nudged clear so it isn't hidden under the original */
  if(c.floorId) c.floorPlace={x:(c.floorPlace.x||0)+500, y:(c.floorPlace.y||0)+500, rot:c.floorPlace.rot||0};
  transact('project', ()=>{ S.layouts.splice(S.layouts.indexOf(src)+1, 0, c); activateLayout(c.id); });
}
/** @param {string} id */
function deleteLayout(id){
  if(S.layouts.length===1){ flash('You need at least one room'); return; }
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  askConfirm('Delete this room?', '\u201c'+l.name+'\u201d will be removed. Your library stays.', 'Delete', ()=>{
    transact('project', ()=>{
      S.layouts=S.layouts.filter(x=>x.id!==id);
      if(S.active===id) activateLayout(S.layouts[0].id);
      if(lastMerge && lastMerge.aId===id) setLastMerge(null);
    });
    fit();
  });
}

/* the menu's long way round to what dragging does */
/** @param {'folder'|'layout'} kind @param {string} id */
function moveDialog(kind,id){
  const obj = /** @type {Partial<import('../../kernel/types.js').Folder & import('../../kernel/types.js').Layout>|null|undefined} */(kind==='folder' ? folderOf(id) : S.layouts.find(x=>x.id===id));   // a Folder when kind is 'folder', else a Layout
  if(!obj) return;
  const cur = (kind==='folder' ? obj.parentId : obj.folderId) || '';
  const choices=[{value:'', label:'No folder (top level)'}];
  (function walk(/** @type {string|null} */pid,/** @type {number} */depth){
    for(const f of childFolders(pid)){
      const bad = kind==='folder' && (f.id===id || folderDescendant(id,f.id));
      if(!bad) choices.push({value:f.id, label:'\u00a0\u00a0'.repeat(depth)+f.name});
      walk(f.id,depth+1);
    }
  })(null,0);
  askChoice('Move \u201c'+obj.name+'\u201d', 'Folder', choices, cur, 'Move', s=>{
    const v=s||null;
    transact('project', ()=>{
      if(kind==='folder') obj.parentId=v; else { obj.folderId=v; obj.floorId=null; }
      if(v) treeExpand(v);
    });
  });
}
/* The Rooms list holds more than one kind of thing, so + stays the one-click common case
   (a new room) and everything rarer sits behind the ⋯ with a word for a label. */
/* the floor row's menu; the blueprint import lands on a floor, so it starts here */
/** @param {string} id a floor */
function bpUndoableOn(id){
  return !!(bpLastImport && bpLastImport.floorId===id);
}
/** @param {string} id @param {Element} anchor */
function floorMenu(id, anchor){
  const fl=floorOf(id); if(!fl) return;
  openMenu(anchor, [
    {label:'Rename', fn:()=>renameFloor(id)},
    {label:'Rooms on this floor…', fn:()=>floorRoomsDialog(id)},
    {label:'Import a blueprint onto this floor…', fn:()=>bpUploadDialog(false, id)},
    ...(bpUndoableOn(id) ? [{label:'Undo the blueprint import…', fn:bpUndoImport}] : []),
    {sep:true},
    {label:'Delete floor…', danger:true, fn:()=>deleteFloor(id)},
  ], fl.name);
}

const newFolder = () =>
  askText('New folder','Name','Folder', n=>{ transact('project', ()=>{ S.folders.push({id:uid(),name:n,parentId:null,tags:[]}); }); });
/** The row being dragged in the tree. @type {{kind: 'folder'|'layout', id: string}|null} */
let dragTree=null;
/** @param {{kind: 'folder'|'layout', id: string}|null} v */
function setDragTree(v){ dragTree=v; }

/** Where a drop at e would land. @param {DragEvent} e @returns {{mode: 'root'} | {mode: 'onto-floor', id: string, row: HTMLElement} | {mode: 'into'|'before'|'after', id: string, isFolder: boolean, row: HTMLElement} | null} */
function treeDropSpot(e){
  if(!dragTree) return null;
  const row=/** @type {HTMLElement|null} */(/** @type {Element} */(e.target).closest('.tree-row'));
  if(!row) return {mode:'root'};
  /* dropping a room on a floor row is how you stand it on that floor */
  if(row.dataset.floor) return dragTree.kind==='layout' ? {mode:'onto-floor',id:row.dataset.floor,row} : null;
  const isFolder=!!row.dataset.folder;
  const id=/** @type {string} */(isFolder?row.dataset.folder:row.dataset.layout);   // every row carries one
  if(isFolder && dragTree.kind==='folder' && id===dragTree.id) return null;
  const t=dropHalf(e,row);
  if(isFolder && t>=0.3 && t<=0.7) return {mode:'into',id,isFolder,row};
  return {mode:t<0.5?'before':'after',id,isFolder,row};
}

export {treeRenaming, renamed, renameFolder, renameLayout, renameFloor, folderPath, folderDescendant, enterFloor, folderMenu, layoutMenu, folderTagsDialog, folderContents, deleteFolder, duplicateLayout, deleteLayout, moveDialog, floorMenu, newFolder, dragTree, setDragTree, treeDropSpot};
