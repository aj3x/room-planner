/* Shape fixers. migrate() upgrades an older saved state on load; normLayout
   and normItem are split out of it so the importer can clean up one room or
   one thing lifted out of a file; pruneMeasures and remapMeasures keep a
   measurement's ends pointing at things that exist.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   §3 files all five under core/store.js and they cannot go there. migrate()
   needs syncWallOff (model/walls.js) and normHex (canvas/draw.js), both
   inside the big canvas import cycle, and ui/panels.js imports core/store.js
   — so core/store.js -> canvas/draw.js welds the canvas cycle to the
   modal.js <-> panels.js one. That merged cycle contains canvas/view.js,
   whose top-level `const cv=$('cv'), ctx=cv.getContext('2d')` would then run
   before ui/modal.js had initialised `$`: the exact boot failure that
   reverted togglePane in the plan/ round. Verified with the cycle checker,
   not by eye.

   Nothing in ui/ or canvas/ imports this file, so it adds no cycle at all.
*/
import {normHex} from '../canvas/draw.js';
import {INV_SCOPES} from '../core/floor-space.js';
import {norm360} from '../core/geometry.js';
import {normOpen} from '../core/open-state.js';
import {PALETTE, isCanvasMode, rectPts, setS, uid} from '../core/state.js';
import {reconcileTags} from '../library/item-folders.js';
import {syncWallOff} from '../model/walls.js';

/* older saves used a width/depth rectangle, N/E/S/W doors, tagless/countless items, and no folders.
   normLayout/normItem are split out so the importer can clean up one room or one thing
   lifted out of a file without pushing a whole state object through migrate(). */
function normLayout(l){
  l.id = l.id || uid();
  l.name = l.name || 'My room';
  l.room = l.room || {};
  if(!Array.isArray(l.room.points)){
    l.room.points = rectPts(l.room.w||4270, l.room.d||3660);
    delete l.room.w; delete l.room.d;
  }
  l.room.wall = l.room.wall||114;
  syncWallOff(l.room);
  l.room.floor = normHex(l.room.floor)||'#f5f3ee';
  l.room.trim = l.room.trim||19;
  if(!Array.isArray(l.room.pillars)) l.room.pillars=[];
  for(const pl of l.room.pillars){
    pl.id = pl.id||uid();
    if(!pl.shape || !['rect','ellipse'].includes(pl.shape.type)) pl.shape={type:'rect',w:300,d:300};
    pl.shape.w = Math.max(10, pl.shape.w||300);
    pl.shape.d = Math.max(10, pl.shape.d||300);
    pl.x = isFinite(pl.x)?pl.x:0;
    pl.y = isFinite(pl.y)?pl.y:0;
    pl.rot = isFinite(pl.rot)?pl.rot:0;
  }
  if(!Array.isArray(l.room.iwalls)) l.room.iwalls=[];
  for(const w of l.room.iwalls){
    w.id = w.id||uid();
    if(!Array.isArray(w.a)||w.a.length<2) w.a=[0,0];
    if(!Array.isArray(w.b)||w.b.length<2) w.b=[300,0];
    w.t = Math.max(10, w.t||l.room.wall);
  }
  if(!Array.isArray(l.openings)){
    const map={N:0,E:1,S:2,W:3};
    l.openings = (l.doors||[]).map(d=>({
      id:d.id||uid(), kind:'door', wall:map[d.wall]??0, offset:d.offset||0, width:d.width||813,
      dtype:d.type||'hinge', hinge:d.hinge||'start', swing:d.swing||'in'
    }));
    delete l.doors;
  }
  for(const o of l.openings) o.corner = o.corner==='ccw' ? 'ccw' : 'cw';
  l.placed = Array.isArray(l.placed) ? l.placed.filter(p=>p&&p.itemId) : [];
  for(const p of l.placed) if(!p.id) p.id=uid();
  if(!Array.isArray(l.measures)) l.measures=[];
  pruneMeasures(l);
  if(l.folderId===undefined) l.folderId=null;
  if(l.floorId===undefined) l.floorId=null;
  /* the bbox is honest for a rectangle and overstates an L-shape, so a plan can say
     what the room is really called on paper */
  l.dimLabel = typeof l.dimLabel==='string' ? l.dimLabel : '';
  {
    const p = l.floorPlace||{};
    l.floorPlace = {x:isFinite(p.x)?p.x:0, y:isFinite(p.y)?p.y:0, rot:isFinite(p.rot)?norm360(p.rot):0};
  }
  return l;
}
/* a measurement's ends point at things by id (a room wall by its index); drop any whose
   end is malformed or no longer exists. While editing, a missing end is only skipped when
   drawing, so undoing the removal of an item brings its measurements back with it. */
function pruneMeasures(l){
  const ids={item:l.placed, open:l.openings, pillar:l.room.pillars, iwall:l.room.iwalls};
  const has={}; for(const k in ids) has[k]=new Set(ids[k].map(x=>x.id));
  const ok = a => !!a && typeof a==='object' &&
    (a.part==='whole' || (a.part==='swing' && a.k==='open') || ((a.part==='side'||a.part==='corner') && Number.isInteger(a.n) && a.n>=0)) &&
    (a.k==='wall' ? Number.isInteger(a.id) && a.id>=0 && a.id<l.room.points.length : !!has[a.k] && has[a.k].has(a.id));
  l.measures = l.measures.filter(m=>m && ok(m.a) && ok(m.b));
  for(const m of l.measures) m.id = m.id||uid();
}
/* things in a copied or imported room get new ids; `map` is {kind: {oldId: newId}} */
function remapMeasures(l, map){
  for(const m of l.measures) for(const a of [m.a,m.b]){
    const n = map[a.k] && map[a.k][a.id];
    if(n) a.id=n;
  }
  pruneMeasures(l);
}
function normItem(it){
  it.id = it.id || uid();
  it.name = it.name || 'Untitled';
  if(!Array.isArray(it.tags)) it.tags=[];
  if(it.count==null) it.count=1;
  it.color = normHex(it.color) || PALETTE[0];
  it.open = normOpen(it.open);
  return it;
}
function migrate(st){
  if(!st||!Array.isArray(st.layouts)||!st.layouts.length) return null;
  for(const l of st.layouts) normLayout(l);
  st.inventory = st.inventory||[];
  for(const it of st.inventory) normItem(it);
  if(!Array.isArray(st.folders)) st.folders=[];
  if(!Array.isArray(st.floors)) st.floors=[];
  if(!Array.isArray(st.tagFilter)) st.tagFilter=[];
  if(st.untaggedOnly==null) st.untaggedOnly=false;
  if(typeof st.invSearch!=='string') st.invSearch='';
  if(st.onlyAvailable==null) st.onlyAvailable=false;
  if(st.showOpen==null) st.showOpen=true;
  if(st.showMeasure==null) st.showMeasure=true;
  if(!INV_SCOPES[st.invScope]) st.invScope='project';
  if(typeof st.zoomSpeed!=='number' || !isFinite(st.zoomSpeed) || st.zoomSpeed<=0) st.zoomSpeed=1;
  if(st.leftOpen==null) st.leftOpen=true;
  if(st.rightOpen==null) st.rightOpen=true;
  if(!Array.isArray(st.secClosed)) st.secClosed=[];
  if(!['room','furniture','floor','inventory','marketplace'].includes(st.mode)) st.mode='furniture';
  if(!isCanvasMode(st.planMode)) st.planMode = isCanvasMode(st.mode) ? st.mode : 'furniture';
  if(!st.layouts.some(l=>l.id===st.active)) st.active=st.layouts[0].id;
  const fl=st.layouts.find(l=>l.id===st.active);
  st.lastFolderId = fl ? (fl.folderId||null) : null;
  if(!Array.isArray(st.itemFolders)) st.itemFolders=[];
  if(!Array.isArray(st.marketFolders)) st.marketFolders=[];
  if(!Array.isArray(st.marketListings)) st.marketListings=[];
  if(!Array.isArray(st.marketSubs)) st.marketSubs=[];
  if(st.defaultMarketDismissed==null) st.defaultMarketDismissed=false;
  if(!st.uiLib || typeof st.uiLib!=='object') st.uiLib={tab:'library', libFolderId:null, marketFolderId:null};
  for(const it of st.inventory){
    if(it.folderId===undefined) it.folderId=null;
    if(!Array.isArray(it.manualTags)) it.manualTags=(it.tags||[]).slice();
  }
  for(const f of st.floors){
    f.parentId=f.parentId||null;
    f.extWall = isFinite(f.extWall) && f.extWall>0 ? f.extWall : 0;   // 0 = each room's own wall
  }
  /* a room can only stand on a floor that still exists */
  { const live=new Set(st.floors.map(f=>f.id));
    for(const l of st.layouts) if(l.floorId && !live.has(l.floorId)) l.floorId=null; }
  for(const f of st.itemFolders){ f.parentId=f.parentId||null; if(!Array.isArray(f.tags)) f.tags=[]; }
  for(const f of st.marketFolders) f.parentId=f.parentId||null;
  for(const l of st.marketListings) l.parentId=l.parentId||null;
  for(const s of st.marketSubs) s.id=s.id||uid();
  setS(st);   // reconcileTags below reads S.itemFolders; every caller assigns S=migrate(...) anyway
  for(const it of st.inventory) reconcileTags(it);
  return st;
}
export {normLayout, pruneMeasures, remapMeasures, normItem, migrate};
