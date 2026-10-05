// @ts-check
/* Double-clicking a wall — in the plan or in the Walls list — types its
   length in. The same two values as the Selection panel, close to hand
   while you are in the plan. It leans on setWallLen/setWallAngle returning
   false when tryRoomEdit rolls a change back, in which case the dialog
   stays open over the message. */
import {RP, S, roomMode} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen, parseLen, unitWord} from '../../kernel/units.js';
import {transact} from '../../kernel/tx.js';
import {setWallAngle, setWallLen, wallAngle, wallOf} from '../../kernel/model/walls.js';
import {moError, openDialog} from '../../ui-kit/modal.jsx';
import {setMode} from '../mode/index.js';

/** @typedef {import('preact').RefObject<HTMLInputElement>} BoxRef */

/** @param {{len: string, deg: number, lenBox: BoxRef, degBox: BoxRef}} p */
function WallBody({len, deg, lenBox, degBox}){
  return <>
    <div class="field"><label for="wdLen">Length</label><input type="text" class="len" id="wdLen" value={len} ref={lenBox}/></div>
    <div class="field"><label for="wdAng">Direction</label><input type="number" class="deg" id="wdAng" step="1" value={deg} ref={degBox}/><span class="unit">°</span></div>
    <p class="hint">{'The far corner moves, and the next wall follows. 0° points right, 90° up. Plain numbers are '+unitWord()+'; 6\'2", 75cm and 1.2m also work.'}</p>
  </>;
}

/** @param {number} i */
function wallDialog(i){
  if(!roomMode()) setMode('room');
  const P=RP();
  if(!(i>=0&&i<P.length)) return;
  const w=wallOf(i);
  roomSel.value = {kind:'wall', i};
  /** @type {BoxRef} */
  const lenBox={current: null};
  /** @type {BoxRef} */
  const degBox={current: null};
  openDialog({title: 'Wall '+(i+1), ok: 'Save', body: <WallBody len={fmtLen(w.len,S.unit)} deg={Math.round(wallAngle(i))} lenBox={lenBox} degBox={degBox}/>, onOk: ()=>{
    const len=parseLen(lenBox.current ? lenBox.current.value : '',S.unit);
    if(!isFinite(len)||len<100){ moError('Give the wall a length of at least 100 mm'); return false; }
    const deg=parseFloat(degBox.current ? degBox.current.value : '');
    const ok=transact('room', ()=>{
      let ok=true;
      if(isFinite(deg) && Math.round(deg)!==Math.round(wallAngle(i))) ok=setWallAngle(i,deg);
      if(ok) ok=setWallLen(i,len);
      return ok;
    });
    if(!ok) return false;   // tryRoomEdit rolled it back and flashed why — stay open
  }});
}
export {wallDialog};
