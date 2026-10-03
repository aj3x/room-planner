// @ts-check
/* Floor mode: picking rooms up and arranging them. A press on the picked
   room's rotate handle turns it (in 15° steps; Alt turns freely), a press
   on a room drags it under the floor magnet (kernel/floor-place.js; Alt
   drops the magnet), Shift+click marks rooms for merge/delete instead, and
   a press on nothing pans. Every frame is a preview('floor'); the pointerup
   commits once, so one drag is one undo step. */

import {floorPts} from '../../kernel/floor-space.js';
import {bbox, norm360} from '../../kernel/geometry.js';
import {floorEntry, snapFloor} from '../../kernel/history.js';
import {alignGuides, alignNote, floorGuides, floorSel, floorSnapNote, mergeClear, mergeSel, mergeToggle} from '../../kernel/selection.js';
import {L, S, floorMode, floorOf} from '../../kernel/state.js';
import {preview, transact} from '../../kernel/tx.js';
import {floorRoomAt, snapFloorPlace} from '../../kernel/floor-place.js';
import {floorSelectionLayer} from './floor-selection-layer.js';
import {snapPt, view, wx, wy, startPan} from '../canvas/index.js';

/* A room this size needs a more generous magnet than a wall endpoint does */
const floorSnapRadius = () => 24/view.scale;
/* the room on this floor under a screen point */
/** @param {number} px @param {number} py @returns {string|null} */
function pickFloorRoom(px,py){
  const fl=floorOf(L().floorId); if(!fl) return null;
  return floorRoomAt(fl, [wx(px),wy(py)]);
}

/** While a room is held: moving it (offset from the pointer) or turning it
    (from start degrees, pointer angle a0); snap is the arrangement before it moved.
    @typedef {{mode: 'floor-room', id: string, dx: number, dy: number, snap?: string}
            | {mode: 'floor-rot', id: string, start: number, a0: number, snap?: string}} FloorDrag */
/** @type {FloorDrag|null} */
let drag=null;   // {mode:'floor-room'|'floor-rot', id, …, snap} while a room is held

/** @type {import('../canvas/types.js').Tool['onDown']} */
function floorDown(e,px,py){
  if(e.button===2) return null;   // a right-click's own pointerdown; contextmenu handles the click itself
  const m=floorSelectionLayer.hitTest(px,py);
  if(m){
    const b=bbox(m.P);
    drag = {mode:'floor-rot', id:/** @type {string} */(floorSel.value), start:m.l.floorPlace.rot||0,
          a0:Math.atan2(wy(py)-(b.y0+b.y1)/2, wx(px)-(b.x0+b.x1)/2)};
    return floorTool;
  }
  const hit=pickFloorRoom(px,py);
  if(hit){
    if(e.shiftKey){
      mergeToggle(hit);
      return null;   // shift+click only marks rooms for merge/delete — it never moves one
    }
    mergeSel.value = new Set([hit]);   // seeds the pair: a plain click here, then shift+click a second room
    const l=/** @type {import('../../kernel/types.js').Layout} */(S.layouts.find(x=>x.id===hit));   // floorRoomAt found it there
    floorEntry();   // baseline the arrangement BEFORE it moves, or there is nothing to undo to
    floorSel.value = hit;
    drag = {mode:'floor-room', id:hit, dx:wx(px)-l.floorPlace.x, dy:wy(py)-l.floorPlace.y};
    return floorTool;
  }
  if(floorSel.value){ floorSel.value = null; }
  mergeClear();
  return startPan(px,py);
}

/** @type {import('../canvas/types.js').HeldTool['onMove']} */
function floorMove(px,py,mods){
  if(!drag) return;
  const pt=[wx(px),wy(py)];
  // nothing has moved yet: remember how things stood so Escape can put them back
  if(!drag.snap) drag.snap = snapFloor();
  const d=drag, l=S.layouts.find(x=>x.id===d.id); if(!l) return;
  if(drag.mode==='floor-room'){
    let nx=pt[0]-drag.dx, ny=pt[1]-drag.dy;
    if(mods.altKey){ floorGuides.value = []; floorSnapNote.value = 'Free'; }   // alt drops the magnet, same as everywhere else
    else { const s=snapFloorPlace(l,nx,ny,floorSnapRadius(),snapPt); nx=s.x; ny=s.y; floorGuides.value = s.guides; floorSnapNote.value = s.note; }
    l.floorPlace.x=nx; l.floorPlace.y=ny;
    preview('floor'); return;
  }
  const b=bbox(floorPts(l));
  const a=Math.atan2(pt[1]-(b.y0+b.y1)/2, pt[0]-(b.x0+b.x1)/2);
  let deg=drag.start+(a-drag.a0)*180/Math.PI;
  if(!mods.altKey) deg=Math.round(deg/15)*15;   // free turn is the exception, not the rule
  l.floorPlace.rot=norm360(deg);
  preview('floor');
}

/* the whole gesture is one undo step, recorded here and nowhere in between */
/** @type {import('../canvas/types.js').HeldTool['onUp']} */
function floorUp(){
  transact('floor', ()=>{
    alignGuides.value = []; alignNote.value = '';
    floorGuides.value = []; floorSnapNote.value = '';
  });
  drag = null;
}

/* Escape mid-drag: every room back exactly where it started */
/** @type {import('../canvas/types.js').HeldTool['onCancel']} */
function floorCancel(){
  const d=/** @type {FloorDrag} */(drag);   // held
  if(d.snap){
    const s=JSON.parse(d.snap);
    for(const [id,place] of /** @type {[string, import('../../kernel/types.js').FloorPlace][]} */(s)){ const l=S.layouts.find(x=>x.id===id); if(l) l.floorPlace=place; }
  }
  drag = null; floorGuides.value = []; floorSnapNote.value = '';
  // back where the gesture started, which is what storage and history already hold
  preview('floor');
}

/** @satisfies {import('../canvas/types.js').Tool} */
const floorTool = {
  id:'floor', autoPan:true,
  active: floorMode,
  onDown: floorDown, onMove: floorMove, onUp: floorUp, onCancel: floorCancel,
};

export {floorTool, floorSnapRadius, pickFloorRoom};
