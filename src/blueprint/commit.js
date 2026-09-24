import {fit} from '../canvas/view.js';
import {floorHist, furnHist, histEntry, roomHist, snapFurn, snapRoom} from '../core/history.js';
import {normLayout} from '../core/migrate.js';
import {treeOpen} from '../core/selection.js';
import {S, blankLayout, floorOf, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {clampOpenings} from '../model/walls.js';
import {activateLayout} from '../plan/layout-tree.js';
import {renderAll, setMode} from '../plan/mode.js';
import {flash} from '../ui/flash.js';
import {askConfirm, moError} from '../ui/modal.js';
import {plural} from '../ui/panels.js';
import {bpEffExtWall, bpRebuild} from './draft.js';
import {bpDispose, bpState} from './state.js';

/* ---- blueprint: commit ----
   A room that fails the polygon check is left out and named, never silently created
   broken and never blocking the rooms that are fine. */
let bpLastImport=null;
function bpCommit(){
  const st=bpState, d=bpRebuild();
  if(!d.layouts.length){ moError('Nothing here could become a room yet — put at least one back from "Leave out"'); return false; }
  const target=st.targetFloorId ? floorOf(st.targetFloorId) : null;
  const extWall=bpEffExtWall();
  const floor=target || {id:uid(), name:bpFloorName(), parentId:null, extWall};
  if(!target) S.floors.push(floor);
  const ids=[];
  for(const l of d.layouts){
    delete l._bpRegion; delete l._bpPx;
    l.floorId=floor.id;
    normLayout(l);
    clampOpenings(l);
    S.layouts.push(l); ids.push(l.id);
  }
  bpSeedHistory(d.layouts, floor.id);
  bpLastImport={floorId:floor.id, layoutIds:ids, prevActive:S.active, createdFloor:!target};
  const left=d.problems.length;
  bpDispose();
  treeOpen.add(floor.id);
  activateLayout(ids[0]);
  setMode('floor');
  renderAll(); save();
  flash(`${plural(ids.length,'room')} added to ${floor.name}${left?` — ${plural(left,'room')} left out`:''}.`);
}
function bpFloorName(){
  const base='Ground floor';
  let n=base, i=2;
  while(S.floors.some(f=>f.name===n)) n=base+' '+(i++);
  return n;
}
/* each imported room needs its own pristine baseline, or undo inside it has nowhere
   to get back to */
function bpSeedHistory(created, floorId){
  const keep=S.active;
  for(const l of created){ S.active=l.id; histEntry(roomHist,snapRoom); histEntry(furnHist,snapFurn); }
  S.active=keep;
  delete floorHist[floorId];
}
function bpUndoImport(){
  if(!bpLastImport) return;
  const imp=bpLastImport;
  const n=imp.layoutIds.length;
  askConfirm('Undo this import?',
    plural(n,'room')+(imp.createdFloor?(n===1?' and the floor it sits on':' and the floor they sit on'):'')+' will be removed.',
    'Undo import', ()=>{
      const kill=new Set(imp.layoutIds);
      S.layouts=S.layouts.filter(l=>!kill.has(l.id));
      if(imp.createdFloor) S.floors=S.floors.filter(f=>f.id!==imp.floorId);
      for(const id of kill){ delete roomHist[id]; delete furnHist[id]; }
      delete floorHist[imp.floorId];
      treeOpen.delete(imp.floorId);
      if(!S.layouts.length) S.layouts=[blankLayout()];
      activateLayout(S.layouts.some(l=>l.id===imp.prevActive) ? imp.prevActive : S.layouts[0].id);
      bpLastImport=null;
      renderAll(); fit(); save();
    });
}

export {bpLastImport, bpCommit, bpFloorName, bpSeedHistory, bpUndoImport};
