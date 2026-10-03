// @ts-check
/* Panning the camera by dragging. Not one of the registered tools: the
   dispatcher hands it the pointer while Space is held, and the room, floor
   and measure tools hand it a press on empty canvas (startPan). */

import {cv, view} from './view.js';
import {draw, scheduleDraw} from './draw.js';

let spaceDown=false;
/** @param {boolean} v */
function setSpaceDown(v){ spaceDown = v; } // held to force pan mode (Space+drag pans; Space+scroll still zooms)

/** @typedef {{px: number, py: number, ox: number, oy: number}} Pan */
/** @type {Pan|null} */
let pan=null;   // {px, py, ox, oy}: where the press was, and the camera then

/* start a pan at screen point (px,py); returns the tool to give the pointer to */
/** @param {number} px @param {number} py @returns {import('./types.js').HeldTool} */
function startPan(px,py){
  pan={px, py, ox:view.ox, oy:view.oy};
  return panTool;
}

/** @satisfies {import('./types.js').HeldTool & {cursor: string, onDown(e: PointerEvent, px: number, py: number): import('./types.js').HeldTool}} */
const panTool = {
  id:'pan',
  cursor:'grab',   // what the canvas shows while Space is held
  onDown(e,px,py){
    cv.style.cursor='grabbing';
    return startPan(px,py);
  },
  onMove(px,py){
    const p=/** @type {Pan} */(pan);   // held: startPan set it
    view.ox=p.ox+(px-p.px); view.oy=p.oy+(py-p.py);
    scheduleDraw();
  },
  onUp(){
    pan=null;
    cv.style.cursor = spaceDown ? panTool.cursor : '';
  },
  /* Escape: the camera goes back where it was */
  onCancel(){
    const p=/** @type {Pan} */(pan);   // held: startPan set it
    view.ox=p.ox; view.oy=p.oy;
    pan=null;
    draw();
  },
};

export {panTool, startPan, spaceDown, setSpaceDown};
