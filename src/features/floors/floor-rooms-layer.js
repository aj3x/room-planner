// @ts-check
/* ---- the floor, drawn as one plan ----
   Walls are why this has its own pass order rather than reusing the room scene's layers. A room's
   band lies OUTSIDE its measured face (see drawWalls), so two rooms parked exactly
   one wall-thickness apart both fill that same gap and it reads as a single shared
   wall, with no boolean geometry anywhere. That only holds if every band is laid
   down BEFORE any opening is punched: punch as you go and the next room's band
   paints the doorway shut again. */

/* Pass A: each room's floor, grid and baseboard; or, with nothing to show,
   which of the two reasons it is. */

import {H, W, ctx, PAL} from '../canvas/index.js';
import {L} from '../../kernel/state.js';
import {drawRoomFloor} from '../room/index.js';

/* nothing to show: say which of the two reasons it is */
/** @param {import('../../kernel/types.js').Floor|null|undefined} fl */
function drawFloorEmpty(fl){
  const C=PAL();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=C.wall;
  ctx.font='600 14px ui-sans-serif,system-ui,sans-serif';
  ctx.fillText(fl ? '“'+fl.name+'” has no rooms on it yet'
                  : '“'+L().name+'” is not on a floor', W/2, H/2-10);
  ctx.font='400 12px ui-sans-serif,system-ui,sans-serif';
  ctx.fillText(fl ? 'Add rooms to it from the Rooms list.'
                  : 'Put it on one from its ⋯ menu in the Rooms list.', W/2, H/2+12);
}

/** @satisfies {import('../canvas/types.js').Layer} */
const floorRoomsLayer = {
  id:'floor-rooms', z:20, scene:'floor',
  draw(ctx, view, {fl, members, empty}){
    if(empty){ drawFloorEmpty(fl); return; }
    for(const m of members) drawRoomFloor(m.P, m.l.room);
  }
};

export {floorRoomsLayer};
