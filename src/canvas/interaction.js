/* Dragging, edge-panning and zooming: what happens between a pointerdown and
   the pointerup, once the deadzone has armed.

   Extracted from index.html in Phase 3, move-only: the blocks below are
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   The pointer/wheel/key listeners themselves stayed in index.html, per rule
   6 -- registering them at import time would both break rule 6 and move them
   ahead of every other listener in the file. They drive this module through
   applyDragAt/cancelDrag/endDrag and the four setters, which landed as a
   declared code change in the commit before this one.
*/
import {floorPts} from '../core/floor-space.js';
import {bbox, norm360, polySimple, worldPoly} from '../core/geometry.js';
import {bumpRev, commitFloor, commitFurn, commitRoom, snapFloor, snapFurn, snapRoom} from '../core/history.js';
import {selectAdd, selectSet, setAlignGuides, setAlignNote, setFloorGuides, setFloorSnapNote} from '../core/selection.js';
import {L, RP, S, instOf, itemOf, openOf} from '../core/state.js';
import {save} from '../core/store.js';
import {centreInside, slideToValid, validate} from '../model/validity.js';
import {clampOpenings, iwallOf, nearestOnWalls, pillarOf, snapWallPoint, wallOf} from '../model/walls.js';
import {renderFloorSel} from '../plan/floors.js';
import {renderOpen, renderRoomSel, renderWalls} from '../plan/room-panel.js';
import {renderSel} from '../plan/selection-panel.js';
import {flash} from '../ui/flash.js';
import {draw, scheduleDraw, snapFloorPlace} from './draw.js';
import {drag, setDrag} from './interaction-state.js';
import {alignRadius, bringToFront, snapCorner} from './snap.js';
import {H, W, axisLockFrom, cv, snapMM, snapPt, view, wx, wy} from './view.js';
import {drawState, splitDrawState, wallDrawState} from './interaction-state.js';
import {applyDrawCursorAt} from './room-draw.js';
/* ------------------------- interaction ------------------------- */
let spaceDown=false;
function setSpaceDown(v){ spaceDown = v; } // held to force pan mode (Space+drag pans; Space+scroll still zooms)
const ROOM_DRAGS=['corner','wall','open','pillar','iwall','iwall-end'];

let lastPX=null, lastPY=null, lastMods={shiftKey:false,altKey:false};
function setLastPX(v){ lastPX = v; }
function setLastPY(v){ lastPY = v; }
function setLastMods(v){ lastMods = v; }
const DEADZONE_MODES=['open','corner','pillar','iwall','iwall-end','wall'];
const DEADZONE_PX=4;
function applyDragAt(px,py,mods){
  if(!drag) return;
  if(!drag.armed && DEADZONE_MODES.includes(drag.mode)){
    if(Math.hypot(px-drag.ox, py-drag.oy)<DEADZONE_PX) return;   // ignore tiny jitter so a click on the point doesn't nudge it
    drag.armed=true;
  }
  const pt=[wx(px),wy(py)];
  const floorDrag = drag.mode==='floor-room'||drag.mode==='floor-rot';
  // nothing has moved yet: remember how things stood so Escape can put them back
  if(drag.mode!=='pan' && !drag.snap) drag.snap = floorDrag ? snapFloor() : ROOM_DRAGS.includes(drag.mode) ? snapRoom() : snapFurn();

  if(drag.mode==='pan'){
    view.ox=drag.ox+(px-drag.px); view.oy=drag.oy+(py-drag.py);
    scheduleDraw(); return;
  }
  if(drag.mode==='floor-room'){
    const l=S.layouts.find(x=>x.id===drag.id); if(!l) return;
    let nx=pt[0]-drag.dx, ny=pt[1]-drag.dy;
    if(mods.altKey){ setFloorGuides([]); setFloorSnapNote('Free'); }   // alt drops the magnet, same as everywhere else
    else { const s=snapFloorPlace(l,nx,ny); nx=s.x; ny=s.y; setFloorGuides(s.guides); setFloorSnapNote(s.note); }
    l.floorPlace.x=nx; l.floorPlace.y=ny;
    scheduleDraw(); renderFloorSel(); return;
  }
  if(drag.mode==='floor-rot'){
    const l=S.layouts.find(x=>x.id===drag.id); if(!l) return;
    const b=bbox(floorPts(l));
    const a=Math.atan2(pt[1]-(b.y0+b.y1)/2, pt[0]-(b.x0+b.x1)/2);
    let deg=drag.start+(a-drag.a0)*180/Math.PI;
    if(!mods.altKey) deg=Math.round(deg/15)*15;   // free turn is the exception, not the rule
    l.floorPlace.rot=norm360(deg);
    scheduleDraw(); renderFloorSel(); return;
  }
  if(drag.mode==='corner'){
    const P=RP(), was=P[drag.i].slice();
    let np=pt;
    if(mods.altKey){ setAlignGuides([]); setAlignNote('Free'); }   // alt drops the magnet, same as everywhere else
    else {
      // shift reaches past the magnet's radius, for an alignment too far off to bite on its own
      const s=snapCorner(drag.i, pt, mods.shiftKey?Infinity:alignRadius());
      np=s.pt; setAlignGuides(s.guides); setAlignNote(s.note);
    }
    P[drag.i]=np;
    if(!polySimple(P)){ P[drag.i]=was; setAlignGuides([]); setAlignNote(''); }
    else clampOpenings();
    bumpRev(); scheduleDraw(); renderRoomSel(); renderWalls(); return;
  }
  if(drag.mode==='wall'){
    const P=RP(), n=P.length, i=drag.i, w=wallOf(i);
    const dx=pt[0]-drag.last[0], dy=pt[1]-drag.last[1];
    const k=dx*w.nrm[0]+dy*w.nrm[1];          // perpendicular component only
    const a=P[i].slice(), b=P[(i+1)%n].slice();
    P[i]=[a[0]+w.nrm[0]*k, a[1]+w.nrm[1]*k];
    P[(i+1)%n]=[b[0]+w.nrm[0]*k, b[1]+w.nrm[1]*k];
    if(!polySimple(P)){ P[i]=a; P[(i+1)%n]=b; }
    else { drag.last=pt; clampOpenings(); }
    bumpRev(); scheduleDraw(); renderRoomSel(); renderWalls(); return;
  }
  if(drag.mode==='open'){
    const o=openOf(drag.id); if(!o) return;
    const near=nearestOnWalls(pt); if(!near) return;
    o.wall=near.i;
    const len=wallOf(near.i).len;
    o.width=Math.min(o.width,len);
    o.offset=Math.max(0,Math.min(near.t*len-o.width/2, len-o.width));
    bumpRev(); scheduleDraw(); renderRoomSel(); renderOpen(); return;
  }
  if(drag.mode==='pillar'){
    const pl=pillarOf(drag.id); if(!pl) return;
    let nx=pt[0]-drag.dx, ny=pt[1]-drag.dy;
    if(!mods.altKey){ const s=snapPt([nx,ny]); nx=s[0]; ny=s[1]; }
    pl.x=nx; pl.y=ny;
    bumpRev(); scheduleDraw(); renderRoomSel(); renderWalls(); return;
  }
  if(drag.mode==='iwall'){
    const w=iwallOf(drag.id); if(!w) return;
    let nx=pt[0]-drag.dx, ny=pt[1]-drag.dy;
    if(!mods.altKey){ const s=snapPt([nx,ny]); nx=s[0]; ny=s[1]; }
    const ddx=nx-w.a[0], ddy=ny-w.a[1];
    w.a=[w.a[0]+ddx, w.a[1]+ddy]; w.b=[w.b[0]+ddx, w.b[1]+ddy];
    bumpRev(); scheduleDraw(); renderRoomSel(); renderWalls(); return;
  }
  if(drag.mode==='iwall-end'){
    const w=iwallOf(drag.id); if(!w) return;
    const other = drag.end==='a' ? w.b : w.a;
    const raw = mods.shiftKey ? axisLockFrom(other,pt) : pt;
    w[drag.end]=snapWallPoint(raw, drag.id, !mods.altKey);
    bumpRev(); scheduleDraw(); renderRoomSel(); renderWalls(); return;
  }

  if(drag.mode==='marquee'){
    drag.x1=px; drag.y1=py;
    scheduleDraw(); return;
  }
  if(drag.mode==='rot'){
    const inst=instOf(drag.id); if(!inst) return;
    const it=itemOf(inst.itemId); if(!it) return;
    const a=Math.atan2(wy(py)-inst.y, wx(px)-inst.x);
    let deg=drag.start+(a-drag.a0)*180/Math.PI;
    if(!mods.shiftKey) deg=Math.round(deg/15)*15;
    const prev=inst.rot;
    inst.rot=norm360(deg);
    if(!drag.loose && !validate(inst,worldPoly(inst,it)).ok) inst.rot=prev;
    bumpRev(); scheduleDraw(); renderSel(); return;
  }
  // drag.mode==='move': one or more furniture items, each clamped/validated
  // independently against walls/collisions (a group can end up slightly
  // uneven if one item hits something — accepted tradeoff over blocking the
  // whole group on a single collision)
  const anchor=instOf(drag.anchorId); if(!anchor) return;
  let anx=pt[0]-drag.dx, any=pt[1]-drag.dy;
  const anchorIt=itemOf(anchor.itemId);
  const g=snapMM();
  if(g>0&&!mods.altKey&&anchorIt){
    const b=bbox(worldPoly({x:0,y:0,rot:anchor.rot},anchorIt));
    anx=Math.round((anx+b.x0)/g)*g-b.x0;
    any=Math.round((any+b.y0)/g)*g-b.y0;
  }
  const anchorStart=drag.starts.find(s=>s.id===drag.anchorId);
  const ddx=anx-anchorStart.x, ddy=any-anchorStart.y;
  for(const st of drag.starts){
    const inst=instOf(st.id); const it=inst&&itemOf(inst.itemId);
    if(!inst||!it) continue;
    const nx=st.x+ddx, ny=st.y+ddy;
    const px0=inst.x, py0=inst.y;
    inst.x=nx; inst.y=ny;
    const v=validate(inst,worldPoly(inst,it));
    if(v.ok) drag.loose=false;
    else if(drag.loose){
      if(!centreInside(inst)){ inst.x=px0; inst.y=py0; }
    } else {
      // go as far toward the pointer as fits, per axis, so the piece meets the
      // wall flush rather than stopping wherever the last pointer event left it
      const p=slideToValid(inst,it,[px0,py0],[nx,ny]);
      if(Math.hypot(p[0]-px0,p[1]-py0)<0.01){ inst.x=px0; inst.y=py0; if(drag.starts.length===1) flash(v.why); }
    }
  }
  bumpRev(); scheduleDraw();
}

/* auto-scroll the canvas when a drag or a wall/room draw sits near the visible
   edge and the cursor stops moving — event-driven pointermove alone can't do
   this since no new events fire while the cursor is still */
const EDGE_PAN_ZONE=40, EDGE_PAN_MAXSPD=18;
function edgePanVel(px,py){
  let vx=0, vy=0;
  if(px<EDGE_PAN_ZONE) vx=-EDGE_PAN_MAXSPD*(1-px/EDGE_PAN_ZONE);
  else if(px>W-EDGE_PAN_ZONE) vx=EDGE_PAN_MAXSPD*(1-(W-px)/EDGE_PAN_ZONE);
  if(py<EDGE_PAN_ZONE) vy=-EDGE_PAN_MAXSPD*(1-py/EDGE_PAN_ZONE);
  else if(py>H-EDGE_PAN_ZONE) vy=EDGE_PAN_MAXSPD*(1-(H-py)/EDGE_PAN_ZONE);
  return {vx,vy};
}

/* Escape mid-drag: put whatever was being dragged back exactly where it started */
function cancelDrag(){
  const wasFloor = drag.mode==='floor-room'||drag.mode==='floor-rot';
  if(drag.mode==='pan'||drag.mode==='marquee'){ if(drag.mode==='pan'){ view.ox=drag.ox; view.oy=drag.oy; } }
  else if(drag.snap){
    const s=JSON.parse(drag.snap);
    if(wasFloor) for(const [id,place] of s){ const l=S.layouts.find(x=>x.id===id); if(l) l.floorPlace=place; }
    else if(ROOM_DRAGS.includes(drag.mode)){ L().room=s.room; L().openings=s.openings; }
    else L().placed=s.placed;
    if(!wasFloor) bumpRev();
  }
  setDrag(null); setFloorGuides([]); setFloorSnapNote(''); setAlignGuides([]); setAlignNote('');
  renderSel(); renderRoomSel(); renderWalls(); renderOpen(); renderFloorSel(); draw();
}
function endDrag(e){
  if(drag&&drag.mode==='marquee'){
    const x0=Math.min(drag.x0,drag.x1), x1=Math.max(drag.x0,drag.x1);
    const y0=Math.min(drag.y0,drag.y1), y1=Math.max(drag.y0,drag.y1);
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
    if(drag.additive) for(const id of hitIds) selectAdd(id);
    else selectSet(hitIds);
    if(hitIds.length) bringToFront(hitIds);
    setDrag(null);
    renderSel(); draw();
    if(e&&e.pointerId!==undefined){ try{ cv.releasePointerCapture(e.pointerId); }catch(err){} }
    return;
  }
  if(drag&&drag.mode==='pan'){
    cv.style.cursor = spaceDown ? 'grab' : '';
  } else if(drag){
    save();
    setAlignGuides([]); setAlignNote('');
    if(drag.mode==='floor-room'||drag.mode==='floor-rot'){ setFloorGuides([]); setFloorSnapNote(''); commitFloor(); renderFloorSel(); draw(); }
    else if(ROOM_DRAGS.includes(drag.mode)){ commitRoom(); scheduleDraw(); }
    else { commitFurn(); renderSel(); }
  }
  setDrag(null);
  if(e&&e.pointerId!==undefined){ try{ cv.releasePointerCapture(e.pointerId); }catch(err){} }
}

const ZOOM_FACTOR = 1.02;
const ZOOM_ACCEL_K = 0.03; // tuned by feel: higher = faster flicks jump further
let wheelState = {last:0};
function edgePanTick(){
  const dragging = drag && drag.mode!=='pan';
  const drawing = !!(drawState || wallDrawState || splitDrawState);
  if((dragging||drawing) && lastPX!=null){
    const {vx,vy}=edgePanVel(lastPX,lastPY);
    if(vx||vy){
      view.ox-=vx; view.oy-=vy;
      if(dragging) applyDragAt(lastPX,lastPY,lastMods);
      else applyDrawCursorAt(lastPX,lastPY,lastMods.shiftKey);
      scheduleDraw();
    }
  }
  requestAnimationFrame(edgePanTick);
}

export {spaceDown, setSpaceDown, ROOM_DRAGS, lastPX, lastPY, lastMods, setLastPX, setLastPY, setLastMods, DEADZONE_MODES, DEADZONE_PX, applyDragAt, EDGE_PAN_ZONE, EDGE_PAN_MAXSPD, edgePanVel, cancelDrag, endDrag, ZOOM_FACTOR, ZOOM_ACCEL_K, wheelState, edgePanTick};
