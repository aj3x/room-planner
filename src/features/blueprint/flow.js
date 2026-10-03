/* The wizard's order: upload, crop, scale, review. Each stage module
   renders its own stage and leaves it only through `to`, the moves to its
   neighbours that this module hands it, so no stage imports another and the
   sequence is written down once, here. Back from a stage goes to the one
   before; the scale stage's Back also abandons a detection still running
   (bpRunSeq), which it does itself before calling to.back(). */

import {bpUploadStage} from './step1-upload.js';
import {bpCropStage} from './step2-crop.js';
import {bpScaleStage} from './step3-scale.js';
import {bpReviewStage} from './step4-review.js';

/* The wizard's entry point. `keep` holds on to the photo already chosen
   (coming Back from the crop); `targetFloorId` is the floor the rooms land
   on, or none for a new one. */
function bpUploadDialog(keep, targetFloorId){
  bpUploadStage(keep, targetFloorId, {next: () => bpCropDialog(targetFloorId)});
}
function bpCropDialog(targetFloorId){
  bpCropStage(targetFloorId, {back: () => bpUploadDialog(true, targetFloorId), next: () => bpScaleDialog(targetFloorId)});
}
function bpScaleDialog(targetFloorId){
  bpScaleStage(targetFloorId, {back: () => bpCropDialog(targetFloorId), next: () => bpReviewDialog(targetFloorId)});
}
function bpReviewDialog(targetFloorId){
  bpReviewStage(targetFloorId, {back: () => bpScaleDialog(targetFloorId)});
}

export {bpUploadDialog};
