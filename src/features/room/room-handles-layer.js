// @ts-check
/* Room mode's editing handles: the selected pillar, interior wall or wall
   picked out in accent, a square on every corner, a dot on every opening.
   Drawn over everything but the measurements and tool overlays. */

import {ctx, sx, sy, PAL, pathPoly} from '../canvas/index.js';
import {worldPoly} from '../../kernel/geometry.js';
import {roomSel} from '../../kernel/selection.js';
import {L, RP, roomMode} from '../../kernel/state.js';
import {openGeom} from '../../kernel/model/openings.js';
import {iwallPoly, wallOf} from '../../kernel/model/walls.js';

function drawHandles(){
  const P=RP(), C=PAL(), r=L().room;
  const pl=roomSel.value&&roomSel.value.kind==='pillar'&&r.pillars.find(q=>q.id===roomSel.value?.id);
  if(pl){
    pathPoly(worldPoly(pl,pl));
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; ctx.stroke();
  }
  const iw=roomSel.value&&roomSel.value.kind==='iwall'&&r.iwalls.find(q=>q.id===roomSel.value?.id);
  if(iw){
    pathPoly(iwallPoly(iw));
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; ctx.stroke();
    for(const p of [iw.a,iw.b]){
      ctx.beginPath(); ctx.rect(sx(p[0])-5,sy(p[1])-5,10,10);
      ctx.fillStyle=C.surface; ctx.fill(); ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
    }
  }
  if(roomSel.value&&roomSel.value.kind==='wall'){
    const w=wallOf(roomSel.value.i);
    ctx.beginPath(); ctx.moveTo(sx(w.a[0]),sy(w.a[1])); ctx.lineTo(sx(w.b[0]),sy(w.b[1]));
    ctx.strokeStyle=C.accent; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke(); ctx.lineCap='butt';
  }
  for(let i=0;i<P.length;i++){
    const on = roomSel.value&&roomSel.value.kind==='corner'&&roomSel.value.i===i;
    ctx.beginPath(); ctx.rect(sx(P[i][0])-5,sy(P[i][1])-5,10,10);
    ctx.fillStyle = on?C.accent:C.surface; ctx.fill();
    ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  }
  for(const o of L().openings){
    const g=openGeom(o), on=roomSel.value&&roomSel.value.kind==='opening'&&roomSel.value.id===o.id;
    ctx.beginPath(); ctx.arc(sx(g.mid[0]),sy(g.mid[1]),7,0,Math.PI*2);
    ctx.fillStyle = on?C.accent:C.surface; ctx.fill();
    ctx.strokeStyle=C.accent; ctx.lineWidth=2; ctx.stroke();
  }
}

/** @satisfies {import('../canvas/types.js').Layer} */
const roomHandlesLayer = {
  id:'room-handles', z:120, scene:'room',
  deps(){ roomSel.value; },
  draw(){ if(roomMode()) drawHandles(); }
};

export {roomHandlesLayer};
