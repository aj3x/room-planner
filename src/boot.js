import {bpLastImport, bpUndoImport} from './blueprint/commit.js';
import {bpUploadDialog} from './blueprint/step1-upload.js';
import {draw, scheduleDraw} from './canvas/draw.js';
import {fit, resize} from './canvas/view.js';
import {seedHistFor} from './core/history.js';
import {migrate} from './core/migrate.js';
import {S, isCanvasMode, setS} from './core/state.js';
import {on} from './core/bus.js';
import {provide} from './core/registry.js';
import {KEY, Store} from './core/store.js';
import {marketFolderOf} from './library/adhoc-folders.js';
import {itemFolderOf} from './library/item-folders.js';
import {ensureDefaultMarket} from './library/market-subs.js';
import {nav} from './library/nav.js';
import {renderLibAll} from './library/shell.js';
import {renderFloorSel} from './plan/floors.js';
import {itemDialog} from './plan/item-dialog.js';
import {activateLayout, renderTree} from './plan/layout-tree.js';
import {renderInv} from './plan/item-list.js';
import {applyLayoutMode, paramMode, renderAll, renderMode, setMode, setPendingFit, syncModeParam} from './plan/mode.js';
import {renderSel} from './plan/selection-panel.js';
import {renderOpen, renderRoom, renderRoomSel, renderSnap, renderWalls} from './plan/room-panel.js';
import {flash} from './ui/flash.js';
import {$} from './ui/modal.js';
import {applySections} from './ui/panels.js';

/* Cross-feature entry points that cannot be plain imports without closing an
   import cycle. See src/core/registry.js for why, and
   .claude/plans/decoupling.md §4 for what it bought.

   boot.js is the right place for this: nothing in src/ imports it, so the
   edges it draws here cost the graph nothing. It runs from inside boot(),
   before its first `await`, so every name is in place before control returns
   to the event loop and the first listener can fire.

   `blueprint.lastImport` is a getter because commit.js reassigns the binding
   it reads. */
function wire(){
  provide('blueprint.uploadDialog', bpUploadDialog);
  provide('blueprint.undoImport', bpUndoImport);
  provide('blueprint.lastImport', () => bpLastImport);

  /* The domain layer reports a rejected edit but does not own the toast:
     model/walls.js's tryRoomEdit refuses a fold-over and says so through here.
     See .claude/plans/decoupling.md §4, step 3. */
  provide('ui.flash', flash);

  /* Every committed change (core/tx.js) ends with one `changed`; the canvas
     answers with one draw on the next frame, however many changes landed in
     this one. The Library places hide the canvas, and setMode() draws on the
     way back to it. */
  on('changed', (scope, o) => { if(o && o.canvas && isCanvasMode(S.mode)) scheduleDraw(); });

  /* Who repaints when. Every mutation site that used to import a render
     function now names the panel instead (core/bus.js), and this is the only
     list of what those names mean. The order inside each repaint() call at the
     call site is preserved, so this is a swap, not a redesign. */
  on('paint:room',     renderRoom);
  on('paint:walls',    renderWalls);
  on('paint:roomSel',  renderRoomSel);
  on('paint:openings', renderOpen);
  on('paint:sel',      renderSel);
  on('paint:inv',      renderInv);
  on('paint:floorSel', renderFloorSel);
  on('paint:tree',     renderTree);
  on('paint:all',      renderAll);
  on('paint:libAll',   renderLibAll);

  /* Two commands rather than notifications: a canvas gesture can finish by
     putting the app in Room mode, or by making a different room the active
     one. Both used to be direct imports of plan/, which is the edge that fused
     canvas/ and plan/ into one cycle. */
  on('item:edit',       id => itemDialog(id));
  on('mode:set',        m  => setMode(m));
  on('layout:activate', id => activateLayout(id));

  /* Undo/redo repaint. core/history.js restores a snapshot and says so; which
     panels that makes stale is a question about the UI, and belongs here.
     Each of these is the exact call list the apply* function used to inline. */
  provide('repaint.afterRoomRestore', () => {
    renderRoom(); renderWalls(); renderRoomSel(); renderOpen(); draw();
  });
  provide('repaint.afterFurnRestore', () => { renderInv(); renderSel(); draw(); });
  provide('repaint.afterFloorRestore', () => { renderFloorSel(); draw(); });
  provide('repaint.histAvail', ({canUndo, canRedo}) => {
    const u=$('btnUndo'), r=$('btnRedo'); if(!u) return;
    u.disabled=!canUndo; r.disabled=!canRedo;
  });
}

async function boot(){
  wire();
  try{
    const raw=await Store.get(KEY);
    if(raw){
      const data=migrate(JSON.parse(raw));
      if(data){ setS(data); if(!S.layouts.some(l=>l.id===S.active)) S.active=S.layouts[0].id; }
    }
  }catch(e){}
  const pm=paramMode();
  if(pm) S.mode=pm;
  syncModeParam();
  $('unitSel').value=S.unit;
  $('showSwing').checked=S.showSwing; $('showDims').checked=S.showDims; $('showOpen').checked=S.showOpen; $('showWalk').checked=S.showWalk; $('showMeasure').checked=S.showMeasure; $('zoomSpeedSel').value=S.zoomSpeed;
  seedHistFor();
  nav.tab = S.mode==='marketplace' ? 'market' : 'library';
  nav.libFolderId = itemFolderOf(S.uiLib.libFolderId) ? S.uiLib.libFolderId : null;
  nav.marketFolderId = marketFolderOf(S.uiLib.marketFolderId) ? S.uiLib.marketFolderId : null;
  renderSnap(); applySections(); renderMode(); applyLayoutMode(); renderAll();
  if(isCanvasMode(S.mode)){ resize(); fit(); } else { setPendingFit(true); }
  if(!isCanvasMode(S.mode)) renderLibAll();
  ensureDefaultMarket().then(()=>{ if(!isCanvasMode(S.mode)) renderLibAll(); });
}

export {boot};
