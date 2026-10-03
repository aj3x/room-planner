// @ts-check
/* Openings: doors and windows cut into a room wall, and the floor a hinged
   door's leaf sweeps.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. */

import {EPS, shrink, polyHit, worldPoly} from './geometry.js';
import {L, itemOf} from './state.js';
import {wallOf} from './walls.js';

/** @typedef {import('./types.js').Pt} Pt */
/** @typedef {import('./types.js').Opening} Opening */
/** Where an opening sits on its wall, and how a door's leaf moves. The optional
    fields are a bi-fold's (pivot, railEnd, apex, leafN) or a hinged door's (hinge, a0, a1, open, r).
    @typedef {{p0: Pt, p1: Pt, dir: Pt, nrm: Pt, mid: Pt,
      pivot?: Pt, railEnd?: Pt, apex?: Pt, leafN?: Pt,
      hinge?: Pt, a0?: number, a1?: number, open?: Pt, r?: number}} OpenGeom */

/* ------------------------- openings ------------------------- */
/* an opening's offset is always stored clockwise from the wall's start (wall.a);
   o.corner just controls which corner the *displayed* distance is measured from —
   'cw' (default) is that same start corner, 'ccw' is the wall's far/end corner. */
/** @param {Opening} o @param {number} len */
function openingDispOffset(o,len){ return o.corner==='ccw' ? (len-o.width-o.offset) : o.offset; }
/** @param {Opening} o @param {number} len @param {number} val */
function setOpeningDispOffset(o,len,val){
  o.offset = o.corner==='ccw' ? (len-o.width-val) : val;
  o.offset = Math.max(0, Math.min(o.offset, len-o.width));
}
/* How much of the opening a bi-fold's folded panels cover, as drawn. 0.5 is half open,
   1 would be shut flat. Three-quarters reads as a closet door standing ajar. */
const BP_BIFOLD_SHUT=0.75;
/** @param {Opening} o @param {Pt[]} [poly] @param {import('./types.js').Room} [room] @returns {OpenGeom} */
function openGeom(o, poly, room){
  const w = wallOf(o.wall, poly);
  const p0=[w.a[0]+w.dir[0]*o.offset, w.a[1]+w.dir[1]*o.offset];
  const p1=[w.a[0]+w.dir[0]*(o.offset+o.width), w.a[1]+w.dir[1]*(o.offset+o.width)];
  /** @type {OpenGeom} */
  const g={p0,p1,dir:w.dir,nrm:w.nrm,mid:[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2]};
  if(o.kind==='door' && o.dtype==='bifold'){
    /* Two panels on a rail, pivoting at ONE jamb. Half open they fold into a V taking up
       HALF the opening and the other half stands empty — which is the whole point of the
       thing, and why a chevron spanning the full width is wrong: that is a double bi-fold,
       four panels, meeting in the middle.

       Drawn three-quarters shut: the folded panels cover that much of the opening and the
       rest stands clear. Nothing is fudged — each panel is half the opening, so two sides
       of w/2 on a base of `reach` fix the fold's standoff by Pythagoras. */
    const atStart = o.hinge!=='end';
    const u = atStart ? w.dir : [-w.dir[0], -w.dir[1]];
    const n = o.swing==='out' ? [-w.nrm[0],-w.nrm[1]] : w.nrm;
    const pivot = atStart ? p0 : p1;
    const reach = o.width*BP_BIFOLD_SHUT;
    g.pivot=pivot;
    g.railEnd=[pivot[0]+u[0]*reach, pivot[1]+u[1]*reach];
    const midR=[pivot[0]+u[0]*reach/2, pivot[1]+u[1]*reach/2];
    /* the panels do not stretch: two of w/2 on a base of `reach` fixes how far the fold
       stands off the wall, so the drawn state follows from BP_BIFOLD_SHUT alone */
    const rise=Math.sqrt(Math.max(0, Math.pow(o.width/2,2) - Math.pow(reach/2,2)));
    g.apex=[midR[0]+n[0]*rise, midR[1]+n[1]*rise];
    g.leafN=n;
  }
  if(o.kind==='door' && o.dtype==='hinge'){
    const atStart = o.hinge!=='end';
    // p0/p1 sit on the interior face; a door swinging out is hung on the
    // frame's exterior face instead, so its hinge/leaf attach there
    const outward = o.swing==='out';
    const faceThick = outward ? (room||L().room).wall : 0;
    const face = (/** @type {Pt} */p)=>[p[0]-w.nrm[0]*faceThick, p[1]-w.nrm[1]*faceThick];
    g.hinge = atStart ? face(p0) : face(p1);
    const v = atStart ? [w.dir[0]*o.width, w.dir[1]*o.width] : [-w.dir[0]*o.width, -w.dir[1]*o.width];
    const want = outward ? [-w.nrm[0],-w.nrm[1]] : w.nrm;
    const rA=[-v[1],v[0]], rB=[v[1],-v[0]];
    const open = (rA[0]*want[0]+rA[1]*want[1])>0 ? rA : rB;
    g.a0=Math.atan2(v[1],v[0]); g.a1=Math.atan2(open[1],open[0]);
    g.open=[g.hinge[0]+open[0], g.hinge[1]+open[1]];
    g.r=o.width;
  }
  return g;
}
/** The floor a door's leaf sweeps, or null for anything that does not swing.
    @param {Opening} o @param {Pt[]} [poly] @param {import('./types.js').Room} [room] @returns {Pt[]|null} */
function swingPoly(o, poly, room){
  if(o.kind!=='door') return null;
  if(o.dtype==='bifold'){
    const g=/** @type {Required<OpenGeom>} */(openGeom(o, poly, room));   // a bi-fold's has its pivot, apex and rail
    return [g.pivot.slice(), g.apex.slice(), g.railEnd.slice()];
  }
  if(o.dtype!=='hinge') return null;
  const g=/** @type {Required<OpenGeom>} */(openGeom(o, poly, room)), pts=[g.hinge.slice()], N=14;   // a hinged door's has its hinge and arc
  let diff=g.a1-g.a0;
  while(diff>Math.PI) diff-=Math.PI*2;
  while(diff<-Math.PI) diff+=Math.PI*2;
  for(let i=0;i<=N;i++){
    const a=g.a0+diff*(i/N);
    pts.push([g.hinge[0]+Math.cos(a)*g.r, g.hinge[1]+Math.sin(a)*g.r]);
  }
  return pts;
}
/** @returns {string[]} ids of the doors whose swing an item stands in */
function blockedOpenings(){
  /** @type {string[]} */
  const out=[];
  for(const o of L().openings){
    const sp=swingPoly(o);
    if(!sp) continue;
    for(const p of L().placed){
      const it=itemOf(p.itemId);
      if(!it||it.passThrough) continue;
      if(polyHit(shrink(worldPoly(p,it),EPS),sp)){ out.push(o.id); break; }
    }
  }
  return out;
}


/* What to call an opening in a list or a title. */
/** @param {Pick<Opening, 'kind'|'dtype'>} o */
const KIND = o => o.kind==='window' ? 'Window' : (o.dtype==='slide'?'Sliding door':o.dtype==='open'?'Doorway':o.dtype==='bifold'?'Bi-fold door':'Hinged door');

export {KIND, openingDispOffset, setOpeningDispOffset, BP_BIFOLD_SHUT, openGeom,
        swingPoly, blockedOpenings};
