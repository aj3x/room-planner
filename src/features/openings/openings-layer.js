// @ts-check
/* Door and window symbols: jambs, glazing lines, swings and sliding leaves.
   The floor scene draws them with drawOpening too, on every room. */

import {ctx, sx, sy, view, PAL, pathPoly} from '../canvas/index.js';
import {L, S} from '../../kernel/state.js';
import {blockedOpenings, openGeom, swingPoly} from '../../kernel/openings.js';
import {wallIsOff} from '../../kernel/walls.js';

/* `room`/`poly` let a floor draw a door on a room other than the active one */
/** @param {import('../../kernel/types.js').Opening} o @param {string[]} blocked ids of doors something stands in @param {import('../../kernel/types.js').Room} [room] @param {import('../../kernel/types.js').Pt[]} [poly] */
function drawOpening(o,blocked,room,poly){
  /* each branch below reads the door fields openGeom sets for that dtype */
  const r=room||L().room, g=/** @type {Required<import('../../kernel/openings.js').OpenGeom>} */(openGeom(o,poly,r)), t=Math.max(2,r.wall*view.scale);
  const C=PAL();
  // jambs
  ctx.strokeStyle=C.ink; ctx.lineWidth=Math.max(1.5,t*.35);
  for(const p of [g.p0,g.p1]){
    ctx.beginPath();
    ctx.moveTo(sx(p[0]),sy(p[1]));
    ctx.lineTo(sx(p[0]-g.nrm[0]*r.wall),sy(p[1]-g.nrm[1]*r.wall));
    ctx.stroke();
  }
  if(o.kind==='window'){
    ctx.strokeStyle=C.glassLine; ctx.lineWidth=Math.max(1.2,t*.16);
    for(const k of [-0.34,0.34]){
      ctx.beginPath();
      ctx.moveTo(sx(g.p0[0]-g.nrm[0]*r.wall*k), sy(g.p0[1]-g.nrm[1]*r.wall*k));
      ctx.lineTo(sx(g.p1[0]-g.nrm[0]*r.wall*k), sy(g.p1[1]-g.nrm[1]*r.wall*k));
      ctx.stroke();
    }
  } else if(o.dtype==='hinge'){
    if(S.showSwing){
      const sp=swingPoly(o,poly,r), bad=blocked.includes(o.id);
      pathPoly(/** @type {import('../../kernel/types.js').Pt[]} */(sp));   // a hinged door swings
      ctx.fillStyle = bad?'rgba('+C.dangerRGB+',.16)':C.swing; ctx.fill();
      ctx.strokeStyle = bad?'rgba('+C.dangerRGB+',.7)':C.swingLine;
      ctx.setLineDash([4,4]); ctx.lineWidth=bad?1.5:1; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle=C.ink; ctx.lineWidth=Math.max(2,t*.45); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(sx(g.hinge[0]),sy(g.hinge[1])); ctx.lineTo(sx(g.open[0]),sy(g.open[1])); ctx.stroke();
    ctx.lineCap='butt';
  } else if(o.dtype==='bifold'){
    /* the chevron a closet is drawn with: a leaf from each jamb meeting at a fold, and
       no sweep arc, because a bi-fold does not sweep — it folds back on itself */
    /* only shaded when it is in the way — a bi-fold takes far less room than a swing,
       so shading it by default drew attention to clearance that is rarely the problem */
    const bad=blocked.includes(o.id);
    if(S.showSwing && bad){
      pathPoly(/** @type {import('../../kernel/types.js').Pt[]} */(swingPoly(o,poly,r)));   // a bi-fold folds
      ctx.fillStyle='rgba('+C.dangerRGB+',.16)'; ctx.fill();
      ctx.strokeStyle='rgba('+C.dangerRGB+',.7)';
      ctx.setLineDash([4,4]); ctx.lineWidth=1.5; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle=C.ink; ctx.lineWidth=Math.max(1.5,t*.3);
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(sx(g.pivot[0]),sy(g.pivot[1]));
    ctx.lineTo(sx(g.apex[0]),sy(g.apex[1]));
    ctx.lineTo(sx(g.railEnd[0]),sy(g.railEnd[1]));
    ctx.stroke();
    ctx.lineCap='butt'; ctx.lineJoin='miter';
  } else if(o.dtype==='slide'){
    const off=[-g.nrm[0]*r.wall*.5, -g.nrm[1]*r.wall*.5];
    ctx.lineWidth=Math.max(2,t*.4);
    ctx.strokeStyle=C.ink;
    ctx.beginPath();
    ctx.moveTo(sx(g.p0[0]+off[0]),sy(g.p0[1]+off[1]));
    ctx.lineTo(sx(g.mid[0]+off[0]),sy(g.mid[1]+off[1])); ctx.stroke();
    ctx.strokeStyle=C.swingLine;
    ctx.beginPath();
    ctx.moveTo(sx(g.mid[0]-off[0]*.5),sy(g.mid[1]-off[1]*.5));
    ctx.lineTo(sx(g.p1[0]-off[0]*.5),sy(g.p1[1]-off[1]*.5)); ctx.stroke();
  }
}

/** @satisfies {import('../canvas/types.js').Layer} */
const openingsLayer = {
  id:'openings', z:70, scene:'room',
  draw(){
    const r=L().room;
    const blocked = S.showSwing ? blockedOpenings() : [];
    for(const o of L().openings) if(!wallIsOff(r,o.wall)) drawOpening(o, blocked);
  }
};

export {openingsLayer, drawOpening};
