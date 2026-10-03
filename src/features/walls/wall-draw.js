/* Drawing a freestanding interior wall, the commands: starting, finishing
   and abandoning it. The pointer and key handling, and the wall on screen,
   are the wall-draw tool's (canvas/tools/wall-draw.js). */
import {batch} from '../../kernel/signals.js';
import {roomSel} from '../../kernel/selection.js';
import {L, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {wallDrawState, drawCursor, stopOtherTools} from '../canvas/index.js';
import {roomMode} from '../../kernel/state.js';
import {flash} from '../../ui-kit/flash.js';
import {setMode} from '../mode/index.js';
function cancelWallDraw(){ wallDrawState.value = null; }
function finishWallDraw(a,b){
  const w={id:uid(), a, b, t:L().room.wall};
  transact('room', ()=>{
    L().room.iwalls.push(w);
    wallDrawState.value = null;
    roomSel.value = {kind:'iwall', id:w.id};
  });
}

/* ------------------------- drawing a freestanding wall ------------------------- */
function startWallDraw(){
  stopOtherTools('wall-draw');
  if(!roomMode()) setMode('room');
  batch(()=>{ wallDrawState.value = {a:null}; drawCursor.value = null; roomSel.value = null; });
  flash('Click the wall’s start, then its end. Esc cancels.');
}
export {cancelWallDraw, finishWallDraw, startWallDraw};
