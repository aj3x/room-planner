import {bpOrtho} from './outlines.js';
import {polyArea, signedArea} from '../core/geometry.js';

/* ---- blueprint: polygon clean-up ----
   Order matters and it is the order below. polySimple rejects any edge under 50mm,
   so merging has to happen before the check, not after it — and winding has to be
   settled first of all, because reversing a ring after openings are attached would
   need an edge-index remap, and a remap that exists can be got wrong. */
const bpNormWinding = P => signedArea(P) < 0 ? P.slice().reverse() : P;
function bpDropCollinear(P,deg){
  const tol=Math.cos((deg||1.5)*Math.PI/180);
  let out=P.slice();
  for(let guard=0; guard<200 && out.length>3; guard++){
    let cut=-1;
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length], b=out[i], c=out[(i+1)%out.length];
      const u=[b[0]-a[0],b[1]-a[1]], v=[c[0]-b[0],c[1]-b[1]];
      const lu=Math.hypot(u[0],u[1]), lv=Math.hypot(v[0],v[1]);
      if(lu<1e-6||lv<1e-6){ cut=i; break; }
      if((u[0]*v[0]+u[1]*v[1])/(lu*lv) >= tol){ cut=i; break; }
    }
    if(cut<0) break;
    out.splice(cut,1);
  }
  return out;
}
function bpMergeShortEdges(P,min){
  const m=min||50;
  let out=P.slice();
  for(let guard=0; guard<400 && out.length>3; guard++){
    let worst=-1, wlen=m;
    for(let i=0;i<out.length;i++){
      const a=out[i], b=out[(i+1)%out.length];
      const len=Math.hypot(b[0]-a[0], b[1]-a[1]);
      if(len<wlen){ wlen=len; worst=i; }
    }
    if(worst<0) break;
    const j=(worst+1)%out.length;
    out[worst]=[(out[worst][0]+out[j][0])/2, (out[worst][1]+out[j][1])/2];
    out.splice(j,1);
  }
  return out;
}
/* A traced border that pinches to a point walks into the neck and back out again, so the
   same vertex appears twice. That is a legal border walk but a self-intersecting polygon,
   and polySimple is right to refuse it. Cut the smaller lobe off rather than lose the
   whole room — a kitchen minus its alcove beats no kitchen at all. */
function bpUnpinch(P, tol){
  tol=tol||25;
  let Q=P;
  for(let guard=0; guard<40; guard++){
    let hit=null;
    for(let i=0;i<Q.length && !hit;i++)
      for(let j=i+2;j<Q.length;j++){
        if(i===0 && j===Q.length-1) continue;
        if(Math.abs(Q[i][0]-Q[j][0])<=tol && Math.abs(Q[i][1]-Q[j][1])<=tol){ hit=[i,j]; break; }
      }
    if(!hit) break;
    const a=Q.slice(hit[0],hit[1]), b=Q.slice(0,hit[0]).concat(Q.slice(hit[1]));
    const next = polyArea(a)>=polyArea(b) ? a : b;
    if(next.length<4) break;
    Q=next;
  }
  return Q;
}
/* A vertex whose two edges fold back within 30° of the way they came is a spike, not a
   corner — no real wall meets another that sharply, so this is always a tracing glitch
   (a stray pixel snagged the border walk) rather than architecture. Same iterative
   removal as bpDropCollinear, just testing for near-reversal (dot ~ -1) instead of
   near-straight (dot ~ +1); dropping the tip vertex outright joins its neighbours
   directly, and a subsequent merge/collinear pass cleans up what that leaves behind. */
function bpDropSpikes(P, deg){
  const tol=Math.cos((deg||30)*Math.PI/180);
  let out=P.slice();
  for(let guard=0; guard<200 && out.length>3; guard++){
    let cut=-1;
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length], b=out[i], c=out[(i+1)%out.length];
      const u=[b[0]-a[0],b[1]-a[1]], v=[c[0]-b[0],c[1]-b[1]];
      const lu=Math.hypot(u[0],u[1]), lv=Math.hypot(v[0],v[1]);
      if(lu<1e-6||lv<1e-6) continue;
      if((u[0]*v[0]+u[1]*v[1])/(lu*lv) <= -tol){ cut=i; break; }
    }
    if(cut<0) break;
    out.splice(cut,1);
  }
  return out;
}
/* A vertex whose "ear" — the triangle it cuts with its two immediate neighbours — is
   physically tiny can't be a real corner either, whatever angle it turns at: every wall
   on a floor plan runs at least hundreds of mm between corners, so a nibble a couple of
   inches across (both its edges short, and little perpendicular deviation off the
   straight line between its neighbours) is quantization noise off a fixture's rounded
   ink, not architecture — a rounded tub rim leaves exactly this shape, a small-angle
   notch bpDropSpikes' sharp-reversal test doesn't catch since neither edge folds back.
   Expressed as effective width (twice the ear's area over its base length) rather than
   raw distance so it still means "how far off straight," the same quantity bpDropCollinear
   tests via angle; this just catches it at any angle, provided the deviation is tiny in
   absolute terms.
   150mm does NOT sit under every real corner, though — checked directly against this same
   test photo, a genuine step in the west exterior wall (confirmed against the source
   image: a clean, deliberate 90-degree jog, not rounding) measures only 84mm off straight,
   comfortably inside the 150mm meant to clear a rounded fixture's nibble. Distance alone
   can't tell those apart; a floor plan's own right angles can be exactly that small. What
   DOES tell them apart is the turn itself: every real corner in an orthogonal plan turns a
   clean 90 degrees, while the tub rim's two nibbles turn at 113 and 151 degrees (measured
   off this same photo) — nowhere near it. So a vertex within 20 degrees of a true
   90-degree turn is left alone regardless of how tiny its ear reads, and only a vertex
   that turns at some OTHER angle is judged by distance at all. */
function bpDropNoise(P, mm){
  const lim=mm||150, angTol=20*Math.PI/180;
  let out=P.slice();
  for(let guard=0; guard<200 && out.length>3; guard++){
    let cut=-1;
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length], b=out[i], c=out[(i+1)%out.length];
      const base=[c[0]-a[0],c[1]-a[1]], baselen=Math.hypot(base[0],base[1]);
      if(baselen<1e-6) continue;
      const cross=(b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
      if(Math.abs(cross)/baselen > lim) continue;
      const u=[b[0]-a[0],b[1]-a[1]], v=[c[0]-b[0],c[1]-b[1]];
      const turn=Math.atan2(u[0]*v[1]-u[1]*v[0], u[0]*v[0]+u[1]*v[1]);
      if(Math.abs(Math.abs(turn)-Math.PI/2) <= angTol) continue;
      cut=i; break;
    }
    if(cut<0) break;
    out.splice(cut,1);
  }
  return out;
}
/* the one gate. The previous attempt at this feature shipped a weakened copy that
   dropped the 50mm rule and compared area in pixels against a millimetre threshold,
   so its rooms were born invalid and every later edit rolled back with "That would
   fold the room over itself". There is no second polygon check in this file. */
function bpCleanPoly(P){
  /* A vertex the raw trace left sitting almost exactly on the line between its own
     neighbours (a stair-stepped wall corner traced one pixel wide, say) isn't noise
     ABOUT that corner, it's noise NEXT TO it — and left in, it drags a real corner's own
     ear-area test down with it: measured against a genuine ~90 degree corner one photo
     pixel away from a redundant collinear point, the corner's effective width read at
     54mm, under bpDropNoise's own 150mm limit, and the corner itself got dropped instead
     of the noise beside it (the bedroom closet on the test photo, its near wall traced
     dead straight, came out a trapezoid this way). Collinear points carry no angle and no
     ear at all, so dropping them first is always safe — never a real corner — and it
     costs the later spike/noise passes nothing since the deliberate second pass after
     them already repeats it. */
  let Q=bpDropCollinear(bpUnpinch(bpNormWinding(P)), 1.5);
  Q=bpDropSpikes(Q,30);
  Q=bpDropNoise(Q,150);
  Q=bpMergeShortEdges(bpDropCollinear(Q,1.5), 50);
  /* dropping a spike or a noise nibble can leave two former neighbours sub-50mm apart —
     the exact shape polySimple's own edge-length check exists to catch — so the
     merge/collinear pass has to run again after this second pass, not just before it. */
  Q=bpDropSpikes(Q, 30);
  Q=bpDropNoise(Q, 150);
  Q=bpMergeShortEdges(bpDropCollinear(Q,1.5), 50);
  /* Every pass above judges one vertex at a time, off its own two immediate neighbours —
     which is exactly why a whole EDGE can still end up a few tens of millimetres off
     true even once nothing along it looks droppable on its own. Checked against this same
     real photo: a 510mm edge left 37mm off horizontal, and two edges either side of one
     divider seam left 17-18mm off, each too small on its own to trip any test above but
     still a visible kink once drawn. A floor plan this pipeline traces is orthogonal by
     construction — the wall detection this whole file is built on doesn't support a
     genuinely angled wall yet (see AGENTS.md) — so an edge that's already almost exactly
     horizontal or vertical is meant to BE horizontal or vertical, and `bpOrtho` (built for
     exactly this, snapping the raw per-pixel trace before any of this file's per-vertex
     cleanup ever sees it) is run again here, on the finished edge, to catch what tracing
     left behind. 50mm matches the short-edge floor two lines up, for the same reason: past
     that, a real diagonal wall becomes the more likely explanation, not measurement noise. */
  Q=bpOrtho(Q, 50);
  Q=bpMergeShortEdges(bpDropCollinear(Q,1.5), 50);
  return bpNormWinding(bpUnpinch(Q));
}

export {bpNormWinding, bpDropCollinear, bpMergeShortEdges, bpUnpinch, bpDropSpikes, bpDropNoise, bpCleanPoly};
