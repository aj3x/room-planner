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
import {snapFloor, snapFurn, snapRoom} from '../core/history.js';
import {selectAdd, selectSet, alignGuides, alignNote, floorGuides, floorSnapNote, roomSel, mergeToggle, mergeClear} from '../core/selection.js';
import {L, RP, S, instOf, itemOf, openOf} from '../core/state.js';
import {preview, transact} from '../core/tx.js';
import {centreInside, slideToValid, validate} from '../model/validity.js';
import {clampOpenings, iwallOf, nearestOnWalls, pillarOf, wallOf} from '../model/walls.js';
import {snapWallPoint} from './snap.js';
import {flash} from '../ui/flash.js';
import {draw, scheduleDraw, snapFloorPlace} from './draw.js';
import {drag} from './interaction-state.js';
import {alignRadius, bringToFront, snapCorner} from './snap.js';
import {H, W, axisLockFrom, cv, snapMM, snapPt, view, wx, wy} from './view.js';
import {drawState, splitDrawState, wallDrawState} from './interaction-state.js';
import {applyDrawCursorAt} from './room-draw.js';
/* the rest are here for onCanvasPointerDown, which moved in from the shell */
import {pointInPoly} from '../core/geometry.js';
import {floorEntry} from '../core/history.js';
import {floorSel, mergeSel, sel, selSet, selectClear, selectOnly, selectToggle} from '../core/selection.js';
import {floorMode, floorOf, roomMode, uid} from '../core/state.js';
import {isBad} from '../model/validity.js';
import {floorMembers, floorRotHandle, handlePos, pickFloorRoom} from './draw.js';
import {measureOn} from './measure-state.js';
import {measurePointerDown} from './measure-tool.js';
import {drawSnapPoint, finishCustomDraw} from './room-draw.js';
import {boundaryHit, splitResolvePoint, trySplitLine} from './split-room.js';
import {pickAt, pickRoom} from './snap.js';
import {sx, sy} from './view.js';
import {finishWallDraw} from './wall-draw.js';
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
/* Where a gesture on the canvas begins: one dispatcher over every mode the
   canvas can be in. Order matters and is not arbitrary — space-to-pan wins
   over everything, the three draw modes (room outline, freestanding wall,
   split line) each swallow the click while they are live, measuring comes
   next, and only then do Floor / Room / Furniture get a look at it.

   Moved out of index.html's <script> as part of Step 4 of
   .claude/plans/decoupling.md. The registration itself stayed behind, at the
   exact line it occupied — AGENTS.md rule 3: a module that calls
   addEventListener at import time is a top-level side effect AND jumps that
   listener ahead of every other one in the file. The rule is about the
   registration, not the body, so index.html now reads
   `cv.addEventListener('pointerdown', onCanvasPointerDown)` and the 165 lines
   of mode dispatch live here, where a unit test can reach them. */
function onCanvasPointerDown(e){
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  const px=e.offsetX, py=e.offsetY;

  if(spaceDown){
    drag.value = {mode:'pan', px, py, ox:view.ox, oy:view.oy};
    cv.style.cursor='grabbing';
    draw();
    return;
  }

  if(drawState.value){
    const raw=[wx(px),wy(py)];
    if(drawState.value.pts.length>=3){
      const s0=[sx(drawState.value.pts[0][0]), sy(drawState.value.pts[0][1])];
      if(Math.hypot(px-s0[0], py-s0[1])<12){ finishCustomDraw(); return; }
    }
    drawState.value.pts.push(drawSnapPoint(raw,e.shiftKey));
    alignGuides.value = []; alignNote.value = '';
    draw();
    return;
  }

  if(wallDrawState.value){
    const raw0=[wx(px),wy(py)];
    const raw = (wallDrawState.value.a && e.shiftKey) ? axisLockFrom(wallDrawState.value.a,raw0) : raw0;
    const snapped=snapWallPoint(raw,null,!e.altKey);
    if(!wallDrawState.value.a){ wallDrawState.value.a=snapped; draw(); return; }
    if(Math.hypot(snapped[0]-wallDrawState.value.a[0], snapped[1]-wallDrawState.value.a[1])<50){ flash('Drag out a longer wall'); return; }
    finishWallDraw(wallDrawState.value.a, snapped);
    return;
  }

  if(splitDrawState.value){
    const raw0=[wx(px),wy(py)];
    const pts=splitDrawState.value.pts;
    const resolved=splitResolvePoint(raw0, e.shiftKey);
    const snapped=snapWallPoint(resolved.pt,null,!e.altKey);
    const hit=boundaryHit(snapped);
    if(hit){
      if(!pts.length){ pts.push(hit); draw(); return; }
      trySplitLine(pts[0], pts.slice(1), hit);
      return;
    }
    if(!pts.length){ flash("Click a point on the room's wall"); return; }
    if(!pointInPoly(snapped, RP())){ flash('Stay inside the room'); return; }
    pts.push(snapped);
    draw();
    return;
  }

  if(measureOn.value){ measurePointerDown(px,py); return; }

  /* Floor mode positions whole rooms; their walls and items are edited in Room/Furniture */
  if(floorMode()){
    if(e.button===2) return;   // a right-click's own pointerdown; contextmenu handles the click itself
    const fl=floorOf(L().floorId);
    if(fl && floorSel.value){
      const m=floorMembers(fl).find(x=>x.l.id===floorSel.value);
      if(m){
        const h=floorRotHandle(m.P);
        if(Math.hypot(px-h.x,py-h.y)<14){
          const b=bbox(m.P);
          drag.value = {mode:'floor-rot', id:floorSel.value, start:m.l.floorPlace.rot||0,
                a0:Math.atan2(wy(py)-(b.y0+b.y1)/2, wx(px)-(b.x0+b.x1)/2)};
          return;
        }
      }
    }
    const hit=pickFloorRoom(px,py);
    if(hit){
      if(e.shiftKey){
        mergeToggle(hit);
        return;   // shift+click only marks rooms for merge/delete — it never moves one
      }
      mergeSel.value = new Set([hit]);   // seeds the pair: a plain click here, then shift+click a second room
      const l=S.layouts.find(x=>x.id===hit);
      floorEntry();   // baseline the arrangement BEFORE it moves, or there is nothing to undo to
      floorSel.value = hit;
      drag.value = {mode:'floor-room', id:hit, dx:wx(px)-l.floorPlace.x, dy:wy(py)-l.floorPlace.y};
      return;
    }
    if(floorSel.value){ floorSel.value = null; }
    mergeClear();
    drag.value = {mode:'pan', px, py, ox:view.ox, oy:view.oy};
    draw();
    return;
  }

  if(roomMode()){
    const hit=pickRoom(px,py);
    if(hit){
      roomSel.value = hit; selectClear();
      if(hit.kind==='opening') drag.value = {mode:'open', id:hit.id, ox:px, oy:py, armed:false};
      else if(hit.kind==='corner') drag.value = {mode:'corner', i:hit.i, ox:px, oy:py, armed:false};
      else if(hit.kind==='pillar'){
        const pl=pillarOf(hit.id);
        drag.value = {mode:'pillar', id:hit.id, dx:wx(px)-pl.x, dy:wy(py)-pl.y, ox:px, oy:py, armed:false};
      }
      else if(hit.kind==='iwall'){
        if(hit.end) drag.value = {mode:'iwall-end', id:hit.id, end:hit.end, ox:px, oy:py, armed:false};
        else { const w=iwallOf(hit.id); drag.value = {mode:'iwall', id:hit.id, dx:wx(px)-w.a[0], dy:wy(py)-w.a[1], ox:px, oy:py, armed:false}; }
      }
      else drag.value = {mode:'wall', i:hit.i, last:[wx(px),wy(py)], ox:px, oy:py, armed:false};
      return;
    }
    roomSel.value = null;
    drag.value = {mode:'pan', px, py, ox:view.ox, oy:view.oy};
    draw();
    return;
  }

  if(!e.altKey && selSet.value.size===1 && sel.value){
    const inst=instOf(sel.value), it=inst&&itemOf(inst.itemId);
    if(inst&&it){
      const h=handlePos(inst,it);
      if(Math.hypot(px-h.x,py-h.y)<14){
        drag.value = {mode:'rot', id:sel.value, start:inst.rot||0, a0:Math.atan2(wy(py)-inst.y, wx(px)-inst.x), loose:isBad(inst)};
        return;
      }
    }
  }
  const hit=pickAt(wx(px),wy(py));
  if(hit && e.altKey){
    // Alt+drag: duplicate the clicked item (or the whole selection, if the
    // clicked item is already part of a multi-selection) and drag the copies,
    // leaving the originals in place. Snapshot BEFORE pushing the duplicates
    // so undo removes them entirely, as one step with the drag that follows.
    const srcIds = selSet.value.has(hit.id) && selSet.value.size>1 ? [...selSet.value] : [hit.id];
    const snap = snapFurn();
    const idMap = new Map();
    for(const id of srcIds){
      const src=instOf(id); if(!src) continue;
      const dupe={...src, id:uid()};
      L().placed.push(dupe);
      idMap.set(id, dupe.id);
    }
    const newIds=[...idMap.values()];
    if(!newIds.length) return;
    bringToFront(newIds);
    selectSet(newIds);
    const anchorNew=idMap.get(hit.id);
    const starts=newIds.map(id=>{ const p=instOf(id); return {id,x:p.x,y:p.y}; });
    drag.value = {mode:'move', ids:newIds, anchorId:anchorNew, dx:wx(px)-instOf(anchorNew).x, dy:wy(py)-instOf(anchorNew).y, starts, loose:isBad(instOf(anchorNew)), snap};
    preview('furn');   // the copies are committed with the drag, by endDrag
    return;
  }
  if(hit){
    if(e.shiftKey) selectToggle(hit.id);
    else if(!selSet.value.has(hit.id)) selectOnly(hit.id);
    bringToFront([...selSet.value]);
    const ids=[...selSet.value];
    const starts=ids.map(id=>{ const p=instOf(id); return {id,x:p.x,y:p.y}; });
    drag.value = {mode:'move', ids, anchorId:hit.id, dx:wx(px)-hit.x, dy:wy(py)-hit.y, starts, loose:isBad(hit)};
  } else {
    drag.value = {mode:'marquee', x0:px, y0:py, x1:px, y1:py, additive:e.shiftKey};
    draw();
  }
}

function applyDragAt(px,py,mods){
  if(!drag.value) return;
  if(!drag.value.armed && DEADZONE_MODES.includes(drag.value.mode)){
    if(Math.hypot(px-drag.value.ox, py-drag.value.oy)<DEADZONE_PX) return;   // ignore tiny jitter so a click on the point doesn't nudge it
    drag.value.armed=true;
  }
  const pt=[wx(px),wy(py)];
  const floorDrag = drag.value.mode==='floor-room'||drag.value.mode==='floor-rot';
  // nothing has moved yet: remember how things stood so Escape can put them back
  if(drag.value.mode!=='pan' && !drag.value.snap) drag.value.snap = floorDrag ? snapFloor() : ROOM_DRAGS.includes(drag.value.mode) ? snapRoom() : snapFurn();

  if(drag.value.mode==='pan'){
    view.ox=drag.value.ox+(px-drag.value.px); view.oy=drag.value.oy+(py-drag.value.py);
    scheduleDraw(); return;
  }
  if(drag.value.mode==='floor-room'){
    const l=S.layouts.find(x=>x.id===drag.value.id); if(!l) return;
    let nx=pt[0]-drag.value.dx, ny=pt[1]-drag.value.dy;
    if(mods.altKey){ floorGuides.value = []; floorSnapNote.value = 'Free'; }   // alt drops the magnet, same as everywhere else
    else { const s=snapFloorPlace(l,nx,ny); nx=s.x; ny=s.y; floorGuides.value = s.guides; floorSnapNote.value = s.note; }
    l.floorPlace.x=nx; l.floorPlace.y=ny;
    preview('floor'); return;
  }
  if(drag.value.mode==='floor-rot'){
    const l=S.layouts.find(x=>x.id===drag.value.id); if(!l) return;
    const b=bbox(floorPts(l));
    const a=Math.atan2(pt[1]-(b.y0+b.y1)/2, pt[0]-(b.x0+b.x1)/2);
    let deg=drag.value.start+(a-drag.value.a0)*180/Math.PI;
    if(!mods.altKey) deg=Math.round(deg/15)*15;   // free turn is the exception, not the rule
    l.floorPlace.rot=norm360(deg);
    preview('floor'); return;
  }
  if(drag.value.mode==='corner'){
    const P=RP(), was=P[drag.value.i].slice();
    let np=pt;
    if(mods.altKey){ alignGuides.value = []; alignNote.value = 'Free'; }   // alt drops the magnet, same as everywhere else
    else {
      // shift reaches past the magnet's radius, for an alignment too far off to bite on its own
      const s=snapCorner(drag.value.i, pt, mods.shiftKey?Infinity:alignRadius());
      np=s.pt; alignGuides.value = s.guides; alignNote.value = s.note;
    }
    P[drag.value.i]=np;
    if(!polySimple(P)){ P[drag.value.i]=was; alignGuides.value = []; alignNote.value = ''; }
    else clampOpenings();
    preview('room'); return;
  }
  if(drag.value.mode==='wall'){
    const P=RP(), n=P.length, i=drag.value.i, w=wallOf(i);
    const dx=pt[0]-drag.value.last[0], dy=pt[1]-drag.value.last[1];
    const k=dx*w.nrm[0]+dy*w.nrm[1];          // perpendicular component only
    const a=P[i].slice(), b=P[(i+1)%n].slice();
    P[i]=[a[0]+w.nrm[0]*k, a[1]+w.nrm[1]*k];
    P[(i+1)%n]=[b[0]+w.nrm[0]*k, b[1]+w.nrm[1]*k];
    if(!polySimple(P)){ P[i]=a; P[(i+1)%n]=b; }
    else { drag.value.last=pt; clampOpenings(); }
    preview('room'); return;
  }
  if(drag.value.mode==='open'){
    const o=openOf(drag.value.id); if(!o) return;
    const near=nearestOnWalls(pt); if(!near) return;
    o.wall=near.i;
    const len=wallOf(near.i).len;
    o.width=Math.min(o.width,len);
    o.offset=Math.max(0,Math.min(near.t*len-o.width/2, len-o.width));
    preview('room'); return;
  }
  if(drag.value.mode==='pillar'){
    const pl=pillarOf(drag.value.id); if(!pl) return;
    let nx=pt[0]-drag.value.dx, ny=pt[1]-drag.value.dy;
    if(!mods.altKey){ const s=snapPt([nx,ny]); nx=s[0]; ny=s[1]; }
    pl.x=nx; pl.y=ny;
    preview('room'); return;
  }
  if(drag.value.mode==='iwall'){
    const w=iwallOf(drag.value.id); if(!w) return;
    let nx=pt[0]-drag.value.dx, ny=pt[1]-drag.value.dy;
    if(!mods.altKey){ const s=snapPt([nx,ny]); nx=s[0]; ny=s[1]; }
    const ddx=nx-w.a[0], ddy=ny-w.a[1];
    w.a=[w.a[0]+ddx, w.a[1]+ddy]; w.b=[w.b[0]+ddx, w.b[1]+ddy];
    preview('room'); return;
  }
  if(drag.value.mode==='iwall-end'){
    const w=iwallOf(drag.value.id); if(!w) return;
    const other = drag.value.end==='a' ? w.b : w.a;
    const raw = mods.shiftKey ? axisLockFrom(other,pt) : pt;
    w[drag.value.end]=snapWallPoint(raw, drag.value.id, !mods.altKey);
    preview('room'); return;
  }

  if(drag.value.mode==='marquee'){
    drag.value.x1=px; drag.value.y1=py;
    scheduleDraw(); return;
  }
  if(drag.value.mode==='rot'){
    const inst=instOf(drag.value.id); if(!inst) return;
    const it=itemOf(inst.itemId); if(!it) return;
    const a=Math.atan2(wy(py)-inst.y, wx(px)-inst.x);
    let deg=drag.value.start+(a-drag.value.a0)*180/Math.PI;
    if(!mods.shiftKey) deg=Math.round(deg/15)*15;
    const prev=inst.rot;
    inst.rot=norm360(deg);
    if(!drag.value.loose && !validate(inst,worldPoly(inst,it)).ok) inst.rot=prev;
    preview('furn'); return;
  }
  // drag.mode==='move': one or more furniture items, each clamped/validated
  // independently against walls/collisions (a group can end up slightly
  // uneven if one item hits something — accepted tradeoff over blocking the
  // whole group on a single collision)
  const anchor=instOf(drag.value.anchorId); if(!anchor) return;
  let anx=pt[0]-drag.value.dx, any=pt[1]-drag.value.dy;
  const anchorIt=itemOf(anchor.itemId);
  const g=snapMM();
  if(g>0&&!mods.altKey&&anchorIt){
    const b=bbox(worldPoly({x:0,y:0,rot:anchor.rot},anchorIt));
    anx=Math.round((anx+b.x0)/g)*g-b.x0;
    any=Math.round((any+b.y0)/g)*g-b.y0;
  }
  const anchorStart=drag.value.starts.find(s=>s.id===drag.value.anchorId);
  const ddx=anx-anchorStart.x, ddy=any-anchorStart.y;
  for(const st of drag.value.starts){
    const inst=instOf(st.id); const it=inst&&itemOf(inst.itemId);
    if(!inst||!it) continue;
    const nx=st.x+ddx, ny=st.y+ddy;
    const px0=inst.x, py0=inst.y;
    inst.x=nx; inst.y=ny;
    const v=validate(inst,worldPoly(inst,it));
    if(v.ok) drag.value.loose=false;
    else if(drag.value.loose){
      if(!centreInside(inst)){ inst.x=px0; inst.y=py0; }
    } else {
      // go as far toward the pointer as fits, per axis, so the piece meets the
      // wall flush rather than stopping wherever the last pointer event left it
      const p=slideToValid(inst,it,[px0,py0],[nx,ny]);
      if(Math.hypot(p[0]-px0,p[1]-py0)<0.01){ inst.x=px0; inst.y=py0; if(drag.value.starts.length===1) flash(v.why); }
    }
  }
  preview('furn');
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

/* Which part of the document a drag edits. Pan and marquee edit nothing. */
function dragScope(mode){
  return mode==='floor-room'||mode==='floor-rot' ? 'floor' : ROOM_DRAGS.includes(mode) ? 'room' : 'furn';
}

/* Escape mid-drag: put whatever was being dragged back exactly where it started */
function cancelDrag(){
  const mode=drag.value.mode, wasFloor = mode==='floor-room'||mode==='floor-rot';
  const edits = mode!=='pan' && mode!=='marquee';
  if(!edits){ if(mode==='pan'){ view.ox=drag.value.ox; view.oy=drag.value.oy; } }
  else if(drag.value.snap){
    const s=JSON.parse(drag.value.snap);
    if(wasFloor) for(const [id,place] of s){ const l=S.layouts.find(x=>x.id===id); if(l) l.floorPlace=place; }
    else if(ROOM_DRAGS.includes(mode)){ L().room=s.room; L().openings=s.openings; }
    else L().placed=s.placed;
  }
  drag.value = null; floorGuides.value = []; floorSnapNote.value = ''; alignGuides.value = []; alignNote.value = '';
  // back where the gesture started, which is what storage and history already hold
  if(edits) preview(dragScope(mode)); else draw();
}
function endDrag(e){
  if(drag.value&&drag.value.mode==='marquee'){
    const x0=Math.min(drag.value.x0,drag.value.x1), x1=Math.max(drag.value.x0,drag.value.x1);
    const y0=Math.min(drag.value.y0,drag.value.y1), y1=Math.max(drag.value.y0,drag.value.y1);
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
    if(drag.value.additive) for(const id of hitIds) selectAdd(id);
    else selectSet(hitIds);
    if(hitIds.length) bringToFront(hitIds);
    drag.value = null;
    if(e&&e.pointerId!==undefined){ try{ cv.releasePointerCapture(e.pointerId); }catch(err){} }
    return;
  }
  if(drag.value&&drag.value.mode==='pan'){
    cv.style.cursor = spaceDown ? 'grab' : '';
  } else if(drag.value){
    // the whole gesture is one undo step, recorded here and nowhere in between
    const scope=dragScope(drag.value.mode);
    transact(scope, ()=>{
      alignGuides.value = []; alignNote.value = '';
      if(scope==='floor'){ floorGuides.value = []; floorSnapNote.value = ''; }
    });
  }
  drag.value = null;
  if(e&&e.pointerId!==undefined){ try{ cv.releasePointerCapture(e.pointerId); }catch(err){} }
}

const ZOOM_FACTOR = 1.02;
const ZOOM_ACCEL_K = 0.03; // tuned by feel: higher = faster flicks jump further
let wheelState = {last:0};
function edgePanTick(){
  const dragging = drag.value && drag.value.mode!=='pan';
  const drawing = !!(drawState.value || wallDrawState.value || splitDrawState.value);
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

export {onCanvasPointerDown, spaceDown, setSpaceDown, ROOM_DRAGS, lastPX, lastPY, lastMods, setLastPX, setLastPY, setLastMods, DEADZONE_MODES, DEADZONE_PX, applyDragAt, EDGE_PAN_ZONE, EDGE_PAN_MAXSPD, edgePanVel, cancelDrag, endDrag, ZOOM_FACTOR, ZOOM_ACCEL_K, wheelState, edgePanTick};
