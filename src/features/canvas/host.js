// @ts-check
/* The canvas as the app shell hosts it: the pointer, wheel and key handlers
   the stage and the document route to it, the layer and tool registry
   app/canvas-setup.js fills, the effects boot() mounts, the edge-pan loop and
   colour-scheme query index.html starts, the three stock layers, and the
   View section the Properties pane's slot is filled with.

   Only app/ (and index.html) may import this file; a feature uses the canvas
   through index.js, which is what features draw and gesture with. Splitting
   the two keeps index.js down to what features need (eslint.config.js
   enforces the split). */

export {alignGuidesLayer} from './align-guides-layer.js';
export {zoomAt} from './camera.js';
export {addLayer, mountCanvas} from './draw.js';
export {activeTool, cancelGesture, edgePanTick, gestureTool, isGesturing, onCanvasKey, onCanvasMouseMove, onCanvasPointerDown, onCanvasPointerLeave, onCanvasPointerMove, onCanvasPointerUp, onCanvasWheel, registerTool} from './interaction.js';
export {darkMQ} from './paint.js';
export {panTool, setSpaceDown} from './pan-tool.js';
export {readoutLayer} from './readout-layer.js';
export {sections} from './sections.jsx';
export {stageLayer} from './stage-layer.js';
