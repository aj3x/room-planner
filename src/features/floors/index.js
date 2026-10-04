// @ts-check
/* Floors: arranging rooms on a floor, merging two of them, the floor
   panels, the Floor-mode tool and its layers.

   This file is the feature's public API: code outside src/features/floors/
   imports it only from here (eslint.config.js enforces that). */

export {floorContentsLayer} from './floor-contents-layer.js';
export {floorGuidesLayer} from './floor-guides-layer.js';
export {floorLabelsLayer} from './floor-labels-layer.js';
export {floorOverlapsLayer} from './floor-overlaps-layer.js';
export {floorReadoutLayer} from './floor-readout-layer.js';
export {floorRoomsLayer} from './floor-rooms-layer.js';
export {floorSelectionLayer} from './floor-selection-layer.js';
export {floorTool, pickFloorRoom} from './floor-tool.js';
export {floorUnderlayLayer} from './floor-underlay-layer.js';
export {floorWallsLayer} from './floor-walls-layer.js';
export {deleteFloor, floorRoomsDialog, lastMerge, mergeUndo, newFloor, newFloorWith, openFloorMergeMenu, putOnFloor, putOnFloorDialog, setLastMerge, turnFloorRoom} from './floors.js';
export {sections} from './sections.jsx';
