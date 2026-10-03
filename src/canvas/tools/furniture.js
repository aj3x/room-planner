/* Furniture mode: turning the selected item by its handle, dragging one or
   more items (Alt duplicates them first), and dragging out a marquee over
   empty floor to select. Every frame of a move or turn is a preview('furn');
   the pointerup commits once, so one drag is one undo step. */

import {bbox, norm360, worldPoly} from '../../core/geometry.js';
import {hexA} from '../../core/color.js';
import {snapFurn} from '../../core/history.js';
import {alignGuides, alignNote, sel, selSet, selectAdd, selectOnly, selectSet, selectToggle} from '../../core/selection.js';
import {signal} from '../../core/signals.js';
import {L, furnMode, instOf, itemOf, uid} from '../../core/state.js';
import {preview, transact} from '../../core/tx.js';
import {centreInside, isBad, slideToValid, validate} from '../../model/validity.js';
import {flash} from '../../ui/flash.js';
import {draw, scheduleDraw} from '../draw.js';
import {itemToolsLayer} from '../layers/item-tools.js';
import {PAL} from '../paint.js';
import {bringToFront, pickAt} from '../snap.js';
import {ctx, snapMM, wx, wy} from '../view.js';

/* the drag in flight: {mode:'move'|'rot'|'marquee', …} — replaced when one
   starts or ends, mutated in place while it moves */
const furnDrag = signal(null);

function furnDown(e,px,py){
  if(!e.altKey){
    const inst=itemToolsLayer.hitTest(px,py);
    if(inst){
      furnDrag.value = {mode:'rot', id:sel.value, start:inst.rot||0, a0:Math.atan2(wy(py)-inst.y, wx(px)-inst.x), loose:isBad(inst)};
      return furnitureTool;
    }
  }
  const hit=pickAt(wx(px),wy(py));
  if(hit && e.altKey){
    // Alt+drag: duplicate the clicked item (or the whole selection, if the
    // clicked item is already part of a multi-selection) and drag the copies,
    // leaving the originals in place. Snapshot BEFORE pushing the duplicates
    // so undo removes them entirely, as one step with the drag that follows.
    const srcIds = selSet.value.has(hit.id) && selSet.value.size>1 ? [...selSet.value] : [hit.id];
    const snap = snapFurn();
    const idMap = new Map();
    for(const id of srcIds){
      const src=instOf(id); if(!src) continue;
      const dupe={...src, id:uid()};
      L().placed.push(dupe);
      idMap.set(id, dupe.id);
    }
    const newIds=[...idMap.values()];
    if(!newIds.length) return null;
    bringToFront(newIds);
    selectSet(newIds);
    const anchorNew=idMap.get(hit.id);
    const starts=newIds.map(id=>{ const p=instOf(id); return {id,x:p.x,y:p.y}; });
    furnDrag.value = {mode:'move', ids:newIds, anchorId:anchorNew, dx:wx(px)-instOf(anchorNew).x, dy:wy(py)-instOf(anchorNew).y, starts, loose:isBad(instOf(anchorNew)), snap};
    preview('furn');   // the copies are committed with the drag, by furnUp
    return furnitureTool;
  }
  if(hit){
    if(e.shiftKey) selectToggle(hit.id);
    else if(!selSet.value.has(hit.id)) selectOnly(hit.id);
    bringToFront([...selSet.value]);
    const ids=[...selSet.value];
    const starts=ids.map(id=>{ const p=instOf(id); return {id,x:p.x,y:p.y}; });
    furnDrag.value = {mode:'move', ids, anchorId:hit.id, dx:wx(px)-hit.x, dy:wy(py)-hit.y, starts, loose:isBad(hit)};
  } else {
    furnDrag.value = {mode:'marquee', x0:px, y0:py, x1:px, y1:py, additive:e.shiftKey};
  }
  return furnitureTool;
}

function furnMove(px,py,mods){
  const d=furnDrag.value;
  if(!d) return;
  const pt=[wx(px),wy(py)];
  // nothing has moved yet: remember how things stood so Escape can put them back
  if(!d.snap) d.snap = snapFurn();

  if(d.mode==='marquee'){
    d.x1=px; d.y1=py;
    scheduleDraw(); return;
  }
  if(d.mode==='rot'){
    const inst=instOf(d.id); if(!inst) return;
    const it=itemOf(inst.itemId); if(!it) return;
    const a=Math.atan2(wy(py)-inst.y, wx(px)-inst.x);
    let deg=d.start+(a-d.a0)*180/Math.PI;
    if(!mods.shiftKey) deg=Math.round(deg/15)*15;
    const prev=inst.rot;
    inst.rot=norm360(deg);
    if(!d.loose && !validate(inst,worldPoly(inst,it)).ok) inst.rot=prev;
    preview('furn'); return;
  }
  // mode 'move': one or more furniture items, each clamped/validated
  // independently against walls/collisions (a group can end up slightly
  // uneven if one item hits something — accepted tradeoff over blocking the
  // whole group on a single collision)
  const anchor=instOf(d.anchorId); if(!anchor) return;
  let anx=pt[0]-d.dx, any=pt[1]-d.dy;
  const anchorIt=itemOf(anchor.itemId);
  const g=snapMM();
  if(g>0&&!mods.altKey&&anchorIt){
    const b=bbox(worldPoly({x:0,y:0,rot:anchor.rot},anchorIt));
    anx=Math.round((anx+b.x0)/g)*g-b.x0;
    any=Math.round((any+b.y0)/g)*g-b.y0;
  }
  const anchorStart=d.starts.find(s=>s.id===d.anchorId);
  const ddx=anx-anchorStart.x, ddy=any-anchorStart.y;
  for(const st of d.starts){
    const inst=instOf(st.id); const it=inst&&itemOf(inst.itemId);
    if(!inst||!it) continue;
    const nx=st.x+ddx, ny=st.y+ddy;
    const px0=inst.x, py0=inst.y;
    inst.x=nx; inst.y=ny;
    const v=validate(inst,worldPoly(inst,it));
    if(v.ok) d.loose=false;
    else if(d.loose){
      if(!centreInside(inst)){ inst.x=px0; inst.y=py0; }
    } else {
      // go as far toward the pointer as fits, per axis, so the piece meets the
      // wall flush rather than stopping wherever the last pointer event left it
      const p=slideToValid(inst,it,[px0,py0],[nx,ny]);
      if(Math.hypot(p[0]-px0,p[1]-py0)<0.01){ inst.x=px0; inst.y=py0; if(d.starts.length===1) flash(v.why); }
    }
  }
  preview('furn');
}

function furnUp(){
  const d=furnDrag.value;
  if(d.mode==='marquee'){
    const x0=Math.min(d.x0,d.x1), x1=Math.max(d.x0,d.x1);
    const y0=Math.min(d.y0,d.y1), y1=Math.max(d.y0,d.y1);
    const wa=[wx(x0),wy(y0)], wb=[wx(x1),wy(y1)];
    const rx0=Math.min(wa[0],wb[0]), rx1=Math.max(wa[0],wb[0]);
    const ry0=Math.min(wa[1],wb[1]), ry1=Math.max(wa[1],wb[1]);
    const hitIds=[];
    if(Math.hypot(x1-x0,y1-y0)>3){ // treat a near-zero-size drag as a plain empty click, not a marquee
      for(const p of L().placed){
        const it=itemOf(p.itemId); if(!it) continue;
        const b=bbox(worldPoly(p,it));
        if(b.x0<=rx1 && b.x1>=rx0 && b.y0<=ry1 && b.y1>=ry0) hitIds.push(p.id);
      }
    }
    if(d.additive) for(const id of hitIds) selectAdd(id);
    else selectSet(hitIds);
    if(hitIds.length) bringToFront(hitIds);
    furnDrag.value = null;
    return;
  }
  // the whole gesture is one undo step, recorded here and nowhere in between
  transact('furn', ()=>{ alignGuides.value = []; alignNote.value = ''; });
  furnDrag.value = null;
}

/* Escape mid-drag: put whatever was being dragged back exactly where it started */
function furnCancel(){
  const d=furnDrag.value;
  if(d.mode==='marquee'){ furnDrag.value = null; alignGuides.value = []; alignNote.value = ''; draw(); return; }
  if(d.snap) L().placed=JSON.parse(d.snap).placed;
  furnDrag.value = null; alignGuides.value = []; alignNote.value = '';
  // back where the gesture started, which is what storage and history already hold
  preview('furn');
}

function drawMarquee(){
  const d=furnDrag.value;
  if(!d||d.mode!=='marquee') return;
  const x0=Math.min(d.x0,d.x1), x1=Math.max(d.x0,d.x1);
  const y0=Math.min(d.y0,d.y1), y1=Math.max(d.y0,d.y1);
  const C=PAL();
  ctx.save();
  ctx.fillStyle=hexA(C.accent,.08);
  ctx.fillRect(x0,y0,x1-x0,y1-y0);
  ctx.setLineDash([5,4]); ctx.lineWidth=1.25; ctx.strokeStyle=C.accent;
  ctx.strokeRect(x0,y0,x1-x0,y1-y0);
  ctx.setLineDash([]);
  ctx.restore();
}
const marqueeOverlay = {
  id:'marquee', z:170, scene:'room',
  deps(){ furnDrag.value; },
  draw(){ drawMarquee(); }
};

const furnitureTool = {
  id:'furniture', autoPan:true,
  active: furnMode,
  onDown: furnDown, onMove: furnMove, onUp: furnUp, onCancel: furnCancel,
  overlay: marqueeOverlay,
};

export {furnitureTool, furnDrag};
