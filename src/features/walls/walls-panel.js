// @ts-check
/* The room's walls and structures: the commands the Selection panel's
   views of them (wall-props.jsx), the two lists (walls-list.jsx) and the
   wall dialog (wall-dialog.jsx) run. */
import {S, L, RP, roomMode, uid} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen} from '../../kernel/units.js';
import {bbox, centroid} from '../../kernel/geometry.js';
import {transact} from '../../kernel/tx.js';
import {syncWallOff, wallIsOff} from '../../kernel/model/walls.js';
import {stopDrawing} from '../canvas/index.js';
import {askConfirm} from '../../ui-kit/modal.jsx';
import {plural} from '../../ui-kit/panels.js';
import {setMode} from '../mode/index.js';

/** @param {{w: number, d: number}} sh */
const sizeLabelShape = sh => fmtLen(sh.w,S.unit)+' × '+fmtLen(sh.d,S.unit);
/** @param {string} id */
function deletePillar(id){
  transact('room', ()=>{
    L().room.pillars=L().room.pillars.filter(p=>p.id!==id);
    if(roomSel.value&&roomSel.value.kind==='pillar'&&roomSel.value.id===id) roomSel.value = null;
  });
}
/** @param {string} id */
function deleteIWall(id){
  transact('room', ()=>{
    L().room.iwalls=L().room.iwalls.filter(w=>w.id!==id);
    if(roomSel.value&&roomSel.value.kind==='iwall'&&roomSel.value.id===id) roomSel.value = null;
  });
}

/* Taking a wall away takes its doors and windows with it — there is nothing left for
   them to sit in. It is all one room transaction, so one undo brings the wall and
   everything that was in it back together. */
/** @param {number} i */
function toggleWallOff(i){
  const l=L(), room=l.room;
  syncWallOff(room);
  if(wallIsOff(room,i)){
    transact('room', ()=>{ /** @type {boolean[]} */(room.wallOff)[i]=false; });
    return;
  }
  const inWall=l.openings.filter(o=>o.wall===i);
  const apply=()=>{
    transact('room', ()=>{
      /** @type {boolean[]} */(room.wallOff)[i]=true;
      if(inWall.length) l.openings=l.openings.filter(o=>o.wall!==i);
    });
  };
  if(!inWall.length){ apply(); return; }
  askConfirm('Open this side?',
    'Wall '+(i+1)+' holds '+plural(inWall.length,'door or window')+'. Opening the side removes '+(inWall.length>1?'them':'it')+' too.',
    'Open this side', apply);
}

function addPillar(){
  stopDrawing();
  if(!roomMode()) setMode('room');
  const b=bbox(RP()), c=centroid(RP())||[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
  /** @type {import('../../kernel/types.js').Pillar} */
  const pl={id:uid(), x:c[0], y:c[1], rot:0, shape:{type:'rect',w:300,d:300}};
  transact('room', ()=>{
    L().room.pillars.push(pl);
    roomSel.value = {kind:'pillar', id:pl.id};
  });
}

export {sizeLabelShape, deletePillar, deleteIWall, toggleWallOff, addPillar};
