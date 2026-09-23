/* Walls: the room's own outline, plus the pillars and freestanding interior
   walls that stand inside it.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   Six functions of this region could NOT come along, because each reaches into
   a phase that has not run yet. They stay in index.html, in place:

     tryRoomEdit          calls flash()      -> ui/flash.js
     setWallAngle, setWallLen, setRectSize   call tryRoomEdit
     snapRadius           reads view         -> canvas/view.js
     snapWallPoint        calls snapPt()     -> canvas/snap.js

   They belong here and should join this file once ui/ and canvas/ have moved.
   The rest had to go now regardless: model/openings.js and model/validity.js
   both need wallOf and obstaclePolys, and neither can import from index.html. */

import {norm360, pointInPoly, ptSegDist, worldPoly} from '../core/geometry.js';
import {L, RP} from '../core/state.js';

/* ------------------------- walls ------------------------- */
/* ---- walls you can take away ----
   room.wallOff runs parallel to room.points: entry i is the edge from points[i] to
   points[i+1]. Turning one off removes the wall, not the corner — the polygon still
   bounds the room's floor, so area, furniture and validity are untouched. It is how
   one room opens onto the next without a partition between them. */
function syncWallOff(room){
  const n=room.points.length;
  if(!Array.isArray(room.wallOff)) room.wallOff=[];
  room.wallOff.length=n;
  for(let i=0;i<n;i++) room.wallOff[i]=!!room.wallOff[i];
  return room.wallOff;
}
const wallIsOff = (room,i) => !!(room.wallOff && room.wallOff[i]);
/* the polygon as runs of consecutive walled edges, so each run mitres its own corners;
   null means every edge is walled and it should be stroked as one closed loop */
function wallRuns(P, off){
  const n=P.length;
  if(!off || !off.some(Boolean)) return null;
  const runs=[];
  let cur=null;
  for(let i=0;i<n;i++){
    if(off[i]){ cur=null; continue; }
    if(!cur){ cur=[P[i]]; runs.push(cur); }
    cur.push(P[(i+1)%n]);
  }
  // a run spanning the wrap-around joins the last edge to the first, so that corner mitres
  if(runs.length>1 && !off[0] && !off[n-1]){
    const first=runs.shift();
    runs[runs.length-1].push(...first.slice(1));
  }
  return runs;
}
/* `poly` lets a floor ask about a room other than the active one; it defaults to that one */
function wallOf(i, poly){
  const P=poly||RP(), n=P.length, a=P[i], b=P[(i+1)%n];
  const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy)||1e-9;
  const dir=[dx/len,dy/len];
  let nrm=[-dir[1],dir[0]];
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  if(!pointInPoly([mid[0]+nrm[0]*2, mid[1]+nrm[1]*2], P)) nrm=[-nrm[0],-nrm[1]];
  return {a,b,dir,nrm,len,mid};
}
/* 0° points right, 90° points up — the way people read a plan */
const wallAngle = i => { const w=wallOf(i); return norm360(-Math.atan2(w.dir[1],w.dir[0])*180/Math.PI); };
/* defaults to the active room, but takes any layout so a freshly built one can be
   clamped before it is ever activated */
function clampOpenings(l){
  l = l || L();
  const P = l.room.points, n = P.length;
  for(const o of l.openings){
    if(o.wall>=n) o.wall = 0;
    const len = wallOf(o.wall, P).len;
    o.width = Math.max(100, Math.min(o.width, len));
    o.offset = Math.max(0, Math.min(o.offset, len-o.width));
  }
}
function nearestOnWalls(pt){
  const P=RP(); let best=null;
  for(let i=0;i<P.length;i++){
    const w=wallOf(i), r=ptSegDist(pt,w.a,w.b);
    if(!best || r.d<best.d) best={i, d:r.d, t:r.t, len:w.len};
  }
  return best;
}

/* ---- pillars & interior (freestanding) walls ----
   These stand inside the room, not on its outline. A pillar is a small shape
   with a position, reusing the same shapePoly/worldPoly a piece of furniture
   uses. An interior wall is one straight thick segment; a run of several,
   drawn end to end with snapping, reads as one connected partition even
   though each segment is its own independent record — same as the room's own
   corners and walls are independent points with no separate "this wall is
   connected to that one" flag. */
const pillarOf = id => L().room.pillars.find(p=>p.id===id);
const iwallOf = id => L().room.iwalls.find(w=>w.id===id);
function iwallGeom(w){
  const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], len=Math.hypot(dx,dy)||1e-9;
  const dir=[dx/len,dy/len];
  return {dir, nrm:[-dir[1],dir[0]], len, mid:[(w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2]};
}
function iwallPoly(w){
  const g=iwallGeom(w), h=w.t/2, n=g.nrm;
  return [
    [w.a[0]+n[0]*h, w.a[1]+n[1]*h],
    [w.b[0]+n[0]*h, w.b[1]+n[1]*h],
    [w.b[0]-n[0]*h, w.b[1]-n[1]*h],
    [w.a[0]-n[0]*h, w.a[1]-n[1]*h]
  ];
}
const iwallLen = w => iwallGeom(w).len;
const iwallAngle = w => norm360(-Math.atan2(w.b[1]-w.a[1], w.b[0]-w.a[0])*180/Math.PI);
function setIWallLen(w,len){ const g=iwallGeom(w); w.b=[w.a[0]+g.dir[0]*len, w.a[1]+g.dir[1]*len]; }
function setIWallAngle(w,deg){ const len=iwallLen(w), r=-deg*Math.PI/180; w.b=[w.a[0]+Math.cos(r)*len, w.a[1]+Math.sin(r)*len]; }
/* move one end of a freestanding wall so it sits exactly `dist` from the room wall it's
   currently closest to, sliding along the same foot-to-end direction it's already on */
function setIWallEndDist(w,end,dist){
  const near=nearestOnWalls(w[end]);
  if(!near) return false;
  const rw=wallOf(near.i);
  const foot=[rw.a[0]+rw.dir[0]*near.t*rw.len, rw.a[1]+rw.dir[1]*near.t*rw.len];
  const vx=w[end][0]-foot[0], vy=w[end][1]-foot[1];
  const side=(vx*rw.nrm[0]+vy*rw.nrm[1])>=0 ? 1 : -1;
  w[end]=[foot[0]+rw.nrm[0]*side*dist, foot[1]+rw.nrm[1]*side*dist];
  return true;
}
/* every obstacle that stands in the floor besides the room's own outline —
   used to keep furniture off pillars and interior walls the same way it is
   kept off everything else it might bump into */
function obstaclePolys(){
  const out=[];
  for(const pl of L().room.pillars) out.push({poly:worldPoly(pl,pl), name:'a pillar'});
  for(const w of L().room.iwalls) out.push({poly:iwallPoly(w), name:'a wall'});
  return out;
}
function isRectRoom(){
  const P=RP();
  if(P.length!==4) return false;
  for(let i=0;i<4;i++){
    const a=P[i], b=P[(i+1)%4];
    if(Math.abs(a[0]-b[0])>1 && Math.abs(a[1]-b[1])>1) return false;
  }
  return true;
}

export {syncWallOff, wallIsOff, wallRuns, wallOf, wallAngle, clampOpenings,
        nearestOnWalls, pillarOf, iwallOf, iwallGeom, iwallPoly, iwallLen,
        iwallAngle, setIWallLen, setIWallAngle, setIWallEndDist, obstaclePolys,
        isRectRoom};
