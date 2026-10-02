/* Drawing a freestanding interior wall.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added. §3 gives this banner no file of its own; it is its
   own two-function region, so it gets one.
*/
import {emit, repaint} from '../core/bus.js';
import {setRoomSel} from '../core/selection.js';
import {L, uid} from '../core/state.js';
import {transact} from '../core/tx.js';
import {draw} from './draw.js';
import {setWallDrawState} from './interaction-state.js';
import {roomMode} from '../core/state.js';
import {flash} from '../ui/flash.js';
import {drawState, setDrawCursor, splitDrawState} from './interaction-state.js';
import {measureOn} from './measure-state.js';
import {setMeasure} from './measure-tool.js';
import {cancelCustomDraw} from './room-draw.js';
import {cancelSplitDraw} from './split-room.js';
function cancelWallDraw(){ setWallDrawState(null); draw(); }
function finishWallDraw(a,b){
  const w={id:uid(), a, b, t:L().room.wall};
  transact('room', ()=>{
    L().room.iwalls.push(w);
    setWallDrawState(null);
    setRoomSel({kind:'iwall', id:w.id});
  });
  repaint('walls','roomSel');
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* ------------------------- drawing a freestanding wall ------------------------- */
function startWallDraw(){
  if(drawState) cancelCustomDraw();
  if(splitDrawState) cancelSplitDraw();
  if(measureOn) setMeasure(false);
  if(!roomMode()) emit('mode:set','room');
  setWallDrawState({a:null}); setDrawCursor(null);
  setRoomSel(null); repaint('roomSel');
  flash('Click the wall’s start, then its end. Esc cancels.');
  draw();
}
export {cancelWallDraw, finishWallDraw, startWallDraw};
