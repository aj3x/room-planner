import {mountCanvas} from './canvas/draw.js';
import {setupCanvas} from './canvas/setup.js';
import {mountMeasureBar} from './canvas/measure-tool.js';
import {fit, resize} from './canvas/camera.js';
import {seedHistFor} from './core/history.js';
import {migrate} from './core/migrate.js';
import {S, isCanvasMode, setS} from './core/state.js';
import {KEY, Store} from './core/store.js';
import {marketFolderOf} from './library/adhoc-folders.js';
import {itemFolderOf} from './library/item-folders.js';
import {ensureDefaultMarket} from './library/market-subs.js';
import {nav} from './library/nav.js';
import {mountLibrary} from './library/shell.js';
import {mountFloorPanels} from './plan/floors.js';
import {mountItemList} from './plan/item-list.js';
import {mountTree} from './plan/layout-tree.js';
import {mountMode, paramMode, setPendingFit, syncModeParam} from './plan/mode.js';
import {mountRoomPanels} from './plan/room-panel.js';
import {mountSelPanel} from './plan/selection-panel.js';
import {effect, notice, untracked} from './core/signals.js';
import {flash} from './ui/flash.js';
import {mountSections} from './ui/panels.js';

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
  /* what the domain layer reports (a refused edit), as a toast */
  effect(() => { const n=notice.value; if(n) untracked(() => flash(n.msg)); });
}

async function boot(){
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
