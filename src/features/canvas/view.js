// @ts-check
/* The view: the canvas element, its 2D context, and the camera that maps world
   millimetres onto screen pixels. A leaf of canvas/: it imports no other
   canvas module, so every layer and tool can import it without joining a
   cycle. What moves the camera and repaints (resize, fit, zoomAt) is
   features/canvas/camera.js.

   `view` is never reassigned, only mutated, so an importer sees every change
   through the live binding. W and H are reassigned by resize(), so they are
   written through setW/setH.

   On the top-level DOM work in the first line, and why it is here rather than
   in app/boot.js, see the note above it. */

import {$} from '../../ui-kit/dom.js';
import {S} from '../../kernel/state.js';

/* ------------------------- view ------------------------- */
/* Top-level DOM, and the one place in src/ that takes a rendering context at
   import time. It is here rather than in boot.js because every canvas module
   needs ctx, and leaving it in index.html would pin all of canvas/ there with
   it. $('cv') is a lookup, not a mutation; getContext('2d') goes one step further, but it is a lazy
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
const cv=/** @type {HTMLCanvasElement} */($('cv')), ctx=/** @type {CanvasRenderingContext2D} */(cv.getContext('2d'));   // a 2D context is always available
/** @type {import('./types.js').View} */
let view={scale:.1,ox:0,oy:0};

let W=0, H=0;
/* W/H are the canvas's CSS-pixel size, and resize() is the only thing that
   writes them — through these, the same pattern setS uses in kernel/state.js. */
/** @param {number} v */
function setW(v){ W = v; }
/** @param {number} v */
function setH(v){ H = v; }

/* world mm -> screen px, and back */
const sx=(/** @type {number} */x)=>view.ox+x*view.scale, sy=(/** @type {number} */y)=>view.oy+y*view.scale;
const wx=(/** @type {number} */p)=>(p-view.ox)/view.scale, wy=(/** @type {number} */p)=>(p-view.oy)/view.scale;

const snapMM = () => parseFloat(S.snap)||0;
/** @param {import('../../kernel/types.js').Pt} p @returns {import('../../kernel/types.js').Pt} */
function snapPt(p){
  const g=snapMM();
  return g>0 ? [Math.round(p[0]/g)*g, Math.round(p[1]/g)*g] : p;
}
/* lock a point onto the horizontal or vertical line through `a`, whichever the cursor is closer to */
/** @param {import('../../kernel/types.js').Pt} a @param {import('../../kernel/types.js').Pt} pt @returns {import('../../kernel/types.js').Pt} */
function axisLockFrom(a,pt){
  const dx=pt[0]-a[0], dy=pt[1]-a[1];
  return Math.abs(dx)>=Math.abs(dy) ? [pt[0],a[1]] : [a[0],pt[1]];
}


export {cv, ctx, view, W, H, setW, setH, sx, sy, wx, wy, snapMM, snapPt, axisLockFrom};
