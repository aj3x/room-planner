// @ts-check
/* The plan canvas: the camera (view, camera), the compositor (draw) and its
   palette (paint), the pointer dispatcher (interaction) with the pan tool,
   the shared drawing-tool state, snapping and picking (snap), and the layers
   no one feature owns: the stage, the alignment guides, the status readout.
   Every other feature that draws contributes layers and tools to it; they
   are registered by app/canvas-setup.js.

   This file is the feature's public API: code outside src/features/canvas/
   imports it only from here (eslint.config.js enforces that). */

export {alignGuidesLayer} from './align-guides-layer.js';
export {fit, resize, zoomAt} from './camera.js';
export {addLayer, draw, mountCanvas, scheduleDraw} from './draw.js';
export {drawCursor, drawState, splitDrawState, wallDrawShift, wallDrawState} from './interaction-state.js';
export {activeTool, cancelGesture, edgePanTick, gestureTool, isGesturing, onCanvasKey, onCanvasMouseMove, onCanvasPointerDown, onCanvasPointerLeave, onCanvasPointerMove, onCanvasPointerUp, onCanvasWheel, registerTool, resetTools, stopDrawing, stopOtherTools, stopToolsFor} from './interaction.js';
export {addPoly, clip, darkMQ, drawDimension, drawSquareTick, PAL, pathPoly, setForceLightCanvas} from './paint.js';
export {panTool, setSpaceDown, startPan} from './pan-tool.js';
export {readoutLayer} from './readout-layer.js';
export {alignPoint, alignRadius, bringToFront, isSquare, pickAt, pickRoom, snapCorner, snapWallPoint, squareCorner} from './snap.js';
export {stageLayer} from './stage-layer.js';
export {mountViewPrefs} from './view-prefs.js';
export {axisLockFrom, ctx, cv, H, snapMM, snapPt, sx, sy, view, W, wx, wy} from './view.js';
