/* The layout tree: the folder/floor/room tree in the left pane, and the HTML
   its rows are built from.

   Extracted from index.html in Phase 3, move-only: the block below is
   byte-identical to what stood there (bar the one `import {moreBtn}` line,
   which was already an import and is re-stated in the header), and the
   `export` block at the end is the only line added.

   This is the tree's *rendering* half only. Everything that acts on a row —
   enterFloor, folderMenu, layoutMenu, the rename dialogs' callers and the
   drag-and-drop listeners — calls renderAll(), setMode() or the room-panel
   render*() functions, and those are inside the plan/library reference cycle
   documented in .claude/plans/refactor-split.md. They stayed in index.html.

   treeBox is a top-level DOM read, the same call ui/modal.js makes for `mo`
   and canvas/view.js for `cv`: a lookup, not a mutation, and the bundle runs
   after the document is parsed in all three targets.
*/
import {esc} from '../ui/panels.js';
import {moreBtn} from '../ui/menu.js';
import {$, svgI} from '../ui/modal.js';
import {S, floorMode, floorLayouts, childFloors, childFolders, childLayouts,
        folderOf, floorOf} from '../core/state.js';
import {mergeSel, treeOpen} from '../core/selection.js';
import {curFloorId} from '../core/history.js';
import {inlineEdit} from '../ui/inline-edit.js';
import {save} from '../core/store.js';
import {resetMeasureState} from '../canvas/measure-tool.js';
import {seedHistFor} from '../core/history.js';
import {setFloorSel, setRoomSel, setSel} from '../core/selection.js';
import {L} from '../core/state.js';

import {lastSplit, splitUndo, startSplitRoom} from '../canvas/split-room.js';
import {fit} from '../canvas/view.js';
import {remapMeasures} from '../core/migrate.js';
import {blankLayout, uid} from '../core/state.js';
import {flash} from '../ui/flash.js';
import {openMenu} from '../ui/menu.js';
import {askConfirm, askText, openModal} from '../ui/modal.js';
import {mountTagField, tagFieldHTML, tagFieldValue} from '../ui/tag-input.js';
import {lastMerge, mergeUndo, newFloorWith, putOnFloorDialog, setLastMerge} from './floors.js';
import {renderInv} from './item-list.js';
import {renderAll, setMode} from './mode.js';
import {dropHalf} from '../ui/dnd.js';
/* ------------------------- layout tree (folders + rooms) ------------------------- */
function folderLabel(f){
  const tags=(f.tags&&f.tags.length) ? `<span class="tagchip" title="Tag filter: ${esc(f.tags.join(', '))}">${esc(f.tags[0])}${f.tags.length>1?' +'+(f.tags.length-1):''}</span>` : '';
  return `<span class="nm">${esc(f.name)}</span>${tags}`;
}
const layoutRowHTML = (l,depth) =>
  `<div class="tree-row layout-row ${l.id===S.active?'active':''} ${mergeSel.size>=2 && mergeSel.has(l.id)?'merge-sel':''}" draggable="true" data-layout="${l.id}" style="padding-left:${depth*12+26}px" ${l.id===S.active?'aria-current="true"':''}>
      <span class="ico">${svgI('room')}</span><span class="nm">${esc(l.name)}</span>
      ${moreBtn('tree-more')}
    </div>`;
/* a floor holds its rooms directly: a room standing on one shows up here, not
   back under its folder, so it is only ever in the tree once */
function floorRowHTML(fl,depth){
  const open=treeOpen.has(fl.id), rooms=floorLayouts(fl.id);
  const active=floorMode() && curFloorId()===fl.id;
  let html=`<div class="tree-row floor-row ${active?'active':''}" data-floor="${fl.id}" style="padding-left:${depth*12+4}px" aria-expanded="${open}" ${active?'aria-current="true"':''}>`+`
      <button type="button" class="caret" data-act="toggle" aria-label="${open?'Collapse':'Expand'}">${svgI(open?'chev-d':'chev-r')}</button>
      <span class="ico">${svgI('floor')}</span><span class="nm">${esc(fl.name)}</span>
      <span class="tagchip">${rooms.length} room${rooms.length===1?'':'s'}</span>
      ${moreBtn('tree-more')}
    </div>`;
  if(open){
    for(const l of rooms) html+=layoutRowHTML(l,depth+1);
    if(!rooms.length) html+=`<div class="tree-empty" style="padding-left:${(depth+1)*12+26}px">No rooms yet</div>`;
  }
  return html;
}
function renderTreeLevel(parentId,depth){
  let html='';
  if(!parentId) for(const fl of childFloors(null)) html+=floorRowHTML(fl,depth);
  for(const f of childFolders(parentId)){
    const open=treeOpen.has(f.id);
    html+=`<div class="tree-row folder-row" draggable="true" data-folder="${f.id}" style="padding-left:${depth*12+4}px" aria-expanded="${open}">
      <button type="button" class="caret" data-act="toggle" aria-label="${open?'Collapse':'Expand'}">${svgI(open?'chev-d':'chev-r')}</button>
      <span class="ico">${svgI('folder')}</span>${folderLabel(f)}
      ${moreBtn('tree-more')}
    </div>`;
    if(open) html+=renderTreeLevel(f.id,depth+1);
  }
  const loose=childLayouts(parentId).filter(l=>!l.floorId);
  for(const l of loose) html+=layoutRowHTML(l,depth);
  if(depth>0 && !childFolders(parentId).length && !loose.length){
    html+=`<div class="tree-empty" style="padding-left:${depth*12+26}px">Empty</div>`;
  }
  return html;
}
function renderTree(){ $('layoutTree').innerHTML=renderTreeLevel(null,0); }
const treeBox=$('layoutTree');
const treeRowEl = id => treeBox.querySelector('[data-folder="'+id+'"],[data-layout="'+id+'"],[data-floor="'+id+'"]');

function renameFolder(id){
  const f=folderOf(id), row=treeRowEl(id);
  if(!f||!row) return;
  inlineEdit(row.querySelector('.nm'), f.name, v=>{ if(v){ f.name=v; save(); } renderTree(); });
}
function renameLayout(id){
  const l=S.layouts.find(x=>x.id===id), row=treeRowEl(id);
  if(!l||!row) return;
  inlineEdit(row.querySelector('.nm'), l.name, v=>{ if(v){ l.name=v; save(); } renderTree(); });
}
function renameFloor(id){
  const f=floorOf(id), row=treeRowEl(id);
  if(!f||!row) return;
  inlineEdit(row.querySelector('.nm'), f.name, v=>{ if(v){ f.name=v; save(); } renderTree(); });
}


/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* switching into a room under a DIFFERENT folder re-applies that folder's tag filter;
   switching between rooms in the SAME folder leaves whatever filter the person set alone */
function activateLayout(id){
  S.active=id; setSel(null); setRoomSel(null); setFloorSel(null);
  resetMeasureState();
  seedHistFor();
  const fid = L() ? (L().folderId||null) : null;
  if(fid !== S.lastFolderId){ S.tagFilter = (folderOf(fid)?.tags||[]).slice(); S.untaggedOnly=false; }
  S.lastFolderId = fid;
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* folder path from root to id, inclusive */
function folderPath(id){
  const out=[]; let f=folderOf(id);
  while(f){ out.unshift(f); f=folderOf(f.parentId); }
  return out;
}
/* would putting `id` under `parentId` create a cycle? */
function folderDescendant(id,parentId){
  let f=folderOf(parentId);
  while(f){ if(f.id===id) return true; f=folderOf(f.parentId); }
  return false;
}

/* clicking a floor switches the canvas to that floor's arrangement, not just the tree
   row — Floor mode has no floor id of its own (see curFloorId), so the anchor is
   whichever room on it is already active, or its first room otherwise */
function enterFloor(id){
  const rooms=floorLayouts(id);
  if(!rooms.length){ flash('Add a room to this floor first'); return; }
  if(curFloorId()!==id) activateLayout(rooms.find(l=>l.id===S.active)?.id || rooms[0].id);
  setMode('floor');
  renderAll(); save();
}

function folderMenu(id, anchor){
  const f=folderOf(id); if(!f) return;
  openMenu(anchor, [
    {label:'Rename', fn:()=>renameFolder(id)},
    {label:'Add a room here', fn:()=>askText('New room','Name','Room', n=>{
      const l=blankLayout(n,id); S.layouts.push(l); treeOpen.add(id); activateLayout(l.id);
      renderAll(); fit(); save();
    })},
    {label:'Add a subfolder', fn:()=>askText('New folder','Name','Folder', n=>{
      S.folders.push({id:uid(),name:n,parentId:id,tags:[]}); treeOpen.add(id); renderTree(); save();
    })},
    {sep:true},
    {label:'Move to folder\u2026', fn:()=>moveDialog('folder',id)},
    {label:'Edit tag filter\u2026', fn:()=>folderTagsDialog(id)},
    {sep:true},
    {label:'Delete folder\u2026', danger:true, fn:()=>deleteFolder(id)},
  ], f.name);
}
function layoutMenu(id, anchor){
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>{ activateLayout(id); renderAll(); fit(); save(); }},
    {label:'Rename', fn:()=>renameLayout(id)},
    {label:'Duplicate', fn:()=>duplicateLayout(id)},
    {label:'Split room\u2026', fn:()=>startSplitRoom(id)},
    {label:'Move to folder\u2026', fn:()=>moveDialog('layout',id)},
    l.floorId
      ? {label:'Take off \u201c'+(floorOf(l.floorId)||{name:'the floor'}).name+'\u201d', fn:()=>{ l.floorId=null; renderAll(); save(); }}
      : (S.floors.length
          ? {label:'Put on a floor\u2026', fn:()=>putOnFloorDialog(id)}
          : {label:'Put on a new floor\u2026', fn:()=>newFloorWith(l)}),
    ...(lastMerge && lastMerge.aId===id ? [{label:'Undo this merge\u2026', fn:mergeUndo}] : []),
    ...(lastSplit && lastSplit.aId===id ? [{label:'Undo this split\u2026', fn:splitUndo}] : []),
    {sep:true},
    {label:'Delete room\u2026', danger:true, fn:()=>deleteLayout(id)},
  ], l.name);
}

function folderTagsDialog(id){
  const f=folderOf(id);
  openModal('Tag filter for '+f.name, `
    <label class="stack-label" for="fTagsInput">Tags</label>
    ${tagFieldHTML('fTags','living room, seating')}
    <p class="hint">Type to pick from tags you already use. Tab or comma adds one, backspace removes the last.</p>
    <p class="hint">When you switch into a room in this folder from a room in a different folder, the item list's tag filter is set to this automatically. Switching between rooms inside this same folder leaves your filter as you left it.</p>`,
    'Save', ()=>{
      f.tags=tagFieldValue('fTags');
      renderTree(); save();
    },
    ()=>{ mountTagField('fTags', f.tags||[]); });
}
/* every folder and room under `id`, deepest last */
function folderContents(id){
  const folders=[], layouts=[];
  (function walk(pid){
    for(const f of childFolders(pid)){ folders.push(f); walk(f.id); }
    for(const l of childLayouts(pid)) layouts.push(l);
  })(id);
  return {folders,layouts};
}
function deleteFolder(id){
  const f=folderOf(id); if(!f) return;
  const up = folderOf(f.parentId) ? '\u201c'+folderOf(f.parentId).name+'\u201d' : 'the top level';
  const {folders,layouts}=folderContents(id);
  const drop=keep=>{
    if(keep){
      for(const sub of childFolders(id)) sub.parentId=f.parentId;
      for(const l of childLayouts(id)) l.folderId=f.parentId;
    } else {
      const killF=new Set(folders.map(x=>x.id)), killL=new Set(layouts.map(x=>x.id));
      S.layouts=S.layouts.filter(l=>!killL.has(l.id));
      S.folders=S.folders.filter(x=>!killF.has(x.id));
      for(const k of killF) treeOpen.delete(k);
    }
    S.folders=S.folders.filter(x=>x.id!==id);
    treeOpen.delete(id);
    if(!S.layouts.length) S.layouts=[blankLayout()];
    if(!S.layouts.some(l=>l.id===S.active)) activateLayout(S.layouts[0].id);
    renderAll(); fit(); save();
  };
  if(!folders.length && !layouts.length){
    askConfirm('Delete this folder?', '\u201c'+f.name+'\u201d is empty.', 'Delete folder', ()=>drop(false));
    return;
  }
  const bits=[];
  if(layouts.length) bits.push(layouts.length+' room'+(layouts.length>1?'s':''));
  if(folders.length) bits.push(folders.length+' folder'+(folders.length>1?'s':''));
  openModal('Delete \u201c'+f.name+'\u201d?', `
    <p>It holds ${esc(bits.join(' and '))}. Deleting the folder deletes all of that too.</p>
    <label class="check"><input type="checkbox" id="keepKids">Keep everything inside \u2014 move it up to ${esc(up)}</label>
    <p class="hint">Your library is never touched, only the rooms themselves.</p>`,
    'Delete folder', ()=>drop($('keepKids').checked), null, {danger:true});
}
function duplicateLayout(id){
  const src=S.layouts.find(x=>x.id===id); if(!src) return;
  const c=JSON.parse(JSON.stringify(src));
  c.id=uid(); c.name=c.name+' copy';
  const map={open:{}, item:{}, pillar:{}, iwall:{}};
  const renew = (k,x) => { const id=uid(); map[k][x.id]=id; x.id=id; };
  c.openings.forEach(o=>renew('open',o));
  c.placed.forEach(p=>renew('item',p));
  c.room.pillars.forEach(p=>renew('pillar',p));
  c.room.iwalls.forEach(w=>renew('iwall',w));
  remapMeasures(c, map);
  /* a copy stays on the same floor, nudged clear so it isn't hidden under the original */
  if(c.floorId) c.floorPlace={x:(c.floorPlace.x||0)+500, y:(c.floorPlace.y||0)+500, rot:c.floorPlace.rot||0};
  S.layouts.splice(S.layouts.indexOf(src)+1, 0, c);
  activateLayout(c.id);
  renderAll(); save();
}
function deleteLayout(id){
  if(S.layouts.length===1){ flash('You need at least one room'); return; }
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  askConfirm('Delete this room?', '\u201c'+l.name+'\u201d will be removed. Your library stays.', 'Delete', ()=>{
    S.layouts=S.layouts.filter(x=>x.id!==id);
    if(S.active===id) activateLayout(S.layouts[0].id);
    if(lastMerge && lastMerge.aId===id) setLastMerge(null);
    renderAll(); fit(); save();
  });
}

/* the menu's long way round to what dragging does */
function moveDialog(kind,id){
  const obj = kind==='folder' ? folderOf(id) : S.layouts.find(x=>x.id===id);
  if(!obj) return;
  const cur = (kind==='folder' ? obj.parentId : obj.folderId) || '';
  let opts=`<option value="" ${cur?'':'selected'}>No folder (top level)</option>`;
  (function walk(pid,depth){
    for(const f of childFolders(pid)){
      const bad = kind==='folder' && (f.id===id || folderDescendant(id,f.id));
      if(!bad) opts+=`<option value="${f.id}" ${f.id===cur?'selected':''}>${'\u00a0\u00a0'.repeat(depth)}${esc(f.name)}</option>`;
      walk(f.id,depth+1);
    }
  })(null,0);
  openModal('Move \u201c'+obj.name+'\u201d', `
    <label class="stack-label" for="moFolder">Folder</label>
    <select id="moFolder">${opts}</select>`, 'Move', ()=>{
      const v=$('moFolder').value||null;
      if(kind==='folder') obj.parentId=v; else { obj.folderId=v; obj.floorId=null; }
      if(v) treeOpen.add(v);
      renderTree(); renderInv(); save();
    });
}
/* The Rooms list holds more than one kind of thing, so + stays the one-click common case
   (a new room) and everything rarer sits behind the ⋯ with a word for a label. */
const newFolder = () =>
  askText('New folder','Name','Folder', n=>{ S.folders.push({id:uid(),name:n,parentId:null,tags:[]}); renderTree(); save(); });
let dragTree=null;
function setDragTree(v){ dragTree=v; }

function treeDropSpot(e){
  if(!dragTree) return null;
  const row=e.target.closest('.tree-row');
  if(!row) return {mode:'root'};
  /* dropping a room on a floor row is how you stand it on that floor */
  if(row.dataset.floor) return dragTree.kind==='layout' ? {mode:'onto-floor',id:row.dataset.floor,row} : null;
  const isFolder=!!row.dataset.folder;
  const id=isFolder?row.dataset.folder:row.dataset.layout;
  if(isFolder && dragTree.kind==='folder' && id===dragTree.id) return null;
  const t=dropHalf(e,row);
  if(isFolder && t>=0.3 && t<=0.7) return {mode:'into',id,isFolder,row};
  return {mode:t<0.5?'before':'after',id,isFolder,row};
}

export {folderLabel, layoutRowHTML, floorRowHTML, renderTreeLevel, renderTree, treeBox, treeRowEl, renameFolder, renameLayout, renameFloor, activateLayout, folderPath, folderDescendant, enterFloor, folderMenu, layoutMenu, folderTagsDialog, folderContents, deleteFolder, duplicateLayout, deleteLayout, moveDialog, newFolder, dragTree, setDragTree, treeDropSpot};
