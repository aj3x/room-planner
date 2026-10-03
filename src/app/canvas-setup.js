/* The canvas's parts list: every layer and every tool, registered once from
   boot() — never at import time. A new layer is a module under
   canvas/layers/ and one line here, a new tool a module under canvas/tools/
   and one line here; nothing else changes. Order among layers matters only
   between equal z; order among tools is their priority. */

import {addLayer} from '../features/canvas/draw.js';
import {stageLayer} from '../features/canvas/stage-layer.js';
import {floorUnderlayLayer} from '../features/floors/floor-underlay-layer.js';
import {roomFloorLayer} from '../features/room/room-floor-layer.js';
import {walkPathsLayer} from '../features/walkpaths/walk-paths-layer.js';
import {wallsLayer} from '../features/walls/walls-layer.js';
import {iwallsLayer} from '../features/walls/iwalls-layer.js';
import {pillarsLayer} from '../features/walls/pillars-layer.js';
import {openingsLayer} from '../features/openings/openings-layer.js';
import {openRegionsLayer} from '../features/furniture/open-regions-layer.js';
import {itemsLayer} from '../features/furniture/items-layer.js';
import {wallLabelsLayer} from '../features/walls/wall-labels-layer.js';
import {alignGuidesLayer} from '../features/canvas/align-guides-layer.js';
import {roomHandlesLayer} from '../features/room/room-handles-layer.js';
import {itemToolsLayer} from '../features/furniture/item-tools-layer.js';
import {measuresLayer} from '../features/measure/measures-layer.js';
import {readoutLayer} from '../features/canvas/readout-layer.js';
import {floorRoomsLayer} from '../features/floors/floor-rooms-layer.js';
import {floorWallsLayer} from '../features/floors/floor-walls-layer.js';
import {floorContentsLayer} from '../features/floors/floor-contents-layer.js';
import {floorLabelsLayer} from '../features/floors/floor-labels-layer.js';
import {floorOverlapsLayer} from '../features/floors/floor-overlaps-layer.js';
import {floorGuidesLayer} from '../features/floors/floor-guides-layer.js';
import {floorSelectionLayer} from '../features/floors/floor-selection-layer.js';
import {floorReadoutLayer} from '../features/floors/floor-readout-layer.js';
import {registerTool} from '../features/canvas/interaction.js';
import {roomDrawTool} from '../features/room/room-draw-tool.js';
import {wallDrawTool} from '../features/walls/wall-draw-tool.js';
import {splitTool} from '../features/room/split-tool.js';
import {measureTool} from '../features/measure/measure-tool.js';
import {floorTool} from '../features/floors/floor-tool.js';
import {roomTool} from '../features/room/room-tool.js';
import {furnitureTool} from '../features/furniture/furniture-tool.js';

const LAYERS = [
  stageLayer,
  // the active room (Room and Furniture modes)
  floorUnderlayLayer, roomFloorLayer, walkPathsLayer, wallsLayer, iwallsLayer, pillarsLayer,
  openingsLayer, openRegionsLayer, itemsLayer, wallLabelsLayer, alignGuidesLayer,
  roomHandlesLayer, itemToolsLayer, measuresLayer, readoutLayer,
  // every room on the floor (Floor mode)
  floorRoomsLayer, floorWallsLayer, floorContentsLayer, floorLabelsLayer, floorOverlapsLayer,
  floorGuidesLayer, floorSelectionLayer, floorReadoutLayer,
];

/* The first whose active() holds is the active tool: a drawing tool or the
   Measure tool while one is on, else the canvas mode's own. */
const TOOLS = [roomDrawTool, wallDrawTool, splitTool, measureTool, floorTool, roomTool, furnitureTool];

function setupCanvas(){
  for(const l of LAYERS) addLayer(l);
  for(const t of TOOLS) registerTool(t);   // each tool's overlay joins the layers
}

export {setupCanvas};
