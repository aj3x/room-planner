// @ts-check
/* ---- blueprint: step 3, scale ----
   Detection runs entirely in pixel space (bpAnalyse never needs a real-world unit),
   so this step doesn't gate detection — it's the calibration and wall-thickness tool,
   on a screen of its own.
   While detection runs, the stage shows its progress; when it is done the stage
   opens again with the photo to measure on. `to` holds the stages either side
   (see flow.js). */
import {useLayoutEffect, useReducer, useRef, useState} from 'preact/hooks';
import {PAL} from '../canvas/index.js';
import {S} from '../../kernel/state.js';
import {fmtLen, parseLen} from '../../kernel/units.js';
import {moError, openDialog, updateDialog} from '../../ui-kit/modal.jsx';
import {plural} from '../../ui-kit/panels.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {bpAnalyse} from './detect.js';
import {bpEffExtWall, bpEffWall, bpRebuild, bpScaleSanity, bpScaleXY} from './draft.js';
import {bpDispose, bpRunSeq, bpState, setBpRunSeq} from './state.js';
import {Stepper} from './wizard.jsx';

/** @typedef {{back: () => void, next: () => void}} StageMoves */
/** @typedef {number[]} Px a point on the photo, in its pixels */
/** One manual measurement: which axis it pins, its two ends and how long it really is.
    @typedef {{axis: 'x'|'y', a: Px, b: Px, mm: number}} Measurement */

const BP_STEPS=[['walls','Reading the walls'],['rooms','Finding the rooms'],['text','Reading the text on the plan']];

/* ---- detecting ---- */
/** The steps of a detection still running, and where it has got to; when it
    is done, the stage opens again with its result.
    @param {{done: () => void}} p */
function Detecting({done}){
  /* each step reached is marked "now", and every one before the latest "done" */
  const [seen, setSeen] = useState(/** @type {number[]} */([]));
  useLayoutEffect(() => {
    const runId=setBpRunSeq(bpRunSeq+1);
    bpState.runId=runId;
    /** @param {string} k */
    const step=k=>{ const i=BP_STEPS.findIndex(s=>s[0]===k); if(i>=0) setSeen(v=>v.concat(i)); };
    bpAnalyse(bpState.work, {runId, onStep:step}).then((/** @type {any} */p)=>{   // the detection's proposal, built across the untyped pipeline
      if(runId!==bpRunSeq||!bpState) return;
      bpState.proposal=p;
      bpState.detectedFor=JSON.stringify(bpState.cropRect);
      /* left null so the draft takes the thickness measured off the drawing. OCR only
         ever yields one pooled reading, so it seeds both axes equally — a manual
         measurement (see the scale side) can then override just one of them. */
      bpState.edits={scale:p.scale ? {x:p.scale.mmPerPx, y:p.scale.mmPerPx, source:'read', n:p.scale.n, spread:p.scale.spread} : null,
        wallMm:null, extMm:null, spaces:{}, openings:{}};
      /* pre-filled from whatever OCR read off the plan, so Review opens with names and
         Scale opens already measured rather than racing an async pass against the user */
      for(const r of p.regions) bpState.edits.spaces[r.id]=
        {name:r.ocrName||'', kind:'room', touched:false, dimText:r.ocrDimText||''};
      bpState.cal=null;
      done();
    });
  }, []);
  const cur=seen.length ? seen[seen.length-1] : -1;
  return <ul class="bp-steps" id="bpSteps">
    {BP_STEPS.map((s,i)=><li key={s[0]} data-step={s[0]} data-done={i<cur ? '1' : undefined} data-now={seen.includes(i) ? '1' : undefined}>
      <Icon name="check"/><span>{s[1]}</span></li>)}
  </ul>;
}

/* ---- measuring ---- */
/* every manual measurement made so far, oldest first — [] once nothing's been measured
   (including right after OCR, before the person has touched Scale at all) */
/** @returns {Measurement[]} */
function bpMeasurements(){
  const sc=bpState.edits&&bpState.edits.scale;
  return (sc&&sc.source==='measured'&&sc.measurements) || [];
}
/* which axes a manual measurement has already pinned down */
function bpAxesDone(){
  const ms=bpMeasurements();
  return {x:ms.some(m=>m.axis==='x'), y:ms.some(m=>m.axis==='y')};
}
/* the two ends of a click-to-measure are gathered over several events, so the
   message shown has three distinct states rather than one static line. One measurement
   is enough to generate a layout, but it assumes the photo scales the same in both
   directions — a second measurement across a wall running the other way corrects that,
   so once one axis is pinned down the prompt steers toward the other one. */
function bpCalMsg(){
  const c=bpState.cal;
  if(!c||!c.a){
    const done=bpAxesDone();
    if(done.x||done.y) return `Click the two ends of another wall, running ${done.x?'up and down':'side to side'} this time — it sharpens the other dimension.`;
    return 'Click the two ends of a wall you know.';
  }
  if(!c.b) return 'Now click the other end.';
  return 'How long is that wall?';
}
/* the calibration line(s) only — no room fills. Those don't exist as an editable concept
   until Review, and showing them here would spoil the review's own "here's what was
   found" moment. Every measurement made so far stays drawn in red with its own length
   label, so the photo always matches the editable list beside it; the one still being
   clicked is drawn the same way, just without a label until a length is entered. */
/** @param {HTMLCanvasElement|null} cv2 */
function bpDrawScale(cv2){
  if(!cv2||!bpState) return;
  const x=/** @type {CanvasRenderingContext2D} */(cv2.getContext('2d')), C=PAL(), work=bpState.work, c=bpState.cal, red=C.danger;   // a 2D context is always available
  x.clearRect(0,0,cv2.width,cv2.height);
  x.drawImage(work,0,0);
  const r=Math.max(3, work.width/220);
  /** @param {Px} a @param {Px|null} b @param {string|null} label */
  const seg=(a,b,label)=>{
    x.strokeStyle=C.surface; x.lineWidth=r*1.6;
    x.beginPath(); x.moveTo(a[0],a[1]); if(b) x.lineTo(b[0],b[1]); x.stroke();
    x.strokeStyle=red; x.lineWidth=r*0.6;
    x.beginPath(); x.moveTo(a[0],a[1]); if(b) x.lineTo(b[0],b[1]); x.stroke();
    for(const p of [a,b]) if(p){ x.beginPath(); x.arc(p[0],p[1],r,0,Math.PI*2); x.fillStyle=red; x.fill(); }
    if(!label || !b) return;
    const cx=(a[0]+b[0])/2, cy=(a[1]+b[1])/2;
    x.font='600 '+Math.max(12,Math.round(work.width/85))+'px ui-sans-serif,-apple-system,system-ui,sans-serif';
    const w=x.measureText(label).width+14, h=Math.max(20,Math.round(work.width/48));
    x.beginPath();
    if(x.roundRect) x.roundRect(cx-w/2,cy-h/2,w,h,h/2); else x.rect(cx-w/2,cy-h/2,w,h);
    x.fillStyle=C.surface; x.globalAlpha=.94; x.fill(); x.globalAlpha=1;
    x.fillStyle=red; x.textAlign='center'; x.textBaseline='middle';
    x.fillText(label,cx,cy);
  };
  for(const m of bpMeasurements()) seg(m.a, m.b, fmtLen(m.mm,S.unit));
  if(c&&c.a) seg(c.a, c.b, null);
}

/* The photo to measure on and, beside it, the scale and the wall widths.
   It renders from bpState and re-renders whenever something here changes
   it; the photo is redrawn after each render. */
function ScaleBody(){
  const [, changed] = useReducer(/** @param {number} n */ n => n+1, 0);
  const cv = useRef(/** @type {HTMLCanvasElement|null} */(null));
  const len = useRef(/** @type {HTMLInputElement|null} */(null));
  const st=bpState, e=st.edits, c=st.cal, picking=!!(c&&c.a), work=st.work;
  /** After a change: re-render, and Generate only once there is a scale to generate at. */
  const update = () => { changed(0); updateDialog({okDisabled: !bpScaleXY(e.scale)}); };
  useLayoutEffect(() => { bpDrawScale(cv.current); });
  /* the length box is where a finished pair of clicks wants typing next */
  const asking = !!(c && c.b);
  useLayoutEffect(() => { if(asking && len.current) len.current.focus(); }, [asking, c]);
  /** @param {PointerEvent} ev @returns {Px} */
  const at=ev=>{
    const b=/** @type {HTMLCanvasElement} */(cv.current).getBoundingClientRect();   // the event is the canvas's
    return [(ev.clientX-b.left)*(work.width/b.width), (ev.clientY-b.top)*(work.height/b.height)];
  };
  const warn=bpScaleSanity(bpRebuild());
  const ms=bpMeasurements();
  return <div class="bp-review">
    {/* no "start measuring" button — a click on the photo just is the start (or the next
        step) of a measurement. A pair that's already complete and waiting on a length
        (or nothing in progress at all) means this click begins a fresh one; a lone first
        point means this click is its second end. */}
    <div class="bp-stage"><canvas id="bpScaleCv" ref={cv} width={work.width} height={work.height}
      onPointerDown={ev=>{
        const cal=bpState.cal;
        if(!cal || (cal.a && cal.b)) bpState.cal={a:at(ev), b:null};
        else cal.b=at(ev);
        update();
      }}/></div>
    <div id="bpScaleSide">
      <div class="group-title">Scale</div>
      {/* the plan's own size is the only scale reading anyone can actually check — nobody
          can tell whether 8.2mm per pixel is right, everybody can tell whether 104 m² is */}
      {e.scale && e.scale.source==='read' ? <>
        <div class="nm">{'Read off '+plural(e.scale.n,'printed dimension')}</div>
        {e.scale.spread>0.12 ? <p class="hint warn">Those printed dimensions don't fully agree with each other — worth adding a measurement to be sure.</p> : null}
      </> : null}
      {ms.length ? <ul class="list mt" id="bpMeasureList">{ms.map((m,i)=>
        <li key={i} data-mi={i}>
          <span class="lmain"><span class="nm">{'Measurement '+(i+1)}</span></span>
          <span class="lact">
            <input type="text" class="len" data-bp="mlen" value={fmtLen(m.mm,S.unit)}
              onChange={ev=>{ const mm=parseLen(ev.currentTarget.value, S.unit); if(mm>0){ e.scale.measurements[i].mm=mm; update(); } }}/>
            <button type="button" class="btn quiet sm icon" data-bp="mdel" title="Remove this measurement" aria-label="Remove this measurement"
              onClick={()=>{ e.scale.measurements.splice(i,1); update(); }}><Icon name="close"/></button>
          </span>
        </li>)}</ul> : null}
      {ms.length===1 && !picking ? <p class="hint">Add a second measurement across a wall running the other way for a more accurate fit.</p> : null}
      {warn ? <p class="hint warn">{warn}</p> : null}
      <div class="bp-measure mt" id="bpCalRow">
        <p class="hint" id="bpCalMsg">{bpCalMsg()}</p>
        {picking ? <div class="bp-row">
          {c.b ? <>
            <input type="text" class="len" id="bpCalLen" ref={len} placeholder={fmtLen(3000,S.unit)}/>
            <button type="button" class="btn sm" id="bpCalOk" onClick={()=>{
              const cal=bpState.cal;
              if(!cal||!cal.a||!cal.b){ moError('Click the two ends of a wall first'); return; }
              const mm=parseLen(len.current ? len.current.value : '', S.unit);
              if(!mm||mm<=0){ moError('Enter how long that wall really is'); return; }
              const px=Math.hypot(cal.b[0]-cal.a[0], cal.b[1]-cal.a[1]);
              if(px<4){ moError('Those two points are too close together'); return; }
              moError('');
              /* traced walls are always axis-aligned in pixel space (bpOrtho), so which way this
                 click ran tells us cleanly which axis it calibrates — no need to ask. */
              const axis = Math.abs(cal.b[0]-cal.a[0]) >= Math.abs(cal.b[1]-cal.a[1]) ? 'x' : 'y';
              e.scale = {source:'measured', measurements:[...bpMeasurements(), {axis, a:cal.a, b:cal.b, mm}]};
              bpState.cal=null;
              update();
            }}>Use this length</button></> : null}
          <button type="button" class="btn quiet sm icon" id="bpCalCancel" title="Cancel this measurement" aria-label="Cancel this measurement"
            onClick={()=>{ bpState.cal=null; update(); }}><Icon name="close"/></button>
        </div> : null}
      </div>
      <div class="group mt">
        <div class="group-title">Set wall widths</div>
        <div class="field">
          <label for="bpExtWall" title="Defaults to 5¾″, adjusted automatically once the scale is set from the photo — override if you know the real thickness.">Outer wall</label>
          <input type="text" class="len" id="bpExtWall" value={fmtLen(bpEffExtWall(), S.unit)}
            onChange={ev=>{ const mm=parseLen(ev.currentTarget.value, S.unit); if(mm>0){ e.extMm=mm; update(); } }}/>
        </div>
        <div class="field">
          <label for="bpWall">Interior wall</label>
          <input type="text" class="len" id="bpWall" value={fmtLen(bpEffWall(), S.unit)}
            onChange={ev=>{ const mm=parseLen(ev.currentTarget.value, S.unit); if(mm>0){ e.wallMm=mm; update(); } }}/>
        </div>
      </div>
    </div>
  </div>;
}

/** @param {string|null|undefined} targetFloorId @param {StageMoves} to */
function bpScaleStage(targetFloorId, to){
  const st=bpState, ready=!!st.proposal;
  openDialog({title: 'Import a blueprint', ok: 'Generate layout', okDisabled: !ready || !bpScaleXY(st.edits.scale),
    body: ready ? <ScaleBody/> : <Detecting done={()=>bpScaleStage(targetFloorId, to)}/>,
    onOk: ()=>{ if(!st.edits||!st.edits.scale) return false; to.next(); return false; },
    xwide: true, onClose: bpDispose, onBack: ()=>{ setBpRunSeq(bpRunSeq+1); to.back(); }, stepper: <Stepper active={2}/>});
}

export {bpScaleStage};
