// @ts-check
/* What the page is showing: the mode (setMode) and the active room
   (activateLayout), which half of the page shows for it, undo and redo on
   the mode's own stack, and the canvas's mode and undo/redo buttons
   (controls.jsx).

   setMode() commits the mode through transact('prefs') and resets the
   selection that does not survive it; every panel, the canvas and the
   Library are effects on those signals and repaint themselves. It applies
   the page layout itself, before resize(): resize() measures the canvas, and
   the canvas has no size while the Library is showing.

   It is a feature rather than ui-kit/ because it drives the canvas (resize,
   fit, stopping tools) and ui-kit/ imports no feature.
*/
import {fit, resize, resetTools, stopToolsFor} from '../canvas/index.js';
import {floorEntry, redoFloor, redoFurn, redoRoom, seedHistFor, undoFloor, undoFurn, undoRoom} from '../../kernel/history.js';
import {selectClear, alignGuides, alignNote, floorGuides, floorSel, floorSnapNote, roomSel, sel} from '../../kernel/selection.js';
import {batch, effect, pref} from '../../kernel/signals.js';
import {L, S, floorMode, folderOf, isCanvasMode, roomMode} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {showLibrary} from '../../ui-kit/panels.js';
import {closeMenu} from '../../ui-kit/menu.js';
import {wideLayout} from '../../ui-kit/panels.js';

function syncModeParam(){
  const usp=new URLSearchParams(location.search);
  usp.set('mode', S.mode);
  history.replaceState(null,'',location.pathname+'?'+usp.toString()+location.hash);
}

let pendingFit=false;
/** @param {boolean} v */
function setPendingFit(v){ pendingFit = v; }
/** @param {import('../../kernel/types.js').Mode} m */
function setMode(m){
  batch(()=>{
    transact('prefs', ()=>{ S.mode=m; if(isCanvasMode(m)) S.planMode=m; });
    if(m==='furniture') roomSel.value = null;
    else if(m==='room') selectClear();
    else if(m==='floor'){ selectClear(); roomSel.value = null; floorSel.value = L().floorId ? L().id : null; floorEntry(); }
    if(m!=='floor'){ floorGuides.value = []; floorSnapNote.value = ''; }
    alignGuides.value = []; alignNote.value = '';
    stopToolsFor(m);
  });
  applyLayoutMode();
  if(isCanvasMode(m)){
    resize();
    if(pendingFit){ pendingFit=false; fit(); }
    else if(m==='floor') fit();   // arriving at a floor, frame the whole arrangement
  }
  syncModeParam();
}
/* switching into a room under a DIFFERENT folder re-applies that folder's tag filter;
   switching between rooms in the SAME folder leaves whatever filter the person set alone */
/** @param {string} id */
function activateLayout(id){
  S.active=id; sel.value = null; roomSel.value = null; floorSel.value = null;
  resetTools();
  seedHistFor();
  const fid = L() ? (L().folderId||null) : null;
  if(fid !== S.lastFolderId){ S.tagFilter = (folderOf(fid)?.tags||[]).slice(); S.untaggedOnly=false; }
  S.lastFolderId = fid;
}

/* which sections and canvas controls show follows the mode, through body[data-mode] in the stylesheet */
function renderMode(){
  document.body.dataset.mode = S.mode;
}

/* ------------------------- boot ------------------------- */
function applyLayoutMode(){
  showLibrary(!isCanvasMode(S.mode));
}

/* Undo and redo, on whichever stack the mode edits: the buttons' and the keyboard's. */
function undo(){ floorMode()?undoFloor():roomMode()?undoRoom():undoFurn(); }
function redo(){ floorMode()?redoFloor():roomMode()?redoRoom():redoFurn(); }

/* The mode's own view of the page, as an effect on what it shows. */
function mountMode(){
  effect(() => { pref('mode'); pref('leftOpen'); pref('rightOpen'); renderMode(); applyLayoutMode(); });
}

/** @param {'left'|'right'} side */
function togglePane(side){
  if(!wideLayout()) return;
  transact('prefs', ()=>{ if(side==='left') S.leftOpen=!S.leftOpen; else S.rightOpen=!S.rightOpen; }, {canvas:false});   // resize() redraws
  closeMenu(); resize();   // the mode effect has applied the panes by now: this is never inside a batch
}
/* the mode also lives in ?mode=, so a refresh (or a shared link) lands back in the same mode */
/** @returns {import('../../kernel/types.js').Mode|null} the ?mode= the page was opened with, if it names one */
function paramMode(){
  const m=new URLSearchParams(location.search).get('mode');
  return ['room','furniture','floor','inventory','marketplace'].includes(/** @type {string} */(m)) ? /** @type {import('../../kernel/types.js').Mode} */(m) : null;
}

export {mountMode, setPendingFit, syncModeParam, setMode, activateLayout, applyLayoutMode, togglePane, paramMode, undo, redo};
