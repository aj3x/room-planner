import {PAL} from '../canvas/draw.js';
import {S} from '../core/state.js';
import {fmtLen, parseLen} from '../core/units.js';
import {$, moError, openModal, svgI} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';
import {bpAnalyse} from './detect.js';
import {bpEffExtWall, bpEffWall, bpRebuild, bpScaleSanity, bpScaleXY} from './draft.js';
import {bpDispose, bpRunSeq, bpState, setBpRunSeq} from './state.js';
import {bpCropDialog} from './step2-crop.js';
import {bpReviewDialog} from './step4-review.js';
import {bpStepperHTML} from './wizard.js';

/* ---- blueprint: step 3, scale ----
   Detection runs entirely in pixel space (bpAnalyse never needs a real-world unit),
   so this step doesn't gate detection — it's the calibration and wall-thickness tool
   that used to be stranded at the top of the review screen, given its own screen. */
const BP_STEPS=[['walls','Reading the walls'],['rooms','Finding the rooms'],['text','Reading the text on the plan']];
function bpScaleDialog(targetFloorId){
  const st=bpState, ready=!!st.proposal;
  openModal('Import a blueprint',
    ready ? `<div class="bp-review">
      <div class="bp-stage"><canvas id="bpScaleCv"></canvas></div>
      <div id="bpScaleSide"></div>
    </div>` : `<ul class="bp-steps" id="bpSteps">
      ${BP_STEPS.map(s=>`<li data-step="${s[0]}">${svgI('check')}<span>${esc(s[1])}</span></li>`).join('')}
    </ul>`,
    'Generate layout',
    ()=>{ if(!st.edits||!st.edits.scale) return false; bpReviewDialog(targetFloorId); return false; },
    ()=>{ if(ready) bpMountScale(); else bpRunDetection(targetFloorId); },
    {xwide:true, onClose:bpDispose, onBack:()=>{ setBpRunSeq(bpRunSeq+1); bpCropDialog(targetFloorId); }, stepper:bpStepperHTML(2)});
  $('moOk').disabled = !ready || !st.edits.scale;
}
function bpRunDetection(targetFloorId){
  $('moOk').disabled=true;
  const runId=setBpRunSeq(bpRunSeq+1);
  bpState.runId=runId;
  const step=k=>{
    const li=$('bpSteps')&&$('bpSteps').querySelector(`li[data-step="${k}"]`);
    if(!li) return;
    let prev=li.previousElementSibling;
    while(prev){ prev.dataset.done='1'; prev=prev.previousElementSibling; }
    li.dataset.now='1';
  };
  bpAnalyse(bpState.work, {runId, onStep:step}).then(p=>{
    if(runId!==bpRunSeq||!bpState) return;
    bpState.proposal=p;
    bpState.detectedFor=JSON.stringify(bpState.cropRect);
    /* left null so the draft takes the thickness measured off the drawing. OCR only
       ever yields one pooled reading, so it seeds both axes equally — a manual
       measurement (see bpBindScaleSide) can then override just one of them. */
    bpState.edits={scale:p.scale ? {x:p.scale.mmPerPx, y:p.scale.mmPerPx, source:'read', n:p.scale.n, spread:p.scale.spread} : null,
      wallMm:null, extMm:null, spaces:{}, openings:{}};
    /* pre-filled from whatever OCR read off the plan, so Review opens with names and
       Scale opens already measured rather than racing an async pass against the user */
    for(const r of p.regions) bpState.edits.spaces[r.id]=
      {name:r.ocrName||'', kind:'room', touched:false, dimText:r.ocrDimText||''};
    bpState.cal=null;
    bpScaleDialog(targetFloorId);
  });
}
function bpMountScale(){
  const cv2=$('bpScaleCv'), work=bpState.work;
  cv2.width=work.width; cv2.height=work.height;
  const at=ev=>{
    const b=cv2.getBoundingClientRect();
    return [(ev.clientX-b.left)*(work.width/b.width), (ev.clientY-b.top)*(work.height/b.height)];
  };
  /* no "start measuring" button — a click on the photo just is the start (or the next
     step) of a measurement. A pair that's already complete and waiting on a length
     (or nothing in progress at all) means this click begins a fresh one; a lone first
     point means this click is its second end. */
  cv2.addEventListener('pointerdown', ev=>{
    const c=bpState.cal;
    if(!c || (c.a && c.b)) bpState.cal={a:at(ev), b:null};
    else c.b=at(ev);
    bpRenderScaleSide();
    bpDrawScale();
    if(bpState.cal.b){ const len=$('bpCalLen'); if(len) len.focus(); }
  });
  bpRenderScaleSide();
  bpDrawScale();
}
/* every manual measurement made so far, oldest first — [] once nothing's been measured
   (including right after OCR, before the person has touched Scale at all) */
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
function bpRenderScaleSide(){
  const st=bpState, e=st.edits, side=$('bpScaleSide'), c=st.cal, picking=!!(c&&c.a);
  if(!side) return;
  const xy=bpScaleXY(e.scale), warn=bpScaleSanity(bpRebuild());
  const ms=bpMeasurements();
  /* the plan's own size is the only scale reading anyone can actually check — nobody
     can tell whether 8.2mm per pixel is right, everybody can tell whether 104 m² is */
  const readNote = e.scale && e.scale.source==='read'
    ? `<div class="nm">Read off ${esc(plural(e.scale.n,'printed dimension'))}</div>
       ${e.scale.spread>0.12 ? `<p class="hint warn">Those printed dimensions don't fully agree with each other — worth adding a measurement to be sure.</p>` : ''}` : '';
  const measureRows = ms.map((m,i)=>`
    <li data-mi="${i}">
      <span class="lmain"><span class="nm">Measurement ${i+1}</span></span>
      <span class="lact">
        <input type="text" class="len" data-bp="mlen" value="${esc(fmtLen(m.mm,S.unit))}">
        <button type="button" class="btn quiet sm icon" data-bp="mdel" title="Remove this measurement" aria-label="Remove this measurement">${svgI('close')}</button>
      </span>
    </li>`).join('');
  const scaleLine = `
    ${readNote}
    ${ms.length ? `<ul class="list mt" id="bpMeasureList">${measureRows}</ul>` : ''}
    ${ms.length===1 && !picking ? `<p class="hint">Add a second measurement across a wall running the other way for a more accurate fit.</p>` : ''}
    ${warn?`<p class="hint warn">${esc(warn)}</p>`:''}`;
  side.innerHTML = `
    <div class="group-title">Scale</div>
    ${scaleLine}
    <div class="bp-measure mt" id="bpCalRow">
      <p class="hint" id="bpCalMsg">${esc(bpCalMsg())}</p>
      ${picking ? `<div class="bp-row">
        ${c.b ? `<input type="text" class="len" id="bpCalLen" placeholder="${esc(fmtLen(3000,S.unit))}">
        <button type="button" class="btn sm" id="bpCalOk">Use this length</button>` : ''}
        <button type="button" class="btn quiet sm icon" id="bpCalCancel" title="Cancel this measurement" aria-label="Cancel this measurement">${svgI('close')}</button>
      </div>` : ''}
    </div>
    <div class="group mt">
      <div class="group-title">Set wall widths</div>
      <div class="field">
        <label for="bpExtWall" title="Defaults to 5¾″, adjusted automatically once the scale is set from the photo — override if you know the real thickness.">Outer wall</label>
        <input type="text" class="len" id="bpExtWall" value="${esc(fmtLen(bpEffExtWall(), S.unit))}">
      </div>
      <div class="field">
        <label for="bpWall">Interior wall</label>
        <input type="text" class="len" id="bpWall" value="${esc(fmtLen(bpEffWall(), S.unit))}">
      </div>
    </div>`;
  $('moOk').disabled=!xy;
  bpBindScaleSide();
}
function bpBindScaleSide(){
  const e=bpState.edits;
  const calOk=$('bpCalOk');
  if(calOk) calOk.addEventListener('click', ()=>{
    const c=bpState.cal;
    if(!c||!c.a||!c.b){ moError('Click the two ends of a wall first'); return; }
    const mm=parseLen($('bpCalLen').value, S.unit);
    if(!mm||mm<=0){ moError('Enter how long that wall really is'); return; }
    const px=Math.hypot(c.b[0]-c.a[0], c.b[1]-c.a[1]);
    if(px<4){ moError('Those two points are too close together'); return; }
    moError('');
    /* traced walls are always axis-aligned in pixel space (bpOrtho), so which way this
       click ran tells us cleanly which axis it calibrates — no need to ask. */
    const axis = Math.abs(c.b[0]-c.a[0]) >= Math.abs(c.b[1]-c.a[1]) ? 'x' : 'y';
    e.scale = {source:'measured', measurements:[...bpMeasurements(), {axis, a:c.a, b:c.b, mm}]};
    bpState.cal=null;
    bpRenderScaleSide();
    bpDrawScale();
  });
  const calCancel=$('bpCalCancel');
  if(calCancel) calCancel.addEventListener('click', ()=>{
    bpState.cal=null;
    bpRenderScaleSide();
    bpDrawScale();
  });
  const list=$('bpMeasureList');
  if(list) for(const li of list.querySelectorAll('li')){
    const i=+li.dataset.mi;
    li.querySelector('[data-bp=mlen]').addEventListener('change', ev=>{
      const mm=parseLen(ev.target.value, S.unit);
      if(mm>0){ e.scale.measurements[i].mm=mm; bpRenderScaleSide(); bpDrawScale(); }
    });
    li.querySelector('[data-bp=mdel]').addEventListener('click', ()=>{
      e.scale.measurements.splice(i,1);
      bpRenderScaleSide();
      bpDrawScale();
    });
  }
  $('bpExtWall').addEventListener('change', ev=>{
    const mm=parseLen(ev.target.value, S.unit);
    if(mm>0){ e.extMm=mm; bpRenderScaleSide(); }
  });
  $('bpWall').addEventListener('change', ev=>{
    const mm=parseLen(ev.target.value, S.unit);
    if(mm>0){ e.wallMm=mm; bpRenderScaleSide(); }
  });
}
/* the calibration line(s) only — no room fills. Those don't exist as an editable concept
   until Review, and showing them here would spoil the review's own "here's what was
   found" moment. Every measurement made so far stays drawn in red with its own length
   label, so the photo always matches the editable list beside it; the one still being
   clicked is drawn the same way, just without a label until a length is entered. */
function bpDrawScale(){
  const cv2=$('bpScaleCv'); if(!cv2||!bpState) return;
  const x=cv2.getContext('2d'), C=PAL(), work=bpState.work, c=bpState.cal, red=C.danger;
  x.clearRect(0,0,cv2.width,cv2.height);
  x.drawImage(work,0,0);
  const r=Math.max(3, work.width/220);
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

export {BP_STEPS, bpScaleDialog, bpRunDetection, bpMountScale, bpMeasurements, bpAxesDone, bpCalMsg, bpRenderScaleSide, bpBindScaleSide, bpDrawScale};
