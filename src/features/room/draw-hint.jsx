// @ts-check
/* What drawing a room by hand takes, over the canvas while an outline is
   being drawn. */
import {drawState} from '../canvas/index.js';

function DrawHint(){
  return <div class="island" id="drawHint" hidden={!drawState.value}><b>Drawing the room.</b> Click to place each corner, then click the first corner (or press Enter) to close. Corners line up with the ones already down; Shift locks to 45°. Esc cancels.</div>;
}

export {DrawHint};
