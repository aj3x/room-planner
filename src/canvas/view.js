/* The view: the canvas element, its 2D context, and the camera that maps world
   millimetres onto screen pixels.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   Five members of the region could NOT come along, because each reaches into a
   phase that has not run yet. They stay in index.html, in place:

     W, H                 reassigned by resize()
     resize, zoomAt       call scheduleDraw()  -> canvas/draw.js
     fitBBox              calls draw()         -> canvas/draw.js
     fit                  calls floorBBox()    -> plan/floors.js

   `view` itself could go because it is never reassigned, only mutated, so an
   importer sees every change through the live binding. W and H are reassigned,
   by resize(), which is why they had to stay; separating them from `view` took
   a declarator split, done in its own commit immediately before this move.

   On the top-level DOM work in the first line, and why it is here rather than
   in boot.js, see the note above it. */

import {$} from '../ui/modal.js';
import {S} from '../core/state.js';

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

export {cv, ctx, view, sx, sy, wx, wy, snapMM, snapPt, axisLockFrom};
