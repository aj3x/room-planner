/* Floor mode: picking rooms up and arranging them on the floor. */

import {view, wx, wy} from '../view.js';
import {L, floorOf} from '../../core/state.js';
import {floorRoomAt} from '../../model/floor-place.js';

/* A room this size needs a more generous magnet than a wall endpoint does */
const floorSnapRadius = () => 24/view.scale;
/* the room on this floor under a screen point */
function pickFloorRoom(px,py){
  const fl=floorOf(L().floorId); if(!fl) return null;
  return floorRoomAt(fl, [wx(px),wy(py)]);
}

export {floorSnapRadius, pickFloorRoom};
