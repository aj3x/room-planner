// @ts-check
/* The Furniture pane's Items section and the Stock section, as components.

   Items: the head's + (a new item), the search box and the filter chips,
   the list, and the empty state with its two ways out. It reads the
   library, the settings (search, chips, the scope a count is shared
   across), the project and which items stand in this room while it
   renders, and re-renders on its own (ui-kit/component.js); the commands
   it runs are item-list.js's.

   A row's click places the item, held back a moment (singleClick) so that a
   second click can make it a double-click, which renames it in place. Rows
   drag to reorder the library: the row being dragged and where it would
   land are this component's own state, so the drop marks are rendered like
   everything else. */
import {useRef, useState} from 'preact/hooks';
import {L, S, itemOf} from '../../kernel/state.js';
import {computed, loaded, pref, rev} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {hasOpen, openSizeLabel} from '../../kernel/model/open-state.js';
import {INV_SCOPES, availableCount} from '../../kernel/model/floor-space.js';
import {dropHalf, moveBefore} from '../../ui-kit/dnd.js';
import {cancelSingleClick, singleClick} from '../../ui-kit/inline-edit.js';
import {closeMenu} from '../../ui-kit/menu.js';
import {ActButton, EmptyRow, Icon, MoreButton, RenameField, SecHead} from '../../ui-kit/parts.jsx';
import {itemDialog, sizeLabel} from '../library/index.js';
import {allTags, itemMatchesFilter, itemMenu, loadSamples, placeItem, renameItem, renamingItem} from './item-list.js';

/** @typedef {import('../../kernel/types.js').Item} Item */

/* The list repaints on library edits and filter changes, and on furniture
   edits only when the set of things placed in this room changed: dragging a
   chair about moves no count, and is no reason to re-render every row. */
const placedKey = computed(() => { rev.furn.value; rev.project.value; return L().placed.map(p=>p.itemId).join(); });

/** @param {() => void} fn */
const prefs = fn => transact('prefs', fn, {canvas:false});

function TagChips(){
  const tags=allTags();
  // the Untagged chip only earns its place when it actually splits the list
  const showUntagged = tags.length && S.inventory.some(it=>!(it.tags||[]).length);
  if(!showUntagged) S.untaggedOnly=false;
  /** @param {string} t */
  const toggle = t => prefs(()=>{ S.tagFilter = S.tagFilter.includes(t) ? S.tagFilter.filter(x=>x!==t) : [...S.tagFilter,t]; });
  return <div class="chips" hidden={!tags.length}>
    {tags.map(t=><button key={t} type="button" aria-pressed={S.tagFilter.includes(t)} onClick={()=>toggle(t)}>{t}</button>)}
    {tags.length && showUntagged ? <button key=":untagged" type="button" class="untagged" aria-pressed={S.untaggedOnly} onClick={()=>prefs(()=>{ S.untaggedOnly=!S.untaggedOnly; })}>Untagged</button> : null}
    {tags.length && (S.tagFilter.length || S.untaggedOnly) ? <button key=":clear" type="button" class="clear" title="Clear the tag filter" onClick={()=>prefs(()=>{ S.tagFilter=[]; S.untaggedOnly=false; })}>Clear</button> : null}
  </div>;
}

/** One row of the list.
    @param {{it: Item, count: number, suffix: string, editing: boolean, dragging: boolean, mark: 'before'|'after'|null,
             drag: {start: (id: string, e: DragEvent) => void, over: (id: string, e: DragEvent) => void, drop: (id: string, e: DragEvent) => void}}} p */
function ItemRow({it, count, suffix, editing, dragging, mark, drag}){
  const avail=availableCount(it), total=it.count==null?1:it.count;
  const meta=[sizeLabel(it)];
  if(total>1||avail<total) meta.push(avail+' of '+total+' free');
  const tip=[sizeLabel(it), avail+' of '+total+' free '+suffix];
  if(hasOpen(it)) tip.push('opens to '+openSizeLabel(it));
  if(it.passThrough) tip.push('others can overlap it');
  if(it.tags&&it.tags.length) tip.push('tags: '+it.tags.join(', '));
  const cls=[avail<=0?'off':'', dragging?'dragging':'', mark?'drop-'+mark:''].filter(Boolean).join(' ');
  /** @param {MouseEvent} e */
  function onClick(e){
    const btn=/** @type {HTMLElement|null} */(/** @type {Element} */(e.target).closest('button'));
    if(btn && btn.dataset.act==='more'){ cancelSingleClick(); itemMenu(it.id, btn); return; }
    if(btn && btn.dataset.act==='place'){ cancelSingleClick(); placeItem(it.id); return; }
    if(!btn) singleClick(()=>placeItem(it.id));   // held back in case it becomes a rename
  }
  /** @param {MouseEvent} e */
  function onDblClick(e){
    cancelSingleClick();
    if(/** @type {Element} */(e.target).closest('button')) return;
    renameItem(it.id);
  }
  /** @param {string|null} v */
  function renamed(v){
    if(renamingItem.value===it.id) renamingItem.value = null;   // not if another row's rename has started since
    const cur=itemOf(it.id);
    if(v && cur) transact('lib', ()=>{ cur.name=v; });
  }
  return <li draggable={!editing} class={cls} title={it.name+'\n'+tip.join('\n')}
    onClick={onClick} onDblClick={onDblClick}
    onDragStart={e=>drag.start(it.id, e)} onDragOver={e=>drag.over(it.id, e)} onDrop={e=>drag.drop(it.id, e)}>
    <span class="sw" style={'background:'+it.color}></span>
    <span class="lmain">{editing ? <RenameField value={it.name} done={renamed}/> : <span class="nm">{it.name}</span>}<span class="meta">{meta.join(' · ')}</span></span>
    {count ? <span class="count" title={count+' in this room'}>{count}</span> : null}
    <span class="lact">
      <button class="btn quiet" data-act="place" disabled={avail<=0} title={avail<=0?'None left to place':'Place in this room'}>Place</button>
      <MoreButton/>
    </span>
  </li>;
}

function ItemsSection(){
  rev.lib.value; rev.prefs.value; rev.project.value; placedKey.value;
  const editing=renamingItem.value;
  /* the row in flight and where it would land; the ref is what the drop
     reads, since a drop can arrive before the last dragover's re-render */
  const [dragId, setDragId] = useState(/** @type {string|null} */(null));
  const [mark, setMark] = useState(/** @type {string|null} */(null));   // 'id:before' | 'id:after'
  const dragRef = useRef(/** @type {string|null} */(null));
  const sc = INV_SCOPES[S.invScope] || INV_SCOPES.project;
  const empty=!S.inventory.length;
  const shown = empty ? [] : S.inventory.filter(itemMatchesFilter);
  /** @type {Record<string, number>} */
  const counts={};
  for(const p of L().placed) counts[p.itemId]=(counts[p.itemId]||0)+1;

  function endDrag(){ dragRef.current=null; setDragId(null); setMark(null); }
  const drag = {
    /** @param {string} id @param {DragEvent} e */
    start(id, e){
      cancelSingleClick(); closeMenu();
      dragRef.current=id; setDragId(id);
      if(!e.dataTransfer) return;
      e.dataTransfer.effectAllowed='move';
      try{ e.dataTransfer.setData('text/plain',id); }catch(err){}
    },
    /** @param {string} id @param {DragEvent} e */
    over(id, e){
      if(!dragRef.current || id===dragRef.current) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect='move';
      setMark(id+(dropHalf(e, /** @type {Element} */(e.currentTarget))<0.5?':before':':after'));
    },
    /** @param {string} id @param {DragEvent} e */
    drop(id, e){
      const d=dragRef.current;
      setMark(null);
      if(!d || id===d) return;
      e.preventDefault();
      const after=dropHalf(e, /** @type {Element} */(e.currentTarget))>=0.5;
      transact('lib', ()=>moveBefore(S.inventory, d, id, after));
      endDrag();
    },
  };

  const head=<SecHead title="Items"><ActButton icon="plus" label="New item" onClick={()=>itemDialog(null)}/></SecHead>;
  if(!loaded.value) return head;
  return <>
    {head}
    <div class="search" hidden={empty}><Icon name="search"/><input type="text" placeholder="Search items" aria-label="Search items"
      value={S.invSearch||''} onInput={e=>{ const v=e.currentTarget.value; prefs(()=>{ S.invSearch=v; }); }}/></div>
    <div class="filters" hidden={empty}>
      <label class="chip-toggle" title="Hide items you've already placed every one of"><input type="checkbox" checked={S.onlyAvailable}
        onChange={e=>{ const v=e.currentTarget.checked; prefs(()=>{ S.onlyAvailable=v; }); }}/>In stock</label>
      <TagChips/>
    </div>
    <ul class="list" onDragEnd={endDrag}
      onDragLeave={e=>{ if(e.target===e.currentTarget) setMark(null); }}
      onDrop={()=>setMark(null)}>
      {!empty && !shown.length ? <EmptyRow>Nothing matches this filter.</EmptyRow> : shown.map(it=>{
        const m=mark && mark.slice(0, mark.lastIndexOf(':'))===it.id ? /** @type {'before'|'after'} */(mark.slice(mark.lastIndexOf(':')+1)) : null;
        return <ItemRow key={it.id} it={it} count={counts[it.id]||0} suffix={sc.suffix} editing={editing===it.id}
          dragging={dragId===it.id} mark={m} drag={drag}/>;
      })}
    </ul>
    <div class="empty" hidden={!empty}>
      No items yet. Add your own, or start with a few common pieces.
      <div class="row"><button class="btn sm" onClick={loadSamples}>Load samples</button><button class="btn sm primary" onClick={()=>itemDialog(null)}>Add item</button></div>
    </div>
  </>;
}

/* Which rooms an item's count is shared across. */
function StockSection(){
  const scope=loaded.value ? pref('invScope') : 'project';
  const sc = INV_SCOPES[scope] || INV_SCOPES.project;
  return <>
    <SecHead title="Stock"/>
    <div class="field"><label for="invScope">Count</label>
      <select id="invScope" value={scope} onChange={e=>{ const v=/** @type {import('../../kernel/types.js').InvScope} */(e.currentTarget.value); prefs(()=>{ S.invScope=v; }); }}>
        <option value="project">Across all rooms</option>
        <option value="folder">Within each folder</option>
        <option value="room">Per room</option>
      </select>
    </div>
    <p class="hint">{loaded.value ? sc.hint : ''}</p>
  </>;
}

export {ItemsSection, StockSection};
