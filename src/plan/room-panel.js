/* The Room pane's lists: the snap-size picker, the wall list and the
   structures list (pillars and interior walls), plus the two row helpers the
   other panels share.

   Extracted from index.html in Phase 3, move-only: the block below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   renderRoom, immediately above these in the monolith, did not come. It is
   part of the 48-name reference cycle between the Plan side panels and the
   Library UI (see .claude/plans/refactor-split.md, the plan/ round), and so
   are the listeners that follow renderObstacles here.

   Note for anyone reading renderSnap: it silently rewrites S.snap to the third
   entry of the list when the current value is not in it. That is pre-existing
   behaviour, characterized by the baseline, and moving it does not change it.
*/
import {esc} from '../ui/panels.js';
import {moreBtn} from '../ui/menu.js';
import {$} from '../ui/modal.js';
import {S, L, RP} from '../core/state.js';
import {roomSel} from '../core/selection.js';
import {fmtLen, SNAPS} from '../core/units.js';
import {wallOf, wallIsOff, wallAngle, iwallLen} from '../model/walls.js';
import {deleteCorner, splitWall} from '../canvas/corners.js';
import {draw} from '../canvas/draw.js';
import {squareCorner} from '../canvas/snap.js';
import {bbox, norm360, polyArea} from '../core/geometry.js';
import {commitRoom} from '../core/history.js';
import {setRoomSel} from '../core/selection.js';
import {openOf, roomMode} from '../core/state.js';
import {save} from '../core/store.js';
import {fmtArea, parseLen} from '../core/units.js';
import {openingDispOffset, setOpeningDispOffset} from '../model/openings.js';
import {clampOpenings, isRectRoom, iwallAngle, iwallOf, nearestOnWalls, pillarOf, setIWallAngle, setIWallEndDist, setIWallLen, setRectSize, setWallAngle, setWallLen, syncWallOff, tryRoomEdit} from '../model/walls.js';
import {flash} from '../ui/flash.js';
import {askConfirm} from '../ui/modal.js';
import {plural} from '../ui/panels.js';
import {openingDialog} from './opening-dialog.js';

import {drawState, wallDrawState} from '../canvas/interaction-state.js';
import {cancelCustomDraw} from '../canvas/room-draw.js';
import {cancelWallDraw} from '../canvas/wall-draw.js';
import {centroid} from '../core/geometry.js';
import {uid} from '../core/state.js';
import {unitWord} from '../core/units.js';
import {moError, openModal} from '../ui/modal.js';
import {setMode} from './mode.js';
function renderSnap(){
  const list=(S.unit==='ftin'||S.unit==='in')?SNAPS.imperial:SNAPS.metric;
  const s=$('snapSel');
  s.innerHTML=list.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
  if(!list.some(([v])=>v===S.snap)) S.snap=list[2][0];
  s.value=S.snap;
}
function renderWalls(){
  const ul=$('wallList'), P=RP(), room=L().room;
  ul.innerHTML=P.map((_,i)=>{
    const w=wallOf(i);
    const on=roomSel&&roomSel.kind==='wall'&&roomSel.i===i;
    const meta = wallIsOff(room,i) ? 'Open · '+esc(fmtLen(w.len,S.unit))
                                   : esc(fmtLen(w.len,S.unit))+' · '+Math.round(wallAngle(i))+'°';
    return `<li data-i="${i}" class="${on?'on':''}">
      <span class="nm">Wall ${i+1}</span>
      <span class="lmeta">${meta}</span></li>`;
  }).join('');
  renderObstacles();
}
const sizeLabelShape = sh => fmtLen(sh.w,S.unit)+' × '+fmtLen(sh.d,S.unit);
const emptyRow = msg => `<li class="list-empty"><div class="empty">${msg}</div></li>`;
function renderObstacles(){
  const ul=$('structList'), room=L().room;
  let pn=0, wn=0;
  const rows=[
    ...room.pillars.map(pl=>({kind:'pillar', id:pl.id, label:'Pillar '+(++pn), dim:sizeLabelShape(pl.shape)})),
    ...room.iwalls.map(w=>({kind:'iwall', id:w.id, label:'Interior wall '+(++wn), dim:fmtLen(iwallLen(w),S.unit)}))
  ];
  if(!rows.length){ ul.innerHTML=emptyRow('None yet'); return; }
  ul.innerHTML=rows.map(r=>{
    const on=roomSel&&roomSel.kind===r.kind&&roomSel.id===r.id;
    return `<li data-kind="${r.kind}" data-id="${r.id}" class="${on?'on':''}">
      <span class="nm">${esc(r.label)}</span><span class="lmeta">${esc(r.dim)}</span>
      <span class="lact">${moreBtn('')}</span></li>`;
  }).join('');
}

const KIND = o => o.kind==='window' ? 'Window' : (o.dtype==='slide'?'Sliding door':o.dtype==='open'?'Doorway':o.dtype==='bifold'?'Bi-fold door':'Hinged door');
function renderOpen(){
  const ul=$('openList'), os=L().openings;
  if(!os.length){ ul.innerHTML=emptyRow('None yet'); return; }
  ul.innerHTML=os.map(o=>{
    const on=roomSel&&roomSel.kind==='opening'&&roomSel.id===o.id;
    return `<li data-id="${o.id}" class="${on?'on':''}">
      <span class="lmain"><span class="nm">${KIND(o)}</span><span class="meta">Wall ${o.wall+1} · ${esc(fmtLen(o.width,S.unit))} wide</span></span>
      <span class="lact">${moreBtn('')}</span></li>`;
  }).join('');
}


/* ---- Phase 3, the SCC commit: the rest of this file's region, which could
   not move until the whole 49-name component could. Move-only. ---- */
function renderRoom(){
  const r=L().room;
  const box=$('rectDims');
  if(isRectRoom()){
    const b=bbox(RP());
    box.innerHTML=`<div class="field"><label for="roomW">Width</label><input type="text" class="len" id="roomW" value="${esc(fmtLen(b.w,S.unit))}"></div>
      <div class="field"><label for="roomD">Depth</label><input type="text" class="len" id="roomD" value="${esc(fmtLen(b.h,S.unit))}"></div>`;
    const go=()=>{
      const w=parseLen($('roomW').value,S.unit), d=parseLen($('roomD').value,S.unit);
      if(isFinite(w)&&isFinite(d)&&w>200&&d>200) setRectSize(w,d);
      renderRoom(); renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
    };
    $('roomW').addEventListener('change',go);
    $('roomD').addEventListener('change',go);
  } else {
    const b=bbox(RP());
    box.innerHTML=`<div class="field"><label>Bounds</label><span>${esc(fmtLen(b.w,S.unit))} × ${esc(fmtLen(b.h,S.unit))}</span></div>`;
  }
  $('wallT').value=fmtLen(r.wall,S.unit);
  $('floorCol').value=r.floor;
  $('floorHex').value=r.floor; $('floorHex').classList.remove('bad');
  $('trimOn').checked=!!r.trimOn;
  $('trimD').value=fmtLen(r.trim,S.unit);
  $('trimD').disabled=!r.trimOn;
  $('areaOut').textContent=fmtArea(polyArea(RP()),S.unit);
}

function deletePillar(id){
  L().room.pillars=L().room.pillars.filter(p=>p.id!==id);
  if(roomSel&&roomSel.kind==='pillar'&&roomSel.id===id) setRoomSel(null);
  renderRoomSel(); renderWalls(); draw(); save(); commitRoom();
}
function deleteIWall(id){
  L().room.iwalls=L().room.iwalls.filter(w=>w.id!==id);
  if(roomSel&&roomSel.kind==='iwall'&&roomSel.id===id) setRoomSel(null);
  renderRoomSel(); renderWalls(); draw(); save(); commitRoom();
}

function renderRoomSel(){
  const box=$('roomSelBox'), t=$('roomSelTitle');
  box.closest('section').classList.toggle('is-empty', !(roomMode()&&roomSel));
  if(!roomMode() || !roomSel){
    t.textContent='Selection';
    box.innerHTML='<p class="hint">Click a wall, corner, door or pillar in the plan to change it here.</p>';
    return;
  }
  if(roomSel.kind==='wall') return renderWallProps();
  if(roomSel.kind==='corner') return renderCornerProps();
  if(roomSel.kind==='pillar') return renderPillarProps();
  if(roomSel.kind==='iwall') return renderIWallProps();
  return renderOpeningProps();
}

function renderWallProps(){
  const i=roomSel.i, w=wallOf(i), room=L().room, off=wallIsOff(room,i);
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
  $('wLen').addEventListener('change', e=>{
    const v=parseLen(e.target.value,S.unit);
    if(isFinite(v)&&v>=100) setWallLen(i,v); else flash('Give the wall a length');
    renderRoom(); renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  $('wAng').addEventListener('change', e=>{
    const v=parseFloat(e.target.value);
    if(isFinite(v)) setWallAngle(i,v);
    renderRoom(); renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  if(!off){
    $('wDoor').addEventListener('click',()=>openingDialog(null,'door',i));
    $('wWin').addEventListener('click',()=>openingDialog(null,'window',i));
  }
  $('wSplit').addEventListener('click',()=>splitWall(i));
}
function renderCornerProps(){
  const i=roomSel.i, P=RP(), p=P[i], b=bbox(P);
  if(!p){ setRoomSel(null); return renderRoomSel(); }   // the corner went away under the selection
  $('roomSelTitle').textContent='Corner '+(i+1);
  $('roomSelBox').innerHTML=`
    <div class="field"><label for="cX">From left</label><input type="text" class="len" id="cX" value="${esc(fmtLen(p[0]-b.x0,S.unit))}"></div>
    <div class="field"><label for="cY">From top</label><input type="text" class="len" id="cY" value="${esc(fmtLen(p[1]-b.y0,S.unit))}"></div>
    <p class="hint">Both walls meeting here move with the corner. Dragging it lines it up with the rest of the room; hold Alt for a free hand.</p>
    <div class="row actions"><button class="btn sm" id="cSq">Square this corner</button><button class="btn sm danger" id="cDel" ${P.length<=3?'disabled title="A room needs at least three corners"':''}>Remove corner</button></div>`;
  const go=()=>{
    const x=parseLen($('cX').value,S.unit), y=parseLen($('cY').value,S.unit);
    if(isFinite(x)&&isFinite(y)) tryRoomEdit(()=>{ P[i]=[b.x0+x, b.y0+y]; });
    renderRoom(); renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  };
  $('cX').addEventListener('change',go);
  $('cY').addEventListener('change',go);
  $('cSq').addEventListener('click',()=>squareCorner(i));
  $('cDel').addEventListener('click',()=>deleteCorner(i));
}
/* Taking a wall away takes its doors and windows with it — there is nothing left for
   them to sit in. It all goes through commitRoom, so one undo brings the wall and
   everything that was in it back together. */
function toggleWallOff(i){
  const l=L(), room=l.room;
  syncWallOff(room);
  if(wallIsOff(room,i)){
    room.wallOff[i]=false;
    renderRoom(); renderWalls(); renderRoomSel(); renderOpen(); draw(); save(); commitRoom();
    return;
  }
  const inWall=l.openings.filter(o=>o.wall===i);
  const apply=()=>{
    room.wallOff[i]=true;
    if(inWall.length) l.openings=l.openings.filter(o=>o.wall!==i);
    renderRoom(); renderWalls(); renderRoomSel(); renderOpen(); draw(); save(); commitRoom();
  };
  if(!inWall.length){ apply(); return; }
  askConfirm('Open this side?',
    'Wall '+(i+1)+' holds '+plural(inWall.length,'door or window')+'. Opening the side removes '+(inWall.length>1?'them':'it')+' too.',
    'Open this side', apply);
}

function renderPillarProps(){
  const pl=pillarOf(roomSel.id);
  if(!pl){ setRoomSel(null); return renderRoomSel(); }
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
    pl.shape.type=$('plShape').value;
    const w=parseLen($('plW').value,S.unit), d=parseLen($('plD').value,S.unit);
    if(isFinite(w)&&w>0) pl.shape.w=w;
    if(isFinite(d)&&d>0) pl.shape.d=d;
    const rot=parseFloat($('plRot').value);
    if(isFinite(rot)) pl.rot=norm360(rot);
    renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  };
  $('plShape').addEventListener('change',go);
  $('plW').addEventListener('change',go);
  $('plD').addEventListener('change',go);
  $('plRot').addEventListener('change',go);
  $('plDel').addEventListener('click',()=>deletePillar(pl.id));
}
function renderIWallProps(){
  const w=iwallOf(roomSel.id);
  if(!w){ setRoomSel(null); return renderRoomSel(); }
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
  $('iwLen').addEventListener('change', e=>{
    const v=parseLen(e.target.value,S.unit);
    if(isFinite(v)&&v>=50) setIWallLen(w,v); else flash('Give the wall a length');
    renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  $('iwAng').addEventListener('change', e=>{
    const v=parseFloat(e.target.value);
    if(isFinite(v)) setIWallAngle(w,v);
    renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  $('iwT').addEventListener('change', e=>{
    const v=parseLen(e.target.value,S.unit);
    if(isFinite(v)&&v>=10) w.t=v; else flash('Give the wall a thickness');
    renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  $('iwDA').addEventListener('change', e=>{
    const v=parseLen(e.target.value,S.unit);
    if(isFinite(v)&&v>=0) setIWallEndDist(w,'a',v);
    renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  $('iwDB').addEventListener('change', e=>{
    const v=parseLen(e.target.value,S.unit);
    if(isFinite(v)&&v>=0) setIWallEndDist(w,'b',v);
    renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
  });
  $('iwDel').addEventListener('click',()=>deleteIWall(w.id));
}

function deleteOpening(id){
  L().openings=L().openings.filter(o=>o.id!==id);
  if(roomSel&&roomSel.id===id) setRoomSel(null);
  renderOpen(); renderRoomSel(); draw(); save(); commitRoom();
}
function renderOpeningProps(){
  const o=openOf(roomSel.id);
  if(!o){ setRoomSel(null); return renderRoomSel(); }
  const len=wallOf(o.wall).len;
  o.corner = o.corner==='ccw' ? 'ccw' : 'cw';
  const isDoor=o.kind==='door';
  const hingeBits = isDoor && (o.dtype==='hinge'||o.dtype==='bifold');
  $('roomSelTitle').textContent=KIND(o);
  $('roomSelBox').innerHTML=`
    <div class="field"><label for="oWall">Wall</label><select id="oWall">${RP().map((_,i)=>wallIsOff(L().room,i)&&i!==o.wall?'':`<option value="${i}" ${i===o.wall?'selected':''}>Wall ${i+1}</option>`).join('')}</select></div>
    <div class="field"><label for="oW">Width</label><input type="text" class="len" id="oW" value="${esc(fmtLen(o.width,S.unit))}"></div>
    <div class="field"><label for="oCorner">From</label><select id="oCorner">
      <option value="cw" ${o.corner==='cw'?'selected':''}>Near corner</option>
      <option value="ccw" ${o.corner==='ccw'?'selected':''}>Far corner</option></select></div>
    <div class="field"><label for="oOff">Offset</label><input type="text" class="len" id="oOff" value="${esc(fmtLen(openingDispOffset(o,len),S.unit))}"></div>
    ${isDoor ? `
      <div class="field"><label for="oType">Type</label><select id="oType">
        <option value="hinge" ${o.dtype==='hinge'?'selected':''}>Hinged</option>
        <option value="bifold" ${o.dtype==='bifold'?'selected':''}>Bi-fold</option>
        <option value="slide" ${o.dtype==='slide'?'selected':''}>Sliding</option>
        <option value="open" ${o.dtype==='open'?'selected':''}>Open doorway</option></select></div>
      <div id="oHingeBits" ${hingeBits?'':'hidden'}>
        <div class="field"><label for="oHinge">Hinge</label><select id="oHinge">
          <option value="start" ${(o.hinge||'start')==='start'?'selected':''}>Near corner</option>
          <option value="end" ${o.hinge==='end'?'selected':''}>Far corner</option></select></div>
        <div class="field"><label for="oSwing">Swings</label><select id="oSwing">
          <option value="in" ${(o.swing||'in')==='in'?'selected':''}>Into room</option>
          <option value="out" ${o.swing==='out'?'selected':''}>Out of room</option></select></div>
      </div>` : `
      <div class="field"><label for="oSill">Sill height</label><input type="text" class="len" id="oSill" value="${esc(fmtLen(o.sill||900,S.unit))}"></div>
      <p class="hint">Sill height is a note for you; it doesn't change the plan.</p>`}
    <p class="hint">Wall ${o.wall+1} is ${esc(fmtLen(len,S.unit))} long. Drag the circle in the plan to slide it along, or onto another wall.</p>
    <div class="row actions"><button class="btn sm danger" id="oDel">Delete</button></div>`;
  const go=()=>{
    const wv=parseLen($('oW').value,S.unit);
    o.wall=+$('oWall').value;
    o.corner=$('oCorner').value==='ccw'?'ccw':'cw';
    const l2=wallOf(o.wall).len;
    if(isFinite(wv)&&wv>=100) o.width=Math.min(wv,l2);
    const ov=parseLen($('oOff').value,S.unit);
    if(isFinite(ov)) setOpeningDispOffset(o,l2,ov);
    clampOpenings();
    renderOpen(); renderRoomSel(); draw(); save(); commitRoom();
  };
  $('oWall').addEventListener('change',go);
  $('oW').addEventListener('change',go);
  $('oCorner').addEventListener('change',go);
  $('oOff').addEventListener('change',go);
  if(isDoor){
    $('oType').addEventListener('change', ()=>{
      o.dtype=$('oType').value;
      const hb=$('oHingeBits'); if(hb) hb.hidden = o.dtype!=='hinge' && o.dtype!=='bifold';
      $('roomSelTitle').textContent=KIND(o);
      renderOpen(); draw(); save(); commitRoom();
    });
    $('oHinge').addEventListener('change', ()=>{ o.hinge=$('oHinge').value; draw(); save(); commitRoom(); });
    $('oSwing').addEventListener('change', ()=>{ o.swing=$('oSwing').value; draw(); save(); commitRoom(); });
  } else {
    $('oSill').addEventListener('change', ()=>{
      const v=parseLen($('oSill').value,S.unit);
      o.sill = isFinite(v) ? v : 900;
      save(); commitRoom();
    });
  }
  $('oDel').addEventListener('click',()=>deleteOpening(o.id));
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
function addPillar(){
  if(wallDrawState) cancelWallDraw();
  if(drawState) cancelCustomDraw();
  if(!roomMode()) setMode('room');
  const b=bbox(RP()), c=centroid(RP())||[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
  const pl={id:uid(), x:c[0], y:c[1], rot:0, shape:{type:'rect',w:300,d:300}};
  L().room.pillars.push(pl);
  setRoomSel({kind:'pillar', id:pl.id});
  renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
}

/* double-clicking a wall — in the plan or in the wall list — types its length in.
   Same two values as the Selected panel, just close to hand while you are in the plan. */
function wallDialog(i){
  if(!roomMode()) setMode('room');
  const P=RP();
  if(!(i>=0&&i<P.length)) return;
  const w=wallOf(i);
  setRoomSel({kind:'wall', i});
  renderWalls(); renderRoomSel(); draw();
  openModal('Wall '+(i+1), `
    <div class="field"><label for="wdLen">Length</label><input type="text" class="len" id="wdLen" value="${esc(fmtLen(w.len,S.unit))}"></div>
    <div class="field"><label for="wdAng">Direction</label><input type="number" class="deg" id="wdAng" step="1" value="${Math.round(wallAngle(i))}"><span class="unit">°</span></div>
    <p class="hint">The far corner moves, and the next wall follows. 0° points right, 90° up. Plain numbers are ${unitWord()}; 6'2", 75cm and 1.2m also work.</p>`,
    'Save',
    ()=>{
      const len=parseLen($('wdLen').value,S.unit);
      if(!isFinite(len)||len<100){ moError('Give the wall a length of at least 100 mm'); return false; }
      const deg=parseFloat($('wdAng').value);
      let ok=true;
      if(isFinite(deg) && Math.round(deg)!==Math.round(wallAngle(i))) ok=setWallAngle(i,deg);
      if(ok) ok=setWallLen(i,len);
      renderRoom(); renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
      if(!ok) return false;   // tryRoomEdit rolled it back and flashed why — stay open
    });
}
export {renderSnap, renderWalls, sizeLabelShape, emptyRow, renderObstacles, KIND, renderOpen, renderRoom, deletePillar, deleteIWall, renderRoomSel, renderWallProps, renderCornerProps, toggleWallOff, renderPillarProps, renderIWallProps, deleteOpening, renderOpeningProps, addPillar, wallDialog};
