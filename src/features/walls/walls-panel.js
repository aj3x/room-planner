// @ts-check
/* The room's walls and structures: the Selection panel's view of a wall, a
   corner, a pillar or an interior wall, the wall dialog, and the commands
   their controls and the two lists (walls-list.jsx) run. The props
   renderers are called by room-panel.js's renderRoomSel and return false
   when their part has gone. */
import {S, L, RP, roomMode, uid} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen, parseLen, unitWord} from '../../kernel/units.js';
import {bbox, centroid, norm360} from '../../kernel/geometry.js';
import {transact} from '../../kernel/tx.js';
import {iwallAngle, iwallLen, iwallOf, nearestOnWalls, pillarOf, setIWallAngle, setIWallEndDist, setIWallLen, setWallAngle, setWallLen, syncWallOff, tryRoomEdit, wallAngle, wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {deleteCorner, splitWall} from './corners.js';
import {stopDrawing, squareCorner} from '../canvas/index.js';
import {flash} from '../../ui-kit/flash.js';
import {$, askConfirm, moError, openModal} from '../../ui-kit/modal.js';
import {esc, plural} from '../../ui-kit/panels.js';
import {setMode} from '../mode/index.js';
import {openingDialog} from '../openings/index.js';

/** @typedef {import('../../ui-kit/dom.js').FieldEvent} FieldEvent */

/* The render*Props below run only while something of their kind is picked
   (the Selection panel chooses by roomSel.value.kind), so they read its i or
   id through a cast. */
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

function renderWallProps(){
  const i=/** @type {{i: number}} */(roomSel.value).i, w=wallOf(i), room=L().room, off=wallIsOff(room,i);
  $('roomSelTitle').textContent='Wall '+(i+1);
  $('roomSelBox').innerHTML=`
    <div class="field"><label for="wLen">Length</label><input type="text" class="len" id="wLen" value="${esc(fmtLen(w.len,S.unit))}"></div>
    <div class="field"><label for="wAng">Direction</label><input type="number" class="deg" id="wAng" step="1" value="${Math.round(wallAngle(i))}"><span class="unit">°</span></div>
    <p class="hint">0° points right, 90° up. Changing either moves the far corner.</p>
    ${off?'<p class="hint">This side is open: the corner stays, the wall is gone. The room still keeps its floor area.</p>':''}
    <div class="row actions">
      ${off?'' : '<button class="btn sm" id="wDoor">Add door…</button><button class="btn sm" id="wWin">Add window…</button>'}
      <button class="btn sm" id="wSplit">Split</button>
      <button class="btn sm ${off?'':'danger'}" id="wOff">${off?'Put the wall back':'Open this side'}</button>
    </div>`;
  $('wOff').addEventListener('click',()=>toggleWallOff(i));
  $('wLen').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseLen(e.target.value,S.unit);
    transact('room', ()=>{ if(isFinite(v)&&v>=100) setWallLen(i,v); else flash('Give the wall a length'); });
  });
  $('wAng').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseFloat(e.target.value);
    transact('room', ()=>{ if(isFinite(v)) setWallAngle(i,v); });
  });
  if(!off){
    $('wDoor').addEventListener('click',()=>openingDialog(null,'door',i));
    $('wWin').addEventListener('click',()=>openingDialog(null,'window',i));
  }
  $('wSplit').addEventListener('click',()=>splitWall(i));
}
function renderCornerProps(){
  const i=/** @type {{i: number}} */(roomSel.value).i, P=RP(), p=P[i], b=bbox(P);
  if(!p) return false;   // the corner went away under the selection
  $('roomSelTitle').textContent='Corner '+(i+1);
  $('roomSelBox').innerHTML=`
    <div class="field"><label for="cX">From left</label><input type="text" class="len" id="cX" value="${esc(fmtLen(p[0]-b.x0,S.unit))}"></div>
    <div class="field"><label for="cY">From top</label><input type="text" class="len" id="cY" value="${esc(fmtLen(p[1]-b.y0,S.unit))}"></div>
    <p class="hint">Both walls meeting here move with the corner. Dragging it lines it up with the rest of the room; hold Alt for a free hand.</p>
    <div class="row actions"><button class="btn sm" id="cSq">Square this corner</button><button class="btn sm danger" id="cDel" ${P.length<=3?'disabled title="A room needs at least three corners"':''}>Remove corner</button></div>`;
  const go=()=>{
    const x=parseLen($('cX').value,S.unit), y=parseLen($('cY').value,S.unit);
    transact('room', ()=>{ if(isFinite(x)&&isFinite(y)) tryRoomEdit(()=>{ P[i]=[b.x0+x, b.y0+y]; }); });
  };
  $('cX').addEventListener('change',go);
  $('cY').addEventListener('change',go);
  $('cSq').addEventListener('click',()=>squareCorner(i));
  $('cDel').addEventListener('click',()=>deleteCorner(i));
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

function renderPillarProps(){
  const pl=pillarOf(/** @type {{id: string}} */(roomSel.value).id);
  if(!pl) return false;
  $('roomSelTitle').textContent='Pillar';
  $('roomSelBox').innerHTML=`
    <div class="field"><label for="plShape">Shape</label><select id="plShape">
      <option value="rect" ${pl.shape.type==='rect'?'selected':''}>Rectangle</option>
      <option value="ellipse" ${pl.shape.type==='ellipse'?'selected':''}>Round</option></select></div>
    <div class="field"><label for="plW">Width</label><input type="text" class="len" id="plW" value="${esc(fmtLen(pl.shape.w,S.unit))}"></div>
    <div class="field"><label for="plD">Depth</label><input type="text" class="len" id="plD" value="${esc(fmtLen(pl.shape.d,S.unit))}"></div>
    <div class="field"><label for="plRot">Rotation</label><input type="number" class="deg" id="plRot" step="1" value="${Math.round(pl.rot||0)}"><span class="unit">°</span></div>
    <p class="hint">Drag it in the plan to move it.</p>
    <div class="row actions"><button class="btn sm danger" id="plDel">Remove pillar</button></div>`;
  const go=()=>{
    const w=parseLen($('plW').value,S.unit), d=parseLen($('plD').value,S.unit);
    const rot=parseFloat($('plRot').value);
    transact('room', ()=>{
      pl.shape.type=$('plShape').value;
      if(isFinite(w)&&w>0) pl.shape.w=w;
      if(isFinite(d)&&d>0) pl.shape.d=d;
      if(isFinite(rot)) pl.rot=norm360(rot);
    });
  };
  $('plShape').addEventListener('change',go);
  $('plW').addEventListener('change',go);
  $('plD').addEventListener('change',go);
  $('plRot').addEventListener('change',go);
  $('plDel').addEventListener('click',()=>deletePillar(pl.id));
}
function renderIWallProps(){
  const w=iwallOf(/** @type {{id: string}} */(roomSel.value).id);
  if(!w) return false;
  const na=nearestOnWalls(w.a), nb=nearestOnWalls(w.b);
  $('roomSelTitle').textContent='Interior wall';
  $('roomSelBox').innerHTML=`
    <div class="field"><label for="iwLen">Length</label><input type="text" class="len" id="iwLen" value="${esc(fmtLen(iwallLen(w),S.unit))}"></div>
    <div class="field"><label for="iwAng">Direction</label><input type="number" class="deg" id="iwAng" step="1" value="${Math.round(iwallAngle(w))}"><span class="unit">°</span></div>
    <div class="field"><label for="iwT">Thickness</label><input type="text" class="len" id="iwT" value="${esc(fmtLen(w.t,S.unit))}"></div>
    <div class="field"><label for="iwDA" title="Gap from end A to wall ${na?na.i+1:'-'}">End A gap</label><input type="text" class="len" id="iwDA" value="${esc(fmtLen(na?na.d:0,S.unit))}" ${na?'':'disabled'}></div>
    <div class="field"><label for="iwDB" title="Gap from end B to wall ${nb?nb.i+1:'-'}">End B gap</label><input type="text" class="len" id="iwDB" value="${esc(fmtLen(nb?nb.d:0,S.unit))}" ${nb?'':'disabled'}></div>
    <p class="hint">Gaps are measured to wall ${na?na.i+1:'-'} and wall ${nb?nb.i+1:'-'}. Drag an end to resize or snap it; drag the middle to move it. Shift keeps it straight.</p>
    <div class="row actions"><button class="btn sm danger" id="iwDel">Remove wall</button></div>`;
  $('iwLen').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseLen(e.target.value,S.unit);
    transact('room', ()=>{ if(isFinite(v)&&v>=50) setIWallLen(w,v); else flash('Give the wall a length'); });
  });
  $('iwAng').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseFloat(e.target.value);
    transact('room', ()=>{ if(isFinite(v)) setIWallAngle(w,v); });
  });
  $('iwT').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseLen(e.target.value,S.unit);
    transact('room', ()=>{ if(isFinite(v)&&v>=10) w.t=v; else flash('Give the wall a thickness'); });
  });
  $('iwDA').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseLen(e.target.value,S.unit);
    transact('room', ()=>{ if(isFinite(v)&&v>=0) setIWallEndDist(w,'a',v); });
  });
  $('iwDB').addEventListener('change', (/** @type {FieldEvent} */e)=>{
    const v=parseLen(e.target.value,S.unit);
    transact('room', ()=>{ if(isFinite(v)&&v>=0) setIWallEndDist(w,'b',v); });
  });
  $('iwDel').addEventListener('click',()=>deleteIWall(w.id));
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
export {sizeLabelShape, deletePillar, deleteIWall, renderWallProps, renderCornerProps, toggleWallOff, renderPillarProps, renderIWallProps, addPillar, wallDialog};
