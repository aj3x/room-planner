/* Import: read a file back without assuming it is a whole project, then
   either replace the project or merge into it.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   It was blocked on renderAll and renderLibAll, the two things applyImport
   calls once the new state is in place; both have moved.

   The $('btnImport') registration stays in index.html, per rule 6.
*/
import {fit} from '../canvas/view.js';
import {INV_SCOPES} from '../core/floor-space.js';
import {furnHist, roomHist, seedHistFor} from '../core/history.js';
import {uniqueId} from '../core/ids.js';
import {migrate, normItem, normLayout, remapMeasures} from '../core/migrate.js';
import {setRoomSel, setSel} from '../core/selection.js';
import {S, clone, floorLayouts, isCanvasMode, setS, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {ensureDefaultMarket} from '../library/market-subs.js';
import {renderLibAll} from '../library/shell.js';
import {renderAll} from '../plan/mode.js';
import {renderSnap} from '../plan/room-panel.js';
import {flash} from '../ui/flash.js';
import {$, moError, openModal} from '../ui/modal.js';
import {applyPanes, applySections, plural} from '../ui/panels.js';
import {PREF_KEYS} from './export.js';
import {ancestorFolderIds, folderLine, pickValues, pickerHTML, pickerMount} from './pickers.js';
/* ------------------------- import ------------------------- */
/* pull the parts out of a file without assuming it is a whole project — a things-only
   or rooms-only export is a perfectly good file */
function readImport(data){
  if(!data || typeof data!=='object') return null;
  const layouts = (Array.isArray(data.layouts)?data.layouts:[]).filter(l=>l&&typeof l==='object').map(l=>normLayout(clone(l)));
  const inventory = (Array.isArray(data.inventory)?data.inventory:[]).filter(i=>i&&typeof i==='object'&&i.shape).map(i=>normItem(clone(i)));
  const folders = (Array.isArray(data.folders)?data.folders:[]).filter(f=>f&&f.id).map(f=>{
    const c=clone(f);
    c.name=c.name||'Folder';
    c.parentId=c.parentId||null;
    if(!Array.isArray(c.tags)) c.tags=[];
    return c;
  });
  const floors = (Array.isArray(data.floors)?data.floors:[]).filter(f=>f&&f.id).map(f=>{
    const c=clone(f);
    c.name=c.name||'Floor';
    c.parentId=null;
    c.extWall = isFinite(c.extWall) && c.extWall>0 ? c.extWall : 0;
    return c;
  });
  if(!layouts.length && !inventory.length) return null;
  const prefs={};
  for(const k of PREF_KEYS) if(data[k]!==undefined) prefs[k]=data[k];
  if(prefs.unit && !['ftin','in','cm','mm','m'].includes(prefs.unit)) delete prefs.unit;
  if(prefs.invScope && !INV_SCOPES[prefs.invScope]) delete prefs.invScope;
  if(prefs.snap!==undefined) prefs.snap=String(prefs.snap);
  for(const k of ['showSwing','showDims','showOpen','showWalk','showMeasure','onlyAvailable']) if(prefs[k]!==undefined) prefs[k]=!!prefs[k];
  return {layouts, folders, floors, inventory, active:data.active, prefs:Object.keys(prefs).length?prefs:null};
}
function importDialog(inc){
  const rooms=inc.layouts.map(l=>({value:l.id, label:l.name, sub:folderLine(l,inc.folders), checked:true}));
  const things=inc.inventory.map(i=>({value:i.id, label:i.name, sub:i.id, checked:true}));
  openModal('Import', `
    <div class="field"><label for="imHow">Mode</label><select id="imHow">
      <option value="add">Add to my project</option>
      <option value="replace">Replace my project</option></select></div>
    <p class="hint" id="imHowNote"></p>
    ${pickerHTML('imRooms','Rooms in this file',rooms,'No rooms in this file')}
    ${pickerHTML('imThings','Items in this file',things,'No items in this file')}
    ${inc.prefs?`<label class="check"><input type="checkbox" id="imPrefs">Settings — units, snap, stock, and what the plan shows</label>`:''}
    <div class="field" id="imDupeRow"><label for="imDupe">Same id</label><select id="imDupe">
      <option value="mine">Keep mine</option>
      <option value="theirs">Overwrite mine</option>
      <option value="copy">Add theirs as a copy</option></select></div>
    <p class="hint" id="imDupeNote">An id already in your library, like <code>ikea/kallax/4x2</code>, means the same product — by default yours is kept and incoming rooms use it. "Overwrite mine" replaces your item's data with the incoming one, in place.</p>`,
    'Import',
    ()=>{
      const roomIds=pickValues('imRooms'), itemIds=pickValues('imThings');
      if(!roomIds.length && !itemIds.length){ moError('Tick at least one room or item'); return false; }
      const replace=$('imHow').value==='replace';
      if(replace && !roomIds.length){ moError('Replacing needs at least one room — a project has to have somewhere to stand'); return false; }
      applyImport(inc, roomIds, itemIds, !!($('imPrefs')&&$('imPrefs').checked), replace, $('imDupe').value);
    },
    ()=>{
      pickerMount('imRooms'); pickerMount('imThings');
      const how=$('imHow');
      const sayHow=()=>{
        const rep=how.value==='replace';
        $('imHowNote').textContent = rep
          ? 'Everything you have now — rooms, items and all — is replaced by what you tick below. This can’t be undone.'
          : 'What you tick is added to your project. Nothing you already have is touched.';
        $('imDupeRow').hidden=rep;
        $('imDupeNote').hidden=rep;
        $('moOk').classList.toggle('danger', rep);
        $('moOk').textContent = rep ? 'Replace project' : 'Import';
      };
      how.addEventListener('change',sayHow);
      sayHow();
    });
}
function applyImport(inc, roomIds, itemIds, wantPrefs, replace, dupe){
  const layouts=inc.layouts.filter(l=>roomIds.includes(l.id)).map(clone);
  const items=inc.inventory.filter(i=>itemIds.includes(i.id)).map(clone);
  const keep=new Set();
  for(const l of layouts) for(const id of ancestorFolderIds(inc.folders, l.folderId)) keep.add(id);
  const folders=inc.folders.filter(f=>keep.has(f.id)).map(clone);
  const keepFl=new Set(layouts.map(l=>l.floorId).filter(Boolean));
  const floors=(inc.floors||[]).filter(f=>keepFl.has(f.id)).map(clone);

  if(replace){
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
    ensureDefaultMarket().then(()=>{ if(!isCanvasMode(S.mode)) renderLibAll(); });
    setSel(null); setRoomSel(null);
    for(const k of Object.keys(roomHist)) delete roomHist[k];
    for(const k of Object.keys(furnHist)) delete furnHist[k];
    seedHistFor();
    $('unitSel').value=S.unit;
    $('showSwing').checked=S.showSwing; $('showDims').checked=S.showDims; $('showOpen').checked=S.showOpen; $('showWalk').checked=S.showWalk; $('showMeasure').checked=S.showMeasure; $('zoomSpeedSel').value=S.zoomSpeed;
    renderSnap(); applyPanes(); applySections(); renderAll(); fit(); save();
    flash('Replaced your project with '+plural(S.layouts.length,'room')+' and '+plural(S.inventory.length,'item'));
    return;
  }

  /* adding: an id that is already spoken for either points at what you have, or is
     brought in beside it under id-2 — and every reference in the file follows along */
  const takenItems=new Set(S.inventory.map(i=>i.id));
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
  const folderMap={}, freshFolders=[];
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
      const near = p => floorLayouts(l.floorId).some(o=>Math.abs(o.floorPlace.x-p.x)<50 && Math.abs(o.floorPlace.y-p.y)<50);
      while(near(l.floorPlace)){ l.floorPlace.x+=300; l.floorPlace.y+=300; }
    }
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
  if(wantPrefs && inc.prefs){
    Object.assign(S, inc.prefs);
    $('unitSel').value=S.unit;
    $('showSwing').checked=S.showSwing; $('showDims').checked=S.showDims; $('showOpen').checked=S.showOpen; $('showWalk').checked=S.showWalk; $('showMeasure').checked=S.showMeasure; $('zoomSpeedSel').value=S.zoomSpeed;
    renderSnap();
  }
  renderAll(); save();
  flash('Added '+plural(layouts.length,'room')+' and '+plural(addedItems,'item'));
}
export {readImport, importDialog, applyImport};
