/* Export: what the Export dialog writes, and the "Save plan image" beside it.

   Extracted from index.html in Phase 3, move-only: both blocks below are
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   savePlanImage was declared 2,700 lines above the rest, at the end of the
   view-settings listeners, and §3 gives it no file. It is here because
   exportDialog is its only caller and because it cannot go the other way:
   canvas/draw.js -> io/pickers.js -> ui/panels.js would weld the canvas
   import cycle onto the modal.js <-> panels.js one, dragging canvas/view.js's
   top-level `const cv=$('cv')` into a cycle with the module that defines `$`.
   Nothing imports this file but index.html, so here it adds no cycle at all.

   The `$('btnExport')` registration stays in index.html, per rule 6.
*/
import {draw, setForceLightCanvas} from '../canvas/draw.js';
import {cv} from '../canvas/view.js';
import {L, S, clone, isCanvasMode} from '../core/state.js';
import {ancestorFolderIds, fileSlug, folderLine, pickValues, pickerHTML, pickerMount} from './pickers.js';
import {$, closeModal, moError, openModal, svgI} from '../ui/modal.js';
import {esc} from '../ui/panels.js';

/* a saved image is for printing and sharing, so it is always drawn in the light palette */
function savePlanImage(){
  setForceLightCanvas(true); draw();
  const url=cv.toDataURL('image/png');
  setForceLightCanvas(false); draw();
  const a=document.createElement('a');
  a.download=fileSlug(L().name)+'.png';
  a.href=url;
  a.click();
}
/* ------------------------- export ------------------------- */
const PREF_KEYS=['unit','snap','showSwing','showDims','showOpen','showWalk','showMeasure','invScope','onlyAvailable','zoomSpeed'];
function exportPayload(roomIds, itemIds, withPrefs){
  const layouts=S.layouts.filter(l=>roomIds.includes(l.id)).map(clone);
  const keep=new Set();
  for(const l of layouts) for(const id of ancestorFolderIds(S.folders, l.folderId)) keep.add(id);
  /* a floor travels whenever one of the rooms standing on it does */
  const keepFl=new Set(layouts.map(l=>l.floorId).filter(Boolean));
  const out={
    app:'room-planner', version:2, exported:new Date().toISOString(),
    folders:S.folders.filter(f=>keep.has(f.id)).map(clone),
    floors:S.floors.filter(f=>keepFl.has(f.id)).map(clone),
    layouts,
    inventory:S.inventory.filter(i=>itemIds.includes(i.id)).map(clone)
  };
  if(withPrefs) for(const k of PREF_KEYS) out[k]=S[k];
  if(layouts.some(l=>l.id===S.active)) out.active=S.active;
  return out;
}
function exportName(layouts, itemIds){
  if(!layouts.length) return 'room-planner-items.json';
  if(layouts.length===1) return 'room-planner-'+fileSlug(layouts[0].name)+'.json';
  if(!itemIds.length) return 'room-planner-rooms.json';
  return 'room-planner.json';
}
function downloadJSON(obj, name){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function exportDialog(){
  const rooms=S.layouts.map(l=>({value:l.id, label:l.name, sub:folderLine(l), checked:true}));
  const things=S.inventory.map(i=>({value:i.id, label:i.name, sub:i.id, checked:true}));
  const img = isCanvasMode(S.mode) ? `<div class="export-img">
      <span class="ico">${svgI('room')}</span>
      <div class="grow"><div class="nm">Image of “${esc(L().name)}”</div><div class="dim">PNG of the plan as it's framed now</div></div>
      <button type="button" class="btn sm" id="xPng">Save image</button></div>
    <p class="group-title">Project file</p>` : '';
  openModal('Export', `
    ${img}
    <p class="hint">Tick what goes in the file. It can be imported here or on another device.</p>
    ${pickerHTML('xRooms','Rooms',rooms,'You have no rooms to export')}
    ${pickerHTML('xThings','Items',things,'Your library is empty')}
    <label class="check"><input type="checkbox" id="xPrefs" checked>Settings — units, snap, stock and view</label>
    <p class="hint" id="xNote"></p>`,
    'Export file',
    ()=>{
      const roomIds=pickValues('xRooms'), itemIds=pickValues('xThings');
      if(!roomIds.length && !itemIds.length){ moError('Tick at least one room or item'); return false; }
      const picked=S.layouts.filter(l=>roomIds.includes(l.id));
      downloadJSON(exportPayload(roomIds,itemIds,$('xPrefs').checked), exportName(picked,itemIds));
    },
    ()=>{
      /* a room is no use without the things standing in it, so picking a room locks those on */
      const syncUsed=()=>{
        const picked=new Set(pickValues('xRooms')), need=new Set();
        for(const l of S.layouts) if(picked.has(l.id)) for(const p of l.placed) need.add(p.itemId);
        for(const c of $('xThings').querySelectorAll('input[type=checkbox]')){
          const must=need.has(c.value);
          c.disabled=must;
          if(must) c.checked=true;
          c.closest('.pick').classList.toggle('locked',must);
        }
        $('xNote').textContent = need.size
          ? 'Items placed in the rooms you picked always come along, so the plan still works at the other end.'
          : '';
      };
      if($('xPng')) $('xPng').addEventListener('click', ()=>{ closeModal(); savePlanImage(); });
      pickerMount('xRooms', syncUsed);
      pickerMount('xThings');
      syncUsed();
    });
}
export {savePlanImage, PREF_KEYS, exportPayload, exportName, downloadJSON, exportDialog};
