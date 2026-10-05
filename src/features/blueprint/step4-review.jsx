// @ts-check
/* ---- blueprint: step 4, review ----
   Detection will be wrong somewhere. This is the screen that makes that survivable,
   so everything it found is listed, named and removable before anything is created.
   `to.back()` returns to the scale (see flow.js). */
import {useLayoutEffect, useReducer, useRef} from 'preact/hooks';
import {PAL} from '../canvas/index.js';
import {bbox, polyArea} from '../../kernel/geometry.js';
import {S} from '../../kernel/state.js';
import {fmtArea, fmtLen, parseLen} from '../../kernel/units.js';
import {KIND} from '../../kernel/model/openings.js';
import {flash} from '../../ui-kit/flash.js';
import {openDialog, updateDialog} from '../../ui-kit/modal.jsx';
import {plural} from '../../ui-kit/panels.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {bpCommit} from './commit.js';
import {bpRebuild, bpScaleMm} from './draft.js';
import {BP_DEBUG_MASKS, bpDebugMaskArr, bpDebugOn} from './mask-viewer.js';
import {bpDispose, bpState} from './state.js';
import {Stepper} from './wizard.jsx';

/* The draft, the edits to it and the proposal are the detection pipeline's,
   built up across modules that are not strict yet: typed any here. */
/** @typedef {any} Draft */

/* Not styled to DESIGN.md's usual polish on purpose — this tab only exists behind
   #bpdebug, for tracing a detection bug against the real pixels, not for an end user. */
/** @param {{redraw: () => void}} p */
function DebugTab({redraw}){
  const st=bpState, p=st.proposal, dg=(p&&p.debug)||{};
  const rows=Object.keys(dg).filter(k=>k!=='w'&&k!=='h'&&k!=='thresholds');
  return <>
    <div class="group mt">
      <div class="group-title">Mask overlay</div>
      <select id="bpDebugMask" value={st.debugMask} onChange={e=>{ bpState.debugMask=e.currentTarget.value; redraw(); }}>
        {BP_DEBUG_MASKS.map(m=><option key={m} value={m}>{m==='none'?'None':m[0].toUpperCase()+m.slice(1)}</option>)}</select>
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
      <ul class="list">{rows.map(k=>{
        const v=dg[k];
        return <li key={k}><span class="lmain"><span class="nm">{k}</span></span><span class="meta">{typeof v==='number'?(Number.isInteger(v)?String(v):v.toFixed(3)):String(v)}</span></li>;
      })}</ul>
      <div class="bp-row mt"><button type="button" class="btn sm" id="bpDebugCopy" onClick={async ()=>{
        const text=JSON.stringify(dg, null, 2);
        try{ await navigator.clipboard.writeText(text); flash('Copied the debug report.'); }
        catch(e){ flash("Couldn't copy — see the console instead."); console.log(text); }
      }}>Copy report</button></div>
    </div>
  </>;
}

/* One row per opening, not one per room, even though a door between two rooms is created
   twice. Two rows for the same door would read as two doors and invite deleting one. */
/** @param {{d: Draft, changed: () => void, redraw: () => void}} p */
function OpeningsTab({d, changed, redraw}){
  const st=bpState, e=st.edits, ops=st.proposal.openings||[];
  if(!ops.length) return null;
  const live=ops.filter((/** @type {any} */o)=>!(e.openings[o.id]||{}).deleted);
  return <div class="group">
    <div class="group-title">{plural(live.length,'door')+' and windows'}</div>
    <ul class="list" id="bpOpens">{ops.map((/** @type {any} */o)=>{   // a proposed opening, the pipeline's
      const ed=e.openings[o.id]||(e.openings[o.id]={});
      const kind=ed.kind||o.kind;
      const dt=ed.dtype||o.dtype||'open';
      const rooms=(d.openingRooms&&d.openingRooms[o.id])||[];
      const wMm=ed.widthMm || Math.round(o.widthPx*bpScaleMm(e.scale));
      const where = rooms.length ? rooms.join(' · ') : 'not on a wall yet';
      return <li key={o.id} data-oid={o.id} class={ed.deleted?'bad':undefined}
        onPointerEnter={()=>{ bpState.hoverOid=o.id; redraw(); }}
        onPointerLeave={()=>{ if(bpState.hoverOid===o.id){ bpState.hoverOid=null; redraw(); } }}>
        <span class="lmain">
          <span class="nm">{kind==='window'?'Window':KIND({kind:'door',dtype:dt})}</span>
          <span class="meta">{where+(ed.deleted?' · left out':'')}</span>
        </span>
        <span class="lact">
          <input type="text" class="len" data-bp="ow" value={fmtLen(wMm,S.unit)}
            onChange={ev=>{ const mm=parseLen(ev.currentTarget.value, S.unit); if(mm>0){ ed.widthMm=mm; changed(); } }}/>
          <select data-bp="okind" value={kind} onChange={ev=>{ ed.kind=ev.currentTarget.value; changed(); }}>
            <option value="door">Door</option>
            <option value="window">Window</option>
          </select>
          <select data-bp="odtype" hidden={kind==='window'} value={dt} onChange={ev=>{ ed.dtype=ev.currentTarget.value; changed(); }}>
            <option value="hinge">Hinged</option>
            <option value="bifold">Bi-fold</option>
            <option value="slide">Sliding</option>
            <option value="open">Open doorway</option>
          </select>
          <button type="button" class="btn quiet sm icon" data-bp="odel" title={ed.deleted?'Put back':'Leave out'}
            onClick={()=>{ ed.deleted=!ed.deleted; changed(); }}><Icon name={ed.deleted?'plus':'close'}/></button>
        </span></li>;
    })}</ul>
  </div>;
}

/* The draft on the photo, and beside it every room and opening it found,
   in tabs. It renders from bpState: each change made here rebuilds the
   draft and re-renders, and the photo is redrawn after each render. */
function ReviewBody(){
  const [, bump] = useReducer(/** @param {number} n */ n => n+1, 0);
  const cv = useRef(/** @type {HTMLCanvasElement|null} */(null));
  const st=bpState, e=st.edits, work=st.work, d=st.draft, tab=st.reviewTab, dbg=bpDebugOn();
  const redraw = () => bpDrawReview(cv.current);
  /* a change to the draft: rebuild it, and with it what is highlighted (the
     list it pointed into is re-rendered) and whether there is anything to import */
  const changed = () => {
    st.draft=bpRebuild();
    st.focusRid=null; st.hoverRid=null; st.hoverOid=null;
    bump(0);
    updateDialog({okDisabled: !st.draft.layouts.length});
  };
  useLayoutEffect(redraw);
  /** @param {string} t @param {string} label */
  const tabBtn = (t, label) => <button type="button" data-tab={t} aria-pressed={tab===t} onClick={()=>{ st.reviewTab=t; changed(); }}>{label}</button>;
  return <div class="bp-review">
    <div class="bp-stage"><canvas id="bpRev" ref={cv} width={work.width} height={work.height}></canvas></div>
    {/* Enter anywhere in the dialog clicks the primary — which here would import every
        room the moment someone finished typing a length */}
    <div id="bpSide" onKeyDown={ev=>{ if(ev.key==='Enter') ev.stopPropagation(); }}>
      <div class="seg full" id="bpReviewTabs" role="group" aria-label="Review">
        {tabBtn('rooms', 'Rooms')}{tabBtn('openings', 'Openings')}{dbg ? tabBtn('debug', 'Debug') : null}
      </div>
      <div id="bpTabRooms" hidden={tab!=='rooms'}>
        <div class="group-title mt">{plural(d.layouts.length,'room')}</div>
        <ul class="list" id="bpRooms">{d.layouts.map((/** @type {any} */l)=>{   // a draft room
          const rid=l._bpRegion, ed=e.spaces[rid];
          const b=bbox(l.room.points);
          return <li key={rid} data-rid={rid}
            onPointerEnter={()=>{ bpState.hoverRid=rid; redraw(); }}
            onPointerLeave={()=>{ if(bpState.hoverRid===rid){ bpState.hoverRid=null; redraw(); } }}>
            <span class="lmain">
              {/* focus, not click, so tabbing between rows lights them up too. Focus and hover are
                  tracked apart and focus wins: sliding the pointer off the row while still typing
                  in it must not take the highlight away. */}
              <input type="text" class="nm ghost" data-bp="name" value={ed.name||l.name}
                onInput={ev=>{ ed.name=ev.currentTarget.value; ed.touched=true; }}
                onFocus={()=>{ bpState.focusRid=rid; redraw(); }}
                onBlur={()=>{ if(bpState.focusRid===rid){ bpState.focusRid=null; redraw(); } }}/>
              <span class="meta">{fmtLen(b.x1-b.x0,S.unit)+' × '+fmtLen(b.y1-b.y0,S.unit)+' · '+fmtArea(polyArea(l.room.points),S.unit)}</span>
            </span>
            <span class="lact">
              <select data-bp="kind" value={ed.kind} onChange={ev=>{ ed.kind=ev.currentTarget.value; changed(); }}>
                <option value="room">Room</option><option value="closet">Closet</option><option value="skip">Leave out</option></select>
            </span></li>;
        })}</ul>
        {d.problems.map((/** @type {{name: string, why: string}} */p,/** @type {number} */i)=><p key={i} class="hint warn">{p.name+': '+p.why+" — it'll be left out."}</p>)}
      </div>
      <div id="bpTabOpenings" hidden={tab!=='openings'}><OpeningsTab d={d} changed={changed} redraw={redraw}/></div>
      {dbg ? <div id="bpTabDebug" hidden={tab!=='debug'}><DebugTab redraw={redraw}/></div> : null}
    </div>
  </div>;
}

/** @param {string|null|undefined} targetFloorId @param {{back: () => void}} to */
function bpReviewStage(targetFloorId, to){
  const st=bpState;
  st.draft=bpRebuild();
  if(!st.reviewTab) st.reviewTab='rooms';
  /* nothing is highlighted in a list just rendered */
  st.focusRid=null; st.hoverRid=null; st.hoverOid=null;
  /* nothing is focused on arrival: a focused name lights its room up, which would single one out */
  openDialog({title: 'Review the rooms', ok: 'Import to plan', focus: false, okDisabled: !st.draft.layouts.length, body: <ReviewBody/>, onOk: bpCommit,
    xwide: true, onClose: bpDispose, onBack: to.back, stepper: <Stepper active={3}/>});
}

/* every colour here comes from the canvas palette, and doors/windows are told apart
   by shape rather than by hue, so the overlay reads the same in either theme and
   over any photo */
/** @param {HTMLCanvasElement|null} cv2 */
function bpDrawReview(cv2){
  if(!cv2||!bpState) return;
  const x=/** @type {CanvasRenderingContext2D} */(cv2.getContext('2d')), C=PAL(), work=bpState.work, d=bpState.draft;   // a 2D context is always available
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
    const paint=(/** @type {any} */l)=>{   // a draft room: the untyped pipeline's, with its outline on the photo (_bpPx)
      const on = l._bpRegion===lit;
      const P=/** @type {number[][]} */(l._bpPx);
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
  const ho = bpState.hoverOid && (bpState.proposal.openings||[]).find((/** @type {{id: string}} */o)=>o.id===bpState.hoverOid);
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

export {bpReviewStage};
