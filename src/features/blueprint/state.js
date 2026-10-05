/* ------------------------- blueprint import -------------------------
   Trace a photo of a floor plan into rooms on a floor.

   Four stages in one modal — choose a photo, crop it, find the rooms, review —
   chained by the fact that an onOk returning false leaves the modal open, so each
   stage just replaces the body. Detection is a PROPOSAL, never a result: everything
   it decides is shown, editable and deletable before a single room is created.

   The photo is deliberately not part of S. save() serialises the whole of S into
   localStorage, so a few megabytes of base64 there would break saving permanently
   and silently. It lives in bpState until commit, then it is dropped. */

/* ---- blueprint: state ---- */
/* The wizard's working state (the photo, the detection's proposal, the edits
   made to it). Typed any: its shape is built up and read across the blueprint
   modules that are not yet strict, and typing it is their ratchet step. */
/** @type {any} */
let bpState=null;
/* every async continuation carries the run it belongs to, so a cancelled detection's
   late results land on the floor instead of on a dialog that has moved on */
let bpRunSeq=0;
/* these two are written by the wizard's stages, which are modules of their
   own — and you cannot assign to an imported binding */
function setBpState(v){ bpState=v; }
function setBpRunSeq(v){ bpRunSeq=v; return v; }
const bpClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bpDispose(){
  bpRunSeq++;
  if(bpState){
    if(bpState.url) URL.revokeObjectURL(bpState.url);
    if(bpState.worker){ try{ bpState.worker.terminate(); }catch(e){} }
  }
  bpState=null;
}

export {bpState, bpRunSeq, setBpState, setBpRunSeq, bpClamp, bpDispose};
