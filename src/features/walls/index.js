// @ts-check
/* The room's walls, corners, pillars and interior walls: their lists and
   Selection panel views, the wall dialog, drawing an interior wall, and
   their layers.

   This file is the feature's public API: code outside src/features/walls/
   imports it only from here (eslint.config.js enforces that). */

export {deleteCorner} from './corners.js';
export {iwallsLayer} from './iwalls-layer.js';
export {pillarsLayer} from './pillars-layer.js';
export {wallDrawTool} from './wall-draw-tool.js';
export {wallLabelsLayer} from './wall-labels-layer.js';
export {wallsLayer} from './walls-layer.js';
export {deleteIWall, deletePillar} from './walls-panel.js';
export {wallDialog} from './wall-dialog.jsx';
export {CornerProps, IWallProps, PillarProps, WallProps, wallPartTitle} from './wall-props.jsx';
export {sections} from './walls-list.jsx';
