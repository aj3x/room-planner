import {$, moError, openModal} from '../ui/modal.js';
import {bpFitCanvas, bpLoadImage} from './image.js';
import {bpDispose, bpPasteFn, bpState, bpUnbindPaste, setBpPasteFn, setBpState} from './state.js';
import {bpCropDialog} from './step2-crop.js';
import {bpStepperHTML} from './wizard.js';

/* ---- blueprint: step 1, upload ---- */
function bpUploadDialog(keep, targetFloorId){
  if(!keep) bpDispose();
  if(!bpState) setBpState({file:null,img:null,url:null,full:null,crop:null,cropRect:null,work:null,
                        proposal:null,detectedFor:null,edits:null,draft:null,cal:null,worker:null,
                        debugMask:'none',targetFloorId:targetFloorId||null});
  openModal('Import a blueprint', `
    <div class="dropzone" id="bpDrop">Drop a photo of a floor plan here<br>
      <label class="btn sm">Choose photo…<input type="file" id="bpFile" accept="image/*" hidden></label></div>
    <p class="hint">Supports PNG, JPG, WebP</p>
    <div class="bp-status" id="bpStatus"></div>`,
    'Continue',
    ()=>{
      if(!bpState||!bpState.full){ moError('Choose a photo first'); return false; }
      bpUnbindPaste();
      bpCropDialog(targetFloorId);
      return false;
    },
    ()=>bpMountUpload(targetFloorId),
    {onClose:bpDispose, stepper:bpStepperHTML(0)});
  /* choosing a photo is itself the confirmation — Continue only exists as a keyboard
     fallback once a photo is picked, so it stays out of the way until then */
  $('moOk').hidden=true;
}
function bpMountUpload(targetFloorId){
  const drop=$('bpDrop'), file=$('bpFile'), status=$('bpStatus');
  const take=f=>{
    status.textContent='Reading the photo…';
    bpLoadImage(f).then(r=>{
      if(bpState.url) URL.revokeObjectURL(bpState.url);
      bpState.file=r.file; bpState.img=r.img; bpState.url=r.url;
      bpState.full=bpFitCanvas(r.img, 2400);
      bpState.crop=null; bpState.proposal=null; bpState.detectedFor=null;
      bpUnbindPaste();
      bpCropDialog(targetFloorId);
    }).catch(()=>{ status.textContent="That file isn't an image the browser can open."; });
  };
  file.addEventListener('change', ()=>{ if(file.files[0]) take(file.files[0]); });
  drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', ()=>drop.classList.remove('over'));
  drop.addEventListener('drop', e=>{
    e.preventDefault(); drop.classList.remove('over');
    const f=e.dataTransfer.files[0]; if(f) take(f);
  });
  /* a screenshot of a listing is the commonest input there is, so paste has to work,
     even though the hint text no longer spells out the shortcut. Unbound on the way
     to the next stage as well as on close, because a stage handoff replaces the
     modal's close hook without ever running it. */
  bpUnbindPaste();
  setBpPasteFn(e=>{ const f=e.clipboardData&&e.clipboardData.files[0]; if(f) take(f); });
  document.addEventListener('paste', bpPasteFn);
}

export {bpUploadDialog, bpMountUpload};
