/* Floor space, and how far a thing's stock reaches.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. */

import {bbox} from './geometry.js';
import {S, L, blankFloorPlace, floorLayouts} from './state.js';

/* ---- floor space ----
   A room keeps drawing itself in its own mm space. Standing it on a floor is one
   rigid move: spin about its own bbox centre, then shift. The matrix is worldPoly's,
   so turning a room reads exactly like turning an item, and because the points come
   out already in floor space every sx()/sy() call downstream works untouched. */
function floorXf(l, place){
  const b=bbox(l.room.points), pl=place||l.floorPlace||blankFloorPlace(), r=(pl.rot||0)*Math.PI/180;
  return {cx:(b.x0+b.x1)/2, cy:(b.y0+b.y1)/2, c:Math.cos(r), s:Math.sin(r), dx:pl.x||0, dy:pl.y||0, rot:pl.rot||0};
}
/* the room's outline as it WOULD sit at some placement, for testing a drag before committing it */
const ptsAt = (l,place) => { const t=floorXf(l,place); return l.room.points.map(p=>floorPt(t,p)); };
/* floor space back into one room's own space — how a neighbour is shown while you edit */
const floorPtInv = (t,q) => { const dx=q[0]-t.dx-t.cx, dy=q[1]-t.dy-t.cy;
  return [t.cx+dx*t.c+dy*t.s, t.cy-dx*t.s+dy*t.c]; };
const floorPt = (t,p) => { const dx=p[0]-t.cx, dy=p[1]-t.cy;
  return [t.cx+dx*t.c-dy*t.s+t.dx, t.cy+dx*t.s+dy*t.c+t.dy]; };
function floorPts(l){ const t=floorXf(l); return l.room.points.map(p=>floorPt(t,p)); }
/* a placed item or pillar carried onto the floor: it also turns with the room */
const floorInst = (l,inst,t) => { t=t||floorXf(l); const q=floorPt(t,[inst.x,inst.y]);
  return Object.assign({}, inst, {x:q[0], y:q[1], rot:(inst.rot||0)+t.rot}); };
const floorIWall = (l,w,t) => { t=t||floorXf(l);
  return Object.assign({}, w, {a:floorPt(t,w.a), b:floorPt(t,w.b)}); };
/* union bounds of everything standing on a floor; null when nothing is */
function floorBBox(fid){
  const pts=[]; for(const l of floorLayouts(fid)) pts.push(...floorPts(l));
  return pts.length ? bbox(pts) : null;
}
/* a room joining a floor lands beside what is already there, never on top of it.
   Call before setting l.floorId, so the floor's bounds don't already include it. */
function placeOnFloor(l, fid){
  const b=floorBBox(fid), own=bbox(l.room.points);
  l.floorPlace = b ? {x:b.x1+1000-own.x0, y:b.y0-own.y0, rot:0} : blankFloorPlace();
}
/* ---- how far a thing's stock reaches ----
   'project': one pool for everything — placing a sofa anywhere spends it.
   'folder' : the rooms sitting DIRECTLY in a folder share a pool. A subfolder
              keeps its own pool; it never draws on the folder above it.
   'room'   : every room starts with the full stock of every thing. */
const INV_SCOPES = {
  project:{suffix:'across your rooms',
           hint:'One pool for every room: placing an item anywhere takes it out of stock everywhere.'},
  folder :{suffix:'in this folder',
           hint:'Rooms directly in the same folder share a pool. A subfolder keeps its own stock.'},
  room   :{suffix:'in this room',
           hint:'Every room starts with full stock. Only this room’s placements count.'}
};
/* the rooms whose placements count against stock right now */
function scopeLayouts(){
  const cur=L();
  if(S.invScope==='room') return cur?[cur]:[];
  if(S.invScope==='folder'){
    const fid=cur?(cur.folderId||null):null;
    return S.layouts.filter(l=>(l.folderId||null)===fid);
  }
  return S.layouts;
}
function usedCount(itemId){
  let n=0;
  for(const l of scopeLayouts()) for(const p of l.placed) if(p.itemId===itemId) n++;
  return n;
}
const availableCount = it => Math.max(0, (it.count==null?1:it.count) - usedCount(it.id));

export {floorXf, ptsAt, floorPtInv, floorPt, floorPts, floorInst, floorIWall,
        floorBBox, placeOnFloor, INV_SCOPES, scopeLayouts, usedCount, availableCount};
