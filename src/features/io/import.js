// @ts-check
/* Import: read a file back without assuming it is a whole project, then
   either replace the project or merge into it. The dialog that picks what
   comes in is import-dialog.jsx.

   One transact('project') covers either path, so every panel, the Library
   and the canvas repaint from the new state as effects; this module names
   none of them.
*/
import {fit} from '../canvas/index.js';
import {INV_SCOPES} from '../../kernel/model/floor-space.js';
import {furnHist, roomHist, seedHistFor} from '../../kernel/history.js';
import {uniqueId} from '../../kernel/ids.js';
import {migrate, normItem, normLayout, remapMeasures} from '../../kernel/migrate.js';
import {roomSel, sel} from '../../kernel/selection.js';
import {S, clone, floorLayouts, setS, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {ensureDefaultMarket} from '../marketplace/index.js';
import {flash} from '../../ui-kit/flash.js';
import {plural} from '../../ui-kit/panels.js';
import {PREF_KEYS} from './export.js';
import {ancestorFolderIds} from './pickers.js';
/* ------------------------- import ------------------------- */
/* pull the parts out of a file without assuming it is a whole project — a things-only
   or rooms-only export is a perfectly good file */
/** @typedef {import('../../kernel/types.js').State} State */
/** A file's parts, each cleaned up as if it had been loaded; prefs are the settings it carried, if any.
    @typedef {{layouts: import('../../kernel/types.js').Layout[], folders: import('../../kernel/types.js').Folder[],
      floors: import('../../kernel/types.js').Floor[], inventory: import('../../kernel/types.js').Item[],
      active: unknown, prefs: Partial<State>|null}} Imported */
/* What `data` holds is whatever the file did, so it is read as any and
   everything taken out of it goes through normLayout/normItem or a check. */
/** @param {any} data a parsed file @returns {Imported|null} */
function readImport(data){
  if(!data || typeof data!=='object') return null;
  const layouts = (Array.isArray(data.layouts)?data.layouts:[]).filter((/** @type {any} */l)=>l&&typeof l==='object').map((/** @type {any} */l)=>normLayout(clone(l)));
  const inventory = (Array.isArray(data.inventory)?data.inventory:[]).filter((/** @type {any} */i)=>i&&typeof i==='object'&&i.shape).map((/** @type {any} */i)=>normItem(clone(i)));
  const folders = (Array.isArray(data.folders)?data.folders:[]).filter((/** @type {any} */f)=>f&&f.id).map((/** @type {any} */f)=>{
    const c=clone(f);
    c.name=c.name||'Folder';
    c.parentId=c.parentId||null;
    if(!Array.isArray(c.tags)) c.tags=[];
    return c;
  });
  const floors = (Array.isArray(data.floors)?data.floors:[]).filter((/** @type {any} */f)=>f&&f.id).map((/** @type {any} */f)=>{
    const c=clone(f);
    c.name=c.name||'Floor';
    c.parentId=null;
    c.extWall = isFinite(c.extWall) && c.extWall>0 ? c.extWall : 0;
    return c;
  });
  if(!layouts.length && !inventory.length) return null;
  /** @type {Record<string, any>} the settings as the file had them, checked below */
  const prefs={};
  for(const k of PREF_KEYS) if(data[k]!==undefined) prefs[k]=data[k];
  if(prefs.unit && !['ftin','in','cm','mm','m'].includes(prefs.unit)) delete prefs.unit;
  if(prefs.invScope && !INV_SCOPES[prefs.invScope]) delete prefs.invScope;
  if(prefs.snap!==undefined) prefs.snap=String(prefs.snap);
  for(const k of ['showSwing','showDims','showOpen','showWalk','showMeasure','onlyAvailable']) if(prefs[k]!==undefined) prefs[k]=!!prefs[k];
  return {layouts, folders, floors, inventory, active:data.active, prefs:Object.keys(prefs).length?prefs:null};
}
/* One project transaction, whichever way it goes: no undo stack covers it (a
   replace starts every stack afresh below). */
/** @param {Imported} inc @param {string[]} roomIds @param {string[]} itemIds @param {boolean} wantPrefs
    @param {boolean} replace replace the project rather than merge into it
    @param {'mine'|'theirs'|string} dupe on an item id already here: keep mine, or add theirs beside it */
function applyImport(inc, roomIds, itemIds, wantPrefs, replace, dupe){
  transact('project', ()=>importInto(inc, roomIds, itemIds, wantPrefs, replace, dupe));
}
/** @param {Imported} inc @param {string[]} roomIds @param {string[]} itemIds @param {boolean} wantPrefs @param {boolean} replace @param {string} dupe */
function importInto(inc, roomIds, itemIds, wantPrefs, replace, dupe){
  const layouts=inc.layouts.filter(l=>roomIds.includes(l.id)).map(clone);
  const items=inc.inventory.filter(i=>itemIds.includes(i.id)).map(clone);
  /** @type {Set<string>} */
  const keep=new Set();
  for(const l of layouts) for(const id of ancestorFolderIds(inc.folders, l.folderId)) keep.add(id);
  const folders=inc.folders.filter(f=>keep.has(f.id)).map(clone);
  const keepFl=new Set(layouts.map(l=>l.floorId).filter(Boolean));
  const floors=(inc.floors||[]).filter(f=>keepFl.has(f.id)).map(clone);

  if(replace){
    /** @type {Record<string, any> & {layouts: import('../../kernel/types.js').Layout[]}} a partial save; migrate() completes it */
    const st={
      mode:'furniture', tagFilter:[], untaggedOnly:false,
      leftOpen:S.leftOpen, rightOpen:S.rightOpen, secClosed:S.secClosed.slice(),
      inventory:items, folders, floors, layouts
    };
    for(const k of PREF_KEYS) st[k]=S[k];
    if(wantPrefs && inc.prefs) Object.assign(st, inc.prefs);
    const have=new Set(items.map(i=>i.id));
    for(const l of st.layouts) l.placed=l.placed.filter(p=>have.has(p.itemId));
    st.active = st.layouts.some(l=>l.id===inc.active) ? inc.active : st.layouts[0].id;
    const done=migrate(st);
    if(!done){ flash("There was nothing in that file to import"); return; }
    setS(done);
    ensureDefaultMarket();
    sel.value = null; roomSel.value = null;
    for(const k of Object.keys(roomHist)) delete roomHist[k];
    for(const k of Object.keys(furnHist)) delete furnHist[k];
    seedHistFor();
    fit();
    flash('Replaced your project with '+plural(S.layouts.length,'room')+' and '+plural(S.inventory.length,'item'));
    return;
  }

  /* adding: an id that is already spoken for either points at what you have, or is
     brought in beside it under id-2 — and every reference in the file follows along */
  const takenItems=new Set(S.inventory.map(i=>i.id));
  /** @type {Record<string, string>} */
  const itemMap={};
  let addedItems=0;
  for(const it of items){
    if(takenItems.has(it.id) && dupe==='mine'){ itemMap[it.id]=it.id; continue; }
    if(takenItems.has(it.id) && dupe==='theirs'){
      const idx=S.inventory.findIndex(x=>x.id===it.id);
      if(idx>=0) S.inventory[idx]=it;
      itemMap[it.id]=it.id;
      addedItems++;
      continue;
    }
    const nid=uniqueId(it.id, takenItems);
    itemMap[it.id]=nid; it.id=nid;
    takenItems.add(nid);
    S.inventory.push(it);
    addedItems++;
  }
  /* a folder id that already exists here IS that folder — importing the same file twice
     files the rooms into the folder you already have rather than growing a twin of it */
  const takenFolders=new Set(S.folders.map(f=>f.id));
  /** @type {Record<string, string>} */
  const folderMap={}, freshFolders=/** @type {import('../../kernel/types.js').Folder[]} */([]);
  for(const f of folders){
    folderMap[f.id]=f.id;
    if(takenFolders.has(f.id)) continue;
    takenFolders.add(f.id);
    freshFolders.push(f);
  }
  for(const f of freshFolders){
    f.parentId = f.parentId ? (folderMap[f.parentId]||null) : null;
    S.folders.push(f);
  }
  /* floors follow the same rule as folders: an id you already have IS that floor */
  const takenFloors=new Set(S.floors.map(f=>f.id));
  for(const f of floors){
    if(takenFloors.has(f.id)) continue;
    takenFloors.add(f.id);
    S.floors.push(f);
  }
  const takenLayouts=new Set(S.layouts.map(l=>l.id));
  for(const l of layouts){
    if(takenLayouts.has(l.id)) l.id=uid();
    takenLayouts.add(l.id);
    l.folderId = l.folderId ? (folderMap[l.folderId]||null) : null;
    l.floorId = l.floorId && takenFloors.has(l.floorId) ? l.floorId : null;
    /* importing the same file twice must not hide one room exactly under another */
    if(l.floorId){
      const near = (/** @type {import('../../kernel/types.js').FloorPlace} */p) => floorLayouts(l.floorId).some(o=>Math.abs(o.floorPlace.x-p.x)<50 && Math.abs(o.floorPlace.y-p.y)<50);
      while(near(l.floorPlace)){ l.floorPlace.x+=300; l.floorPlace.y+=300; }
    }
    /** @type {Record<string, string>} */
    const placedMap={};
    l.placed = l.placed.filter(p=>{
      // the thing came in with the room, or one of yours already answers to that id
      const target = itemMap[p.itemId] || (takenItems.has(p.itemId) ? p.itemId : null);
      if(!target) return false;
      p.itemId=target;
      const id=uid(); placedMap[p.id]=id; p.id=id;
      return true;
    });
    remapMeasures(l, {item:placedMap});
    S.layouts.push(l);
  }
  if(wantPrefs && inc.prefs) Object.assign(S, inc.prefs);
  flash('Added '+plural(layouts.length,'room')+' and '+plural(addedItems,'item'));
}
export {readImport, applyImport};
