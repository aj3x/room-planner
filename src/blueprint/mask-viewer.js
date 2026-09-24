import {bpState} from './state.js';

/* ---- blueprint: debug mask viewer ----
   `#bpdebug` in the URL, checked live (not cached at wizard-open) so it can be flipped
   on mid-session without restarting the import. Renders whichever of bpAnalyse's own
   intermediate masks (structure/wall/skin/cavity/barrier) is picked, straight from the
   pixels the pipeline actually classified — so a boundary bug gets diagnosed against
   what the pipeline saw, not guessed at from the final polygon. */
function bpDebugOn(){ return true; } // TODO: revert to `location.hash.indexOf('bpdebug')>=0` when asked to hide debug mode again
const BP_DEBUG_MASKS=['none','structure','wall','skin','cavity','barrier'];
function bpDebugMaskArr(name){
  const p=bpState&&bpState.proposal; if(!p) return null;
  if(name==='barrier') return p.barrier||null;
  return (p.masks&&p.masks[name])||null;
}

export {bpDebugOn, BP_DEBUG_MASKS, bpDebugMaskArr};
