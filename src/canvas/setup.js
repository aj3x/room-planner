/* The canvas's parts list: every layer and every tool, registered once from
   boot() — never at import time. A new layer is a module under
   canvas/layers/ and one line here, a new tool a module under canvas/tools/
   and one line here; nothing else changes. Order among layers matters only
   between equal z; order among tools is their priority. */

import {addLayer} from './draw.js';
import {stageLayer} from './layers/stage.js';
import {floorUnderlayLayer} from './layers/floor-underlay.js';
import {roomFloorLayer} from './layers/room-floor.js';
import {walkPathsLayer} from './layers/walk-paths.js';
import {wallsLayer} from './layers/walls.js';
import {iwallsLayer} from './layers/iwalls.js';
import {pillarsLayer} from './layers/pillars.js';
import {openingsLayer} from './layers/openings.js';
import {openRegionsLayer} from './layers/open-regions.js';
import {itemsLayer} from './layers/items.js';
import {wallLabelsLayer} from './layers/wall-labels.js';
import {alignGuidesLayer} from './layers/align-guides.js';
import {roomHandlesLayer} from './layers/room-handles.js';
import {itemToolsLayer} from './layers/item-tools.js';
import {measuresLayer} from './layers/measures.js';
import {readoutLayer} from './layers/readout.js';
import {floorRoomsLayer} from './layers/floor-rooms.js';
import {floorWallsLayer} from './layers/floor-walls.js';
import {floorContentsLayer} from './layers/floor-contents.js';
import {floorLabelsLayer} from './layers/floor-labels.js';
import {floorOverlapsLayer} from './layers/floor-overlaps.js';
import {floorGuidesLayer} from './layers/floor-guides.js';
import {floorSelectionLayer} from './layers/floor-selection.js';
import {floorReadoutLayer} from './layers/floor-readout.js';
import {registerTool} from './interaction.js';
import {roomDrawTool} from './tools/room-draw.js';
import {wallDrawTool} from './tools/wall-draw.js';
import {splitTool} from './tools/split.js';
import {measureTool} from './tools/measure.js';
import {floorTool} from './tools/floor.js';
import {roomTool} from './tools/room.js';
import {furnitureTool} from './tools/furniture.js';

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
