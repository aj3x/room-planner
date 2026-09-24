/* The mode switch. setMode() is one of the six edges that made the Plan side
   panels and the Library UI a single strongly-connected component: it calls
   renderLibAll() for the two library places and draw()/render*() for the three
   canvas ones.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only.

   Not in ui/panels.js, where the plan/ round's notes file the rest of this
   banner: setMode calls resize() and fit(), so ui/panels.js -> canvas/view.js
   would drag view.js's top-level `const cv=$('cv')` into the
   modal.js <-> panels.js cycle -- the boot failure that reverted togglePane.
   Nothing in ui/ imports plan/, so here it costs nothing.

   paramMode, renderAll and the #navSeg/#modeSeg listeners stayed in
   index.html: the listeners under rule 6, renderAll because it is in a
   second, smaller SCC of its own with renderFloorSel and the floor dialogs.
*/
import {draw} from '../canvas/draw.js';
import {measureOn, setMeasureOn} from '../canvas/measure-state.js';
import {renderMeasureBar, resetMeasureState} from '../canvas/measure-tool.js';
import {fit, resize} from '../canvas/view.js';
import {floorEntry, updateHistButtons} from '../core/history.js';
import {selectClear, setAlignGuides, setAlignNote, setFloorGuides, setFloorSel, setFloorSnapNote, setRoomSel} from '../core/selection.js';
import {L, S, isCanvasMode} from '../core/state.js';
import {save} from '../core/store.js';
import {renderLibAll} from '../library/shell.js';
import {$} from '../ui/modal.js';
import {applyPanes} from '../ui/panels.js';
import {renderOpen, renderRoomSel, renderWalls} from './room-panel.js';
import {renderSel} from './selection-panel.js';
import {renderFloorSel} from './floors.js';
import {renderInv} from './item-list.js';
import {renderTree} from './layout-tree.js';
import {renderRoom, renderSnap} from './room-panel.js';
import {closeMenu} from '../ui/menu.js';
import {wideLayout} from '../ui/panels.js';

function syncModeParam(){
  const usp=new URLSearchParams(location.search);
  usp.set('mode', S.mode);
  history.replaceState(null,'',location.pathname+'?'+usp.toString()+location.hash);
}

let pendingFit=false;
function setPendingFit(v){ pendingFit = v; }
function setMode(m){
  S.mode=m;
  if(isCanvasMode(m)) S.planMode=m;
  if(m==='furniture') setRoomSel(null);
  else if(m==='room') selectClear();
  else if(m==='floor'){ selectClear(); setRoomSel(null); setFloorSel(L().floorId ? L().id : null); floorEntry(); }
  if(m!=='floor'){ setFloorGuides([]); setFloorSnapNote(''); }
  setAlignGuides([]); setAlignNote('');
  /* measurements belong to one room, so Floor mode leaves the tool behind too */
  if((!isCanvasMode(m) || m==='floor') && measureOn){ setMeasureOn(false); resetMeasureState(); renderMeasureBar(); }
  renderMode(); applyLayoutMode();
  if(isCanvasMode(m)){
    resize();
    if(pendingFit){ pendingFit=false; fit(); }
    else if(m==='floor') fit();   // arriving at a floor, frame the whole arrangement
    renderRoomSel(); renderWalls(); renderOpen(); renderSel(); updateHistButtons(); draw();
  }
  else renderLibAll();
  save();
  syncModeParam();
}
/* places (Plan / Library / Marketplace) live in the header; the Room/Furniture mode lives on the canvas it changes */
function renderMode(){
  const place = isCanvasMode(S.mode) ? 'plan' : S.mode;
  for(const b of document.querySelectorAll('#navSeg button')){
    if(b.dataset.nav===place) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  }
  for(const b of document.querySelectorAll('#modeSeg button')) b.setAttribute('aria-pressed', String(b.dataset.mode===S.mode));
  document.body.dataset.mode = S.mode;
}

/* ------------------------- boot ------------------------- */
function applyLayoutMode(){
  const lib = !isCanvasMode(S.mode);
  document.querySelector('main').style.display = lib ? 'none' : '';
  $('paneLibrary').classList.toggle('on', lib);
  if(!lib) applyPanes();
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function renderAll(){
  renderTree(); renderRoom(); renderWalls(); renderRoomSel(); renderOpen();
  renderInv(); renderSel(); renderFloorSel(); renderSnap(); renderMode(); renderMeasureBar(); updateHistButtons(); draw();
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function togglePane(side){
  if(!wideLayout()) return;
  if(side==='left') S.leftOpen=!S.leftOpen; else S.rightOpen=!S.rightOpen;
  closeMenu(); applyPanes(); save(); resize();
}
/* the mode also lives in ?mode=, so a refresh (or a shared link) lands back in the same mode */
function paramMode(){
  const m=new URLSearchParams(location.search).get('mode');
  return ['room','furniture','floor','inventory','marketplace'].includes(m) ? m : null;
}

export {setPendingFit, syncModeParam, setMode, renderMode, applyLayoutMode, renderAll, togglePane, paramMode};
