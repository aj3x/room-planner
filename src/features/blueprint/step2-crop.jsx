// @ts-check
/* ---- blueprint: step 2, crop ----
   The box starts drawn at a small inset rather than empty: a box you adjust reads as
   an invitation, an empty canvas reads as a puzzle. `to` holds the stages either
   side (see flow.js). */
import {useLayoutEffect, useRef} from 'preact/hooks';
import {PAL} from '../canvas/index.js';
import {moError, openDialog} from '../../ui-kit/modal.jsx';
import {bpCropCanvas, bpFitCanvas, bpLoadImage} from './image.js';
import {bpAutoCropRect} from './pixels.js';
import {bpClamp, bpDispose, bpState} from './state.js';
import {Stepper} from './wizard.jsx';

/** @typedef {{x: number, y: number, w: number, h: number}} Rect */

/** The photo with the crop box over it, dragged by its handles, its middle, or anew.
    The box is bpState.crop. */
function CropCanvas(){
  const ref = useRef(/** @type {HTMLCanvasElement|null} */(null));
  /** @type {import('preact').RefObject<{mode: string|null, grab: {p: number[], r: Rect}|null}>} what a drag is doing */
  const drag = useRef({mode: null, grab: null});
  const src=bpState.full, W=src.width, H=src.height;
  if(!bpState.crop){
    bpState.crop = bpAutoCropRect(src);
    if(!bpState.crop){
      const ix=Math.round(W*0.06), iy=Math.round(H*0.06);
      bpState.crop={x:ix, y:iy, w:W-ix*2, h:H-iy*2};
    }
  }
  const HS=Math.max(8, Math.round(Math.min(W,H)*0.018));
  /** @param {Rect} r @returns {Record<string, number[]>} */
  const handles=r=>({
    nw:[r.x,r.y], n:[r.x+r.w/2,r.y], ne:[r.x+r.w,r.y],
    e:[r.x+r.w,r.y+r.h/2], se:[r.x+r.w,r.y+r.h], s:[r.x+r.w/2,r.y+r.h],
    sw:[r.x,r.y+r.h], w:[r.x,r.y+r.h/2]
  });
  const paint=()=>{
    const cv2=ref.current; if(!cv2) return;
    const cx=/** @type {CanvasRenderingContext2D} */(cv2.getContext('2d'));   // a 2D context is always available
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
  useLayoutEffect(paint, []);
  /** @param {PointerEvent} e */
  const toLocal=e=>{
    const b=/** @type {HTMLCanvasElement} */(ref.current).getBoundingClientRect();   // the event is the canvas's
    return [ (e.clientX-b.left)*(W/b.width), (e.clientY-b.top)*(H/b.height) ];
  };
  const d=/** @type {{mode: string|null, grab: {p: number[], r: Rect}|null}} */(drag.current);   // set above
  const done=()=>{
    if(!d.mode) return;
    d.mode=null;
    const r=bpState.crop;
    if(r.w<20||r.h<20) bpState.crop={x:0,y:0,w:W,h:H};
    paint();
  };
  return <canvas id="bpCrop" ref={ref} width={W} height={H}
    onPointerDown={e=>{
      const p=toLocal(e), r=bpState.crop, hs=handles(r);
      d.mode=null;
      for(const k in hs){
        const q=hs[k];
        if(Math.abs(p[0]-q[0])<=HS && Math.abs(p[1]-q[1])<=HS){ d.mode='resize-'+k; break; }
      }
      if(!d.mode) d.mode = (p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h) ? 'move' : 'new';
      if(d.mode==='new') bpState.crop={x:p[0],y:p[1],w:0,h:0};
      d.grab={p, r:Object.assign({},r)};
      e.currentTarget.setPointerCapture(e.pointerId);
      paint();
    }}
    onPointerMove={e=>{
      if(!d.mode || !d.grab) return;
      const p=toLocal(e), r=bpState.crop, g=d.grab;
      const dx=p[0]-g.p[0], dy=p[1]-g.p[1];
      if(d.mode==='move'){
        r.x=bpClamp(g.r.x+dx, 0, W-g.r.w); r.y=bpClamp(g.r.y+dy, 0, H-g.r.h);
      } else if(d.mode==='new'){
        r.x=Math.min(g.p[0],p[0]); r.y=Math.min(g.p[1],p[1]);
        r.w=Math.abs(dx); r.h=Math.abs(dy);
      } else {
        const k=d.mode.slice(7);
        let x0=g.r.x, y0=g.r.y, x1=g.r.x+g.r.w, y1=g.r.y+g.r.h;
        if(k.includes('w')) x0=bpClamp(x0+dx,0,x1-20);
        if(k.includes('e')) x1=bpClamp(x1+dx,x0+20,W);
        if(k.includes('n')) y0=bpClamp(y0+dy,0,y1-20);
        if(k.includes('s')) y1=bpClamp(y1+dy,y0+20,H);
        r.x=x0; r.y=y0; r.w=x1-x0; r.h=y1-y0;
      }
      paint();
    }}
    onPointerUp={done} onPointerCancel={done}/>;
}

/** @param {{replace: (f: File) => void}} p */
function CropBody({replace}){
  return <>
    <div class="bp-stage" id="bpCropWrap"><CropCanvas/></div>
    <div class="bp-row">
      <label class="btn quiet sm">Replace image<input type="file" id="bpChange" accept="image/*" hidden
        onChange={e=>{ const fs=e.currentTarget.files; if(fs && fs[0]) replace(fs[0]); }}/></label>
    </div>
    <p class="hint">Drag the box to cover just the floor plan.</p>
  </>;
}

/** @param {string|null|undefined} targetFloorId @param {{back: () => void, next: () => void}} to */
function bpCropStage(targetFloorId, to){
  /** @param {File} f */
  const replace = f => {
    bpLoadImage(f).then((/** @type {{img: HTMLImageElement, url: string, file: File}} */r)=>{
      if(bpState.url) URL.revokeObjectURL(bpState.url);
      bpState.file=r.file; bpState.img=r.img; bpState.url=r.url;
      bpState.full=bpFitCanvas(r.img, 2400);
      bpState.crop=null; bpState.proposal=null; bpState.detectedFor=null;
      bpCropStage(targetFloorId, to);
    }).catch(()=>moError("That file isn't an image the browser can open."));
  };
  openDialog({title: 'Import a blueprint', ok: 'Confirm crop', body: <CropBody replace={replace}/>,
    onOk: ()=>{
      bpState.cropRect = bpState.crop || {x:0,y:0,w:bpState.full.width,h:bpState.full.height};
      bpState.work = bpCropCanvas(bpState.full, bpState.cropRect);
      to.next();
      return false;
    },
    xwide: true, onClose: bpDispose, onBack: to.back, stepper: <Stepper active={1}/>});
}

export {bpCropStage};
