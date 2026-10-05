// @ts-check
/* ---- blueprint: step 1, upload ----
   Choosing a photo is itself the confirmation: dropping, picking or pasting
   one moves straight on to the crop. Continue only exists as the keyboard's
   way on once a photo is picked (Enter), so its button stays out of sight.
   `to.next()` moves on to the crop (see flow.js). */
import {useEffect, useRef, useState} from 'preact/hooks';
import {moError, openDialog} from '../../ui-kit/modal.jsx';
import {bpFitCanvas, bpLoadImage} from './image.js';
import {bpDispose, bpState, setBpState} from './state.js';
import {Stepper} from './wizard.jsx';

/** The wizard's moves out of a stage (flow.js). @typedef {{next: () => void, back?: () => void}} StageMoves */

/** @param {{next: () => void}} p */
function UploadBody({next}){
  const [status, setStatus] = useState('');
  const [over, setOver] = useState(false);
  const live = useRef(true);
  /** @param {File} f */
  const take = f => {
    setStatus('Reading the photo…');
    bpLoadImage(f).then((/** @type {{img: HTMLImageElement, url: string, file: File}} */r)=>{
      if(!live.current) return;
      if(bpState.url) URL.revokeObjectURL(bpState.url);
      bpState.file=r.file; bpState.img=r.img; bpState.url=r.url;
      bpState.full=bpFitCanvas(r.img, 2400);
      bpState.crop=null; bpState.proposal=null; bpState.detectedFor=null;
      next();
    }).catch(()=>{ if(live.current) setStatus("That file isn't an image the browser can open."); });
  };
  /* A screenshot of a listing is the commonest input there is, so paste has
     to work, wherever the focus is — which is why it is the document's: a
     paste goes to the focused element, and nothing in this dialog takes
     focus. Bound while this stage is showing, however it goes away. */
  useEffect(() => {
    /** @param {ClipboardEvent} e */
    const onPaste = e => { const f=e.clipboardData&&e.clipboardData.files[0]; if(f) take(f); };
    document.addEventListener('paste', onPaste);
    return () => { live.current=false; document.removeEventListener('paste', onPaste); };
  }, []);
  return <>
    <div class={'dropzone'+(over?' over':'')} id="bpDrop"
      onDragOver={e=>{ e.preventDefault(); setOver(true); }}
      onDragLeave={()=>setOver(false)}
      onDrop={e=>{ e.preventDefault(); setOver(false); const f=e.dataTransfer && e.dataTransfer.files[0]; if(f) take(f); }}>Drop a photo of a floor plan here<br/>
      <label class="btn sm">Choose photo…<input type="file" id="bpFile" accept="image/*" hidden
        onChange={e=>{ const fs=e.currentTarget.files; if(fs && fs[0]) take(fs[0]); }}/></label></div>
    <p class="hint">Supports PNG, JPG, WebP</p>
    <div class="bp-status" id="bpStatus">{status}</div>
  </>;
}

/** @param {boolean|undefined} keep hold on to the photo already chosen @param {string|null|undefined} targetFloorId @param {StageMoves} to */
function bpUploadStage(keep, targetFloorId, to){
  if(!keep) bpDispose();
  if(!bpState) setBpState({file:null,img:null,url:null,full:null,crop:null,cropRect:null,work:null,
                        proposal:null,detectedFor:null,edits:null,draft:null,cal:null,worker:null,
                        debugMask:'none',targetFloorId:targetFloorId||null});
  openDialog({title: 'Import a blueprint', ok: 'Continue', okHidden: true, body: <UploadBody next={to.next}/>,
    onOk: ()=>{
      if(!bpState||!bpState.full){ moError('Choose a photo first'); return false; }
      to.next();
      return false;
    },
    onClose: bpDispose, stepper: <Stepper active={0}/>});
}

export {bpUploadStage};
