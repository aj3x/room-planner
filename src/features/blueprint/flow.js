// @ts-check
/* The wizard's order: upload, crop, scale, review. Each stage module
   renders its own stage and leaves it only through `to`, the moves to its
   neighbours that this module hands it, so no stage imports another and the
   sequence is written down once, here. Back from a stage goes to the one
   before; the scale stage's Back also abandons a detection still running
   (bpRunSeq), which it does itself before calling to.back(). */

import {bpUploadStage} from './step1-upload.jsx';
import {bpCropStage} from './step2-crop.jsx';
import {bpScaleStage} from './step3-scale.jsx';
import {bpReviewStage} from './step4-review.jsx';

/* The wizard's entry point. `keep` holds on to the photo already chosen
   (coming Back from the crop); `targetFloorId` is the floor the rooms land
   on, or none for a new one. */
/** @param {boolean} [keep] @param {string|null} [targetFloorId] */
function bpUploadDialog(keep, targetFloorId){
  bpUploadStage(keep, targetFloorId, {next: () => bpCropDialog(targetFloorId)});
}
/** @param {string|null} [targetFloorId] */
function bpCropDialog(targetFloorId){
  bpCropStage(targetFloorId, {back: () => bpUploadDialog(true, targetFloorId), next: () => bpScaleDialog(targetFloorId)});
}
/** @param {string|null} [targetFloorId] */
function bpScaleDialog(targetFloorId){
  bpScaleStage(targetFloorId, {back: () => bpCropDialog(targetFloorId), next: () => bpReviewDialog(targetFloorId)});
}
/** @param {string|null} [targetFloorId] */
function bpReviewDialog(targetFloorId){
  bpReviewStage(targetFloorId, {back: () => bpScaleDialog(targetFloorId)});
}

export {bpUploadDialog};
