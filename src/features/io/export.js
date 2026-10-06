// @ts-check
/* Export: what the Export dialog (export-dialog.jsx) writes, and the
   "Save plan image" beside it.

   savePlanImage is here, not in the canvas feature, because the Export
   dialog is its only caller; it reaches the canvas through
   features/canvas/index.js.
*/
import {draw, setForceLightCanvas, cv} from '../canvas/index.js';
import {L, S, clone} from '../../kernel/state.js';
import {ancestorFolderIds, fileSlug} from './pickers.js';

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
/** the settings an export can carry @type {('unit'|'snap'|'showSwing'|'showDims'|'showOpen'|'showWalk'|'showMeasure'|'invScope'|'onlyAvailable'|'zoomSpeed')[]} */
const PREF_KEYS=['unit','snap','showSwing','showDims','showOpen','showWalk','showMeasure','invScope','onlyAvailable','zoomSpeed'];
/** @param {string[]} roomIds @param {string[]} itemIds @param {boolean} withPrefs @returns {import('../../kernel/types.js').ProjectFile} */
function exportPayload(roomIds, itemIds, withPrefs){
  const layouts=S.layouts.filter(l=>roomIds.includes(l.id)).map(clone);
  /** @type {Set<string>} */
  const keep=new Set();
  for(const l of layouts) for(const id of ancestorFolderIds(S.folders, l.folderId)) keep.add(id);
  /* a floor travels whenever one of the rooms standing on it does */
  const keepFl=new Set(layouts.map(l=>l.floorId).filter(Boolean));
  /** @type {import('../../kernel/types.js').ProjectFile} */
  const out={
    app:'room-planner', version:2, exported:new Date().toISOString(),
    folders:S.folders.filter(f=>keep.has(f.id)).map(clone),
    floors:S.floors.filter(f=>keepFl.has(f.id)).map(clone),
    layouts,
    inventory:S.inventory.filter(i=>itemIds.includes(i.id)).map(clone)
  };
  if(withPrefs) for(const k of PREF_KEYS) /** @type {Record<string, unknown>} */(/** @type {unknown} */(out))[k]=S[k];   // k is a pref of both; tsc cannot pair out[k] with S[k]
  if(layouts.some(l=>l.id===S.active)) out.active=S.active;
  return out;
}
/** @param {{name: string}[]} layouts @param {string[]} itemIds */
function exportName(layouts, itemIds){
  if(!layouts.length) return 'room-planner-items.json';
  if(layouts.length===1) return 'room-planner-'+fileSlug(layouts[0].name)+'.json';
  if(!itemIds.length) return 'room-planner-rooms.json';
  return 'room-planner.json';
}
/** @param {unknown} obj @param {string} name */
function downloadJSON(obj, name){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
export {savePlanImage, PREF_KEYS, exportPayload, exportName, downloadJSON};
