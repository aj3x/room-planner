// @ts-check
import {fit} from '../canvas/index.js';
import {floorHist, furnHist, histEntry, roomHist, snapFurn, snapRoom} from '../../kernel/history.js';
import {normLayout} from '../../kernel/migrate.js';
import {treeExpand, treeCollapse} from '../../kernel/selection.js';
import {S, blankLayout, floorOf, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {clampOpenings} from '../../kernel/walls.js';
import {activateLayout, setMode} from '../mode/index.js';
import {flash} from '../../ui-kit/flash.js';
import {askConfirm, moError} from '../../ui-kit/modal.js';
import {plural} from '../../ui-kit/panels.js';
import {bpEffExtWall, bpRebuild} from './draft.js';
import {bpDispose, bpState} from './state.js';

/* ---- blueprint: commit ----
   A room that fails the polygon check is left out and named, never silently created
   broken and never blocking the rooms that are fine. */
/** The last import, for "Undo this import": the floor, the rooms it made, the room active before, and whether the floor is new too.
    @type {{floorId: string, layoutIds: string[], prevActive: string, createdFloor: boolean}|null} */
let bpLastImport=null;
/** @returns {false|undefined} false keeps the dialog open */
function bpCommit(){
  const st=bpState, d=bpRebuild();
  if(!d.layouts.length){ moError('Nothing here could become a room yet — put at least one back from "Leave out"'); return false; }
  const target=st.targetFloorId ? floorOf(st.targetFloorId) : null;
  const extWall=bpEffExtWall();
  const floor=target || {id:uid(), name:bpFloorName(), parentId:null, extWall};
  /** @type {string[]} */
  const ids=[];
  /* Not on any undo stack (it creates a floor and N rooms); bpUndoImport is the way back. */
  transact('project', ()=>{
    if(!target) S.floors.push(floor);
    for(const l of d.layouts){
      delete l._bpRegion; delete l._bpPx;
      l.floorId=floor.id;
      normLayout(l);
      clampOpenings(l);
      S.layouts.push(l); ids.push(l.id);
    }
    bpSeedHistory(d.layouts, floor.id);
    bpLastImport={floorId:floor.id, layoutIds:ids, prevActive:S.active, createdFloor:!target};
    bpDispose();
    treeExpand(floor.id);
    activateLayout(ids[0]);
    setMode('floor');
  });
  const left=d.problems.length;
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
/** @param {import('../../kernel/types.js').Layout[]} created @param {string} floorId */
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
      transact('project', ()=>{
        S.layouts=S.layouts.filter(l=>!kill.has(l.id));
        if(imp.createdFloor) S.floors=S.floors.filter(f=>f.id!==imp.floorId);
        for(const id of kill){ delete roomHist[id]; delete furnHist[id]; }
        delete floorHist[imp.floorId];
        treeCollapse(imp.floorId);
        if(!S.layouts.length) S.layouts=[blankLayout()];
        activateLayout(S.layouts.some(l=>l.id===imp.prevActive) ? imp.prevActive : S.layouts[0].id);
        bpLastImport=null;
      });
      fit();
    });
}

export {bpLastImport, bpCommit, bpFloorName, bpSeedHistory, bpUndoImport};
