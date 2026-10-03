/* The room picked up on the floor, with its rotate handle, and the rooms
   marked for merge/delete. hitTest says whether a screen point is on the
   picked room's rotate handle. */

import {ctx, sx, sy, pathPoly} from '../canvas/index.js';
import {bbox} from '../../kernel/geometry.js';
import {floorSel, mergeSel} from '../../kernel/selection.js';
import {L, floorOf} from '../../kernel/state.js';
import {floorMembers} from '../../kernel/floor-place.js';

const floorRotHandle = P => { const b=bbox(P); return {x:sx((b.x0+b.x1)/2), y:sy(b.y0)-26}; };
function drawFloorSelection({C, members}){
  const selM=members.find(m=>m.l.id===floorSel.value);
  if(selM){
    ctx.save();
    pathPoly(selM.P);
    ctx.lineWidth=2; ctx.strokeStyle=C.accent; ctx.stroke();
    const h=floorRotHandle(selM.P), b=bbox(selM.P);
    ctx.beginPath(); ctx.moveTo(sx((b.x0+b.x1)/2), sy(b.y0)); ctx.lineTo(h.x,h.y);
    ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(h.x,h.y,6,0,Math.PI*2);
    ctx.fillStyle=C.surface; ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();
  }
  // rooms marked for merge/delete get a dashed outline — distinct from floorSel's solid
  // one, since these aren't being picked up to move, just earmarked for an action. Only
  // once a pair is actually marked, so a plain click's 1-room seed stays visually quiet.
  for(const id of mergeSel.value.size>=2 ? mergeSel.value : []){
    const m=members.find(x=>x.l.id===id); if(!m) continue;
    ctx.save();
    ctx.setLineDash([6,4]);
    pathPoly(m.P);
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; ctx.stroke();
    ctx.restore();
  }
}

const floorSelectionLayer = {
  id:'floor-selection', z:120, scene:'floor',
  deps(){ floorSel.value; mergeSel.value; },
  draw(ctx, view, f){ if(!f.empty) drawFloorSelection(f); },
  /* the picked room, if (px,py) is on its rotate handle */
  hitTest(px,py){
    const fl=floorOf(L().floorId);
    if(!fl || !floorSel.value) return null;
    const m=floorMembers(fl).find(x=>x.l.id===floorSel.value);
    if(!m) return null;
    const h=floorRotHandle(m.P);
    return Math.hypot(px-h.x,py-h.y)<14 ? m : null;
  }
};

export {floorSelectionLayer};
