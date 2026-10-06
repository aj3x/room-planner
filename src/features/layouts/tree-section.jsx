// @ts-check
/* The Plan pane's Rooms section, as a component: the head (more, import a
   blueprint, new room) and the tree of floors, folders and rooms. It reads
   the project, the mode, what is marked for a merge, what is expanded and
   what is being renamed while it renders, and re-renders on its own
   (ui-kit/component.js); the commands it runs are layout-tree.js's.

   The tree is a flat run of rows, indented by depth (a floor's rooms under
   it, a folder's contents under it when open), each keyed by its id.

   A row's click is held back a moment (singleClick) so that a second click
   can make it a double-click, which renames it in place; the ⋯ and the
   caret act at once. Shift-click marks a room for merging, right-click on a
   room splits it (or merges the two marked). Dragging a room or folder
   moves it: onto a folder puts it inside, onto a floor stands a room on it,
   the upper or lower edge of a row drops it beside that row. Which row is in
   flight and where it would land are this component's own state, so the
   drop marks are rendered like everything else; layout-tree.js's
   treeDropSpot says where a drop lands. */
import {useState} from 'preact/hooks';
import {S, blankLayout, childFloors, childFolders, childLayouts, floorLayouts, floorMode, folderOf} from '../../kernel/state.js';
import {mergeClear, mergeOnly, mergeSel, mergeToggle, treeExpand, treeOpen, treeToggle} from '../../kernel/selection.js';
import {curFloorId} from '../../kernel/history.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {moveBefore} from '../../ui-kit/dnd.js';
import {flash} from '../../ui-kit/flash.js';
import {cancelSingleClick, singleClick} from '../../ui-kit/inline-edit.js';
import {closeMenu, menuAtPoint, openMenu} from '../../ui-kit/menu.js';
import {askText} from '../../ui-kit/modal.jsx';
import {mountComponent} from '../../ui-kit/component.js';
import {ActButton, Icon, MoreButton, RenameField, SecHead} from '../../ui-kit/parts.jsx';
import {fit} from '../canvas/index.js';
import {activateLayout, setMode} from '../mode/index.js';
import {startSplitRoom} from '../room/index.js';
import {newFloor, openFloorMergeMenu, putOnFloor} from '../floors/index.js';
import {bpUploadDialog} from '../blueprint/index.js';
import {dragTree, enterFloor, floorMenu, folderDescendant, folderMenu, layoutMenu, newFolder,
        renameFloor, renameFolder, renameLayout, renamed, setDragTree, treeDropSpot, treeRenaming} from './layout-tree.js';

/** @typedef {import('../../kernel/types.js').Folder} Folder */
/** @typedef {import('../../kernel/types.js').Floor} Floor */
/** @typedef {import('../../kernel/types.js').Layout} Layout */
/** One row of the flattened tree.
    @typedef {{type: 'floor', fl: Floor, depth: number}
            | {type: 'folder', f: Folder, depth: number}
            | {type: 'layout', l: Layout, depth: number}
            | {type: 'empty', key: string, pad: number, text: string}} Row */

/* a floor holds its rooms directly: a room standing on one shows up here, not
   back under its folder, so it is only ever in the tree once */
/** @param {string|null} parentId @param {number} depth @param {Row[]} out */
function treeRows(parentId, depth, out){
  if(!parentId) for(const fl of childFloors(null)){
    out.push({type:'floor', fl, depth});
    if(treeOpen.value.has(fl.id)){
      const rooms=floorLayouts(fl.id);
      for(const l of rooms) out.push({type:'layout', l, depth:depth+1});
      if(!rooms.length) out.push({type:'empty', key:'empty:'+fl.id, pad:(depth+1)*12+26, text:'No rooms yet'});
    }
  }
  for(const f of childFolders(parentId)){
    out.push({type:'folder', f, depth});
    if(treeOpen.value.has(f.id)) treeRows(f.id, depth+1, out);
  }
  const loose=childLayouts(parentId).filter(l=>!l.floorId);
  for(const l of loose) out.push({type:'layout', l, depth});
  if(depth>0 && !childFolders(parentId).length && !loose.length)
    out.push({type:'empty', key:'empty:'+parentId, pad:depth*12+26, text:'Empty'});
  return out;
}

/** @param {{name: string, editing: boolean, done: (v: string|null) => void}} p */
function Name({name, editing, done}){
  return editing ? <RenameField value={name} done={done}/> : <span class="nm">{name}</span>;
}

/** @param {{open: boolean}} p */
function Caret({open}){
  return <button type="button" class="caret" data-act="toggle" aria-label={open?'Collapse':'Expand'}><Icon name={open?'chev-d':'chev-r'}/></button>;
}

/** @param {MouseEvent} e */
const target = e => /** @type {Element} */(e.target);

/* ---- what a row does when clicked ---- */
/** @param {'floor'|'folder'|'layout'} kind @param {string} id @param {MouseEvent} e */
function rowClick(kind, id, e){
  const more=target(e).closest('[data-act=more]');
  if(more){
    cancelSingleClick();
    if(kind==='floor') floorMenu(id, more); else if(kind==='folder') folderMenu(id, more); else layoutMenu(id, more);
    return;
  }
  if(target(e).closest('[data-act=toggle]')){ cancelSingleClick(); treeToggle(id); return; }
  // held back briefly so a second click can turn into a rename instead
  if(kind==='floor'){ singleClick(()=>{ enterFloor(id); }); return; }
  if(kind==='folder'){ singleClick(()=>treeToggle(id)); return; }
  if(e.shiftKey){ cancelSingleClick(); mergeToggle(id); return; }
  mergeClear();
  singleClick(()=>{ transact('project', ()=>{ activateLayout(id); setMode('room'); }); fit(); });
}
/** @param {'floor'|'folder'|'layout'} kind @param {string} id @param {MouseEvent} e */
function rowDblClick(kind, id, e){
  cancelSingleClick();
  if(target(e).closest('button')) return;
  if(kind==='floor') renameFloor(id); else if(kind==='folder') renameFolder(id); else renameLayout(id);
}
/** @param {string} id @param {MouseEvent} e */
function roomContextMenu(id, e){
  e.preventDefault();
  if(!mergeSel.value.has(id)) mergeOnly(id);
  if(mergeSel.value.size!==2){
    menuAtPoint(e.clientX, e.clientY, [{label:'Split room…', fn:()=>startSplitRoom(id)}]);
    return;
  }
  const ids=[...mergeSel.value];
  const l0=S.layouts.find(x=>x.id===ids[0]), l1=S.layouts.find(x=>x.id===ids[1]);
  if(!l0||!l1||!l0.floorId||l0.floorId!==l1.floorId){
    flash('Select two rooms on the same floor to merge them');
    mergeClear();
    return;
  }
  openFloorMergeMenu(ids, e.clientX, e.clientY);
}

/* ---- the head's three buttons ---- */
/** @param {MouseEvent} e */
function roomsMenu(e){
  openMenu(/** @type {Element} */(e.currentTarget), [
    {label:'New folder', fn:newFolder},
    {label:'New floor', fn:newFloor}
  ], 'Rooms');
}
function newRoom(){
  askText('New room','Name','Room '+(S.layouts.length+1), n=>{
    transact('project', ()=>{ const l=blankLayout(n,null); S.layouts.push(l); activateLayout(l.id); });
    fit();
  });
}

/* ---- dropping a dragged row ---- */
/** @param {DragEvent} e */
function drop(e){
  const spot=treeDropSpot(e), d=dragTree;
  if(!spot||!d) return;
  e.preventDefault();
  if(spot.mode==='onto-floor'){
    const l=S.layouts.find(x=>x.id===d.id);
    setDragTree(null);
    if(l && l.floorId!==spot.id) putOnFloor(l, spot.id);
    return;
  }
  /** @type {string|null} */
  let parent=null, targetId=null, after=false;
  if(spot.mode==='into'){ parent=spot.id; treeExpand(parent); }
  else if(spot.mode!=='root'){
    const t = /** @type {Partial<Folder & Layout>|null|undefined} */(spot.isFolder ? folderOf(spot.id) : S.layouts.find(x=>x.id===spot.id));   // a Folder when isFolder, else a Layout
    if(!t) return;
    parent = (spot.isFolder ? t.parentId : t.folderId) || null;
    // folders and rooms are kept in separate lists, so only order against your own kind
    if(spot.isFolder === (d.kind==='folder')){ targetId=spot.id; after=(spot.mode==='after'); }
  }
  const f = d.kind==='folder' ? folderOf(d.id) : null, l = d.kind==='folder' ? null : S.layouts.find(x=>x.id===d.id);
  if(!f && !l) return;
  if(f && (parent===d.id || folderDescendant(d.id,parent))){ flash("A folder can't go inside itself"); return; }
  transact('project', ()=>{
    if(f){
      f.parentId=parent;
      moveBefore(S.folders, d.id, targetId, after);
    } else if(l){
      l.folderId=parent;
      l.floorId=null;   // dragged back into the tree proper, so off the floor it comes
      moveBefore(S.layouts, d.id, targetId, after);
    }
  });
  setDragTree(null);
}

function RoomsSection(){
  rev.project.value; pref('mode');
  const marked=mergeSel.value, editing=treeRenaming.value;
  const [dragging, setDragging] = useState(/** @type {string|null} */(null));
  const [mark, setMark] = useState(/** @type {string|null} */(null));   // 'root', or 'id drop-into|drop-before|drop-after'
  const markOn = /** @param {string} id */ id => mark && mark.startsWith(id+' ') ? mark.slice(id.length+1) : '';
  const rows=loaded.value ? treeRows(null, 0, []) : [];

  /** @param {DragEvent} e */
  function dragStart(e){
    const row=/** @type {HTMLElement|null} */(target(e).closest('.tree-row')); if(!row) return;
    cancelSingleClick(); closeMenu();
    if(row.dataset.floor) return;   // floors don't reorder; rooms are dragged onto them
    const d = row.dataset.folder ? {kind:/** @type {const} */('folder'), id:row.dataset.folder} : {kind:/** @type {const} */('layout'), id:/** @type {string} */(row.dataset.layout)};
    setDragTree(d); setDragging(d.id);
    if(!e.dataTransfer) return;
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',d.id); }catch(err){}
  }
  function dragEnd(){ setDragTree(null); setMark(null); setDragging(null); }
  /** @param {DragEvent} e */
  function dragOver(e){
    const spot=treeDropSpot(e); if(!spot) return;
    e.preventDefault();
    if(e.dataTransfer) e.dataTransfer.dropEffect='move';
    setMark(spot.mode==='root' ? 'root' : spot.id+' '+(spot.mode==='into'||spot.mode==='onto-floor'?'drop-into':spot.mode==='before'?'drop-before':'drop-after'));
  }

  /** @param {Row} r */
  function row(r){
    if(r.type==='empty') return <div key={r.key} class="tree-empty" style={'padding-left:'+r.pad+'px'}>{r.text}</div>;
    if(r.type==='floor'){
      const {fl, depth}=r, open=treeOpen.value.has(fl.id), rooms=floorLayouts(fl.id);
      const active=floorMode() && curFloorId()===fl.id;
      return <div key={fl.id} class={cls('tree-row floor-row', active&&'active', markOn(fl.id))} data-floor={fl.id} style={'padding-left:'+(depth*12+4)+'px'}
        aria-expanded={open} aria-current={active?'true':undefined}
        onClick={e=>rowClick('floor', fl.id, e)} onDblClick={e=>rowDblClick('floor', fl.id, e)}>
        <Caret open={open}/>
        <span class="ico"><Icon name="floor"/></span><Name name={fl.name} editing={editing===fl.id} done={v=>renamed('floor', fl.id, v)}/>
        <span class="tagchip">{rooms.length} room{rooms.length===1?'':'s'}</span>
        <MoreButton cls="tree-more"/>
      </div>;
    }
    if(r.type==='folder'){
      const {f, depth}=r, open=treeOpen.value.has(f.id), tags=f.tags||[];
      return <div key={f.id} class={cls('tree-row folder-row', dragging===f.id&&'dragging', markOn(f.id))} draggable={editing!==f.id} data-folder={f.id} style={'padding-left:'+(depth*12+4)+'px'}
        aria-expanded={open}
        onClick={e=>rowClick('folder', f.id, e)} onDblClick={e=>rowDblClick('folder', f.id, e)}>
        <Caret open={open}/>
        <span class="ico"><Icon name="folder"/></span><Name name={f.name} editing={editing===f.id} done={v=>renamed('folder', f.id, v)}/>
        {tags.length ? <span class="tagchip" title={'Tag filter: '+tags.join(', ')}>{tags[0]}{tags.length>1?' +'+(tags.length-1):''}</span> : null}
        <MoreButton cls="tree-more"/>
      </div>;
    }
    const {l, depth}=r, active=l.id===S.active;
    return <div key={l.id} class={cls('tree-row layout-row', active&&'active', marked.size>=2 && marked.has(l.id) && 'merge-sel', dragging===l.id&&'dragging', markOn(l.id))}
      draggable={editing!==l.id} data-layout={l.id} style={'padding-left:'+(depth*12+26)+'px'} aria-current={active?'true':undefined}
      onClick={e=>rowClick('layout', l.id, e)} onDblClick={e=>rowDblClick('layout', l.id, e)} onContextMenu={e=>roomContextMenu(l.id, e)}>
      <span class="ico"><Icon name="room"/></span><Name name={l.name} editing={editing===l.id} done={v=>renamed('layout', l.id, v)}/>
      <MoreButton cls="tree-more"/>
    </div>;
  }

  return <>
    <SecHead title="Rooms">
      <ActButton icon="more" label="More actions" onClick={roomsMenu}/>
      <ActButton icon="photo" label="Import a blueprint" onClick={()=>bpUploadDialog()}/>
      <ActButton icon="plus" label="New room" onClick={newRoom}/>
    </SecHead>
    <div class={cls('layout-tree', mark==='root'&&'drop-root')}
      onDragStart={dragStart} onDragEnd={dragEnd} onDragOver={dragOver}
      onDragLeave={e=>{ if(e.target===e.currentTarget) setMark(null); }}
      onDrop={e=>{ setMark(null); drop(e); }}>
      {rows.map(row)}
    </div>
  </>;
}

/** @param {...(string|false|null|undefined)} parts */
function cls(...parts){ return parts.filter(Boolean).join(' '); }

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  layout(el){ mountComponent(el, <RoomsSection/>); },
};

export {sections};
