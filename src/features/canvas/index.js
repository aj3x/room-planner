// @ts-check
/* The plan canvas: the camera (view, camera), the compositor (draw) and its
   palette (paint), the pointer dispatcher (interaction) with the pan tool,
   the shared drawing-tool state, snapping and picking (snap), and the layers
   no one feature owns: the stage, the alignment guides, the status readout.
   Every other feature that draws contributes layers and tools to it; they
   are registered by app/canvas-setup.js.

   This file is the feature's public API: what other features draw, snap,
   pick and gesture with. What only the app shell needs (the event handlers,
   the registry, the mounts) is host.js. Code outside src/features/canvas/
   imports it only from these two (eslint.config.js enforces that). */

export {fit, resize} from './camera.js';
export {draw, scheduleDraw} from './draw.js';
export {Readout, setReadout, ZoomControls} from './readout.jsx';
export {drawCursor, drawState, splitDrawState, wallDrawShift, wallDrawState} from './interaction-state.js';
export {resetTools, stopDrawing, stopOtherTools, stopToolsFor} from './interaction.js';
export {addPoly, clip, drawDimension, drawSquareTick, PAL, pathPoly, setForceLightCanvas} from './paint.js';
export {startPan} from './pan-tool.js';
export {alignPoint, alignRadius, bringToFront, isSquare, pickAt, pickRoom, snapCorner, snapWallPoint, squareCorner} from './snap.js';
export {axisLockFrom, ctx, cv, H, snapMM, snapPt, sx, sy, view, W, wx, wy} from './view.js';
