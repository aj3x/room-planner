/* ---- blueprint: openings ----
   A gap in a wall is a window, a hinged door, or a plain doorway, and the drawing says
   which in two cheap tests.

   Windows keep drawing THROUGH the gap: the glass is two or three hairlines continuing
   the wall faces, so structure ink is present the whole way along. A door gap is empty.

   For an empty gap, the swing arc gives away the hinge. The arc is a quarter circle about
   the hinge with a radius equal to the clear width, so counting thin-stroke pixels at that
   radius from each jamb picks the hinge by a wide margin — measured 402 against 92 on the
   test plan's bedroom door. The sweep direction then gives the side it opens to. */
function bpClassifyCuts(cuts, structure, wall, w, h, tPart){
  const thin=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++) thin[i]=(structure[i]&&!wall[i])?1:0;
  const at=(x,y)=>{ x=Math.round(x); y=Math.round(y); return (x<0||y<0||x>=w||y>=h)?0:1; };
  for(const cut of cuts){
    const len=cut.a1-cut.a0+1, c=cut.c;
    const pt=(a,d)=> cut.axis==='h' ? [a, c+d] : [c+d, a];
    /* does anything keep drawing across the gap? */
    let filled=0, samples=0;
    for(let a=cut.a0+2; a<=cut.a1-2; a+=Math.max(1,Math.round(len/24))){
      samples++;
      for(let d=-Math.round(cut.t*0.8); d<=Math.round(cut.t*0.8); d++){
        const p=pt(a,d), x=Math.round(p[0]), y=Math.round(p[1]);
        if(x<0||y<0||x>=w||y>=h) continue;
        if(structure[y*w+x]){ filled++; break; }
      }
    }
    cut.fillRatio = samples ? filled/samples : 0;
    if(cut.fillRatio>=0.7){ cut.kind='window'; continue; }
    if(cut.wide){ cut.kind='divider'; continue; }
    /* empty gap — look for a swing arc about each jamb */
    const jambs=[pt(cut.a0,0), pt(cut.a1,0)];
    /* Count is not the discriminator — the far jamb of a hinged door picks up plenty of
       stray ink, so both ends score in the hundreds. Nor is raw angular spread: measured
       all the way round, every door reads 100 degrees or more because the wall itself and
       the neighbouring fixtures sit in the radius band.

       A swing lives in ONE QUADRANT: from the line of the wall, round to square with it,
       on one side. Measured inside that quadrant a real arc fills most of the 90 degrees,
       while a bi-fold leaf is a straight line at a single bearing and a plain doorway has
       nothing. Everything outside the quadrant is somebody else's ink. */
    const ux = cut.axis==='h' ? 1 : 0, uy = cut.axis==='h' ? 0 : 1;
    const score=[];
    for(let ji=0; ji<2; ji++){
      const j=jambs[ji], s = ji===0 ? 1 : -1;
      const u=[ux*s, uy*s];
      for(const sgn of [1,-1]){
        const nv=[-u[1]*sgn, u[0]*sgn];
        const lo=len*0.82, hi=len*1.18, bins=new Uint8Array(10);
        let n=0;
        for(let y=Math.max(0,Math.round(j[1]-hi)); y<=Math.min(h-1,Math.round(j[1]+hi)); y++)
          for(let x=Math.max(0,Math.round(j[0]-hi)); x<=Math.min(w-1,Math.round(j[0]+hi)); x++){
            if(!thin[y*w+x]) continue;
            const dx=x-j[0], dy=y-j[1], d=Math.hypot(dx,dy);
            if(d<lo||d>hi) continue;
            const cu=dx*u[0]+dy*u[1], cn=dx*nv[0]+dy*nv[1];
            if(cn<0) continue;
            const ang=Math.atan2(cn,cu)*180/Math.PI;
            if(ang<-5||ang>100) continue;
            n++; bins[Math.max(0,Math.min(9,Math.floor(ang/10)))]=1;
          }
        let span=0; for(let i=0;i<10;i++) span+=bins[i];
        score.push({ji, n, span:span*10, dir:nv});
      }
    }
    score.sort((a,b)=> b.span-a.span || b.n-a.n);
    void at;
    const top=score[0];
    /* a real swing sweeps a quarter turn; under about 55 degrees of the quadrant it is a
       straight line clipping the radius band, not an arc */
    /* Not a real fix for the pollution the comment below already names — that still needs
       the stroke classifier, and a length-based attempt to separate the two ink sources at
       the wall-line stage (tried and measured against this same photo) breaks a real door
       elsewhere on it, whose own far jamb reads a genuinely short segment. This is a
       narrower backstop: a real arc on this photo never read above 393 ink pixels at any
       jamb; the two confirmed cases of a fixture's ink getting swept into the count instead
       (a toilet bowl, both times) read 981 and 989. 500 sits in the gap between those two
       clusters with room either side, so a reading above it is distrusted as contaminated
       rather than accepted as an unusually solid arc — it falls through to the plain
       `doorway` reading below, which this same investigation already concluded is the more
       likely truth for both confirmed cases anyway. */
    const isArc = top.n >= Math.max(8, len*0.3) && top.n <= 500 && top.span >= 55;
    if(isArc){
      cut.kind='door';
      cut.hingeAt=top.ji;              // 0 = the a0 end, 1 = the a1 end
      cut.hingePx=jambs[top.ji];
      cut.arcDir=top.dir;              // points into the side the door opens to
      cut.arcN=top.n;
      cut.arcSpan=top.span;
      continue;
    }
    /* No arc, so it is a plain doorway as far as this can tell.
       A bi-fold closet is NOT detected here, deliberately. It is drawn as a chevron rather
       than an arc, and three separate cheap tests all failed to tell one from the other on
       real plans: counting ink at the door's radius (the far jamb scores in the hundreds
       too), angular spread (the wall and neighbouring fixtures fill the band whichever
       door it is), and a radial profile (the quadrant beside the bedroom closet holds 1296
       ink pixels when the chevron itself is about 200). Isolating the stroke as its own
       component would fix the pollution, but the thin mask is a single blob — the ragged
       1-2px rind left around every thick wall wires every arc, leaf and fixture together.
       Doing this properly needs the stroke classifier the openings design calls for, not
       another threshold. Until then the review list carries a type control, and guessing
       wrong in the drawing is worse than leaving it plain. */
    cut.kind='doorway'; continue;
  }
  return cuts;
}

export {bpClassifyCuts};
