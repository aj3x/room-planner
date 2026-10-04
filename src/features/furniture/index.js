// @ts-check
/* Furniture placed in a room: the item list, the Selection panel, the
   Furniture-mode tool and the layers that draw items, their open regions and
   their handles.

   This file is the feature's public API: code outside src/features/furniture/
   imports it only from here (eslint.config.js enforces that). */

export {furnitureTool} from './furniture-tool.js';
export {dragInv, invBox, itemMenu, mountItemList, placeItem, renameItem, setDragInv} from './item-list.js';
export {itemToolsLayer} from './item-tools-layer.js';
export {drawItem, itemsLayer} from './items-layer.js';
export {openRegionsLayer} from './open-regions-layer.js';
export {removeSel, rotate} from './selection-panel.js';
export {sections} from './sections.jsx';
