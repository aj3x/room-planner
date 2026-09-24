/* The Furniture pane's inventory list: the tag-filter chips, the list itself,
   and the two filter helpers behind them.

   Extracted from index.html in Phase 3, move-only: the four chunks below are
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   allTags and itemMatchesFilter were declared near the top of the monolith,
   two hundred lines above the rest, but renderTagChips and renderInv are their
   only readers, so they came here and are module-private now.

   What acts on a row did not come: placeItem, renameItem, itemMenu, deleteItem
   and the drag-to-reorder listeners all reach itemDialog or renderSel, and
   both are in the reference cycle between the Plan side panels and the Library
   UI (see .claude/plans/refactor-split.md, the plan/ round).

   invBox is a top-level DOM read, the same call ui/modal.js makes for `mo`.
*/
import {esc} from '../ui/panels.js';
import {moreBtn} from '../ui/menu.js';
import {$} from '../ui/modal.js';
import {S, L} from '../core/state.js';
import {hasOpen, openSizeLabel} from '../core/open-state.js';
import {INV_SCOPES, availableCount} from '../core/floor-space.js';
import {sizeLabel} from '../canvas/draw.js';
import {emptyRow} from './room-panel.js';

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

export {allTags, itemMatchesFilter, renderTagChips, renderInv, invBox};
