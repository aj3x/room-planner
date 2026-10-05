// @ts-check
/* What the keyboard does to the selected items: Delete removes them, R
   turns one (Shift+R the other way), the arrows nudge by the snap step
   (five with Shift). Not in Room mode, where the keys belong to the room. */
import {worldPoly} from '../../kernel/geometry.js';
import {selSet} from '../../kernel/selection.js';
import {instOf, itemOf, roomMode} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {bisectToValid, centreInside, isBad, validate} from '../../kernel/model/validity.js';
import {flash} from '../../ui-kit/flash.js';
import {KEY_ORDER} from '../../ui-kit/shortcuts.js';
import {snapMM} from '../canvas/index.js';
import {removeSel, rotate} from './selection-panel.js';

const selected = () => !roomMode() && selSet.value.size>0;

/** @param {KeyboardEvent} e */
function nudge(e){
  const step=(snapMM()||10)*(e.shiftKey?5:1);
  const d=/** @type {Record<string, number[]>} */({ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]})[e.key];
  e.preventDefault();
  transact('furn', ()=>{
    for(const id of selSet.value){
      const inst=instOf(id); const it=inst&&itemOf(inst.itemId);
      if(!inst||!it) continue;
      const loose=isBad(inst), ox=inst.x, oy=inst.y;
      inst.x+=d[0]; inst.y+=d[1];
      if(!validate(inst,worldPoly(inst,it)).ok){
        if(loose){ if(!centreInside(inst)){ inst.x=ox; inst.y=oy; } }
        else {
          // take as much of the step as fits
          inst.x=ox; inst.y=oy;
          bisectToValid(inst,it,[ox,oy],[ox+d[0],oy+d[1]]);
          if(Math.hypot(inst.x-ox,inst.y-oy)<0.01){ inst.x=ox; inst.y=oy; if(selSet.value.size===1) flash('No room that way'); }
        }
      }
    }
  });
}

/** @type {import('../../ui-kit/shortcuts.js').Shortcut[]} */
const shortcuts = [
  {id: 'furniture.remove', priority: KEY_ORDER.selection, keys: ['Delete', 'Backspace'],
    run: e => { if(!selected()) return false; e.preventDefault(); removeSel(); }},
  {id: 'furniture.turn', priority: KEY_ORDER.selection, keys: ['r', 'R'],
    run: e => { if(!selected()) return false; if(selSet.value.size===1){ e.preventDefault(); rotate(e.shiftKey?-90:90); } }},
  {id: 'furniture.nudge', priority: KEY_ORDER.selection, keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
    run: e => { if(!selected()) return false; nudge(e); }},
];

export {shortcuts};
