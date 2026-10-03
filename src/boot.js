import {bpLastImport, bpUndoImport} from './blueprint/commit.js';
import {bpUploadDialog} from './blueprint/step1-upload.js';
import {mountCanvas} from './canvas/draw.js';
import {setupCanvas} from './canvas/setup.js';
import {mountMeasureBar} from './canvas/measure-tool.js';
import {fit, resize} from './canvas/camera.js';
import {seedHistFor} from './core/history.js';
import {migrate} from './core/migrate.js';
import {provide} from './core/registry.js';
import {S, isCanvasMode, setS} from './core/state.js';
import {KEY, Store} from './core/store.js';
import {marketFolderOf} from './library/adhoc-folders.js';
import {itemFolderOf} from './library/item-folders.js';
import {ensureDefaultMarket} from './library/market-subs.js';
import {nav} from './library/nav.js';
import {mountLibrary} from './library/shell.js';
import {mountFloorPanels} from './plan/floors.js';
import {mountItemList} from './plan/item-list.js';
import {activateLayout, mountTree} from './plan/layout-tree.js';
import {mountMode, paramMode, setMode, setPendingFit, syncModeParam} from './plan/mode.js';
import {mountRoomPanels} from './plan/room-panel.js';
import {mountSelPanel} from './plan/selection-panel.js';
import {flash} from './ui/flash.js';
import {mountSections} from './ui/panels.js';

/* Cross-feature entry points that cannot be plain imports without closing an
   import cycle. See src/core/registry.js for why each one is there.

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
     model/walls.js's tryRoomEdit refuses a fold-over and says so through here. */
  provide('ui.flash', flash);

  /* Two commands a canvas tool can end in: putting the app in Room mode, and
     making a different room the active one. A direct import of plan/ from
     canvas/ would fuse the two directories into one cycle. */
  provide('plan.setMode', setMode);
  provide('plan.activateLayout', activateLayout);
}

/* Every view, as an effect on the signals it shows. Each one renders once
   here, from the loaded project, and again whenever what it reads changes —
   which is why nothing that changes the project names a view. Order is only
   the order of that first paint. */
function mount(){
  mountMode();
  mountSections();
  mountRoomPanels();
  mountTree();
  mountItemList();
  mountSelPanel();
  mountFloorPanels();
  mountMeasureBar();
  mountLibrary();
  mountCanvas();
}

async function boot(){
  wire();
  setupCanvas();
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
  seedHistFor();
  nav.tab = S.mode==='marketplace' ? 'market' : 'library';
  nav.libFolderId = itemFolderOf(S.uiLib.libFolderId) ? S.uiLib.libFolderId : null;
  nav.marketFolderId = marketFolderOf(S.uiLib.marketFolderId) ? S.uiLib.marketFolderId : null;
  mount();
  if(isCanvasMode(S.mode)){ resize(); fit(); } else { setPendingFit(true); }
  ensureDefaultMarket();
}

export {boot};
