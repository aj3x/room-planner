// @ts-check
import {mountCanvas, fit, resize, mountViewPrefs} from '../features/canvas/index.js';
import {setupCanvas} from './canvas-setup.js';
import {mountMeasureBar} from '../features/measure/index.js';
import {seedHistFor} from '../kernel/history.js';
import {migrate} from '../kernel/migrate.js';
import {S, isCanvasMode, setS} from '../kernel/state.js';
import {KEY, Store} from '../kernel/store.js';
import {marketFolderOf, ensureDefaultMarket} from '../features/marketplace/index.js';
import {itemFolderOf, nav, mountLibrary} from '../features/library/index.js';
import {mountFloorPanels} from '../features/floors/index.js';
import {mountItemList, mountSelPanel} from '../features/furniture/index.js';
import {mountTree} from '../features/layouts/index.js';
import {mountMode, paramMode, setPendingFit, syncModeParam} from '../features/mode/index.js';
import {mountRoomPanels} from '../features/room/index.js';
import {mountWallList} from '../features/walls/index.js';
import {mountOpeningList} from '../features/openings/index.js';
import {effect, notice, untracked} from '../kernel/signals.js';
import {flash} from '../ui-kit/flash.js';
import {mountSections} from '../ui-kit/panels.js';

/* Every view, as an effect on the signals it shows. Each one renders once
   here, from the loaded project, and again whenever what it reads changes —
   which is why nothing that changes the project names a view. Order is only
   the order of that first paint. */
function mount(){
  mountMode();
  mountSections();
  mountViewPrefs();
  mountRoomPanels();
  mountWallList();
  mountOpeningList();
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
