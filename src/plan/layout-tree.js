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
import {S, floorMode, floorLayouts, childFloors, childFolders, childLayouts} from '../core/state.js';
import {mergeSel, treeOpen} from '../core/selection.js';
import {curFloorId} from '../core/history.js';

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

export {folderLabel, layoutRowHTML, floorRowHTML, renderTreeLevel, renderTree,
        treeBox, treeRowEl};
