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
let bpState=null;
/* every async continuation carries the run it belongs to, so a cancelled detection's
   late results land on the floor instead of on a dialog that has moved on */
let bpRunSeq=0, bpPasteFn=null;
/* these three are written by the wizard's step dialogs, which become their own
   modules — and you cannot assign to an imported binding */
function setBpState(v){ bpState=v; }
function setBpRunSeq(v){ bpRunSeq=v; return v; }
function setBpPasteFn(v){ bpPasteFn=v; }
const bpClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bpUnbindPaste(){ if(bpPasteFn){ document.removeEventListener('paste', bpPasteFn); bpPasteFn=null; } }
function bpDispose(){
  bpRunSeq++;
  bpUnbindPaste();
  if(bpState){
    if(bpState.url) URL.revokeObjectURL(bpState.url);
    if(bpState.worker){ try{ bpState.worker.terminate(); }catch(e){} }
  }
  bpState=null;
}

export {bpState, bpRunSeq, bpPasteFn, setBpState, setBpRunSeq, setBpPasteFn, bpClamp, bpUnbindPaste, bpDispose};
