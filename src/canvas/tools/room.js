/* Room mode: the 90° tick on a corner being dragged square. */

import {drawSquareTick} from '../paint.js';
import {alignNote} from '../../core/selection.js';
import {RP} from '../../core/state.js';
import {drag} from '../interaction-state.js';

const cornerTickOverlay = {
  id:'corner-tick', z:115, scene:'room',
  deps(){ drag.value; alignNote.value; },
  draw(){
    const P=RP();
    if(alignNote.value==='Right angle' && drag.value && drag.value.mode==='corner' && P.length>2){
      const n=P.length, i=drag.value.i;
      drawSquareTick(P[(i-1+n)%n], P[i], P[(i+1)%n]);
    }
  }
};

export {cornerTickOverlay};
