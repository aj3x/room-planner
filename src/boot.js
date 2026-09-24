import {fit, resize} from './canvas/view.js';
import {seedHistFor} from './core/history.js';
import {migrate} from './core/migrate.js';
import {S, isCanvasMode, setS} from './core/state.js';
import {KEY, Store} from './core/store.js';
import {marketFolderOf} from './library/adhoc-folders.js';
import {itemFolderOf} from './library/item-folders.js';
import {ensureDefaultMarket} from './library/market-subs.js';
import {nav} from './library/nav.js';
import {renderLibAll} from './library/shell.js';
import {applyLayoutMode, paramMode, renderAll, renderMode, setPendingFit, syncModeParam} from './plan/mode.js';
import {renderSnap} from './plan/room-panel.js';
import {$} from './ui/modal.js';
import {applySections} from './ui/panels.js';

async function boot(){
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
