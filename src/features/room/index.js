// @ts-check
/* The room as a whole: its properties, the Selection panel that shows
   whichever part is picked, drawing a custom outline, splitting a room in
   two (and the polygon weld Floor mode's merge shares), the Room-mode tool and the room's floor and handle layers.

   This file is the feature's public API: code outside src/features/room/
   imports it only from here (eslint.config.js enforces that). */

export {bindLen, setFloorColor} from './room-controls.js';
export {roomDrawTool} from './room-draw-tool.js';
export {cancelCustomDraw, startCustomDraw} from './room-draw.js';
export {mergeGeometry} from './merge-rooms.js';
/** @typedef {import('./merge-rooms.js').MergeOk} MergeOk */
export {drawRoomFloor, roomFloorLayer} from './room-floor-layer.js';
export {roomHandlesLayer} from './room-handles-layer.js';
export {sections} from './sections.jsx';
export {roomTool} from './room-tool.js';
export {lastSplit, splitUndo, startSplitRoom} from './split-room.js';
export {splitTool} from './split-tool.js';
