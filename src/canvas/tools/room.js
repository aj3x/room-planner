/* Room mode: picking and dragging what a room is made of — a corner, a
   wall, a door or window, a pillar, an interior wall or one of its ends.
   A press on nothing pans.

   A drag ignores the first DEADZONE_PX of movement, so a click on a point
   does not nudge it, and snapshots the room on its first real move so that
   Escape can put everything back. Every frame is a preview('room'); the
   pointerup commits once, so one drag is one undo step. */

import {polySimple} from '../../core/geometry.js';
import {snapRoom} from '../../core/history.js';
import {alignGuides, alignNote, roomSel, selectClear} from '../../core/selection.js';
import {signal} from '../../core/signals.js';
import {L, RP, openOf, roomMode} from '../../core/state.js';
import {preview, transact} from '../../core/tx.js';
import {clampOpenings, iwallOf, nearestOnWalls, pillarOf, wallOf} from '../../model/walls.js';
import {drawSquareTick} from '../paint.js';
import {alignRadius, pickRoom, snapCorner, snapWallPoint} from '../snap.js';
import {axisLockFrom, snapPt, wx, wy} from '../view.js';
import {startPan} from './pan.js';

const DEADZONE_PX=4;

/* the drag in flight: {mode, ox, oy, armed, snap, …} — replaced when one
   starts or ends, mutated in place while it moves */
const roomDrag = signal(null);

function roomDown(e,px,py){
  const hit=pickRoom(px,py);
  if(!hit){ roomSel.value = null; return startPan(px,py); }
  roomSel.value = hit; selectClear();
  if(hit.kind==='opening') roomDrag.value = {mode:'open', id:hit.id, ox:px, oy:py, armed:false};
  else if(hit.kind==='corner') roomDrag.value = {mode:'corner', i:hit.i, ox:px, oy:py, armed:false};
  else if(hit.kind==='pillar'){
    const pl=pillarOf(hit.id);
    roomDrag.value = {mode:'pillar', id:hit.id, dx:wx(px)-pl.x, dy:wy(py)-pl.y, ox:px, oy:py, armed:false};
  }
  else if(hit.kind==='iwall'){
    if(hit.end) roomDrag.value = {mode:'iwall-end', id:hit.id, end:hit.end, ox:px, oy:py, armed:false};
    else { const w=iwallOf(hit.id); roomDrag.value = {mode:'iwall', id:hit.id, dx:wx(px)-w.a[0], dy:wy(py)-w.a[1], ox:px, oy:py, armed:false}; }
  }
  else roomDrag.value = {mode:'wall', i:hit.i, last:[wx(px),wy(py)], ox:px, oy:py, armed:false};
  return roomTool;
}

function roomMove(px,py,mods){
  const d=roomDrag.value;
  if(!d) return;
  if(!d.armed){
    if(Math.hypot(px-d.ox, py-d.oy)<DEADZONE_PX) return;   // ignore tiny jitter so a click on the point doesn't nudge it
    d.armed=true;
  }
  const pt=[wx(px),wy(py)];
  // nothing has moved yet: remember how things stood so Escape can put them back
  if(!d.snap) d.snap = snapRoom();

  if(d.mode==='corner'){
    const P=RP(), was=P[d.i].slice();
    let np=pt;
    if(mods.altKey){ alignGuides.value = []; alignNote.value = 'Free'; }   // alt drops the magnet, same as everywhere else
    else {
      // shift reaches past the magnet's radius, for an alignment too far off to bite on its own
      const s=snapCorner(d.i, pt, mods.shiftKey?Infinity:alignRadius());
      np=s.pt; alignGuides.value = s.guides; alignNote.value = s.note;
    }
    P[d.i]=np;
    if(!polySimple(P)){ P[d.i]=was; alignGuides.value = []; alignNote.value = ''; }
    else clampOpenings();
    preview('room'); return;
  }
  if(d.mode==='wall'){
    const P=RP(), n=P.length, i=d.i, w=wallOf(i);
    const dx=pt[0]-d.last[0], dy=pt[1]-d.last[1];
    const k=dx*w.nrm[0]+dy*w.nrm[1];          // perpendicular component only
    const a=P[i].slice(), b=P[(i+1)%n].slice();
    P[i]=[a[0]+w.nrm[0]*k, a[1]+w.nrm[1]*k];
    P[(i+1)%n]=[b[0]+w.nrm[0]*k, b[1]+w.nrm[1]*k];
    if(!polySimple(P)){ P[i]=a; P[(i+1)%n]=b; }
    else { d.last=pt; clampOpenings(); }
    preview('room'); return;
  }
  if(d.mode==='open'){
    const o=openOf(d.id); if(!o) return;
    const near=nearestOnWalls(pt); if(!near) return;
    o.wall=near.i;
    const len=wallOf(near.i).len;
    o.width=Math.min(o.width,len);
    o.offset=Math.max(0,Math.min(near.t*len-o.width/2, len-o.width));
    preview('room'); return;
  }
  if(d.mode==='pillar'){
    const pl=pillarOf(d.id); if(!pl) return;
    let nx=pt[0]-d.dx, ny=pt[1]-d.dy;
    if(!mods.altKey){ const s=snapPt([nx,ny]); nx=s[0]; ny=s[1]; }
    pl.x=nx; pl.y=ny;
    preview('room'); return;
  }
  if(d.mode==='iwall'){
    const w=iwallOf(d.id); if(!w) return;
    let nx=pt[0]-d.dx, ny=pt[1]-d.dy;
    if(!mods.altKey){ const s=snapPt([nx,ny]); nx=s[0]; ny=s[1]; }
    const ddx=nx-w.a[0], ddy=ny-w.a[1];
    w.a=[w.a[0]+ddx, w.a[1]+ddy]; w.b=[w.b[0]+ddx, w.b[1]+ddy];
    preview('room'); return;
  }
  if(d.mode==='iwall-end'){
    const w=iwallOf(d.id); if(!w) return;
    const other = d.end==='a' ? w.b : w.a;
    const raw = mods.shiftKey ? axisLockFrom(other,pt) : pt;
    w[d.end]=snapWallPoint(raw, d.id, !mods.altKey);
    preview('room'); return;
  }
}

/* the whole gesture is one undo step, recorded here and nowhere in between */
function roomUp(){
  transact('room', ()=>{ alignGuides.value = []; alignNote.value = ''; });
  roomDrag.value = null;
}

/* Escape mid-drag: put whatever was being dragged back exactly where it started */
function roomCancel(){
  const d=roomDrag.value;
  if(d.snap){ const s=JSON.parse(d.snap); L().room=s.room; L().openings=s.openings; }
  roomDrag.value = null; alignGuides.value = []; alignNote.value = '';
  // back where the gesture started, which is what storage and history already hold
  preview('room');
}

/* the 90° tick on a corner being dragged square, under the handles */
const cornerTickOverlay = {
  id:'corner-tick', z:115, scene:'room',
  deps(){ roomDrag.value; alignNote.value; },
  draw(){
    const P=RP(), d=roomDrag.value;
    if(alignNote.value==='Right angle' && d && d.mode==='corner' && P.length>2){
      const n=P.length, i=d.i;
      drawSquareTick(P[(i-1+n)%n], P[i], P[(i+1)%n]);
    }
  }
};

const roomTool = {
  id:'room', autoPan:true,
  active: roomMode,
  onDown: roomDown, onMove: roomMove, onUp: roomUp, onCancel: roomCancel,
  overlay: cornerTickOverlay,
};

export {roomTool, roomDrag};
