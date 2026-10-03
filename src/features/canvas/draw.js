/* The canvas compositor. The plan is painted by layers, each one concern
   (the walls, the items, the measurements, the floor's wall bands, …) in its
   own module (`*-layer.js`, in the feature that owns the concern), plus the
   overlay of each tool (a tool's gesture drawn over the plan). draw() paints every layer in
   z order onto a cleared canvas, immediate mode, every frame.

   A layer is
     {id, z, scene?, deps?(), draw(ctx, view, frame), hitTest?(px, py, …)}
   - z orders the stack; equal z keeps registration order.
   - scene is 'room' (the active room, Room and Furniture modes) or 'floor'
     (Floor mode, every room on the floor at once); a layer without one is
     drawn in both.
   - deps() reads the signals the layer shows, beyond the committed project
     (planRev), so the canvas effect knows to repaint when they change.
   - draw() gets the shared 2D context, the camera, and this frame's facts:
       room scene:  {scene, C, bad, openBad}   C is PAL(); bad and openBad
                                               are getConflicts()'
       floor scene: {scene, C, fl, members, depths, empty}
     It runs between ctx.save() and ctx.restore(), so whatever state it sets
     ends with it.
   - hitTest() is for whatever only the layer knows, e.g. where it last drew
     a label; tools call it directly.

   Layers are registered by setupCanvas() (app/canvas-setup.js) from boot(),
   never at import time. Adding one is a new module and a line there. */

import {ctx, view} from './view.js';
import {PAL} from './paint.js';
import {L, S, floorMode, floorOf, isCanvasMode} from '../../kernel/state.js';
import {effect, planRev} from '../../kernel/signals.js';
import {floorEdgeDepths, floorMembers} from '../../kernel/floor-place.js';
import {getConflicts} from '../../kernel/validity.js';

const layers = [];
let sorted = null;
function addLayer(layer){ layers.push(layer); sorted = null; }
function stack(){
  if(!sorted) sorted = layers.slice().sort((a,b) => a.z-b.z);
  return sorted;
}

/* What several layers of this frame would otherwise each work out. */
function frame(){
  const C=PAL();
  if(!floorMode()){ const {bad,openBad}=getConflicts(); return {scene:'room', C, bad, openBad}; }
  const fl=floorOf(L().floorId), members=floorMembers(fl), empty=!fl || !members.length;
  return {scene:'floor', C, fl, members, empty, depths: empty ? null : floorEdgeDepths(members, fl.extWall)};
}

function draw(){
  if(drawPending){ cancelAnimationFrame(drawPending); drawPending=0; }
  const f=frame();
  for(const l of stack()){
    if(l.scene && l.scene!==f.scene) continue;
    ctx.save();
    try{ l.draw(ctx, view, f); }
    finally{ ctx.restore(); }
  }
}

/* One draw per frame, however many changes asked for it. A synchronous draw()
   makes a pending one redundant, so draw() cancels it (see the top of draw). */
let drawPending=0;
function scheduleDraw(){
  if(drawPending) return;
  drawPending=requestAnimationFrame(()=>{ drawPending=0; draw(); });
}

/* The canvas as an effect: the committed project (planRev, bumped by
   transact/preview/undo) and whatever signals the layers declare in deps()
   schedule one draw for the next frame when they change. Mounted from
   boot(), after setupCanvas(). The Library places hide the canvas, and
   setMode() draws on the way back to it. */
function mountCanvas(){
  return effect(()=>{
    planRev.value;
    for(const l of stack()) if(l.deps) l.deps();
    if(isCanvasMode(S.mode)) scheduleDraw();
  });
}

export {addLayer, draw, scheduleDraw, mountCanvas};
