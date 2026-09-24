/* The view: the canvas element, its 2D context, and the camera that maps world
   millimetres onto screen pixels.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   Five members of the region could not come along in the canvas/ round, each
   reaching into a phase that had not run yet. All five are here now:

     W, H                 reassigned by resize() — joined in the draw() round,
                          once a setter split them off `view`
     resize, zoomAt       call scheduleDraw()  -> canvas/draw.js
     fitBBox              calls draw()         -> canvas/draw.js
     fit                  calls floorBBox()    -> core/floor-space.js, which is
                          where floorBBox actually landed, not plan/floors.js

   The last four joined in the plan/ round. They close a second import cycle
   with canvas/draw.js, on top of the one draw.js already has with
   split-room.js and walkpaths.js. It is rule 4's case: every name across the
   edge is a function declaration or is read inside a function body, and
   draw.js has no module-evaluation-time read of anything at all. Do not add a
   top-level read across this edge either.

   `view` itself could go because it is never reassigned, only mutated, so an
   importer sees every change through the live binding. W and H are reassigned,
   by resize(), which is why they had to stay; separating them from `view` took
   a declarator split, done in its own commit immediately before this move.

   On the top-level DOM work in the first line, and why it is here rather than
   in boot.js, see the note above it. */

import {$} from '../ui/modal.js';
import {S, L, RP, floorMode, floorOf, floorLayouts} from '../core/state.js';
import {floorBBox} from '../core/floor-space.js';
import {bbox} from '../core/geometry.js';
import {draw, scheduleDraw} from './draw.js';

/* ------------------------- view ------------------------- */
/* Top-level DOM, and the one place in src/ that takes a rendering context at
   import time. It is here rather than in boot.js because every canvas module
   needs ctx, and leaving it in index.html would pin all of canvas/ there with
   it. $('cv') is the same kind of lookup as ui/modal.js's `const mo =
   $('modal')`; getContext('2d') goes one step further, but it is a lazy
   accessor rather than a mutation -- it allocates the element's 2D context,
   memoises it, and returns the same object on every later call. It registers
   no listener, schedules no work, paints nothing and reads no app state. What
   moving it changes is only WHEN it runs: at module-evaluation time, ahead of
   index.html's own body rather than partway down it. The two things that could
   care are that #cv exists (the bundle runs after the document is parsed in all
   three targets: the dev server's module, the build's classic script at the end
   of <body>, and the jsdom harness's IIFE) and that the harness's recording
   getContext stand-in is installed first (it is a prelude, evaluated before the
   bundle). Canvas size is set later by resize(), exactly as before. */
const cv=$('cv'), ctx=cv.getContext('2d');
let view={scale:.1,ox:0,oy:0};

let W=0, H=0;
/* W/H are the canvas's CSS-pixel size, and resize() is the only thing that
   writes them. It stays in index.html (it calls scheduleDraw), so the write has
   to go through a function once W and H live in canvas/view.js -- the same
   pattern setS uses in core/state.js. Each setter is a bare assignment. */
function setW(v){ W = v; }
function setH(v){ H = v; }

const sx=x=>view.ox+x*view.scale, sy=y=>view.oy+y*view.scale;
const wx=p=>(p-view.ox)/view.scale, wy=p=>(p-view.oy)/view.scale;

const snapMM = () => parseFloat(S.snap)||0;
function snapPt(p){
  const g=snapMM();
  return g>0 ? [Math.round(p[0]/g)*g, Math.round(p[1]/g)*g] : p;
}
/* lock a point onto the horizontal or vertical line through `a`, whichever the cursor is closer to */
function axisLockFrom(a,pt){
  const dx=pt[0]-a[0], dy=pt[1]-a[1];
  return Math.abs(dx)>=Math.abs(dy) ? [pt[0],a[1]] : [a[0],pt[1]];
}


function resize(){
  const r=cv.parentElement.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2.5);
  setW(Math.max(1,Math.floor(r.width))); setH(Math.max(1,Math.floor(r.height)));
  cv.width=W*dpr; cv.height=H*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  scheduleDraw();
}
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
function zoomAt(f,px,py){
  const bx=wx(px),by=wy(py);
  view.scale=Math.max(.004,Math.min(3,view.scale*f));
  view.ox=px-bx*view.scale; view.oy=py-by*view.scale;
  scheduleDraw();
}

export {cv, ctx, view, W, H, setW, setH, sx, sy, wx, wy, snapMM, snapPt, axisLockFrom,
        resize, fitBBox, fit, zoomAt};
