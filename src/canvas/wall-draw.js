/* Drawing a freestanding interior wall.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added. §3 gives this banner no file of its own; it is its
   own two-function region, so it gets one.
*/
import {commitRoom} from '../core/history.js';
import {setRoomSel} from '../core/selection.js';
import {L, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {renderRoomSel, renderWalls} from '../plan/room-panel.js';
import {draw} from './draw.js';
import {setWallDrawState} from './interaction-state.js';
function cancelWallDraw(){ setWallDrawState(null); draw(); }
function finishWallDraw(a,b){
  const w={id:uid(), a, b, t:L().room.wall};
  L().room.iwalls.push(w);
  setWallDrawState(null);
  setRoomSel({kind:'iwall', id:w.id});
  renderWalls(); renderRoomSel(); draw(); save(); commitRoom();
}
export {cancelWallDraw, finishWallDraw};
