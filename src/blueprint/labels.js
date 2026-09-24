/* ---- blueprint: name labels ----
   S5 is what READS these. The glyphs are exactly the components the largest-component
   step throws away, so finding them costs nothing, and the drawing's own median glyph
   height is the only scale any of it uses.

   Words are merged twice: along a baseline into words and lines, then down the page into
   one block per name. A room's name sits above its dimensions, and counting that second
   line as a second name would misread the block as belonging to two different rooms. */
const bpInkMedian=(vals, wts)=>{
  if(!vals.length) return 0;
  const idx=vals.map((_,i)=>i).sort((a,b)=>vals[a]-vals[b]);
  let tot=0; for(const w of wts) tot+=w;
  let acc=0;
  for(const i of idx){ acc+=wts[i]; if(acc>=tot/2) return vals[i]; }
  return vals[idx[idx.length-1]];
};
function bpLabelBlocks(comps, pick, tPart){
  const cand=comps.filter(c=> (!pick||c.id!==pick.id) && c.area>=6 && Math.max(c.bw,c.bh)<=tPart*6);
  /* a plan with this many loose marks on it is hatching, not lettering; proposing
     nothing leaves the rooms exactly as they came out, which is the safe answer */
  if(cand.length<2 || cand.length>1500) return {blocks:[], gh:tPart, glyphIds:new Set()};
  /* Weighted by ink, because a plain median counts a dimension tick the same as a letter
     and there are more ticks, hatching dashes and stray specks on a drawing than there
     are glyphs. Unweighted, the test plan's median glyph is four pixels tall and the
     filter below then throws away every actual letter. */
  const gh=bpInkMedian(cand.map(c=>c.bh), cand.map(c=>c.area)) || tPart;
  const glyphs=cand.filter(c=> c.bh>=gh*0.4 && c.bh<=gh*2.2 && c.bw<=gh*3);
  /* handed back so fixture detection (S7) can leave lettering alone without redoing this
     same glyph test a second time */
  const glyphIds=new Set(glyphs.map(c=>c.id));
  if(glyphs.length<2) return {blocks:[], gh, glyphIds};
  /* One pairwise sweep and a union-find, not merge-and-restart: growing a box and
     rescanning is O(n²) PER MERGE, which is a quarter of a second of the detection
     budget spent on lettering nobody is going to read until S5. */
  const group=(boxes, gap, along)=>{
    const par=boxes.map((_,i)=>i);
    const find=i=>{ while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; };
    for(let i=0;i<boxes.length;i++)
      for(let j=i+1;j<boxes.length;j++){
        const a=boxes[i], b=boxes[j];
        const d=along==='x' ? Math.max(0, Math.max(a.x0,b.x0)-Math.min(a.x1,b.x1))
                            : Math.max(0, Math.max(a.y0,b.y0)-Math.min(a.y1,b.y1));
        if(d>gap) continue;
        const ov=along==='x' ? Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)
                             : Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0);
        const need=along==='x' ? 0.4*Math.min(a.y1-a.y0, b.y1-b.y0)
                               : 0.3*Math.min(a.x1-a.x0, b.x1-b.x0);
        if(ov<need) continue;
        const ra=find(i), rb=find(j);
        if(ra!==rb) par[ra]=rb;
      }
    const by=new Map();
    for(let i=0;i<boxes.length;i++){
      const b=boxes[i], r=find(i), g=by.get(r);
      if(!g) by.set(r, {x0:b.x0, y0:b.y0, x1:b.x1, y1:b.y1, n:b.n});
      else { g.x0=Math.min(g.x0,b.x0); g.y0=Math.min(g.y0,b.y0);
             g.x1=Math.max(g.x1,b.x1); g.y1=Math.max(g.y1,b.y1); g.n+=b.n; }
    }
    return Array.from(by.values());
  };
  let boxes=group(glyphs.map(c=>({x0:c.x0,y0:c.y0,x1:c.x1,y1:c.y1,n:1})), gh*0.9, 'x');
  boxes=group(boxes, gh*2.0, 'y');       // a name and the dimensions under it are one block
  const blocks=boxes.filter(b=> b.n>=3 && b.x1-b.x0 >= gh*1.5)
    .map(b=>({x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,cx:(b.x0+b.x1)/2,cy:(b.y0+b.y1)/2,n:b.n}));
  return {blocks, gh, glyphIds};
}

export {bpInkMedian, bpLabelBlocks};
