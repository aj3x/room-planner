/* Panning the camera by dragging. Not one of the registered tools: the
   dispatcher hands it the pointer while Space is held, and the room, floor
   and measure tools hand it a press on empty canvas (startPan). */

import {cv, view} from './view.js';
import {draw, scheduleDraw} from './draw.js';

let spaceDown=false;
function setSpaceDown(v){ spaceDown = v; } // held to force pan mode (Space+drag pans; Space+scroll still zooms)

let pan=null;   // {px, py, ox, oy}: where the press was, and the camera then

/* start a pan at screen point (px,py); returns the tool to give the pointer to */
function startPan(px,py){
  pan={px, py, ox:view.ox, oy:view.oy};
  return panTool;
}

const panTool = {
  id:'pan',
  cursor:'grab',   // what the canvas shows while Space is held
  onDown(e,px,py){
    cv.style.cursor='grabbing';
    return startPan(px,py);
  },
  onMove(px,py){
    view.ox=pan.ox+(px-pan.px); view.oy=pan.oy+(py-pan.py);
    scheduleDraw();
  },
  onUp(){
    pan=null;
    cv.style.cursor = spaceDown ? panTool.cursor : '';
  },
  /* Escape: the camera goes back where it was */
  onCancel(){
    view.ox=pan.ox; view.oy=pan.oy;
    pan=null;
    draw();
  },
};

export {panTool, startPan, spaceDown, setSpaceDown};
