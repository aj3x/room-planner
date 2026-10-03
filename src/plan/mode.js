/* The mode switch, and the two views that follow the mode: the header and
   canvas mode buttons (renderMode, plus which half of the page is showing),
   and the undo/redo buttons.

   setMode() commits the mode through transact('prefs') and resets the
   selection that does not survive it; every panel, the canvas and the
   Library are effects on those signals and repaint themselves. It applies
   the page layout itself, before resize(): resize() measures the canvas, and
   the canvas has no size while the Library is showing.

   Not in ui/panels.js: setMode calls resize() and fit(), so ui/panels.js ->
   canvas/view.js would drag view.js's top-level `const cv=$('cv')` into the
   modal.js <-> panels.js cycle -- the boot failure that reverted togglePane.
   Nothing in ui/ imports plan/, so here it costs nothing.
*/
import {measureOn} from '../canvas/measure-state.js';
import {resetMeasureState} from '../canvas/measure-tool.js';
import {fit, resize} from '../canvas/camera.js';
import {floorEntry, histAvail, histRev} from '../core/history.js';
import {selectClear, alignGuides, alignNote, floorGuides, floorSel, floorSnapNote, roomSel} from '../core/selection.js';
import {batch, pref, rev} from '../core/signals.js';
import {L, S, isCanvasMode} from '../core/state.js';
import {transact} from '../core/tx.js';
import {$} from '../ui/modal.js';
import {mountPanel} from '../ui/mount.js';
import {applyPanes} from '../ui/panels.js';
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
  batch(()=>{
    transact('prefs', ()=>{ S.mode=m; if(isCanvasMode(m)) S.planMode=m; });
    if(m==='furniture') roomSel.value = null;
    else if(m==='room') selectClear();
    else if(m==='floor'){ selectClear(); roomSel.value = null; floorSel.value = L().floorId ? L().id : null; floorEntry(); }
    if(m!=='floor'){ floorGuides.value = []; floorSnapNote.value = ''; }
    alignGuides.value = []; alignNote.value = '';
    /* measurements belong to one room, so Floor mode leaves the tool behind too */
    if((!isCanvasMode(m) || m==='floor') && measureOn.value){ measureOn.value = false; resetMeasureState(); }
  });
  applyLayoutMode();
  if(isCanvasMode(m)){
    resize();
    if(pendingFit){ pendingFit=false; fit(); }
    else if(m==='floor') fit();   // arriving at a floor, frame the whole arrangement
  }
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

function renderHistButtons(){
  const {canUndo, canRedo}=histAvail();
  $('btnUndo').disabled=!canUndo; $('btnRedo').disabled=!canRedo;
}

/* The mode's own views, as effects (ui/mount.js). */
function mountMode(){
  mountPanel(null, () => { pref('mode'); pref('leftOpen'); pref('rightOpen'); }, () => { renderMode(); applyLayoutMode(); });
  mountPanel(null, () => { histRev.value; pref('mode'); rev.project.value; rev.floor.value; }, renderHistButtons);
}

function togglePane(side){
  if(!wideLayout()) return;
  transact('prefs', ()=>{ if(side==='left') S.leftOpen=!S.leftOpen; else S.rightOpen=!S.rightOpen; }, {canvas:false});   // resize() redraws
  closeMenu(); resize();   // the mode effect has applied the panes by now: this is never inside a batch
}
/* the mode also lives in ?mode=, so a refresh (or a shared link) lands back in the same mode */
function paramMode(){
  const m=new URLSearchParams(location.search).get('mode');
  return ['room','furniture','floor','inventory','marketplace'].includes(m) ? m : null;
}

export {mountMode, setPendingFit, syncModeParam, setMode, renderMode, applyLayoutMode, togglePane, paramMode};
