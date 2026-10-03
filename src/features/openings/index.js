/* Doors and windows: their list, their Selection panel view, the dialog
   that adds or edits one, and their layer.

   This file is the feature's public API: code outside src/features/openings/
   imports it only from here (eslint.config.js enforces that). */

export {openingDialog} from './opening-dialog.js';
export {drawOpening, openingsLayer} from './openings-layer.js';
export {deleteOpening, mountOpeningList, renderOpeningProps} from './openings-panel.js';
