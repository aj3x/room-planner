// @ts-check
/* Moving the camera: sizing the canvas to its box, framing the room (or the
   whole floor), and zooming about a point. Each repaints, which is why these
   are here and not in features/canvas/view.js: view.js is a leaf every layer imports,
   and these import the compositor. */

import {L, RP, floorMode, floorOf, floorLayouts} from '../../kernel/state.js';
import {floorBBox} from '../../kernel/model/floor-space.js';
import {bbox} from '../../kernel/geometry.js';
import {draw, scheduleDraw} from './draw.js';
import {H, W, cv, ctx, setH, setW, view, wx, wy} from './view.js';

function resize(){
  const r=/** @type {HTMLElement} */(cv.parentElement).getBoundingClientRect();   // #cv sits in the stage
  const dpr=Math.min(window.devicePixelRatio||1,2.5);
  setW(Math.max(1,Math.floor(r.width))); setH(Math.max(1,Math.floor(r.height)));
  cv.width=W*dpr; cv.height=H*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  scheduleDraw();
}
/** Frame box b on screen, pad px clear of each edge (175 when absent).
    @param {{x0: number, y0: number, w: number, h: number}} b @param {number} [pad] */
function fitBBox(b,pad){
  pad = pad==null ? 175 : pad;
  const s=Math.min((W-pad*2)/Math.max(b.w,1),(H-pad*2)/Math.max(b.h,1));
  view.scale = s>0 ? s : .05;
  view.ox = (W-b.w*view.scale)/2 - b.x0*view.scale;
  view.oy = (H-b.h*view.scale)/2 - b.y0*view.scale;
  draw();
}
/* in Floor mode the frame is the whole arrangement, grown so the outermost
   wall bands aren't clipped off at the edge */
function fit(){
  if(floorMode()){
    const fl=floorOf(L().floorId), b=fl&&floorBBox(fl.id);
    if(b){
      let pad=0; for(const l of floorLayouts(fl.id)) pad=Math.max(pad, l.room.wall||0);
      fitBBox({x0:b.x0-pad, y0:b.y0-pad, w:b.w+pad*2, h:b.h+pad*2}, 72);
      return;
    }
  }
  fitBBox(bbox(RP()));
}
/** Zoom by factor f about screen point (px, py). @param {number} f @param {number} px @param {number} py */
function zoomAt(f,px,py){
  const bx=wx(px),by=wy(py);
  view.scale=Math.max(.004,Math.min(3,view.scale*f));
  view.ox=px-bx*view.scale; view.oy=py-by*view.scale;
  scheduleDraw();
}

export {resize, fit, zoomAt};
