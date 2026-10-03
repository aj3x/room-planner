/* The Furniture pane's inventory list: the tag-filter chips, the list itself,
   the two filter helpers behind them, and what a row's menu does.

   The list is an effect (mountItemList, at the end): the commands commit
   through transact() and the list, the Selection panel and the canvas follow.

   invBox is a top-level DOM read, the same call ui/modal.js makes for `mo`.
*/
import {esc} from '../ui/panels.js';
import {moreBtn} from '../ui/menu.js';
import {$} from '../ui/modal.js';
import {S, L} from '../core/state.js';
import {hasOpen, openSizeLabel} from '../core/open-state.js';
import {INV_SCOPES, availableCount} from '../core/floor-space.js';
import {sizeLabel} from '../model/items.js';
import {emptyRow} from './room-panel.js';

import {uniqueId} from '../core/ids.js';
import {selectClear} from '../core/selection.js';
import {clone, itemOf} from '../core/state.js';
import {transact} from '../core/tx.js';
import {flash} from '../ui/flash.js';
import {inlineEdit} from '../ui/inline-edit.js';
import {openMenu} from '../ui/menu.js';
import {askConfirm} from '../ui/modal.js';
import {itemDialog} from './item-dialog.js';
import {place} from './selection-panel.js';
import {computed, rev} from '../core/signals.js';
import {mountPanel} from '../ui/mount.js';
function allTags(){
  const s=new Set();
  for(const it of S.inventory) for(const t of (it.tags||[])) s.add(t);
  for(const f of S.itemFolders) for(const t of (f.tags||[])) s.add(t);
  return [...s].sort((a,b)=>a.localeCompare(b));
}
function itemMatchesFilter(it){
  if(S.onlyAvailable && availableCount(it)<=0) return false;
  const tags=it.tags||[];
  if(S.tagFilter.length || S.untaggedOnly){
    // the chips read as "any of these": a tag chip, or the Untagged chip
    if(!(tags.some(t=>S.tagFilter.includes(t)) || (S.untaggedOnly && !tags.length))) return false;
  }
  const q=(S.invSearch||'').trim().toLowerCase();
  if(q){
    const hay=[it.name, ...(it.tags||[])].join(' ').toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}

function renderTagChips(){
  const tags=allTags(), box=$('tagChips');
  // the Untagged chip only earns its place when it actually splits the list
  const showUntagged = tags.length && S.inventory.some(it=>!(it.tags||[]).length);
  if(!showUntagged) S.untaggedOnly=false;
  if(!tags.length){ box.innerHTML=''; box.hidden=true; return; }
  box.hidden=false;
  let html = tags.map(t=>`<button type="button" data-t="${esc(t)}" aria-pressed="${S.tagFilter.includes(t)}">${esc(t)}</button>`).join('');
  if(showUntagged) html += `<button type="button" class="untagged" data-untagged="1" aria-pressed="${S.untaggedOnly}">Untagged</button>`;
  if(S.tagFilter.length || S.untaggedOnly) html += `<button type="button" class="clear" data-clear="1" title="Clear the tag filter">Clear</button>`;
  box.innerHTML=html;
}

function renderInv(){
  $('onlyAvail').checked = S.onlyAvailable;
  if($('invSearch').value !== (S.invSearch||'')) $('invSearch').value = S.invSearch||'';
  const sc = INV_SCOPES[S.invScope] || INV_SCOPES.project;
  $('invScope').value = S.invScope;
  $('invScopeHint').textContent = sc.hint;
  renderTagChips();
  const ul=$('invList'), empty=!S.inventory.length;
  $('invEmpty').hidden=!empty;
  $('invSearch').closest('.search').hidden=empty;
  $('onlyAvail').closest('.filters').hidden=empty;
  if(empty){ ul.innerHTML=''; return; }
  const shown = S.inventory.filter(itemMatchesFilter);
  if(!shown.length){ ul.innerHTML=emptyRow('Nothing matches this filter.'); return; }
  const counts={};
  for(const p of L().placed) counts[p.itemId]=(counts[p.itemId]||0)+1;
  ul.innerHTML=shown.map(i=>{
    const avail=availableCount(i), total=i.count==null?1:i.count;
    const meta=[sizeLabel(i)];
    if(total>1||avail<total) meta.push(avail+' of '+total+' free');
    const tip=[sizeLabel(i), avail+' of '+total+' free '+sc.suffix];
    if(hasOpen(i)) tip.push('opens to '+openSizeLabel(i));
    if(i.passThrough) tip.push('others can overlap it');
    if(i.tags&&i.tags.length) tip.push('tags: '+i.tags.join(', '));
    return `<li data-id="${i.id}" draggable="true" class="${avail<=0?'off':''}" title="${esc(i.name+'\n'+tip.join('\n'))}">
      <span class="sw" style="background:${i.color}"></span>
      <span class="lmain"><span class="nm">${esc(i.name)}</span><span class="meta">${esc(meta.join(' \u00b7 '))}</span></span>
      ${counts[i.id]?`<span class="count" title="${counts[i.id]} in this room">${counts[i.id]}</span>`:''}
      <span class="lact">
        <button class="btn quiet" data-act="place" ${avail<=0?'disabled':''} title="${avail<=0?'None left to place':'Place in this room'}">Place</button>
        ${moreBtn('')}
      </span></li>`;
  }).join('');
}

const invBox=$('invList');


/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function placeItem(id){
  const it=itemOf(id); if(!it) return;
  if(availableCount(it)<=0){ flash("None left to place \u2014 edit the item to own more"); return; }
  place(id);
}
function renameItem(id){
  const it=itemOf(id), li=invBox.querySelector('li[data-id="'+id+'"]');
  if(!it||!li) return;
  inlineEdit(li.querySelector('.nm'), it.name, v=>{ if(v) transact('lib', ()=>{ it.name=v; }); });
}
function itemMenu(id, anchor){
  const it=itemOf(id); if(!it) return;
  openMenu(anchor, [
    {label:'Place in this room', fn:()=>placeItem(id)},
    {label:'Rename', fn:()=>renameItem(id)},
    {label:'Edit\u2026', fn:()=>itemDialog(id)},
    {label:'Duplicate', fn:()=>{
      const c=clone(it);
      // keep the copy in the same id folder as the original: ikea/kallax/4x2 → ikea/kallax/4x2-copy
      c.id=uniqueId(it.id+'-copy', new Set(S.inventory.map(x=>x.id)));
      c.name=it.name+' copy';
      transact('lib', ()=>{ S.inventory.splice(S.inventory.indexOf(it)+1, 0, c); });
    }},
    {sep:true},
    {label:'Delete\u2026', danger:true, fn:()=>deleteItem(id)},
  ], it.name);
}
function deleteItem(id){
  const n=S.layouts.reduce((a,l)=>a+l.placed.filter(p=>p.itemId===id).length,0);
  /* The placements go too, in every room, and none of that is a furniture undo
     step: undo cannot bring back an item the library no longer has. */
  const kill=()=>{
    transact('lib', ()=>{
      S.inventory=S.inventory.filter(i=>i.id!==id);
      for(const l of S.layouts) l.placed=l.placed.filter(p=>p.itemId!==id);
      selectClear();
    });
  };
  if(n) askConfirm('Delete this item?', 'It is placed in '+n+' spot'+(n>1?'s':'')+'. Those will be removed too.', 'Delete', kill);
  else kill();
}
let dragInv=null;
function setDragInv(v){ dragInv=v; }

/* The list repaints on library edits and filter changes, and on furniture
   edits only when the set of things placed in this room changed: dragging a
   chair about moves no count, and is no reason to rebuild every row. */
const placedKey = computed(() => { rev.furn.value; rev.project.value; return L().placed.map(p=>p.itemId).join(); });
function mountItemList(){
  mountPanel('invList', () => { rev.lib.value; rev.prefs.value; rev.project.value; placedKey.value; }, renderInv);
}
export {mountItemList, allTags, itemMatchesFilter, renderTagChips, renderInv, invBox, placeItem, renameItem, itemMenu, deleteItem, dragInv, setDragInv};
