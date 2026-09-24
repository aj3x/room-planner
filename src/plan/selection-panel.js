/* The Properties pane's Selected section, and the three things its buttons do
   to what is selected: turn it, take it away, duplicate it, put one down.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only: the blocks below are byte-identical to what stood there, and the
   `export` block at the end is the only line added.
*/
import {draw} from '../canvas/draw.js';
import {bringToFront} from '../canvas/snap.js';
import {bbox, centroid, norm360, worldPoly} from '../core/geometry.js';
import {commitFurn} from '../core/history.js';
import {hasOpen, openSizeLabel} from '../core/open-state.js';
import {sel, selSet, selectClear, selectOnly, selectSet} from '../core/selection.js';
import {L, RP, S, furnMode, instOf, itemOf, roomMode, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {fmtLen, parseLen} from '../core/units.js';
import {centreInside, getConflicts, isBad, validate} from '../model/validity.js';
import {flash} from '../ui/flash.js';
import {$, svgI} from '../ui/modal.js';
import {esc} from '../ui/panels.js';
import {itemDialog} from './item-dialog.js';
import {renderInv} from './item-list.js';
import {setMode} from './mode.js';

function rotate(deg){
  const inst=instOf(sel); if(!inst) return;
  const it=itemOf(inst.itemId); if(!it) return;
  const loose=isBad(inst), prev=inst.rot||0;
  inst.rot=norm360(prev+deg);
  if(!loose && !validate(inst,worldPoly(inst,it)).ok){ inst.rot=prev; flash('No room to turn it'); }
  draw(); renderSel(); save(); commitFurn();
}
function removeSel(){
  if(!selSet.size) return;
  L().placed=L().placed.filter(p=>!selSet.has(p.id));
  selectClear(); renderSel(); renderInv(); draw(); save(); commitFurn();
}
function place(itemId){
  const it=itemOf(itemId); if(!it) return;
  const b0=bbox(RP());
  const inst={id:uid(), itemId, x:0, y:0, rot:0};
  let done=false;
  for(const rot of [0,90]){
    inst.rot=rot;
    const b=bbox(worldPoly({x:0,y:0,rot},it));
    const step=Math.max(40,Math.min(b.w,b.h)/3);
    for(let y=b0.y0-b.y0; y<=b0.y1-b.y1+1 && !done; y+=step){
      for(let x=b0.x0-b.x0; x<=b0.x1-b.x1+1 && !done; x+=step){
        inst.x=x; inst.y=y;
        if(validate(inst,worldPoly(inst,it)).ok) done=true;
      }
    }
    if(done) break;
  }
  if(!done){
    const c=centroid(RP())||[(b0.x0+b0.x1)/2,(b0.y0+b0.y1)/2];
    inst.rot=0; inst.x=c[0]; inst.y=c[1];
    flash('Nowhere clear to put it — drag it where you want');
  }
  L().placed.push(inst);
  selectOnly(inst.id);
  if(roomMode()) setMode('furniture');
  renderInv(); renderSel(); draw(); save(); commitFurn();
}

function duplicateSel(){
  if(selSet.size<2) return;
  const srcIds=[...selSet];
  const newIds=[];
  for(const id of srcIds){
    const src=instOf(id); if(!src) continue;
    const dupe={...src, id:uid()};
    L().placed.push(dupe);
    newIds.push(dupe.id);
  }
  if(!newIds.length) return;
  bringToFront(newIds);
  selectSet(newIds);
  renderInv(); renderSel(); draw(); save(); commitFurn();
}
function renderSel(){
  const box=$('selBox');
  if(!furnMode() || selSet.size===0){
    box.closest('section').classList.toggle('is-empty', true);
    box.innerHTML=`<p class="hint">Click an item in the plan to move, turn or remove it.</p>
      <dl class="kbd">
        <dt>Nudge</dt><dd><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dd>
        <dt>Turn 90°</dt><dd><kbd>R</kbd></dd>
        <dt>Remove</dt><dd><kbd>Del</kbd></dd>
        <dt>Drag without snap</dt><dd><kbd>Alt</kbd></dd>
        <dt>Select multiple</dt><dd><kbd>Shift</kbd>+click, or drag on empty space</dd>
      </dl>`;
    return;
  }
  if(selSet.size>1){
    box.closest('section').classList.toggle('is-empty', false);
    box.innerHTML=`
      <div class="selhead"><span class="nm">${selSet.size} items selected</span></div>
      <div class="row actions">
        <button class="btn sm" id="sDupG">Duplicate</button>
        <button class="btn sm danger" id="sDelG">Remove</button>
      </div>
      <dl class="kbd">
        <dt>Nudge</dt><dd><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dd>
        <dt>Remove</dt><dd><kbd>Del</kbd></dd>
      </dl>`;
    $('sDelG').addEventListener('click', removeSel);
    $('sDupG').addEventListener('click', duplicateSel);
    return;
  }
  const inst=instOf(sel), it=inst&&itemOf(inst.itemId);
  box.closest('section').classList.toggle('is-empty', !(inst&&it));
  if(!inst||!it){
    selectClear();
    box.innerHTML=`<p class="hint">Click an item in the plan to move, turn or remove it.</p>
      <dl class="kbd">
        <dt>Nudge</dt><dd><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dd>
        <dt>Turn 90°</dt><dd><kbd>R</kbd></dd>
        <dt>Remove</dt><dd><kbd>Del</kbd></dd>
        <dt>Drag without snap</dt><dd><kbd>Alt</kbd></dd>
      </dl>`;
    return;
  }
  const b=bbox(worldPoly(inst,it)), rb=bbox(RP());
  const openWhy = hasOpen(it) ? getConflicts().openBad.get(inst.id) : null;
  const badWhy = isBad(inst) ? validate(inst,worldPoly(inst,it)).why : null;
  box.innerHTML=`
    <div class="selhead"><span class="sw" style="background:${it.color}"></span><span class="nm" title="${esc(it.name)}">${esc(it.name)}</span>
      <button class="btn quiet sm" id="sEdit" title="Change this item's size, shape or colour everywhere">Edit item…</button></div>
    ${badWhy?`<p class="hint warn">${esc(badWhy)}</p>`:''}
    ${openWhy?`<p class="hint warn">${esc(openWhy)}</p>`:''}
    <div class="field"><label for="sX">From left</label><input type="text" class="len" id="sX" value="${esc(fmtLen(b.x0-rb.x0,S.unit))}"></div>
    <div class="field"><label for="sY">From top</label><input type="text" class="len" id="sY" value="${esc(fmtLen(b.y0-rb.y0,S.unit))}"></div>
    <div class="field"><label for="sR">Angle</label>
      <span class="inline-ctl"><input type="number" class="deg" id="sR" step="15" value="${Math.round(inst.rot||0)}">
      <button class="btn icon" id="sRotL" title="Turn 90° left (Shift+R)" aria-label="Turn 90° left">${svgI('rot-l')}</button>
      <button class="btn icon" id="sRotR" title="Turn 90° right (R)" aria-label="Turn 90° right">${svgI('rot-r')}</button></span></div>
    ${hasOpen(it)?`<p class="hint">Opens out to ${esc(openSizeLabel(it))}.</p>`:''}
    <div class="row actions">
      <button class="btn sm" id="sDup">Duplicate</button>
      <button class="btn sm danger" id="sDel">Remove</button>
    </div>`;
  $('sEdit').addEventListener('click',()=>itemDialog(it.id));
  const move=(which,val)=>{
    const mm=parseLen(val,S.unit);
    if(!isFinite(mm)){ renderSel(); return; }
    const loose=isBad(inst), bb=bbox(worldPoly(inst,it)), ox=inst.x, oy=inst.y;
    if(which==='x') inst.x+=(rb.x0+mm)-bb.x0; else inst.y+=(rb.y0+mm)-bb.y0;
    if(!validate(inst,worldPoly(inst,it)).ok){
      if(loose){ if(!centreInside(inst)){ inst.x=ox; inst.y=oy; } }
      else { inst.x=ox; inst.y=oy; flash('No room there'); }
    }
    draw(); renderSel(); save();
  };
  $('sX').addEventListener('change',e=>move('x',e.target.value));
  $('sY').addEventListener('change',e=>move('y',e.target.value));
  $('sR').addEventListener('change',e=>rotate((parseFloat(e.target.value)||0)-(inst.rot||0)));
  $('sRotL').addEventListener('click',()=>rotate(-90));
  $('sRotR').addEventListener('click',()=>rotate(90));
  $('sDel').addEventListener('click',removeSel);
  $('sDup').addEventListener('click',()=>place(inst.itemId));
}
export {rotate, removeSel, place, duplicateSel, renderSel};
