// @ts-check
import {mountCanvas} from '../features/canvas/host.js';
import {fit, resize} from '../features/canvas/index.js';
import {setupCanvas} from './canvas-setup.js';
import {mountMeasureBar} from '../features/measure/index.js';
import {seedHistFor} from '../kernel/history.js';
import {migrate} from '../kernel/migrate.js';
import {S, isCanvasMode, setS} from '../kernel/state.js';
import {KEY, Store} from '../kernel/store.js';
import {marketFolderOf, ensureDefaultMarket} from '../features/marketplace/index.js';
import {itemFolderOf, mountLibraryPage, nav} from '../features/library/index.js';
import {mountMode, paramMode, setPendingFit, syncModeParam} from '../features/mode/index.js';
import {effect, loaded, notice, untracked} from '../kernel/signals.js';
import {flash} from '../ui-kit/flash.js';
import {mountSections} from '../ui-kit/panels.js';
import {mountModal} from '../ui-kit/modal.jsx';
import {fillSlots} from './slots.js';
import {mountChrome} from './chrome.jsx';
import {bindCanvas} from './canvas-events.js';

/* Every view, as an effect on the signals it shows. Each one renders once
   here, from the loaded project, and again whenever what it reads changes —
   which is why nothing that changes the project names a view. Order is only
   the order of that first paint, except that the pane sections' own views
   (mountFills, from app/slots.js) come before the section toggles are
   applied to their headings. */
/** @param {() => void} mountFills */
function mount(mountFills){
  mountMode();
  mountFills();
  mountSections();
  mountMeasureBar();
  mountCanvas();
  /* what the domain layer reports (a refused edit), as a toast */
  effect(() => { const n=notice.value; if(n) untracked(() => flash(n.msg)); });
}

/** @param {string} id @returns {HTMLElement} */
const shell = id => /** @type {HTMLElement} */(document.getElementById(id));   // index.html's

async function boot(){
  /* the page's parts, before the (maybe slow) storage read: each shows
     itself empty until the project is loaded */
  mountChrome();
  mountModal(shell('dialog'));
  mountLibraryPage(shell('paneLibrary'));
  bindCanvas();
  setupCanvas();
  const mountFills = fillSlots();   // the panes' headings, before the (maybe slow) storage read
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
  loaded.value = true;
  mount(mountFills);
  if(isCanvasMode(S.mode)){ resize(); fit(); } else { setPendingFit(true); }
  ensureDefaultMarket();
}

export {boot};
