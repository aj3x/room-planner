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
   import time: every canvas module needs ctx, so it is a live binding here
   rather than something boot() hands round. $('cv') is a lookup;
   getContext('2d') allocates the element's 2D context, memoises it and
   returns the same object on every later call. Neither registers a listener,
   schedules work, paints or reads app state. What it relies on is that #cv
   exists when this module is evaluated (the script runs after the document is
   parsed: the dev server's module, the build's classic script at the end of
   <body>, the unit tests' jsdom shell) and, under test, that the recording
   getContext stand-in is installed first (test/unit-setup.js). The canvas's
   size is set later, by resize(). */
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
