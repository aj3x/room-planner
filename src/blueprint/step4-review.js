import {PAL} from '../canvas/draw.js';
import {bbox, polyArea} from '../core/geometry.js';
import {S} from '../core/state.js';
import {fmtArea, fmtLen, parseLen} from '../core/units.js';
import {KIND} from '../plan/room-panel.js';
import {flash} from '../ui/flash.js';
import {$, openModal, svgI} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';
import {bpCommit} from './commit.js';
import {bpRebuild, bpScaleMm} from './draft.js';
import {BP_DEBUG_MASKS, bpDebugMaskArr, bpDebugOn} from './mask-viewer.js';
import {bpDispose, bpState} from './state.js';
import {bpScaleDialog} from './step3-scale.js';
import {bpStepperHTML} from './wizard.js';

/* ---- blueprint: step 4, review ----
   Detection will be wrong somewhere. This is the screen that makes that survivable,
   so everything it found is listed, named and removable before anything is created. */
function bpReviewDialog(targetFloorId){
  const st=bpState;
  st.draft=bpRebuild();
  if(!st.reviewTab) st.reviewTab='rooms';
  openModal('Review the rooms', `
    <div class="bp-review">
      <div class="bp-stage"><canvas id="bpRev"></canvas></div>
      <div id="bpSide"></div>
    </div>`,
    'Import to plan', bpCommit, ()=>bpMountReview(),
    {xwide:true, onClose:bpDispose, onBack:()=>bpScaleDialog(targetFloorId), stepper:bpStepperHTML(3)});
  bpRenderReview();
}
function bpMountReview(){
  /* Enter anywhere in the modal clicks the primary — which here would import every
     room the moment someone finished typing a length */
  $('bpSide').addEventListener('keydown', e=>{ if(e.key==='Enter') e.stopPropagation(); });
  bpMountReviewStage();
}
function bpRenderReview(){
  const st=bpState; st.draft=bpRebuild();
  /* the list is rebuilt from innerHTML, so nothing is focused or hovered afterwards and
     a stale highlight would point at the wrong room */
  st.focusRid=null; st.hoverRid=null; st.hoverOid=null;
  const d=st.draft, e=st.edits, side=$('bpSide');
  if(!side) return;
  const tab=st.reviewTab, dbg=bpDebugOn();
  side.innerHTML = `
    <div class="seg full" id="bpReviewTabs" role="group" aria-label="Review">
      <button type="button" data-tab="rooms" aria-pressed="${tab==='rooms'}">Rooms</button>
      <button type="button" data-tab="openings" aria-pressed="${tab==='openings'}">Openings</button>
      ${dbg?`<button type="button" data-tab="debug" aria-pressed="${tab==='debug'}">Debug</button>`:''}
    </div>
    <div id="bpTabRooms" ${tab==='rooms'?'':'hidden'}>
      <div class="group-title mt">${esc(plural(d.layouts.length,'room'))}</div>
      <ul class="list" id="bpRooms">${d.layouts.map(l=>{
        const rid=l._bpRegion, ed=e.spaces[rid];
        const b=bbox(l.room.points);
        return `<li data-rid="${esc(rid)}">
          <span class="lmain">
            <input type="text" class="nm ghost" data-bp="name" value="${esc(ed.name||l.name)}">
            <span class="meta">${esc(fmtLen(b.x1-b.x0,S.unit))} × ${esc(fmtLen(b.y1-b.y0,S.unit))} · ${esc(fmtArea(polyArea(l.room.points),S.unit))}</span>
          </span>
          <span class="lact">
            <select data-bp="kind"><option value="room"${ed.kind==='room'?' selected':''}>Room</option><option value="closet"${ed.kind==='closet'?' selected':''}>Closet</option><option value="skip"${ed.kind==='skip'?' selected':''}>Leave out</option></select>
          </span></li>`;
      }).join('')}</ul>
      ${d.problems.map(p=>`<p class="hint warn">${esc(p.name)}: ${esc(p.why)} — it'll be left out.</p>`).join('')}
    </div>
    <div id="bpTabOpenings" ${tab==='openings'?'':'hidden'}>${bpOpenListHTML(d)}</div>
    ${dbg?`<div id="bpTabDebug" ${tab==='debug'?'':'hidden'}>${bpDebugListHTML()}</div>`:''}`;
  $('moOk').disabled = !d.layouts.length;
  bpBindReview();
  bpDrawReview();
}
/* Not styled to DESIGN.md's usual polish on purpose — this tab only exists behind
   #bpdebug, for tracing a detection bug against the real pixels, not for an end user. */
function bpDebugListHTML(){
  const st=bpState, p=st.proposal, dg=(p&&p.debug)||{};
  const opts=BP_DEBUG_MASKS.map(m=>`<option value="${m}"${st.debugMask===m?' selected':''}>${m==='none'?'None':m[0].toUpperCase()+m.slice(1)}</option>`).join('');
  const rows=Object.keys(dg).filter(k=>k!=='w'&&k!=='h'&&k!=='thresholds').map(k=>{
    const v=dg[k]; return `<li><span class="lmain"><span class="nm">${esc(k)}</span></span><span class="meta">${esc(typeof v==='number'?(Number.isInteger(v)?v:v.toFixed(3)):String(v))}</span></li>`;
  }).join('');
  return `<div class="group mt">
    <div class="group-title">Mask overlay</div>
    <select id="bpDebugMask">${opts}</select>
    <p class="hint">Rendered as a red tint over the photo. "Wall" is what got treated as
      solid structure when the room boundary was traced; "cavity" is what the window-gap
      absorption pass swallowed into the barrier — a fixture's own linework showing up in
      either one is the bug. "Barrier" is red wherever one of those is true, and BLUE
      wherever nothing is drawn at all but a gap got stamped shut anyway (closing a doorway
      so it stops leaking one room into the next) — blue with no door or window listed
      nearby in the Openings tab is the bug.</p>
  </div>
  <div class="group">
    <div class="group-title">Pipeline counts</div>
    <ul class="list">${rows}</ul>
    <div class="bp-row mt"><button type="button" class="btn sm" id="bpDebugCopy">Copy report</button></div>
  </div>`;
}
function bpBindDebug(){
  const sel=$('bpDebugMask'); if(!sel) return;
  sel.addEventListener('change', ()=>{ bpState.debugMask=sel.value; bpDrawReview(); });
  const btn=$('bpDebugCopy');
  if(btn) btn.addEventListener('click', async ()=>{
    const p=bpState.proposal, dg=(p&&p.debug)||{};
    const text=JSON.stringify(dg, null, 2);
    try{ await navigator.clipboard.writeText(text); flash('Copied the debug report.'); }
    catch(e){ flash("Couldn't copy — see the console instead."); console.log(text); }
  });
}
/* One row per opening, not one per room, even though a door between two rooms is created
   twice. Two rows for the same door would read as two doors and invite deleting one. */
function bpOpenListHTML(d){
  const st=bpState, e=st.edits, ops=st.proposal.openings||[];
  if(!ops.length) return '';
  const live=ops.filter(o=>!(e.openings[o.id]||{}).deleted);
  return `<div class="group">
    <div class="group-title">${esc(plural(live.length,'door'))} and windows</div>
    <ul class="list" id="bpOpens">${ops.map(o=>{
      const ed=e.openings[o.id]||(e.openings[o.id]={});
      const kind=ed.kind||o.kind;
      const dt=ed.dtype||o.dtype||'open';
      const rooms=(d.openingRooms&&d.openingRooms[o.id])||[];
      const wMm=ed.widthMm || Math.round(o.widthPx*bpScaleMm(e.scale));
      const where = rooms.length ? rooms.join(' · ') : 'not on a wall yet';
      return `<li data-oid="${esc(o.id)}"${ed.deleted?' class="bad"':''}>
        <span class="lmain">
          <span class="nm">${esc(kind==='window'?'Window':KIND({kind:'door',dtype:dt}))}</span>
          <span class="meta">${esc(where)}${ed.deleted?' · left out':''}</span>
        </span>
        <span class="lact">
          <input type="text" class="len" data-bp="ow" value="${esc(fmtLen(wMm,S.unit))}">
          <select data-bp="okind">
            <option value="door"${kind==='door'?' selected':''}>Door</option>
            <option value="window"${kind==='window'?' selected':''}>Window</option>
          </select>
          <select data-bp="odtype"${kind==='window'?' hidden':''}>
            <option value="hinge"${dt==='hinge'?' selected':''}>Hinged</option>
            <option value="bifold"${dt==='bifold'?' selected':''}>Bi-fold</option>
            <option value="slide"${dt==='slide'?' selected':''}>Sliding</option>
            <option value="open"${dt==='open'?' selected':''}>Open doorway</option>
          </select>
          <button type="button" class="btn quiet sm icon" data-bp="odel" title="${ed.deleted?'Put back':'Leave out'}">${svgI(ed.deleted?'plus':'close')}</button>
        </span></li>`;
    }).join('')}</ul>
  </div>`;
}
function bpBindOpens(){
  const e=bpState.edits, ul=$('bpOpens');
  if(!ul) return;
  for(const li of ul.querySelectorAll('li')){
    const id=li.dataset.oid, ed=e.openings[id];
    li.querySelector('[data-bp=ow]').addEventListener('change', ev=>{
      const mm=parseLen(ev.target.value, S.unit);
      if(mm>0){ ed.widthMm=mm; bpRenderReview(); }
    });
    li.querySelector('[data-bp=okind]').addEventListener('change', ev=>{ ed.kind=ev.target.value; bpRenderReview(); });
    const dtEl=li.querySelector('[data-bp=odtype]');
    if(dtEl) dtEl.addEventListener('change', ev=>{ ed.dtype=ev.target.value; bpRenderReview(); });
    li.querySelector('[data-bp=odel]').addEventListener('click', ()=>{ ed.deleted=!ed.deleted; bpRenderReview(); });
    li.addEventListener('pointerenter', ()=>{ bpState.hoverOid=id; bpDrawReview(); });
    li.addEventListener('pointerleave', ()=>{ if(bpState.hoverOid===id){ bpState.hoverOid=null; bpDrawReview(); } });
  }
}
function bpBindReview(){
  const e=bpState.edits;
  for(const b of $('bpReviewTabs').querySelectorAll('button')){
    b.addEventListener('click', ()=>{ bpState.reviewTab=b.dataset.tab; bpRenderReview(); });
  }
  for(const li of $('bpRooms').querySelectorAll('li')){
    const rid=li.dataset.rid, ed=e.spaces[rid];
    const nameEl=li.querySelector('[data-bp=name]');
    nameEl.addEventListener('input', ev=>{ ed.name=ev.target.value; ed.touched=true; });
    /* focus, not click, so tabbing between rows lights them up too. Focus and hover are
       tracked apart and focus wins: sliding the pointer off the row while still typing
       in it must not take the highlight away. */
    nameEl.addEventListener('focus', ()=>{ bpState.focusRid=rid; bpDrawReview(); });
    nameEl.addEventListener('blur', ()=>{ if(bpState.focusRid===rid){ bpState.focusRid=null; bpDrawReview(); } });
    li.addEventListener('pointerenter', ()=>{ bpState.hoverRid=rid; bpDrawReview(); });
    li.addEventListener('pointerleave', ()=>{ if(bpState.hoverRid===rid){ bpState.hoverRid=null; bpDrawReview(); } });
    li.querySelector('[data-bp=kind]').addEventListener('change', ev=>{ ed.kind=ev.target.value; bpRenderReview(); });
  }
  bpBindOpens();
  bpBindDebug();
}
function bpMountReviewStage(){
  const cv2=$('bpRev'), work=bpState.work;
  cv2.width=work.width; cv2.height=work.height;
  bpDrawReview();
}
/* every colour here comes from the canvas palette, and doors/windows are told apart
   by shape rather than by hue, so the overlay reads the same in either theme and
   over any photo */
function bpDrawReview(){
  const cv2=$('bpRev'); if(!cv2||!bpState) return;
  const x=cv2.getContext('2d'), C=PAL(), work=bpState.work, d=bpState.draft;
  x.clearRect(0,0,cv2.width,cv2.height);
  x.globalAlpha=0.55; x.drawImage(work,0,0); x.globalAlpha=1;
  /* #bpdebug only: whichever intermediate mask bpAnalyse classified, tinted red and
     drawn at native resolution — the arrays are exactly work.width x work.height, one
     byte per pixel, so no scaling is needed.
     "Barrier" gets a second colour, because it isn't a mask of ink at all — it's
     `wall||skin||cavity` PLUS every gap `bpCloseGaps` stamped shut afterwards, and next
     to a real wall those read identically red even though nothing is drawn at the second
     one. That read as a genuine wall to a user checking this same view against the photo
     ("clearly there is no barrier and yet your barrier mode detects it") when what they'd
     found was a real detection bug, not this view lying to them — but the view wasn't
     telling them apart either, so there was nothing to see the difference with. Pixels
     that are also real ink (wall, skin or a window cavity) stay the original red; a pixel
     that's ONLY there because a gap got closed over it is tinted blue instead, so which
     one is which is visible before anyone has to read `bpState.proposal.cuts` by hand. */
  if(bpDebugOn() && bpState.debugMask && bpState.debugMask!=='none'){
    const p=bpState.proposal;
    if(bpState.debugMask==='barrier' && p && p.barrier && p.masks && p.barrier.length===work.width*work.height){
      const {wall,skin,cavity}=p.masks, bar=p.barrier;
      const id=x.createImageData(work.width, work.height);
      for(let i=0;i<bar.length;i++){
        if(!bar[i]) continue;
        const o=i*4, real=wall[i]||skin[i]||cavity[i];
        if(real){ id.data[o]=230; id.data[o+1]=40; id.data[o+2]=40; id.data[o+3]=170; }
        else { id.data[o]=40; id.data[o+1]=110; id.data[o+2]=230; id.data[o+3]=170; }
      }
      x.putImageData(id,0,0);
    } else {
      const arr=bpDebugMaskArr(bpState.debugMask);
      if(arr && arr.length===work.width*work.height){
        const id=x.createImageData(work.width, work.height);
        for(let i=0;i<arr.length;i++){
          if(!arr[i]) continue;
          const o=i*4; id.data[o]=230; id.data[o+1]=40; id.data[o+2]=40; id.data[o+3]=170;
        }
        x.putImageData(id,0,0);
      }
    }
  }
  /* the room being named is picked out in green, because a list of five rows all called
     "Room" says nothing about which outline you are about to name. Drawn last so it sits
     over its neighbours. Skipped on the Openings tab — a wall's own room fill would sit
     right under the blue used there for doors and windows, and the two would be
     impossible to tell apart. */
  const lw=Math.max(2, work.width/450);
  const lit = bpState.focusRid || bpState.hoverRid || null;
  if(bpState.reviewTab!=='openings'){
    const paint=l=>{
      const on = l._bpRegion===lit;
      const P=l._bpPx;
      x.beginPath();
      P.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));
      x.closePath();
      x.fillStyle = on ? C.okSoft : C.accentSoft;
      x.globalAlpha = on ? 0.62 : 0.35; x.fill(); x.globalAlpha=1;
      if(on){ x.strokeStyle=C.surface; x.lineWidth=lw*2.6; x.stroke(); }
      x.strokeStyle = on ? C.ok : C.ink;
      x.lineWidth = on ? lw*1.6 : lw;
      x.stroke();
    };
    for(const l of d.layouts) if(l._bpRegion!==lit) paint(l);
    for(const l of d.layouts) if(l._bpRegion===lit) paint(l);
  }
  /* on the Openings tab, every door and window is drawn in blue — the same colour the
     Rooms tab uses for its own fill — so switching tabs swaps which thing reads as
     "the current subject" instead of leaving both stacked on top of each other. Deleted
     ("left out") openings are skipped, same as the list beside it. */
  if(bpState.reviewTab==='openings'){
    for(const o of bpState.proposal.openings||[]){
      if((bpState.edits.openings[o.id]||{}).deleted) continue;
      if(o.id===bpState.hoverOid) continue;
      x.save();
      x.lineCap='round';
      x.strokeStyle=C.surface; x.lineWidth=Math.max(lw*3.4, o.tPx+lw*2.6);
      x.beginPath(); x.moveTo(o.aPx[0],o.aPx[1]); x.lineTo(o.bPx[0],o.bPx[1]); x.stroke();
      x.globalAlpha=0.7;
      x.strokeStyle=C.accent; x.lineWidth=Math.max(lw*2, o.tPx+lw*1.2);
      x.beginPath(); x.moveTo(o.aPx[0],o.aPx[1]); x.lineTo(o.bPx[0],o.bPx[1]); x.stroke();
      x.restore();
    }
  }
  /* an opening row highlighted the same way — a band along the same aPx/bPx segment
     bpAttachOpenings re-attaches from, as wide as the cut itself read off the wall */
  const ho = bpState.hoverOid && (bpState.proposal.openings||[]).find(o=>o.id===bpState.hoverOid);
  if(ho){
    x.save();
    x.lineCap='round';
    x.strokeStyle=C.surface; x.lineWidth=Math.max(lw*3.4, ho.tPx+lw*2.6);
    x.beginPath(); x.moveTo(ho.aPx[0],ho.aPx[1]); x.lineTo(ho.bPx[0],ho.bPx[1]); x.stroke();
    x.strokeStyle=C.ok; x.lineWidth=Math.max(lw*2, ho.tPx+lw*1.2);
    x.beginPath(); x.moveTo(ho.aPx[0],ho.aPx[1]); x.lineTo(ho.bPx[0],ho.bPx[1]); x.stroke();
    x.restore();
  }
}

export {bpReviewDialog, bpMountReview, bpRenderReview, bpDebugListHTML, bpBindDebug, bpOpenListHTML, bpBindOpens, bpBindReview, bpMountReviewStage, bpDrawReview};
