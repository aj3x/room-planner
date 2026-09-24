import {PAL} from '../canvas/draw.js';
import {$, moError, openModal} from '../ui/modal.js';
import {bpCropCanvas, bpFitCanvas, bpLoadImage} from './image.js';
import {bpAutoCropRect} from './pixels.js';
import {bpClamp, bpDispose, bpState, bpUnbindPaste} from './state.js';
import {bpUploadDialog} from './step1-upload.js';
import {bpScaleDialog} from './step3-scale.js';
import {bpStepperHTML} from './wizard.js';

/* ---- blueprint: step 2, crop ----
   The box starts drawn at a small inset rather than empty: a box you adjust reads as
   an invitation, an empty canvas reads as a puzzle. */
function bpCropDialog(targetFloorId){
  bpUnbindPaste();
  openModal('Import a blueprint', `
    <div class="bp-stage" id="bpCropWrap"><canvas id="bpCrop"></canvas></div>
    <div class="bp-row">
      <label class="btn quiet sm">Replace image<input type="file" id="bpChange" accept="image/*" hidden></label>
    </div>
    <p class="hint">Drag the box to cover just the floor plan.</p>`,
    'Confirm crop',
    ()=>{
      bpState.cropRect = bpState.crop || {x:0,y:0,w:bpState.full.width,h:bpState.full.height};
      bpState.work = bpCropCanvas(bpState.full, bpState.cropRect);
      bpScaleDialog(targetFloorId);
      return false;
    },
    ()=>{
      bpMountCropStage();
      $('bpChange').addEventListener('change', e=>{
        const f=e.target.files[0]; if(!f) return;
        bpLoadImage(f).then(r=>{
          if(bpState.url) URL.revokeObjectURL(bpState.url);
          bpState.file=r.file; bpState.img=r.img; bpState.url=r.url;
          bpState.full=bpFitCanvas(r.img, 2400);
          bpState.crop=null; bpState.proposal=null; bpState.detectedFor=null;
          bpCropDialog(targetFloorId);
        }).catch(()=>moError("That file isn't an image the browser can open."));
      });
    },
    {xwide:true, onClose:bpDispose, onBack:()=>bpUploadDialog(true, targetFloorId), stepper:bpStepperHTML(1)});
}
function bpMountCropStage(){
  const old=$('bpCrop');
  /* re-mounting on the way back from a later stage must not stack a second set of
     pointer handlers on the same node */
  const cv2=old.cloneNode(false); old.parentNode.replaceChild(cv2,old);
  const src=bpState.full, W=src.width, H=src.height;
  cv2.width=W; cv2.height=H;
  const cx=cv2.getContext('2d');
  if(!bpState.crop){
    bpState.crop = bpAutoCropRect(src);
    if(!bpState.crop){
      const ix=Math.round(W*0.06), iy=Math.round(H*0.06);
      bpState.crop={x:ix, y:iy, w:W-ix*2, h:H-iy*2};
    }
  }
  const HS=Math.max(8, Math.round(Math.min(W,H)*0.018));
  const handles=r=>({
    nw:[r.x,r.y], n:[r.x+r.w/2,r.y], ne:[r.x+r.w,r.y],
    e:[r.x+r.w,r.y+r.h/2], se:[r.x+r.w,r.y+r.h], s:[r.x+r.w/2,r.y+r.h],
    sw:[r.x,r.y+r.h], w:[r.x,r.y+r.h/2]
  });
  const paint=()=>{
    const r=bpState.crop, C=PAL();
    cx.clearRect(0,0,W,H);
    cx.drawImage(src,0,0);
    cx.fillStyle=C.scrim;
    cx.beginPath();
    cx.rect(0,0,W,H);
    cx.rect(r.x,r.y,r.w,r.h);
    cx.fill('evenodd');
    cx.strokeStyle=C.accent; cx.lineWidth=Math.max(2,W/500);
    cx.strokeRect(r.x,r.y,r.w,r.h);
    cx.fillStyle=C.accent;
    for(const k in handles(r)){ const p=handles(r)[k]; cx.fillRect(p[0]-HS/2,p[1]-HS/2,HS,HS); }
  };
  const toLocal=e=>{
    const b=cv2.getBoundingClientRect();
    return [ (e.clientX-b.left)*(W/b.width), (e.clientY-b.top)*(H/b.height) ];
  };
  let mode=null, grab=null;
  cv2.addEventListener('pointerdown', e=>{
    const p=toLocal(e), r=bpState.crop, hs=handles(r);
    mode=null;
    for(const k in hs){
      const q=hs[k];
      if(Math.abs(p[0]-q[0])<=HS && Math.abs(p[1]-q[1])<=HS){ mode='resize-'+k; break; }
    }
    if(!mode) mode = (p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h) ? 'move' : 'new';
    if(mode==='new') bpState.crop={x:p[0],y:p[1],w:0,h:0};
    grab={p, r:Object.assign({},r)};
    cv2.setPointerCapture(e.pointerId);
    paint();
  });
  cv2.addEventListener('pointermove', e=>{
    if(!mode) return;
    const p=toLocal(e), r=bpState.crop, g=grab;
    const dx=p[0]-g.p[0], dy=p[1]-g.p[1];
    if(mode==='move'){
      r.x=bpClamp(g.r.x+dx, 0, W-g.r.w); r.y=bpClamp(g.r.y+dy, 0, H-g.r.h);
    } else if(mode==='new'){
      r.x=Math.min(g.p[0],p[0]); r.y=Math.min(g.p[1],p[1]);
      r.w=Math.abs(dx); r.h=Math.abs(dy);
    } else {
      const k=mode.slice(7);
      let x0=g.r.x, y0=g.r.y, x1=g.r.x+g.r.w, y1=g.r.y+g.r.h;
      if(k.includes('w')) x0=bpClamp(x0+dx,0,x1-20);
      if(k.includes('e')) x1=bpClamp(x1+dx,x0+20,W);
      if(k.includes('n')) y0=bpClamp(y0+dy,0,y1-20);
      if(k.includes('s')) y1=bpClamp(y1+dy,y0+20,H);
      r.x=x0; r.y=y0; r.w=x1-x0; r.h=y1-y0;
    }
    paint();
  });
  const done=()=>{
    if(!mode) return;
    mode=null;
    const r=bpState.crop;
    if(r.w<20||r.h<20) bpState.crop={x:0,y:0,w:W,h:H};
    paint();
  };
  cv2.addEventListener('pointerup', done);
  cv2.addEventListener('pointercancel', done);
  paint();
}

export {bpCropDialog, bpMountCropStage};
