/* Walls: the room's own outline, plus the pillars and freestanding interior
   walls that stand inside it.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   Six functions of this region could NOT come along in the model/ round,
   because each reached into a phase that had not run yet. All six came home in
   the canvas/ round, in two commits: tryRoomEdit / setWallAngle / setWallLen /
   setRectSize once flash() reached ui/flash.js, then snapRadius (reads view)
   and snapWallPoint (calls snapPt) once both landed in canvas/view.js. This
   file is whole again.

   snapRadius has no caller outside this module and so is not exported back to
   index.html -- the same thing that happened to MM and BARE in the units
   pilot. It stays in the export list for canvas/snap.js, which wants it. */

import {norm360, pointInPoly, ptSegDist, worldPoly, bbox, polySimple} from '../core/geometry.js';
import {L, RP} from '../core/state.js';
import {flash} from '../ui/flash.js';
import {view, snapPt} from '../canvas/view.js';

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

function setWallAngle(i,deg){
  const P=RP(), n=P.length, w=wallOf(i), r=-deg*Math.PI/180;
  return tryRoomEdit(()=>{ P[(i+1)%n]=[w.a[0]+Math.cos(r)*w.len, w.a[1]+Math.sin(r)*w.len]; });
}
function setWallLen(i,len){
  const P=RP(), n=P.length, w=wallOf(i);
  return tryRoomEdit(()=>{ P[(i+1)%n]=[w.a[0]+w.dir[0]*len, w.a[1]+w.dir[1]*len]; });
}
/* every room edit is applied, checked, and rolled back if it breaks the polygon */
function tryRoomEdit(fn){
  const before = JSON.stringify(RP());
  fn();
  if(!polySimple(RP())){
    L().room.points = JSON.parse(before);
    flash('That would fold the room over itself');
    syncWallOff(L().room);
    return false;
  }
  syncWallOff(L().room);
  clampOpenings();
  return true;
}
/* world-space radius a drag should snap within, so pillars/wall ends catch
   onto a nearby corner, wall or other wall end regardless of zoom */
const snapRadius = () => 14/Math.max(view.scale,1e-6);
/* where a wall's end should land: magnetic onto a room corner, a room wall's
   face, or another interior wall's end or run (so two walls "connect" by
   simply sharing a point) — falling back to the ordinary grid snap */
function snapWallPoint(raw, excludeId, magnetic){
  if(magnetic){
    const R=snapRadius(); let best=null;
    const consider=c=>{ const d=Math.hypot(c[0]-raw[0],c[1]-raw[1]); if(d<=R&&(!best||d<best.d)) best={pt:c,d}; };
    for(const v of RP()) consider(v);
    for(const w of L().room.iwalls){ if(w.id===excludeId) continue; consider(w.a); consider(w.b); }
    if(best) return best.pt.slice();
    const nb=nearestOnWalls(raw);
    if(nb && nb.d<=R){ const w=wallOf(nb.i); return [w.a[0]+w.dir[0]*nb.t*w.len, w.a[1]+w.dir[1]*nb.t*w.len]; }
    for(const w of L().room.iwalls){
      if(w.id===excludeId) continue;
      const r=ptSegDist(raw,w.a,w.b);
      if(r.d<=R) return [w.a[0]+(w.b[0]-w.a[0])*r.t, w.a[1]+(w.b[1]-w.a[1])*r.t];
    }
  }
  return snapPt(raw);
}
function setRectSize(w,d){
  const b=bbox(RP());
  return tryRoomEdit(()=>{ L().room.points = RP().map(([x,y])=>[
    b.w>1 ? b.x0+(x-b.x0)/b.w*w : x,
    b.h>1 ? b.y0+(y-b.y0)/b.h*d : y]); });
}

export {syncWallOff, wallIsOff, wallRuns, wallOf, wallAngle, clampOpenings,
        nearestOnWalls, pillarOf, iwallOf, iwallGeom, iwallPoly, iwallLen,
        iwallAngle, setIWallLen, setIWallAngle, setIWallEndDist, obstaclePolys,
        isRectRoom,
        setWallAngle, setWallLen, tryRoomEdit, snapRadius, snapWallPoint,
        setRectSize};
