import {bbox, polyArea, polySimple, ptSegDist} from '../core/geometry.js';
import {blankLayout, uid} from '../core/state.js';
import {clampOpenings, syncWallOff, wallIsOff, wallOf} from '../model/walls.js';
import {bpCleanPoly} from './poly.js';
import {bpState} from './state.js';

/* ---- blueprint: proposal + edits -> draft ----
   The proposal is never mutated. Every correction lands in bpState.edits and the
   draft is rebuilt from scratch, because changing the scale moves every room and
   that has to stay idempotent over whatever the user has already fixed. */
/* A doorway between two rooms belongs to BOTH of them. l.openings is per layout and the
   shared wall band is deep enough to punch from either side, so emitting it once leaves a
   door that reads correctly from the living room and is a solid wall from the bedroom.
   Only ONE side gets the leaf and swing, though — drawing a hinge or bi-fold on both
   walls of the same physical opening draws two doors on top of each other. The other
   side still gets its own rec (still punches its own wall), just downgraded to a plain
   doorway. */
function bpAttachOpenings(layouts, openings, edits, mmX, mmY, G, wallMm){
  const where={};
  for(const l of layouts) l.openings=[];
  for(const o of openings){
    const ed=edits.openings[o.id]||(edits.openings[o.id]={});
    if(ed.deleted) continue;
    const A=[o.aPx[0]*mmX-G.x0, o.aPx[1]*mmY-G.y0];
    const B=[o.bPx[0]*mmX-G.x0, o.bPx[1]*mmY-G.y0];
    const mid=[(A[0]+B[0])/2, (A[1]+B[1])/2];
    const recs=[];
    for(const l of layouts){
      const P=l.room.points, n=P.length;
      const off=[l.floorPlace.x, l.floorPlace.y];
      const lm=[mid[0]-off[0], mid[1]-off[1]];
      /* An opening is found on the wall's CENTRELINE, so how far that sits from the room's
         inner face depends on how thick this particular wall is. A fixed partition-sized
         allowance misses every window in a thick exterior shell. */
      let bi=-1, bd=Math.max(wallMm, (o.tPx||0)*(mmX+mmY)/2)*1.35;
      for(let i=0;i<n;i++){
        if(wallIsOff(l.room,i)) continue;      // no wall there to punch a door through
        const d=ptSegDist(lm, P[i], P[(i+1)%n]).d;
        if(d<bd){ bd=d; bi=i; }
      }
      if(bi<0) continue;
      const wl=wallOf(bi, P);
      const proj=p=>((p[0]-off[0])-wl.a[0])*wl.dir[0] + ((p[1]-off[1])-wl.a[1])*wl.dir[1];
      const t0=proj(A), t1=proj(B);
      const width=Math.abs(t1-t0);
      if(width < 100) continue;
      const rec={ id:uid(), kind:ed.kind||o.kind,
        wall:bi, width:ed.widthMm||width, offset:Math.max(0,Math.min(t0,t1)),
        corner:'cw',
        dtype: (ed.kind||o.kind)==='window' ? 'open' : (ed.dtype||o.dtype||'open'),
        hinge:'start', swing:'in' };
      if(rec.kind==='window'){ rec.sill=900; rec.dtype='open'; }
      else if(rec.dtype==='bifold'){
        if(o.arcDir){
          const dot=o.arcDir[0]*wl.nrm[0] + o.arcDir[1]*wl.nrm[1];
          rec.swing = dot < 0 ? 'in' : 'out';
        }
      }
      else if(rec.dtype==='hinge' && o.hingePx){
        const hp=[o.hingePx[0]*mmX-G.x0-off[0], o.hingePx[1]*mmY-G.y0-off[1]];
        const p0=[wl.a[0]+wl.dir[0]*rec.offset, wl.a[1]+wl.dir[1]*rec.offset];
        const p1=[p0[0]+wl.dir[0]*rec.width, p0[1]+wl.dir[1]*rec.width];
        rec.hinge = Math.hypot(hp[0]-p0[0],hp[1]-p0[1]) <= Math.hypot(hp[0]-p1[0],hp[1]-p1[1]) ? 'start' : 'end';
        if(o.arcDir){
          /* wallOf's normal points out of the room, so a swing that runs with it opens
             outward and one that runs against it opens into this room */
          const dot=o.arcDir[0]*wl.nrm[0] + o.arcDir[1]*wl.nrm[1];
          rec.swing = dot < 0 ? 'in' : 'out';
        }
      }
      rec._bpOpen=o.id;
      recs.push({l, rec});
    }
    if(recs.length>1 && recs[0].rec.kind==='door'){
      const primary=recs.find(r=>r.rec.swing==='in') || recs[0];
      for(const r of recs) if(r!==primary) r.rec.dtype='open';
    }
    for(const {l,rec} of recs){
      l.openings.push(rec);
      (where[o.id]||(where[o.id]=[])).push(l.name);
    }
  }
  return where;
}
/* the drawing knows how thick its own walls are; 114 is only a fallback */
/* the live mm-per-pixel for each axis: derived fresh from the manual measurements
   (bpBindScaleSide) so editing or removing one takes effect immediately, rather than
   a value baked in when the measurement was first added. The most recent measurement
   along an axis wins; an axis with no measurement of its own borrows the other's, so
   a single measurement still fully calibrates the plan. Falls back to the OCR-pooled
   reading when nothing's been measured by hand at all. */
function bpScaleXY(sc){
  if(!sc) return null;
  const ms=(sc.source==='measured'&&sc.measurements) || [];
  if(ms.length){
    const per={};
    for(const m of ms) per[m.axis]=m.mm/Math.hypot(m.b[0]-m.a[0], m.b[1]-m.a[1]);
    if(per.x==null && per.y==null) return null;
    return {x:per.x!=null?per.x:per.y, y:per.y!=null?per.y:per.x};
  }
  return sc.source==='read' ? {x:sc.x, y:sc.y} : null;
}
/* the scale can differ per axis, but a wall's drawn thickness isn't tied to either one
   in particular, so thickness math just splits the difference */
function bpScaleMm(sc){ const xy=bpScaleXY(sc); return xy ? (xy.x+xy.y)/2 : 0; }
function bpEffWall(){
  const st=bpState; if(!st||!st.edits) return 114;
  if(st.edits.wallMm) return st.edits.wallMm;
  const mm=bpScaleMm(st.edits.scale);
  if(!mm||!st.proposal) return 114;
  return Math.max(50, Math.round((st.proposal.tPart||14)*mm));
}
/* same shape as bpEffWall, but the fallback is a real-world default (5¾", a common
   framed exterior wall) rather than a guess measured off the drawing, since the
   photo rarely shows the true depth of an outer wall the way it does a partition */
function bpEffExtWall(){
  const st=bpState; if(!st||!st.edits) return 146;
  if(st.edits.extMm) return st.edits.extMm;
  const mm=bpScaleMm(st.edits.scale);
  if(!mm||!st.proposal) return 146;
  return Math.max(50, Math.round((st.proposal.tExt||st.proposal.tPart||18)*mm));
}
function bpRebuild(){
  const st=bpState; if(!st||!st.proposal) return {layouts:[], problems:[], area:0};
  const e=st.edits, xy=bpScaleXY(e.scale), mmX=xy&&xy.x, mmY=xy&&xy.y;
  const out={layouts:[], problems:[], area:0};
  if(!mmX||!mmY) return out;
  const wall=bpEffWall();
  const built=[];
  for(const r of st.proposal.regions){
    const ed=e.spaces[r.id]||(e.spaces[r.id]={name:'',kind:'room',touched:false});
    if(ed.kind==='skip') continue;
    /* walls trace axis-aligned in pixel space (bpOrtho), so scaling x and y by
       independent factors still lands every corner at a right angle */
    const P=bpCleanPoly(r.polyPx.map(p=>[p[0]*mmX, p[1]*mmY]));
    const named=ed.name||r.name||'';
    if(P.length<3 || !polySimple(P)){
      out.problems.push({id:r.id, name:named||'Room', why:P.length<3 ? 'Too small to be a room' : "This outline folds over itself"});
      continue;
    }
    /* nothing in the app treats a room differently for being a closet — it's purely a
       naming default, so a name typed or read off the plan always wins over it.
       92903.04 is the mm² in a square foot, same constant fmtArea uses. */
    const name=named || (polyArea(P) < 10*92903.04 ? 'Closet' : 'Room');
    built.push({rid:r.id, name, kind:ed.kind, points:P, dimText:ed.dimText||''});
  }
  if(!built.length) return out;
  /* every room keeps its own millimetre space with its bbox at the origin, and
     floorPlace carries where it sits — which is what floorPt reduces to at rot 0 */
  const all=[]; for(const b of built) all.push(...b.points);
  const G=bbox(all);
  for(const b of built){
    const bb=bbox(b.points);
    const l=blankLayout(b.name, null);
    l.room.points=b.points.map(p=>[p[0]-bb.x0, p[1]-bb.y0]);
    l.room.wall=wall;
    syncWallOff(l.room);
    l.floorPlace={x:bb.x0-G.x0, y:bb.y0-G.y0, rot:0};
    l._bpRegion=b.rid;
    /* the dimension line printed on the plan, read verbatim, not reformatted through
       fmtLen — it's shown in place of the computed size (see the dimLabel fallback in
       the main canvas render) exactly because it may not agree with what got traced */
    if(b.dimText) l.dimLabel=b.dimText;
    /* the same outline back in the photo's own pixels, so the overlay draws exactly
       what will be created rather than something reconstructed from it */
    l._bpPx=b.points.map(p=>[p[0]/mmX, p[1]/mmY]);
    out.layouts.push(l);
    out.area+=polyArea(l.room.points);
  }
  out.openingRooms=bpAttachOpenings(out.layouts, st.proposal.openings||[], e, mmX, mmY, G, wall);
  for(const l of out.layouts) clampOpenings(l);
  return out;
}
function bpScaleSanity(draft){
  if(!draft.layouts.length) return '';
  if(draft.area < 1e7) return 'That looks far too small — check the scale.';
  if(draft.area > 5e8) return 'That looks far too big — check the scale.';
  return '';
}

export {bpAttachOpenings, bpScaleXY, bpScaleMm, bpEffWall, bpEffExtWall, bpRebuild, bpScaleSanity};
