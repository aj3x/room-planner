/* The canvas's pointer dispatcher. What a press, a drag or a key on the
   canvas does is decided by tools (`*-tool.js`, in their features), not here.

   A tool is
     {id, active(), onDown(e, px, py), onMove?(px, py, mods), onUp?(e),
      onCancel?(), onHover?(px, py), onCursor?(px, py, mods), onLeave?(),
      onKey?(e), autoPan?, cursor?, overlay?}
   - active() says whether the tool is the one in charge right now. Tools
     are asked in registration order (app/canvas-setup.js) and the first that
     says yes is the active tool: the three drawing tools and the Measure
     tool while they are on, then whichever of Floor / Room / Furniture the
     canvas is in. Space hands the press to the pan tool before any of them.
   - onDown returns the tool that holds the pointer until it comes up —
     itself, the pan tool (startPan) for a press on nothing, or null for a
     click that ends there. That tool gets every onMove and the onUp, or
     onCancel if Escape comes first; its own module holds the gesture's
     state. One gesture is one undo step: onMove previews, onUp commits.
   - onHover: pointer moves with nothing held. onCursor: mouse moves while a
     drawing tool is live (it shows where the next point lands), also called
     by the edge auto-pan. onLeave: the pointer left the canvas.
   - onKey(e) returns true to claim a key; app/shortcuts.js asks the active
     tool first. The mode tools' keys (Delete, arrows, [ ]) stay in
     app/shortcuts.js because they run other features' commands.
   - autoPan: a held drag near the edge scrolls the canvas.
   - overlay: a layer (features/canvas/draw.js) drawing the tool's gesture.
   - stop(): turn the tool off, for one that is switched on and off (the
     drawing tools, Measure). Its start command calls stopOtherTools(id)
     first, so only one such tool is ever on.
   - modes: the canvas modes a switched-on tool may stay on in; setMode()
     stops it on the way to any other (stopToolsFor). Without it, the tool
     survives a mode change.
   - reset(): forget what the tool picked in the room being left;
     activateLayout calls every tool's (resetTools).
   Code outside the tools never names one: it asks for all of a kind to
   stop (stopOtherTools, stopDrawing, stopToolsFor) or reset (resetTools),
   so a new tool needs no edit to the commands that end one.

   Tools are registered by setupCanvas() from boot(), never at import time;
   adding one is a module and a line there. The listeners are registered in
   src/app/bind/stage.js. */

import {S} from '../../kernel/state.js';
import {addLayer, scheduleDraw} from './draw.js';
import {zoomAt} from './camera.js';
import {H, W, cv, view} from './view.js';
import {panTool, spaceDown} from './pan-tool.js';

const tools=[];
function registerTool(t){
  tools.push(t);
  if(t.overlay) addLayer(t.overlay);
}
function activeTool(){
  for(const t of tools) if(t.active()) return t;
  return null;
}
/* Stop every tool that is on and can be stopped, except the ones `keep`
   holds on to. */
function stopTools(keep){
  for(const t of tools) if(t.stop && t.active() && !keep(t)) t.stop();
}
/* Turning one tool on turns every other live one off: each start command
   calls this with its own tool's id. So a new tool needs no edit to the
   existing ones. */
function stopOtherTools(id){ stopTools(t => t.id===id); }
/* Drop whatever is half drawn (an outline, a wall, a divider: the tools
   with onCursor), before a command that edits the room directly. */
function stopDrawing(){ stopTools(t => !t.onCursor); }
/* Entering mode `m`: stop each tool that declares the modes it can stay on
   in, and `m` is not one of them. */
function stopToolsFor(m){ stopTools(t => !t.modes || t.modes.includes(m)); }
/* A different room became the active one. */
function resetTools(){
  for(const t of tools) if(t.reset) t.reset();
}

let captured=null;   // the tool holding the pointer, between its press and release
const isGesturing = () => !!captured;
const gestureTool = () => captured;

let lastPX=null, lastPY=null, lastMods={shiftKey:false,altKey:false};
function track(e){ lastPX=e.offsetX; lastPY=e.offsetY; lastMods={shiftKey:e.shiftKey,altKey:e.altKey}; }

function onCanvasPointerDown(e){
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  const t = spaceDown ? panTool : activeTool();
  if(t) captured = t.onDown(e, e.offsetX, e.offsetY) || null;
}
function onCanvasPointerMove(e){
  if(!captured){
    const t=activeTool();
    if(t && t.onHover) t.onHover(e.offsetX, e.offsetY);
    return;
  }
  track(e);
  captured.onMove(lastPX, lastPY, lastMods);
}
function onCanvasMouseMove(e){
  const t=activeTool();
  if(!t || !t.onCursor) return;
  track(e);
  t.onCursor(lastPX, lastPY, lastMods);
}
function onCanvasPointerUp(e){
  const t=captured;
  captured=null;
  if(t) t.onUp(e);
  if(e&&e.pointerId!==undefined){ try{ cv.releasePointerCapture(e.pointerId); }catch(err){} }
}
function onCanvasPointerLeave(){
  if(captured) return;
  const t=activeTool();
  if(t && t.onLeave) t.onLeave();
}
/* Escape mid-gesture: the tool puts back whatever it was dragging */
function cancelGesture(){
  const t=captured;
  captured=null;
  if(t) t.onCancel();
}
/* the active tool's claim on a key, before the app's shortcuts get it */
function onCanvasKey(e){
  const t=activeTool();
  return !!(t && t.onKey && t.onKey(e));
}

/* auto-scroll the canvas when a drag or a wall/room draw sits near the visible
   edge and the cursor stops moving — event-driven pointermove alone can't do
   this since no new events fire while the cursor is still */
const EDGE_PAN_ZONE=40, EDGE_PAN_MAXSPD=18;
function edgePanVel(px,py){
  let vx=0, vy=0;
  if(px<EDGE_PAN_ZONE) vx=-EDGE_PAN_MAXSPD*(1-px/EDGE_PAN_ZONE);
  else if(px>W-EDGE_PAN_ZONE) vx=EDGE_PAN_MAXSPD*(1-(W-px)/EDGE_PAN_ZONE);
  if(py<EDGE_PAN_ZONE) vy=-EDGE_PAN_MAXSPD*(1-py/EDGE_PAN_ZONE);
  else if(py>H-EDGE_PAN_ZONE) vy=EDGE_PAN_MAXSPD*(1-(H-py)/EDGE_PAN_ZONE);
  return {vx,vy};
}
function edgePanTick(){
  const dragging = !!(captured && captured.autoPan);
  const t = dragging ? captured : activeTool();
  const drawing = !dragging && !!(t && t.onCursor);
  if((dragging||drawing) && lastPX!=null){
    const {vx,vy}=edgePanVel(lastPX,lastPY);
    if(vx||vy){
      view.ox-=vx; view.oy-=vy;
      if(dragging) t.onMove(lastPX,lastPY,lastMods);
      else t.onCursor(lastPX,lastPY,lastMods);
      scheduleDraw();
    }
  }
  requestAnimationFrame(edgePanTick);
}

const ZOOM_FACTOR = 1.02;
const ZOOM_ACCEL_K = 0.03; // tuned by feel: higher = faster flicks jump further
let wheelLast = 0;
function onCanvasWheel(e){
  e.preventDefault();
  const now = performance.now();
  const dt = wheelLast ? Math.max(1, now-wheelLast) : 100;
  wheelLast = now;
  // deltaMode 1 = DOM_DELTA_LINE (mouse wheel notches, chunky); 0 = DOM_DELTA_PIXEL (trackpad, many small events)
  const norm = e.deltaMode===1 ? e.deltaY*16 : e.deltaY;
  const velocity = Math.abs(norm)/dt;
  const accel = Math.min(4, 1+velocity*ZOOM_ACCEL_K);
  const speed = S.zoomSpeed||1;
  const magnitude = accel*speed*Math.min(3, Math.abs(norm)/4);
  zoomAt(Math.pow(ZOOM_FACTOR, (norm<0?1:-1)*magnitude), e.offsetX, e.offsetY);
}

export {registerTool, activeTool, stopOtherTools, stopDrawing, stopToolsFor, resetTools, isGesturing, gestureTool, cancelGesture, onCanvasKey,
        onCanvasPointerDown, onCanvasPointerMove, onCanvasMouseMove, onCanvasPointerUp,
        onCanvasPointerLeave, onCanvasWheel, edgePanVel, edgePanTick};
