// @ts-check
/* Paint primitives every canvas layer and tool overlay shares: the palette,
   the two path helpers, label clipping, the 90° tick and the dimension line.

   Top-level: window.matchMedia() is a BOM read that returns a live query
   object -- no listener, no work scheduled. Its `change` listener is
   registered in index.html. */

import {ctx, sx, sy} from './view.js';
import {S} from '../../kernel/state.js';
import {fmtLen} from '../../kernel/units.js';

/** @typedef {import('../../kernel/types.js').Pt} Pt */

/* canvas colours mirror the CSS tokens (DESIGN.md §3.10); saved images always use `light`.
   Only what sits on the stage (background, walls, wall labels) changes in dark mode — selection,
   handles and warnings are drawn over the floor, which is the user's own (usually light) colour. */
const CANVAS={
  light:{stage:'#e6e6e2', stageAccent:'#2a5bd7', wall:'#2b2b29', wallEdge:'rgba(29,29,27,.5)', pillar:'#585853', ink:'#1d1d1b', ink2:'#585853',
         surface:'#fcfcfb', accent:'#2a5bd7', accentSoft:'#e9effc', danger:'#c0392b', dangerRGB:'192,57,43',
         grid:'rgba(29,29,27,.075)', trim:'rgba(29,29,27,.10)', glass:'#cfd8e2', glassLine:'#5c7a99', swing:'rgba(29,29,27,.05)', swingLine:'rgba(29,29,27,.3)',
         scrim:'rgba(20,20,19,.45)', ok:'#1f7a4d', okSoft:'#dcf0e4'},
  dark: {stage:'#141413', stageAccent:'#7aa2f7', wall:'#8a8a84', wallEdge:'rgba(236,236,234,.35)', pillar:'#6f6f69', ink:'#1d1d1b', ink2:'#adada7',
         surface:'#fcfcfb', accent:'#2a5bd7', accentSoft:'#e9effc', danger:'#c0392b', dangerRGB:'192,57,43',
         grid:'rgba(29,29,27,.075)', trim:'rgba(29,29,27,.10)', glass:'#9fb3c8', glassLine:'#5c7a99', swing:'rgba(29,29,27,.06)', swingLine:'rgba(29,29,27,.35)',
         scrim:'rgba(20,20,19,.45)', ok:'#1f7a4d', okSoft:'#dcf0e4'}
};
const darkMQ=window.matchMedia('(prefers-color-scheme: dark)');
let forceLightCanvas=false;
/** @param {boolean} v */
function setForceLightCanvas(v){ forceLightCanvas = v; }
const PAL = () => (!forceLightCanvas && darkMQ.matches) ? CANVAS.dark : CANVAS.light;

/** Add polygon p (world mm) to the current path. @param {Pt[]} p */
function addPoly(p){
  ctx.moveTo(sx(p[0][0]),sy(p[0][1]));
  for(let i=1;i<p.length;i++) ctx.lineTo(sx(p[i][0]),sy(p[i][1]));
  ctx.closePath();
}
/** @param {Pt[]} p */
function pathPoly(p){ ctx.beginPath(); addPoly(p); }

/** txt cut down to fit about wpx pixels. @param {string} txt @param {number} wpx */
function clip(txt,wpx){ const max=Math.floor(wpx/7.2); return txt.length>max?txt.slice(0,Math.max(1,max-1))+'…':txt; }
/* The square in the corner, the way a plan marks 90°. On a corner that turns the other
   way it lands on the wall band, so it is drawn twice — a pale line first, then the
   accent over it — to stay legible whatever is underneath. */
/** @param {Pt} a @param {Pt} b the corner @param {Pt} c */
function drawSquareTick(a,b,c){
  const C=PAL(), bx=sx(b[0]), by=sy(b[1]);
  const dir=(/** @type {Pt} */q)=>{ const dx=sx(q[0])-bx, dy=sy(q[1])-by, l=Math.hypot(dx,dy); return l<1?null:[dx/l,dy/l]; };
  const u=dir(a), v=dir(c);
  if(!u||!v) return;
  const s=16;
  ctx.save();
  ctx.lineJoin='miter';
  for(const pass of [{w:5, c:C.surface}, {w:2.5, c:C.accent}]){
    ctx.beginPath();
    ctx.moveTo(bx+u[0]*s, by+u[1]*s);
    ctx.lineTo(bx+(u[0]+v[0])*s, by+(u[1]+v[1])*s);
    ctx.lineTo(bx+v[0]*s, by+v[1]*s);
    ctx.strokeStyle=pass.c; ctx.lineWidth=pass.w; ctx.stroke();
  }
  ctx.restore();
}
/* a dimension line with end ticks and its length on a label; returns where it was drawn */
/** @param {{p: Pt, q: Pt, d: number}} r the two ends and the distance to print
    @param {string} color @param {import('./types.js').Palette} C @param {boolean} [dashed] */
function drawDimension(r,color,C,dashed){
  const p=[sx(r.p[0]),sy(r.p[1])], q=[sx(r.q[0]),sy(r.q[1])];
  const len=Math.hypot(q[0]-p[0],q[1]-p[1]);
  const u = len>1 ? [(q[0]-p[0])/len,(q[1]-p[1])/len] : [1,0], n=[-u[1],u[0]];
  ctx.save(); ctx.lineCap='round';
  ctx.beginPath();
  if(len>1){
    ctx.moveTo(p[0],p[1]); ctx.lineTo(q[0],q[1]);
    for(const e of [p,q]){ ctx.moveTo(e[0]-n[0]*5,e[1]-n[1]*5); ctx.lineTo(e[0]+n[0]*5,e[1]+n[1]*5); }
  } else ctx.arc(p[0],p[1],4,0,Math.PI*2);
  // a surface halo under the line, so it reads on the floor, on furniture and on the stage
  ctx.lineWidth=4; ctx.strokeStyle=C.surface; ctx.stroke();
  if(dashed) ctx.setLineDash([5,4]);
  ctx.lineWidth=1.5; ctx.strokeStyle=color; ctx.stroke();
  ctx.setLineDash([]);
  const txt = r.d<0.5 ? 'Touching' : fmtLen(r.d,S.unit);
  ctx.font='600 11px ui-sans-serif,-apple-system,system-ui,sans-serif';
  const w=ctx.measureText(txt).width+12, h=20;
  let cx=(p[0]+q[0])/2, cy=(p[1]+q[1])/2;
  // a line shorter than its label would disappear under it, so the label steps off to one side
  if(len<w+16){ const k=(n[1]>0?-1:1)*(len>1?14:18); cx+=n[0]*k; cy+=n[1]*k; }
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(cx-w/2,cy-h/2,w,h,h/2); else ctx.rect(cx-w/2,cy-h/2,w,h);
  ctx.fillStyle=C.surface; ctx.globalAlpha=.94; ctx.fill(); ctx.globalAlpha=1;
  ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(txt,cx,cy);
  ctx.restore();
  return {p,q,x:cx-w/2,y:cy-h/2,w,h};
}

export {CANVAS, darkMQ, PAL, setForceLightCanvas, addPoly, pathPoly, clip, drawSquareTick, drawDimension};
