// @ts-check
/* What the Furniture pane's item list (items-list.jsx) runs: the two filter
   helpers behind its search and chips, placing, renaming, a row's menu,
   deleting, and the samples. The commands commit through transact(); the
   list, the Selection panel and the canvas follow on their own. */
import {PALETTE, S, clone, itemOf, uid} from '../../kernel/state.js';
import {availableCount} from '../../kernel/model/floor-space.js';
import {uniqueId} from '../../kernel/ids.js';
import {selectClear} from '../../kernel/selection.js';
import {signal} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {flash} from '../../ui-kit/flash.js';
import {openMenu} from '../../ui-kit/menu.js';
import {askConfirm} from '../../ui-kit/modal.js';
import {itemDialog} from '../library/index.js';
import {place} from './selection-panel.js';

function allTags(){
  const s=new Set();
  for(const it of S.inventory) for(const t of (it.tags||[])) s.add(t);
  for(const f of S.itemFolders) for(const t of (f.tags||[])) s.add(t);
  return [...s].sort((a,b)=>a.localeCompare(b));
}
/** @param {import('../../kernel/types.js').Item} it */
function itemMatchesFilter(it){
  if(S.onlyAvailable && availableCount(it)<=0) return false;
  const tags=it.tags||[];
  if(S.tagFilter.length || S.untaggedOnly){
    // the chips read as "any of these": a tag chip, or the Untagged chip
    if(!(tags.some((/** @type {string} */t)=>S.tagFilter.includes(t)) || (S.untaggedOnly && !tags.length))) return false;
  }
  const q=(S.invSearch||'').trim().toLowerCase();
  if(q){
    const hay=[it.name, ...(it.tags||[])].join(' ').toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}

/** @param {string} id */
function placeItem(id){
  const it=itemOf(id); if(!it) return;
  if(availableCount(it)<=0){ flash("None left to place \u2014 edit the item to own more"); return; }
  place(id);
}
/** The item whose name is being typed over in the list, if any (items-list.jsx).
    @type {import('@preact/signals-core').Signal<string|null>} */
const renamingItem = signal(null);
/** @param {string} id */
function renameItem(id){
  if(itemOf(id)) renamingItem.value = id;
}
/** @param {string} id @param {Element} anchor */
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
/** @param {string} id */
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
/* The samples behind the empty list's "Load samples". */
function loadSamples(){
  /** @param {string} name @param {import('../../kernel/types.js').Shape} shape @param {Partial<import('../../kernel/types.js').Item>} [extra] */
  function add(name,shape,extra){ S.inventory.push(/** @type {import('../../kernel/types.js').Item} */(Object.assign({id:uid(),name,color:PALETTE[S.inventory.length%PALETTE.length],shape,passThrough:false},extra||{}))); }   // a whole Item: the base fields, then the extras
  transact('lib', ()=>{
    add('Queen bed',{type:'rect',w:1530,d:2030});
    add('Sofa',{type:'rect',w:2130,d:910});
    add('Round table',{type:'ellipse',w:1070,d:1070});
    add('Desk',{type:'rect',w:1220,d:610});
    add('Corner desk',{type:'lshape',w:1520,d:1520,cw:900,cd:900,corner:'se'});
    add('Dresser',{type:'rect',w:1220,d:460},{open:{top:0,bottom:520,left:0,right:0}});
    add('Extending table',{type:'rect',w:1520,d:900},{open:{top:0,bottom:0,left:0,right:460}});
    add('Rug 5×8',{type:'rect',w:1520,d:2440},{passThrough:true});
  });
}

export {allTags, itemMatchesFilter, placeItem, renamingItem, renameItem, itemMenu, deleteItem, loadSamples};
