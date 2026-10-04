// @ts-check
/* The room's walls and structures: the wall dialog, and the commands the
   Selection panel's views of them (wall-props.jsx) and the two lists
   (walls-list.jsx) run. */
import {S, L, RP, roomMode, uid} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen, parseLen, unitWord} from '../../kernel/units.js';
import {bbox, centroid} from '../../kernel/geometry.js';
import {transact} from '../../kernel/tx.js';
import {setWallAngle, setWallLen, syncWallOff, wallAngle, wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {stopDrawing} from '../canvas/index.js';
import {askConfirm, moError, openModal} from '../../ui-kit/modal.jsx';
import {$} from '../../ui-kit/dom.js';
import {esc, plural} from '../../ui-kit/panels.js';
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

/* double-clicking a wall — in the plan or in the wall list — types its length in.
   Same two values as the Selected panel, just close to hand while you are in the plan. */
/** @param {number} i */
function wallDialog(i){
  if(!roomMode()) setMode('room');
  const P=RP();
  if(!(i>=0&&i<P.length)) return;
  const w=wallOf(i);
  roomSel.value = {kind:'wall', i};
  openModal('Wall '+(i+1), `
    <div class="field"><label for="wdLen">Length</label><input type="text" class="len" id="wdLen" value="${esc(fmtLen(w.len,S.unit))}"></div>
    <div class="field"><label for="wdAng">Direction</label><input type="number" class="deg" id="wdAng" step="1" value="${Math.round(wallAngle(i))}"><span class="unit">°</span></div>
    <p class="hint">The far corner moves, and the next wall follows. 0° points right, 90° up. Plain numbers are ${unitWord()}; 6'2", 75cm and 1.2m also work.</p>`,
    'Save',
    ()=>{
      const len=parseLen($('wdLen').value,S.unit);
      if(!isFinite(len)||len<100){ moError('Give the wall a length of at least 100 mm'); return false; }
      const deg=parseFloat($('wdAng').value);
      const ok=transact('room', ()=>{
        let ok=true;
        if(isFinite(deg) && Math.round(deg)!==Math.round(wallAngle(i))) ok=setWallAngle(i,deg);
        if(ok) ok=setWallLen(i,len);
        return ok;
      });
      if(!ok) return false;   // tryRoomEdit rolled it back and flashed why — stay open
    });
}
export {sizeLabelShape, deletePillar, deleteIWall, toggleWallOff, addPillar, wallDialog};
