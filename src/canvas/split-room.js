/* Splitting a room in two: cutting a polyline from one point on the room's
   outline to another. The drawing state is a signal (splitDrawState), so the
   canvas follows it; committing the split is a transact('project'). */

import {batch} from '../core/signals.js';
import {nearestOnWalls} from '../model/walls.js';

/* is `pt` (already snapped) essentially exactly on the room's own outline? Returns
   the room-wall hit {i,t,len,pt} if so, else null — used to accept/reject each click. */
function boundaryHit(pt){
  const nb=nearestOnWalls(pt);
  if(!nb || nb.d>1) return null;
  return {i:nb.i, t:nb.t, len:nb.len, pt:pt.slice()};
}
/* Straight lines are common enough while cutting a room in two that they deserve
   an easy, largely automatic snap — not just a Shift-held hard lock like the
   freestanding-wall tool's axis lock. Held within SPLIT_ANGLE_TOL of a 45°
   multiple off the previous point, the point magnet-snaps there; Shift forces it
   regardless of how far off the raw angle actually is. */
const SPLIT_ANGLE_STEP=Math.PI/4, SPLIT_ANGLE_TOL=6*Math.PI/180;
function splitAngleSnap(prev, raw, hard){
  const dx=raw[0]-prev[0], dy=raw[1]-prev[1], dist=Math.hypot(dx,dy);
  if(dist<1) return raw;
  const ang=Math.atan2(dy,dx), snapAng=Math.round(ang/SPLIT_ANGLE_STEP)*SPLIT_ANGLE_STEP;
  const diff=Math.abs(Math.atan2(Math.sin(ang-snapAng), Math.cos(ang-snapAng)));
  if(!hard && diff>SPLIT_ANGLE_TOL) return raw;
  return [prev[0]+Math.cos(snapAng)*dist, prev[1]+Math.sin(snapAng)*dist];
}

/* Resolving where the next point of the cut lands (the same magnet as a
   corner drag). The cut in progress is drawn by the split tool's overlay,
   canvas/tools/split.js. */
import {RP} from '../core/state.js';
import {wallOf} from '../model/walls.js';
import {splitDrawState, drawCursor} from './interaction-state.js';
import {alignGuides, alignNote, roomSel, mergeClear} from '../core/selection.js';
import {alignPoint, alignRadius, isSquare} from './snap.js';
import {pointInPoly, polySimple, segHit, worldPoly} from '../core/geometry.js';
import {floorHist, furnHist, roomHist} from '../core/history.js';
import {pruneMeasures} from '../core/migrate.js';
import {L, S, clone, uid} from '../core/state.js';
import {transact} from '../core/tx.js';
import {clampOpenings, syncWallOff} from '../model/walls.js';
import {flash} from '../ui/flash.js';
import {$, askConfirm, closeModal, openModal} from '../ui/modal.js';
import {plural} from '../ui/panels.js';

import {mergeSplice} from './merge-rooms.js';
import {fit} from './camera.js';

import {stopOtherTools} from './interaction.js';
import {activateLayout, setMode} from '../plan/mode.js';

/* Every existing room corner, and every split point already placed, that the
   NEXT split point can align to — the same {p, bias, edge} shape snapCorner
   builds for dragging a room corner, so it reuses alignPoint/isSquare as-is.
   A corner offers both of its own walls as a "square to this" option; the
   most recently placed split point offers the segment behind it (or, for
   the very first point, the wall it started on) the same way drawSnapPoint
   does for a freehand room outline. */
function splitRefs(){
  const P=RP(), n=P.length, refs=[];
  for(let i=0;i<n;i++){
    refs.push({p:P[i], bias:0.3, edge:wallOf(i).dir});
    refs.push({p:P[i], bias:0.3, edge:wallOf((i-1+n)%n).dir});
  }
  const pts=splitDrawState.value.pts;
  for(let k=0;k<pts.length;k++){
    const p=pts[k].pt||pts[k], last=k===pts.length-1;
    let edge=null;
    if(last && k>0){ const prev=pts[k-1].pt||pts[k-1]; edge=[p[0]-prev[0], p[1]-prev[1]]; }
    else if(last) edge=wallOf(pts[0].i).dir;   // only point so far is the start hit
    refs.push({p, bias:last?0:0.2, edge});
  }
  return refs;
}
/* the three points a "is this bend square?" check (and its tick glyph) reads —
   the last two placed points plus the candidate, or, before any bend exists
   yet, a point synthesised back along the start wall so the very first
   segment can still be told apart from square. */
function splitCornerRef(pts, candidatePt){
  if(pts.length>=2){
    return [pts[pts.length-2].pt||pts[pts.length-2], pts[pts.length-1].pt||pts[pts.length-1], candidatePt];
  }
  if(pts.length===1){
    const start=pts[0], w=wallOf(start.i);
    /* w.dir is a unit vector — a synthetic point only 1mm back along the wall is
       invisible on screen (drawSquareTick's own arm-direction check bails out
       under 1 screen px), so push it out a real distance instead. */
    return [[start.pt[0]-w.dir[0]*500, start.pt[1]-w.dir[1]*500], start.pt, candidatePt];
  }
  return null;
}
/* Where the next split point actually lands: Shift hard-locks to a 45° off
   the last point; otherwise the room's own corners/walls and the split
   line's own last segment get first pick (so a bend can line up square in a
   corner, same as dragging a room corner does), falling back to the plain
   45°-ish soft angle magnet, and finally to whatever raw point was given. */
function splitResolvePoint(raw0, hard){
  const pts=splitDrawState.value.pts;
  const prev=pts.length ? (pts[pts.length-1].pt||pts[pts.length-1]) : null;
  if(hard && prev) return {pt:splitAngleSnap(prev, raw0, true), guides:[], note:'Straight'};
  const aligned=alignPoint(raw0, splitRefs(), alignRadius());
  if(aligned.guides.length){
    const cr=splitCornerRef(pts, aligned.pt);
    return {pt:aligned.pt, guides:aligned.guides, note: cr && isSquare(cr[0],cr[1],cr[2]) ? 'Right angle' : 'Lined up'};
  }
  if(prev){
    const angled=splitAngleSnap(prev, raw0, false);
    if(angled!==raw0) return {pt:angled, guides:[], note:'Straight'};
  }
  return {pt:raw0, guides:[], note:''};
}

/* abandoning the cut */
function cancelSplitDraw(){ batch(()=>{ splitDrawState.value = null; alignGuides.value = []; alignNote.value = ''; }); }

/* Once a start hit, any interior points, and an end hit are in hand: validate the
   drawn path is a genuine interior cut (touches the boundary only at its two
   ends, never crosses itself or any other wall, runs through the inside), insert
   the two cut corners, and split the polygon into two chains threaded through
   whatever interior points were placed. Nothing is committed here — this only
   gets as far as opening the solid/open choice; the actual S.layouts mutation
   happens in commitSplit(). */
function trySplitLine(hitA, mid, hitB){
  const P=RP(), n=P.length;
  if(hitA.i===hitB.i){ flash('Pick two different walls to split between'); return; }
  const path=[hitA.pt, ...mid, hitB.pt];
  /* a hit that landed (near enough) exactly on an existing corner touches BOTH
     walls meeting there, not just the one edge index it happened to be recorded
     against — exclude both, or a segment merely starting/ending at that shared
     corner can register as "crossing" the other one via a degenerate collinear
     case in segHit. */
  const endEdges = hit => {
    const s=new Set([hit.i]), tAbs=hit.t*hit.len;
    if(tAbs<=1) s.add((hit.i-1+n)%n);
    else if(tAbs>=hit.len-1) s.add((hit.i+1)%n);
    return s;
  };
  const exclA=endEdges(hitA), exclB=endEdges(hitB);
  for(let s=0;s<path.length-1;s++){
    for(let k=0;k<n;k++){
      if((s===0 && exclA.has(k)) || (s===path.length-2 && exclB.has(k))) continue;
      if(segHit(path[s], path[s+1], P[k], P[(k+1)%n])){
        flash("That line crosses the room's own wall — try a straighter cut");
        return;
      }
    }
  }
  for(let s=0;s<path.length-1;s++){
    for(let t=s+2;t<path.length-1;t++){
      if(segHit(path[s],path[s+1],path[t],path[t+1])){
        flash('That line crosses itself — try a simpler cut');
        return;
      }
    }
  }
  for(let s=0;s<path.length-1;s++){
    const segMid=[(path[s][0]+path[s+1][0])/2, (path[s][1]+path[s+1][1])/2];
    if(!pointInPoly(segMid, P)){ flash('That line runs outside the room'); return; }
  }

  const work={points:clone(P), wallOff:syncWallOff(L().room).slice(), openings:clone(L().openings), measures:clone(L().measures)};
  /* insert (or reuse) the vertex at `hit`, reporting where the new point actually
     landed so a later, lower-edge insertion can tell whether it shifted this one */
  const resolveHit = hit => {
    const tAbs=hit.t*hit.len;
    if(tAbs<=1) return {idx:hit.i, insertAt:null};
    if(tAbs>=hit.len-1) return {idx:(hit.i+1)%work.points.length, insertAt:null};
    mergeSplice(work, hit.i, tAbs);
    return {idx:hit.i+1, insertAt:hit.i+1};
  };
  const [hi,lo] = hitA.i>hitB.i ? [hitA,hitB] : [hitB,hitA];
  const hiRes=resolveHit(hi);
  let hiIdx=hiRes.idx;
  const loRes=resolveHit(lo);   // resolved second, against the (possibly hi-inserted) array
  if(loRes.insertAt!==null && loRes.insertAt<=hiIdx) hiIdx++;   // lo's own insertion just shifted hi's spot
  const loIdx=loRes.idx;
  const [pA,pB] = hitA.i>hitB.i ? [hiIdx,loIdx] : [loIdx,hiIdx];
  if(pA===pB){ flash('Pick two different points to split the room'); return; }

  /* Every corner the drawn path added (the interior points) becomes part of the
     new shared boundary, threaded through in the direction each new room walks
     it: A closes q→p via the path backwards, B closes p→q via the path forwards. */
  const p=Math.min(pA,pB), q=Math.max(pA,pB), n2=work.points.length;
  const chainA=work.points.slice(p, q+1).concat(mid.slice().reverse());
  const chainB=work.points.slice(q).concat(work.points.slice(0, p+1)).concat(mid);
  if(!polySimple(chainA) || !polySimple(chainB)){ flash("That line doesn't leave two usable rooms"); return; }
  const offA=work.wallOff.slice(p, q);
  const offB=work.wallOff.slice(q).concat(work.wallOff.slice(0, p));
  const newEdgeCount=mid.length+1;   // however many segments the drawn path has

  const inA = w => w>=p && w<q;
  const remapA = w => w-p;
  const remapB = w => w>=q ? w-q : w+(n2-q);
  const openingsA=[], openingsB=[];
  for(const o of work.openings){
    if(inA(o.wall)) openingsA.push(Object.assign(clone(o), {wall:remapA(o.wall)}));
    else openingsB.push(Object.assign(clone(o), {wall:remapB(o.wall)}));
  }
  const remapMeasureWalls = remapFn => clone(work.measures).map(m=>{
    for(const anc of [m.a,m.b]) if(anc.k==='wall'){ const w=remapFn(anc.id); anc.id = w==null ? -1 : w; }
    return m;
  });
  const measuresA=remapMeasureWalls(w=>inA(w)?remapA(w):null);
  const measuresB=remapMeasureWalls(w=>inA(w)?null:remapB(w));

  const room=L();
  const pillarsA=[], pillarsB=[];
  for(const pl of room.room.pillars) (pointInPoly([pl.x,pl.y], chainA)?pillarsA:pillarsB).push(clone(pl));
  const iwallsA=[], iwallsB=[];
  for(const w of room.room.iwalls){
    const wmid=[(w.a[0]+w.b[0])/2, (w.a[1]+w.b[1])/2];
    (pointInPoly(wmid, chainA)?iwallsA:iwallsB).push(clone(w));
  }
  const placedA=[], placedB=[];
  for(const inst of room.placed) (pointInPoly([inst.x,inst.y], chainA)?placedA:placedB).push(clone(inst));

  const crossesCut = poly => {
    for(let k=0;k<poly.length;k++) for(let s=0;s<path.length-1;s++)
      if(segHit(path[s],path[s+1],poly[k],poly[(k+1)%poly.length])) return true;
    return false;
  };
  let straddling=0;
  for(const inst of room.placed){ const item=S.inventory.find(x=>x.id===inst.itemId); if(item && crossesCut(worldPoly(inst,item))) straddling++; }
  for(const pl of room.room.pillars) if(crossesCut(worldPoly(pl,pl))) straddling++;
  for(const w of room.room.iwalls) if(pointInPoly(w.a,chainA)!==pointInPoly(w.b,chainA)) straddling++;

  openSplitChoice({chainA,chainB,offA,offB,newEdgeCount,openingsA,openingsB,pillarsA,pillarsB,iwallsA,iwallsB,placedA,placedB,measuresA,measuresB,straddling});
}
function openSplitChoice(ctx){
  /* #moFoot is the shared modal chrome every dialog reuses, so the extra
     button this one needs has to be added on mount and torn back out again
     on close — otherwise it would linger in the footer of every later modal. */
  let openBtn=null;
  openModal("Split this room into two?",
    `<p>${ctx.straddling ? plural(ctx.straddling,'item')+' sit on the dividing line and will move fully onto one side. ' : ''}Choose how the new boundary between the two rooms should look.</p>
     <p class="hint">Leaving it open removes the wall between the two rooms entirely, the same as the “Open this side” option on a wall.</p>`,
    'Split with a wall',
    ()=>{ commitSplit(ctx, false); },
    ()=>{
      openBtn=document.createElement('button');
      openBtn.type='button'; openBtn.className='btn primary';
      openBtn.textContent='Split and leave it open';
      openBtn.addEventListener('click', ()=>{ closeModal(); commitSplit(ctx, true); });
      $('moOk').insertAdjacentElement('afterend', openBtn);
    },
    {onClose:()=>{ if(openBtn){ openBtn.remove(); openBtn=null; } cancelSplitDraw(); }});
}
let lastSplit=null;   // one slot, same "not a stack" precedent as lastMerge
function commitSplit(ctx, openWall){
  const A=L(), room=A.room;
  const {wall, floor, trimOn, trim}=room;
  const bId=uid();
  lastSplit={aId:A.id, aBefore:clone(A), bId, aRoomHist:roomHist[A.id], aFurnHist:furnHist[A.id]};

  /* Not an undo step: the two rooms get fresh stacks below, and splitUndo is
     how this is taken back. */
  transact('project', ()=>{
    room.points=ctx.chainA; room.wallOff=ctx.offA.concat(Array(ctx.newEdgeCount).fill(openWall));
    room.pillars=ctx.pillarsA; room.iwalls=ctx.iwallsA;
    A.openings=ctx.openingsA; A.placed=ctx.placedA; A.measures=ctx.measuresA;
    syncWallOff(room); clampOpenings(A); pruneMeasures(A);

    const B={id:bId, name:A.name+' (2)', folderId:A.folderId, floorId:A.floorId, floorPlace:clone(A.floorPlace),
      room:{points:ctx.chainB, wall, floor, trimOn, trim, pillars:ctx.pillarsB, iwalls:ctx.iwallsB, wallOff:ctx.offB.concat(Array(ctx.newEdgeCount).fill(openWall))},
      openings:ctx.openingsB, placed:ctx.placedB, measures:ctx.measuresB};
    syncWallOff(B.room); clampOpenings(B); pruneMeasures(B);

    S.layouts.splice(S.layouts.indexOf(A)+1, 0, B);

    roomHist[A.id]={stack:[JSON.stringify({room:A.room, openings:A.openings})], idx:0};
    furnHist[A.id]={stack:[JSON.stringify({placed:A.placed})], idx:0};
    roomHist[bId]={stack:[JSON.stringify({room:B.room, openings:B.openings})], idx:0};
    furnHist[bId]={stack:[JSON.stringify({placed:B.placed})], idx:0};
    if(A.floorId) delete floorHist[A.floorId];

    mergeClear();
  });
  fit();
  flash('Split into two rooms');
}
function splitUndo(){
  if(!lastSplit) return;
  const m=lastSplit;
  askConfirm('Undo this split?', 'The room will be restored as it was before splitting.', 'Undo split', ()=>{
    transact('project', ()=>{
      const a=S.layouts.find(x=>x.id===m.aId);
      if(a) Object.assign(a, clone(m.aBefore));
      S.layouts=S.layouts.filter(x=>x.id!==m.bId);
      if(m.aRoomHist) roomHist[m.aId]=m.aRoomHist; else delete roomHist[m.aId];
      if(m.aFurnHist) furnHist[m.aId]=m.aFurnHist; else delete furnHist[m.aId];
      delete roomHist[m.bId]; delete furnHist[m.bId];
      lastSplit=null;
      if(S.active===m.bId) activateLayout(m.aId);
    });
    fit();
  });
}

/* start cutting room `id` in two, in Room mode, with nothing else live */
function startSplitRoom(id){
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  if(!polySimple(l.room.points)){ flash("Straighten this room's outline before splitting it"); return; }
  stopOtherTools('split');
  if(S.active!==id) transact('project', ()=>activateLayout(id));
  setMode('room');
  batch(()=>{ splitDrawState.value = {pts:[]}; drawCursor.value = null; roomSel.value = null; });
  fit();
  flash("Click a point on the room's wall to start the divider. Click inside the room to bend it, or click another wall to finish. Esc cancels.");
}
export {boundaryHit, splitAngleSnap, splitRefs, splitCornerRef, splitResolvePoint, cancelSplitDraw, trySplitLine, openSplitChoice, lastSplit, commitSplit, splitUndo, startSplitRoom};
