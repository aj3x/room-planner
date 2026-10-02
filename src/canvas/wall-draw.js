/* Drawing a freestanding interior wall.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added. §3 gives this banner no file of its own; it is its
   own two-function region, so it gets one.
*/
import {emit, repaint} from '../core/bus.js';
import {roomSel} from '../core/selection.js';
import {L, uid} from '../core/state.js';
import {transact} from '../core/tx.js';
import {draw} from './draw.js';
import {wallDrawState, drawCursor} from './interaction-state.js';
import {roomMode} from '../core/state.js';
import {flash} from '../ui/flash.js';
import {drawState, splitDrawState} from './interaction-state.js';
import {measureOn} from './measure-state.js';
import {setMeasure} from './measure-tool.js';
import {cancelCustomDraw} from './room-draw.js';
import {cancelSplitDraw} from './split-room.js';
function cancelWallDraw(){ wallDrawState.value = null; draw(); }
function finishWallDraw(a,b){
  const w={id:uid(), a, b, t:L().room.wall};
  transact('room', ()=>{
    L().room.iwalls.push(w);
    wallDrawState.value = null;
    roomSel.value = {kind:'iwall', id:w.id};
  });
  repaint('walls','roomSel');
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* ------------------------- drawing a freestanding wall ------------------------- */
function startWallDraw(){
  if(drawState.value) cancelCustomDraw();
  if(splitDrawState.value) cancelSplitDraw();
  if(measureOn) setMeasure(false);
  if(!roomMode()) emit('mode:set','room');
  wallDrawState.value = {a:null}; drawCursor.value = null;
  roomSel.value = null; repaint('roomSel');
  flash('Click the wall’s start, then its end. Esc cancels.');
  draw();
}
export {cancelWallDraw, finishWallDraw, startWallDraw};
