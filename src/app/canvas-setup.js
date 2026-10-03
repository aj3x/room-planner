/* The canvas's parts list: every layer and every tool, registered once from
   boot() — never at import time. A new layer is a module under
   canvas/layers/ and one line here, a new tool a module under canvas/tools/
   and one line here; nothing else changes. Order among layers matters only
   between equal z; order among tools is their priority. */

import {addLayer, stageLayer, alignGuidesLayer, readoutLayer, registerTool} from '../features/canvas/index.js';
import {floorUnderlayLayer, floorRoomsLayer, floorWallsLayer, floorContentsLayer, floorLabelsLayer, floorOverlapsLayer, floorGuidesLayer, floorSelectionLayer, floorReadoutLayer, floorTool} from '../features/floors/index.js';
import {roomFloorLayer, roomHandlesLayer, roomDrawTool, splitTool, roomTool} from '../features/room/index.js';
import {walkPathsLayer} from '../features/walkpaths/index.js';
import {wallsLayer, iwallsLayer, pillarsLayer, wallLabelsLayer, wallDrawTool} from '../features/walls/index.js';
import {openingsLayer} from '../features/openings/index.js';
import {openRegionsLayer, itemsLayer, itemToolsLayer, furnitureTool} from '../features/furniture/index.js';
import {measuresLayer, measureTool} from '../features/measure/index.js';

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
