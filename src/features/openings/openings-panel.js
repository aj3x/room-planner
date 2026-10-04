// @ts-check
/* The room's doors and windows in the Room pane: the list, the Selection
   panel's view of one (called by room-panel.js's renderRoomSel; false when
   it has gone), and deleting one. The list is an effect (mountOpeningList). */
import {S, L, RP, openOf} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen, parseLen} from '../../kernel/units.js';
import {transact} from '../../kernel/tx.js';
import {pref, rev} from '../../kernel/signals.js';
import {KIND, openingDispOffset, setOpeningDispOffset} from '../../kernel/model/openings.js';
import {clampOpenings, wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {moreBtn} from '../../ui-kit/menu.js';
import {$} from '../../ui-kit/modal.js';
import {mountPanel} from '../../ui-kit/mount.js';
import {emptyRow, esc} from '../../ui-kit/panels.js';

function renderOpen(){
  const ul=$('openList'), os=L().openings;
  if(!os.length){ ul.innerHTML=emptyRow('None yet'); return; }
  ul.innerHTML=os.map(o=>{
    const on=roomSel.value&&roomSel.value.kind==='opening'&&roomSel.value.id===o.id;
    return `<li data-id="${o.id}" class="${on?'on':''}">
      <span class="lmain"><span class="nm">${KIND(o)}</span><span class="meta">Wall ${o.wall+1} · ${esc(fmtLen(o.width,S.unit))} wide</span></span>
      <span class="lact">${moreBtn('')}</span></li>`;
  }).join('');
}

/** @param {string} id */
function deleteOpening(id){
  transact('room', ()=>{
    L().openings=L().openings.filter(o=>o.id!==id);
    if(roomSel.value&&roomSel.value.id===id) roomSel.value = null;
  });
}
function renderOpeningProps(){
  const o=openOf(/** @type {{id: string}} */(roomSel.value).id);   // an opening is selected
  if(!o) return false;
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
    const wv=parseLen($('oW').value,S.unit), ov=parseLen($('oOff').value,S.unit);
    transact('room', ()=>{
      o.wall=+$('oWall').value;
      o.corner=$('oCorner').value==='ccw'?'ccw':'cw';
      const l2=wallOf(o.wall).len;
      if(isFinite(wv)&&wv>=100) o.width=Math.min(wv,l2);
      if(isFinite(ov)) setOpeningDispOffset(o,l2,ov);
      clampOpenings();
    });
  };
  $('oWall').addEventListener('change',go);
  $('oW').addEventListener('change',go);
  $('oCorner').addEventListener('change',go);
  $('oOff').addEventListener('change',go);
  if(isDoor){
    $('oType').addEventListener('change', ()=>{
      transact('room', ()=>{ o.dtype=$('oType').value; });
      const hb=$('oHingeBits'); if(hb) hb.hidden = o.dtype!=='hinge' && o.dtype!=='bifold';
      $('roomSelTitle').textContent=KIND(o);
    });
    $('oHinge').addEventListener('change', ()=>transact('room', ()=>{ o.hinge=$('oHinge').value; }));
    $('oSwing').addEventListener('change', ()=>transact('room', ()=>{ o.swing=$('oSwing').value; }));
  } else {
    $('oSill').addEventListener('change', ()=>{
      const v=parseLen($('oSill').value,S.unit);
      transact('room', ()=>{ o.sill = isFinite(v) ? v : 900; });
    });
  }
  $('oDel').addEventListener('click',()=>deleteOpening(o.id));
}
/* The doors and windows list, as an effect. */
function mountOpeningList(){
  mountPanel('openList', () => { rev.room.value; rev.project.value; pref('unit'); roomSel.value; }, renderOpen);
}
export {mountOpeningList, renderOpen, deleteOpening, renderOpeningProps};
