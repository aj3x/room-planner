/* Drawing a freestanding interior wall, the commands: starting, finishing
   and abandoning it. The pointer and key handling, and the wall on screen,
   are the wall-draw tool's (canvas/tools/wall-draw.js). */
import {expect} from '../core/registry.js';
import {batch} from '../core/signals.js';
import {roomSel} from '../core/selection.js';
import {L, uid} from '../core/state.js';
import {transact} from '../core/tx.js';
import {wallDrawState, drawCursor} from './interaction-state.js';
import {roomMode} from '../core/state.js';
import {flash} from '../ui/flash.js';
import {stopOtherTools} from './interaction.js';
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
  if(!roomMode()) expect('plan.setMode')('room');
  batch(()=>{ wallDrawState.value = {a:null}; drawCursor.value = null; roomSel.value = null; });
  flash('Click the wall’s start, then its end. Esc cancels.');
}
export {cancelWallDraw, finishWallDraw, startWallDraw};
