/* The walk-path overlay: the shading passes and the route lines that put
   model/walkpaths.js's clearance numbers on the canvas. The computation is
   model/walkpaths.js; only the paint is here. Furniture mode, with the view
   setting on. */

import {ctx, sx, sy, view} from '../canvas/view.js';
import {PAL, addPoly} from '../canvas/paint.js';
import {S, RP, furnMode} from '../../kernel/state.js';
import {bbox} from '../../kernel/geometry.js';
import {fmtLen} from '../../kernel/units.js';
import {WALK, walkGrid, walkPaths, walkBand} from './walkpaths.js';

/* shade every cell matching `test` with one clipped diagonal hatch pass (or,
   with `cross`, a second pass the other way — an X reads as "not just
   tight, actually blocked"), the same construction the invalid-placement
   hatch uses — texture, not just colour, carries the warning (never colour
   alone, DESIGN.md §3.2) */
function walkShade(grid,test,color,alpha,step,cross){
  let any=false;
  ctx.save(); ctx.beginPath();
  for(let iy=0; iy<grid.rows; iy++) for(let ix=0; ix<grid.cols; ix++){
    const c=grid.cells[iy*grid.cols+ix];
    if(c==null||!test(c)) continue;
    any=true;
    const cx=grid.x0+(ix+.5)*grid.res, cy=grid.y0+(iy+.5)*grid.res, half=grid.res/2;
    addPoly([[cx-half,cy-half],[cx+half,cy-half],[cx+half,cy+half],[cx-half,cy+half]]);
  }
  if(!any){ ctx.restore(); return; }
  ctx.clip();
  const b=bbox(RP());
  ctx.strokeStyle=color; ctx.globalAlpha=alpha; ctx.lineWidth=1;
  ctx.beginPath();
  for(let d=b.x0-b.h; d<b.x1; d+=step) ctx.moveTo(sx(d),sy(b.y0)), ctx.lineTo(sx(d+b.h),sy(b.y1));
  if(cross) for(let d=b.x0; d<b.x1+b.h; d+=step) ctx.moveTo(sx(d),sy(b.y0)), ctx.lineTo(sx(d-b.h),sy(b.y1));
  ctx.stroke();
  ctx.restore();
}
function walkPinchLabel(path,C){
  let min=path[0];
  for(const p of path) if(p.clear<min.clear) min=p;
  if(min.clear>=WALK.comfortable) return;
  const x=sx(min.pt[0]), y=sy(min.pt[1]);
  const txt=fmtLen(Math.max(0,min.clear),S.unit)+(min.clear<WALK.narrow?' — too narrow':' clear');
  ctx.font='600 11px ui-sans-serif,-apple-system,system-ui,sans-serif';
  const w=ctx.measureText(txt).width;
  ctx.save();
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(x-w/2-6,y-11,w+12,22,11); else ctx.rect(x-w/2-6,y-11,w+12,22);
  ctx.fillStyle=C.surface; ctx.globalAlpha=.92; ctx.fill();
  ctx.globalAlpha=1;
  ctx.fillStyle = min.clear<WALK.tight ? C.danger : C.ink2;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(txt,x,y);
  ctx.restore();
}
function drawWalkPath(path,C){
  if(path.length<2) return;
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round'; ctx.globalAlpha=.85;
  // samples are dense, so stroke each run of same-band steps as one polyline —
  // stroking every 50mm step on its own would restart the dash pattern each time
  let i=1;
  while(i<path.length){
    const band=walkBand(Math.min(path[i-1].clear,path[i].clear));
    ctx.beginPath(); ctx.moveTo(sx(path[i-1].pt[0]),sy(path[i-1].pt[1]));
    while(i<path.length && walkBand(Math.min(path[i-1].clear,path[i].clear))===band){
      ctx.lineTo(sx(path[i].pt[0]),sy(path[i].pt[1])); i++;
    }
    if(band==='comfortable'){ ctx.setLineDash([]); ctx.lineWidth=4; ctx.strokeStyle=C.ink2; ctx.globalAlpha=.4; }
    else if(band==='tight'){ ctx.setLineDash([]); ctx.lineWidth=2.5; ctx.strokeStyle=C.ink2; ctx.globalAlpha=.75; }
    else if(band==='narrow'){ ctx.setLineDash([2,3]); ctx.lineWidth=1.75; ctx.strokeStyle=C.danger; ctx.globalAlpha=.9; }
    else { ctx.setLineDash([1,4]); ctx.lineWidth=1.25; ctx.strokeStyle=C.danger; ctx.globalAlpha=1; }
    ctx.stroke();
  }
  ctx.restore();
  walkPinchLabel(path,C);
}
function drawWalkOverlay(){
  if(!S.showWalk || !furnMode()) return;
  const grid=walkGrid();
  if(!grid.cols) return;
  const C=PAL();
  walkShade(grid, c=>c<WALK.narrow, 'rgba('+C.dangerRGB+',.85)', .9, 5/Math.max(view.scale,1e-4), true);
  walkShade(grid, c=>c>=WALK.narrow&&c<WALK.tight, 'rgba('+C.dangerRGB+',.6)', .8, 6/Math.max(view.scale,1e-4));
  walkShade(grid, c=>c>=WALK.tight&&c<WALK.comfortable, C.ink2, .3, 10/Math.max(view.scale,1e-4));
  for(const path of walkPaths()) drawWalkPath(path,C);
}

const walkPathsLayer = {id:'walk-paths', z:30, scene:'room', draw(){ drawWalkOverlay(); }};

export {walkPathsLayer};
