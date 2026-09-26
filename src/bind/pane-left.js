/* The left-hand pane's wiring, and the biggest of the six: the layout tree
   (click routing, context menu, rename, and the drag that reparents a room or
   folder), the Rooms header's menu buttons, the structures/walls/openings lists
   of the Room section, and the whole inventory list — filters, search, click
   routing, rename, its own reorder drag, and the two "add an item" buttons.

   One of the per-pane bind modules; src/bind/header.js carries the full
   rationale for the pattern. The short version: each src/html/ partial ends
   with a module script that imports its bind function and calls it, so a pane's
   markup and the list of things listening to it sit in the same file, and it is
   a function rather than registrations at import time because nothing in src/
   may have a top-level side effect.

   Ordering: three elements here carry more than one listener — treeBox (eight),
   invBox (seven) and wallList (two) — and each group is whole and in
   index.html's order, which is the only thing registration order can decide.
   Do not reorder them. */

import { PALETTE, uid, blankLayout, S, openOf, roomMode, folderOf } from '../core/state.js';
import { roomSel, mergeSel, setRoomSel, treeOpen } from '../core/selection.js';
import { save } from '../core/store.js';
import { $, askText } from '../ui/modal.js';
import { closeMenu, openMenu, menuAtPoint } from '../ui/menu.js';
import { singleClick, cancelSingleClick } from '../ui/inline-edit.js';
import { moveBefore, clearDropMarks, dropHalf } from '../ui/dnd.js';
import { flash } from '../ui/flash.js';
import { wallDrawState } from '../canvas/interaction-state.js';
import { fit } from '../canvas/view.js';
import { draw } from '../canvas/draw.js';
import { startWallDraw, cancelWallDraw } from '../canvas/wall-draw.js';
import { startSplitRoom } from '../canvas/split-room.js';
import { renderAll, setMode } from '../plan/mode.js';
import { folderDescendant, enterFloor, folderMenu, layoutMenu, newFolder, activateLayout, renderTree, treeBox, renameFolder, renameLayout, renameFloor, dragTree, setDragTree, treeDropSpot } from '../plan/layout-tree.js';
import { newFloor, putOnFloor, openFloorMergeMenu, floorMenu, renderFloorSel } from '../plan/floors.js';
import { deletePillar, deleteIWall, renderRoomSel, deleteOpening, renderWalls, renderObstacles, addPillar, wallDialog, KIND, renderOpen } from '../plan/room-panel.js';
import { renderTagChips, renderInv, invBox, placeItem, renameItem, itemMenu, dragInv, setDragInv } from '../plan/item-list.js';
import { itemDialog } from '../plan/item-dialog.js';
import { openingDialog } from '../plan/opening-dialog.js';
import { bpUploadDialog } from '../blueprint/step1-upload.js';

function bindPaneLeft(){
  treeBox.addEventListener('click', e=>{
    const more=e.target.closest('[data-act=more]');
    const caret=e.target.closest('[data-act=toggle]');
    const fRow=e.target.closest('.folder-row');
    const lRow=e.target.closest('.layout-row');
    const flRow=e.target.closest('.floor-row');
    if(more){
      cancelSingleClick();
      if(flRow) floorMenu(flRow.dataset.floor, more);
      else if(fRow) folderMenu(fRow.dataset.folder, more);
      else if(lRow) layoutMenu(lRow.dataset.layout, more);
      return;
    }
    if(caret){
      cancelSingleClick();
      const id = flRow ? flRow.dataset.floor : fRow.dataset.folder;
      treeOpen.has(id)?treeOpen.delete(id):treeOpen.add(id);
      renderTree();
      return;
    }
    // held back briefly so a second click can turn into a rename instead
    if(flRow){
      const id=flRow.dataset.floor;
      singleClick(()=>{ enterFloor(id); });
      return;
    }
    if(fRow){
      const id=fRow.dataset.folder;
      singleClick(()=>{ treeOpen.has(id)?treeOpen.delete(id):treeOpen.add(id); renderTree(); });
      return;
    }
    if(lRow){
      const id=lRow.dataset.layout;
      if(e.shiftKey){
        cancelSingleClick();
        mergeSel.has(id) ? mergeSel.delete(id) : mergeSel.add(id);
        while(mergeSel.size>2) mergeSel.delete(mergeSel.values().next().value);
        renderTree(); renderFloorSel(); draw();
        return;
      }
      mergeSel.clear();
      singleClick(()=>{ activateLayout(id); setMode('room'); renderAll(); fit(); save(); });
    }
  });
  treeBox.addEventListener('contextmenu', e=>{
    const lRow=e.target.closest('.layout-row'); if(!lRow) return;
    e.preventDefault();
    const id=lRow.dataset.layout;
    if(!mergeSel.has(id)){ mergeSel.clear(); mergeSel.add(id); renderTree(); }
    if(mergeSel.size!==2){
      menuAtPoint(e.clientX, e.clientY, [{label:'Split room…', fn:()=>startSplitRoom(id)}]);
      return;
    }
    const ids=[...mergeSel];
    const l0=S.layouts.find(x=>x.id===ids[0]), l1=S.layouts.find(x=>x.id===ids[1]);
    if(!l0||!l1||!l0.floorId||l0.floorId!==l1.floorId){
      flash('Select two rooms on the same floor to merge them');
      mergeSel.clear(); renderTree();
      return;
    }
    openFloorMergeMenu(ids, e.clientX, e.clientY);
  });
  treeBox.addEventListener('dblclick', e=>{
    cancelSingleClick();
    if(e.target.closest('button')) return;
    const row=e.target.closest('.tree-row'); if(!row) return;
    if(row.dataset.floor) renameFloor(row.dataset.floor);
    else if(row.dataset.folder) renameFolder(row.dataset.folder);
    else renameLayout(row.dataset.layout);
  });

  /* ---- drag a room or folder to move it: onto a folder puts it inside, on the
          upper/lower edge of a row drops it beside that row ---- */
  treeBox.addEventListener('dragstart', e=>{
    const row=e.target.closest('.tree-row'); if(!row) return;
    cancelSingleClick(); closeMenu();
    if(row.dataset.floor) return;   // floors don't reorder; rooms are dragged onto them
    setDragTree(row.dataset.folder ? {kind:'folder',id:row.dataset.folder} : {kind:'layout',id:row.dataset.layout});
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',dragTree.id); }catch(err){}
  });
  treeBox.addEventListener('dragend', ()=>{
    setDragTree(null);
    clearDropMarks(treeBox);
    for(const r of treeBox.querySelectorAll('.dragging')) r.classList.remove('dragging');
  });
  treeBox.addEventListener('dragover', e=>{
    const spot=treeDropSpot(e); if(!spot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    clearDropMarks(treeBox);
    if(spot.mode==='root'){ treeBox.classList.add('drop-root'); return; }
    spot.row.classList.add(spot.mode==='into'||spot.mode==='onto-floor'?'drop-into':spot.mode==='before'?'drop-before':'drop-after');
  });
  treeBox.addEventListener('dragleave', e=>{ if(e.target===treeBox) clearDropMarks(treeBox); });
  treeBox.addEventListener('drop', e=>{
    const spot=treeDropSpot(e), d=dragTree;
    clearDropMarks(treeBox);
    if(!spot||!d) return;
    e.preventDefault();
    if(spot.mode==='onto-floor'){
      const l=S.layouts.find(x=>x.id===d.id);
      setDragTree(null);
      if(l && l.floorId!==spot.id) putOnFloor(l, spot.id); else renderTree();
      return;
    }
    let parent=null, targetId=null, after=false;
    if(spot.mode==='into'){ parent=spot.id; treeOpen.add(parent); }
    else if(spot.mode!=='root'){
      const t = spot.isFolder ? folderOf(spot.id) : S.layouts.find(x=>x.id===spot.id);
      if(!t) return;
      parent = (spot.isFolder ? t.parentId : t.folderId) || null;
      // folders and rooms are kept in separate lists, so only order against your own kind
      if(spot.isFolder === (d.kind==='folder')){ targetId=spot.id; after=(spot.mode==='after'); }
    }
    if(d.kind==='folder'){
      const f=folderOf(d.id); if(!f) return;
      if(parent===d.id || folderDescendant(d.id,parent)){ flash("A folder can't go inside itself"); return; }
      f.parentId=parent;
      moveBefore(S.folders, d.id, targetId, after);
    } else {
      const l=S.layouts.find(x=>x.id===d.id); if(!l) return;
      l.folderId=parent;
      l.floorId=null;   // dragged back into the tree proper, so off the floor it comes
      moveBefore(S.layouts, d.id, targetId, after);
    }
    setDragTree(null);
    renderTree(); renderInv(); save();
  });

  $('btnRoomsMore').addEventListener('click', e=>{
    openMenu(e.currentTarget, [
      {label:'New folder', fn:newFolder},
      {label:'New floor', fn:newFloor}
    ], 'Rooms');
  });
  $('btnImportBlueprint').addEventListener('click', ()=>bpUploadDialog());
  $('btnNewLayout').addEventListener('click', ()=>{
    askText('New room','Name','Room '+(S.layouts.length+1), n=>{
      const l=blankLayout(n,null); S.layouts.push(l); activateLayout(l.id);
      renderTree(); renderAll(); fit(); save();
    });
  });

  $('structList').addEventListener('click', e=>{
    const li=e.target.closest('li[data-id]'); if(!li) return;
    const kind=li.dataset.kind, id=li.dataset.id, btn=e.target.closest('button');
    if(btn&&btn.dataset.act==='more'){
      openMenu(btn, [
        {label:'Select', fn:()=>{ if(!roomMode()) setMode('room'); setRoomSel({kind,id}); renderRoomSel(); renderObstacles(); draw(); }},
        {sep:true},
        {label:'Delete', danger:true, fn:()=>kind==='pillar'?deletePillar(id):deleteIWall(id)},
      ], li.querySelector('.nm').textContent);
      return;
    }
    if(!roomMode()) setMode('room');
    setRoomSel({kind, id});
    renderRoomSel(); renderObstacles(); draw();
  });
  $('btnAddStruct').addEventListener('click', e=>{
    openMenu(e.currentTarget, [
      {label:'Pillar', fn:addPillar},
      {label:'Interior wall', fn:()=>{ wallDrawState?cancelWallDraw():startWallDraw(); }},
    ]);
  });
  $('btnAddOpening').addEventListener('click', e=>{
    const wi = roomSel&&roomSel.kind==='wall' ? roomSel.i : 0;
    openMenu(e.currentTarget, [
      {label:'Door…', fn:()=>openingDialog(null,'door',wi)},
      {label:'Window…', fn:()=>openingDialog(null,'window',wi)},
    ]);
  });
  $('wallList').addEventListener('click', e=>{
    const li=e.target.closest('li[data-i]'); if(!li) return;
    if(!roomMode()) setMode('room');
    setRoomSel({kind:'wall', i:+li.dataset.i});
    renderWalls(); renderRoomSel(); draw();
  });
  $('wallList').addEventListener('dblclick', e=>{
    const li=e.target.closest('li[data-i]'); if(li) wallDialog(+li.dataset.i);
  });

  $('openList').addEventListener('click', e=>{
    const li=e.target.closest('li[data-id]'); if(!li) return;
    const id=li.dataset.id, btn=e.target.closest('button');
    if(btn&&btn.dataset.act==='more'){
      const o=openOf(id);
      return openMenu(btn, [
        {label:'Edit…', fn:()=>openingDialog(id)},
        {sep:true},
        {label:'Delete', danger:true, fn:()=>deleteOpening(id)},
      ], o?KIND(o):'');
    }
    if(!roomMode()) setMode('room');
    setRoomSel({kind:'opening', id});
    renderRoomSel(); renderOpen(); draw();
  });

  $('tagChips').addEventListener('click', e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.clear){ S.tagFilter=[]; S.untaggedOnly=false; }
    else if(b.dataset.untagged){ S.untaggedOnly=!S.untaggedOnly; }
    else {
      const t=b.dataset.t;
      S.tagFilter = S.tagFilter.includes(t) ? S.tagFilter.filter(x=>x!==t) : [...S.tagFilter,t];
    }
    renderTagChips(); renderInv(); save();
  });
  $('onlyAvail').addEventListener('change', e=>{ S.onlyAvailable=e.target.checked; renderInv(); save(); });
  $('invSearch').addEventListener('input', e=>{ S.invSearch=e.target.value; renderInv(); save(); });

  invBox.addEventListener('click', e=>{
    const li=e.target.closest('li[data-id]'); if(!li) return;
    const id=li.dataset.id, btn=e.target.closest('button');
    if(btn && btn.dataset.act==='more'){ cancelSingleClick(); return itemMenu(id, btn); }
    if(btn && btn.dataset.act==='place'){ cancelSingleClick(); return placeItem(id); }
    if(!btn) singleClick(()=>placeItem(id));   // held back in case it becomes a rename
  });
  invBox.addEventListener('dblclick', e=>{
    cancelSingleClick();
    if(e.target.closest('button')) return;
    const li=e.target.closest('li[data-id]'); if(!li) return;
    renameItem(li.dataset.id);
  });

  /* ---- drag a thing up or down to reorder your list ---- */
  invBox.addEventListener('dragstart', e=>{
    const li=e.target.closest('li[data-id]'); if(!li) return;
    cancelSingleClick(); closeMenu();
    setDragInv(li.dataset.id);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',dragInv); }catch(err){}
  });
  invBox.addEventListener('dragend', ()=>{
    setDragInv(null);
    clearDropMarks(invBox);
    for(const li of invBox.querySelectorAll('.dragging')) li.classList.remove('dragging');
  });
  invBox.addEventListener('dragover', e=>{
    if(!dragInv) return;
    const li=e.target.closest('li[data-id]');
    if(!li || li.dataset.id===dragInv) return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    clearDropMarks(invBox);
    li.classList.add(dropHalf(e,li)<0.5?'drop-before':'drop-after');
  });
  invBox.addEventListener('dragleave', e=>{ if(e.target===invBox) clearDropMarks(invBox); });
  invBox.addEventListener('drop', e=>{
    const li=e.target.closest('li[data-id]');
    const after = li && li.classList.contains('drop-after');
    clearDropMarks(invBox);
    if(!dragInv || !li || li.dataset.id===dragInv) return;
    e.preventDefault();
    moveBefore(S.inventory, dragInv, li.dataset.id, after);
    setDragInv(null);
    renderInv(); save();
  });

  $('btnAddItem').addEventListener('click',()=>itemDialog(null));
  $('btnAddItem2').addEventListener('click',()=>itemDialog(null));

  /* ------------------------- samples / io ------------------------- */
  $('btnSamples').addEventListener('click', ()=>{
    const add=(name,shape,extra)=>S.inventory.push(Object.assign({id:uid(),name,color:PALETTE[S.inventory.length%PALETTE.length],shape,passThrough:false},extra||{}));
    add('Queen bed',{type:'rect',w:1530,d:2030});
    add('Sofa',{type:'rect',w:2130,d:910});
    add('Round table',{type:'ellipse',w:1070,d:1070});
    add('Desk',{type:'rect',w:1220,d:610});
    add('Corner desk',{type:'lshape',w:1520,d:1520,cw:900,cd:900,corner:'se'});
    add('Dresser',{type:'rect',w:1220,d:460},{open:{top:0,bottom:520,left:0,right:0}});
    add('Extending table',{type:'rect',w:1520,d:900},{open:{top:0,bottom:0,left:0,right:460}});
    add('Rug 5×8',{type:'rect',w:1520,d:2440},{passThrough:true});
    renderInv(); save();
  });
}

export {bindPaneLeft};
