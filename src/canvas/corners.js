/* Adding and taking away a corner. A wall has no id -- it IS the gap between
   two points -- so splicing the polygon renumbers walls underneath everything
   standing in them; both functions renumber before they render.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only.
*/
import {polySimple} from '../core/geometry.js';
import {commitRoom} from '../core/history.js';
import {setRoomSel} from '../core/selection.js';
import {L, RP} from '../core/state.js';
import {save} from '../core/store.js';
import {clampOpenings, syncWallOff, wallIsOff, wallOf} from '../model/walls.js';
import {renderOpen, renderRoom, renderRoomSel, renderWalls} from '../plan/room-panel.js';
import {flash} from '../ui/flash.js';
import {draw} from './draw.js';

/* ------------------------- adding and taking away a corner -------------------------
   A wall has no id: it IS the gap between points i and i+1, so it is addressed by that
   index. Doors and windows (`opening.wall`) and measurements taken to a wall
   (`anchor.k==='wall'`, `anchor.id`) are pinned to a wall by that same index. Splicing
   the polygon therefore renumbers walls underneath everything standing in them, and
   anything not renumbered to match stays behind on whichever wall inherited its old
   number — which is how a closet door ended up two walls down the room. Both of these
   functions renumber before they render, and clampOpenings then pulls back anything
   left hanging off the end of the wall it landed on. */
/* Not tryRoomEdit, deliberately: it clamps the openings the moment the polygon changes,
   which here is one step too early. At that point every opening still carries its old
   wall number against a polygon that has already been renumbered, so each one is
   measured against somebody else's wall and its offset is squashed to fit. Splice,
   renumber, and only then clamp. */
function splitWall(i){
  const P=RP(), room=L().room, w=wallOf(i);
  P.splice(i+1, 0, [w.mid[0], w.mid[1]]);
  if(!polySimple(P)){ P.splice(i+1,1); flash('That would fold the room over itself'); return; }
  room.wallOff.splice(i+1, 0, wallIsOff(room,i));   // both halves inherit whether that wall was there
  /* One wall became two, so every wall past it moves up a number. A door or window in
     the far half changes wall as well, and starts that much further back along it; one
     straddling the join goes wherever most of it is, since an opening cannot span two
     walls. */
  const half=wallOf(i,P).len;
  for(const o of L().openings){
    if(o.wall>i){ o.wall++; continue; }
    if(o.wall!==i || o.offset+o.width/2 < half) continue;
    o.wall=i+1; o.offset=Math.max(0, o.offset-half);
  }
  for(const m of L().measures) for(const a of [m.a,m.b]) if(a.k==='wall' && a.id>i) a.id++;
  syncWallOff(room);
  clampOpenings();
  setRoomSel({kind:'corner', i:i+1});
  renderRoom(); renderWalls(); renderRoomSel(); renderOpen(); draw(); save(); commitRoom();
}
function deleteCorner(i){
  const P=RP();
  if(P.length<=3){ flash('A room needs at least three corners'); return; }
  const room=L().room, n=P.length, prev=(i-1+n)%n;
  // measured before the splice: how much of the merged wall the absorbing one already
  // accounts for, and so how far along it anything from the far side now starts
  const absorbed=wallOf(prev,P).len;
  const removed=P.splice(i,1);
  if(!polySimple(P)){ P.splice(i,0,removed[0]); flash("That corner can't be removed"); return; }
  room.wallOff.splice(i,1);   // the two edges merge; the one before keeps its state
  // walls i-1 and i are now one wall, numbered i-1, and everything past i drops a number
  const to = w => { const t = w===i ? prev : w; return t>i ? t-1 : t; };
  for(const o of L().openings){
    if(o.wall===i) o.offset+=absorbed;
    o.wall=to(o.wall);
  }
  const l=L();
  for(const m of l.measures) for(const a of [m.a,m.b]) if(a.k==='wall') a.id=to(a.id);
  /* a measurement that ran between the two walls now joins one wall to itself and reads
     zero, so it goes with them */
  const sameEnd = m => m.a.k==='wall' && m.b.k==='wall' && m.a.id===m.b.id
                    && m.a.part===m.b.part && m.a.n===m.b.n;
  l.measures = l.measures.filter(m=>!sameEnd(m));
  syncWallOff(room);
  clampOpenings();
  setRoomSel(null);
  renderRoom(); renderWalls(); renderRoomSel(); renderOpen(); draw(); save(); commitRoom();
}
export {splitWall, deleteCorner};
