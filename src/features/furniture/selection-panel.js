// @ts-check
/* What the Selection panel's buttons (selection-section.jsx) and the
   furniture shortcuts do to what is selected: turn it, take it away,
   duplicate it, put one down. Each only commits. */
import {bringToFront} from '../canvas/index.js';
import {bbox, centroid, norm360, worldPoly} from '../../kernel/geometry.js';
import {sel, selSet, selectClear, selectOnly, selectSet} from '../../kernel/selection.js';
import {L, RP, instOf, itemOf, roomMode, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {isBad, validate} from '../../kernel/model/validity.js';
import {flash} from '../../ui-kit/flash.js';
import {setMode} from '../mode/index.js';

/** @param {number} deg */
function rotate(deg){
  const inst=instOf(sel.value); if(!inst) return;
  const it=itemOf(inst.itemId); if(!it) return;
  const loose=isBad(inst), prev=inst.rot||0;
  transact('furn', ()=>{
    inst.rot=norm360(prev+deg);
    if(!loose && !validate(inst,worldPoly(inst,it)).ok){ inst.rot=prev; flash('No room to turn it'); }
  });
}
function removeSel(){
  if(!selSet.value.size) return;
  transact('furn', ()=>{ L().placed=L().placed.filter(p=>!selSet.value.has(p.id)); selectClear(); });
}
/** @param {string} itemId */
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
  transact('furn', ()=>{
    L().placed.push(inst);
    selectOnly(inst.id);
    if(roomMode()) setMode('furniture');
  });
}

function duplicateSel(){
  if(selSet.value.size<2) return;
  const srcIds=[...selSet.value];
  /** @type {string[]} */
  const newIds=[];
  transact('furn', ()=>{
    for(const id of srcIds){
      const src=instOf(id); if(!src) continue;
      const dupe={...src, id:uid()};
      L().placed.push(dupe);
      newIds.push(dupe.id);
    }
    if(!newIds.length) return;
    bringToFront(newIds);
    selectSet(newIds);
  });
}
export {rotate, removeSel, place, duplicateSel};
