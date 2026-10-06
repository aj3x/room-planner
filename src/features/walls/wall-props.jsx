// @ts-check
/* The Selection panel's view of a wall, a corner, a pillar or an interior
   wall, as components. The Selection panel (room/sections.jsx) renders the
   one its selection names, under the title partTitle() gives it, and
   re-renders it whenever the room or the unit changes; each box commits
   through transact() when it is committed (ui-kit/parts.jsx Field).

   Where an old render read every box of a form back to commit one of them
   (a corner's two distances, a pillar's four values), the component passes
   the others as they are shown, formatted, so a commit rounds them exactly
   as reading the boxes did. */
import {S, L, RP} from '../../kernel/state.js';
import {fmtLen, parseLen} from '../../kernel/units.js';
import {bbox, norm360} from '../../kernel/geometry.js';
import {transact} from '../../kernel/tx.js';
import {iwallAngle, iwallLen, iwallOf, nearestOnWalls, pillarOf, setIWallAngle, setIWallEndDist, setIWallLen,
        setWallAngle, setWallLen, tryRoomEdit, wallAngle, wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {flash} from '../../ui-kit/flash.js';
import {Field, Select} from '../../ui-kit/parts.jsx';
import {squareCorner} from '../canvas/index.js';
import {openingDialog} from '../openings/index.js';
import {deleteCorner, splitWall} from './corners.js';
import {deleteIWall, deletePillar, toggleWallOff} from './walls-panel.js';

/** @typedef {import('../../kernel/types.js').RoomSel} RoomSel */

/** The Selection panel's title for a wall, corner, pillar or interior wall,
    or null when the part has gone from under the selection.
    @param {RoomSel} s @returns {string|null} */
function wallPartTitle(s){
  if(s.kind==='wall') return 'Wall '+(s.i+1);
  if(s.kind==='corner') return RP()[s.i] ? 'Corner '+(s.i+1) : null;
  if(s.kind==='pillar') return pillarOf(s.id) ? 'Pillar' : null;
  if(s.kind==='iwall') return iwallOf(s.id) ? 'Interior wall' : null;
  return null;
}

/** @param {string} v */
const len = v => parseLen(v, S.unit);
/** @param {number} mm */
const show = mm => fmtLen(mm, S.unit);

/** @param {{i: number}} p */
function WallProps({i}){
  const w=wallOf(i), off=wallIsOff(L().room,i);
  return <>
    <div class="field"><label for="wLen">Length</label><Field class="len" id="wLen" value={show(w.len)} onCommit={t=>{
      const v=len(t);
      transact('room', ()=>{ if(isFinite(v)&&v>=100) setWallLen(i,v); else flash('Give the wall a length'); });
    }}/></div>
    <div class="field"><label for="wAng">Direction</label><Field type="number" class="deg" id="wAng" step="1" value={String(Math.round(wallAngle(i)))} onCommit={t=>{
      const v=parseFloat(t);
      transact('room', ()=>{ if(isFinite(v)) setWallAngle(i,v); });
    }}/><span class="unit">°</span></div>
    <p class="hint">0° points right, 90° up. Changing either moves the far corner.</p>
    {off ? <p class="hint">This side is open: the corner stays, the wall is gone. The room still keeps its floor area.</p> : null}
    <div class="row actions">
      {off ? null : <>
        <button class="btn sm" onClick={()=>openingDialog(null,'door',i)}>Add door…</button>
        <button class="btn sm" onClick={()=>openingDialog(null,'window',i)}>Add window…</button>
      </>}
      <button class="btn sm" onClick={()=>splitWall(i)}>Split</button>
      <button class={'btn sm '+(off?'':'danger')} onClick={()=>toggleWallOff(i)}>{off?'Put the wall back':'Open this side'}</button>
    </div>
  </>;
}

/** @param {{i: number}} p */
function CornerProps({i}){
  const P=RP(), p=P[i], b=bbox(P);
  const xs=show(p[0]-b.x0), ys=show(p[1]-b.y0);
  /** @param {string} xt @param {string} yt */
  const go=(xt,yt)=>{
    const x=len(xt), y=len(yt);
    transact('room', ()=>{ if(isFinite(x)&&isFinite(y)) tryRoomEdit(()=>{ P[i]=[b.x0+x, b.y0+y]; }); });
  };
  return <>
    <div class="field"><label for="cX">From left</label><Field class="len" id="cX" value={xs} onCommit={t=>go(t,ys)}/></div>
    <div class="field"><label for="cY">From top</label><Field class="len" id="cY" value={ys} onCommit={t=>go(xs,t)}/></div>
    <p class="hint">Both walls meeting here move with the corner. Dragging it lines it up with the rest of the room; hold Alt for a free hand.</p>
    <div class="row actions">
      <button class="btn sm" onClick={()=>squareCorner(i)}>Square this corner</button>
      <button class="btn sm danger" disabled={P.length<=3} title={P.length<=3?'A room needs at least three corners':undefined} onClick={()=>deleteCorner(i)}>Remove corner</button>
    </div>
  </>;
}

/** @param {{id: string}} p */
function PillarProps({id}){
  const pl=/** @type {import('../../kernel/types.js').Pillar} */(pillarOf(id));   // partTitle() said it is there
  /** @type {{shape: string, w: string, d: string, rot: string}} */
  const cur={shape:pl.shape.type, w:show(pl.shape.w), d:show(pl.shape.d), rot:String(Math.round(pl.rot||0))};
  /** @param {Partial<typeof cur>} ch */
  const go=ch=>{
    const v={...cur, ...ch};
    const w=len(v.w), d=len(v.d), rot=parseFloat(v.rot);
    transact('room', ()=>{
      pl.shape.type=/** @type {'rect'|'ellipse'} */(v.shape);   // one of the two options below
      if(isFinite(w)&&w>0) pl.shape.w=w;
      if(isFinite(d)&&d>0) pl.shape.d=d;
      if(isFinite(rot)) pl.rot=norm360(rot);
    });
  };
  return <>
    <div class="field"><label for="plShape">Shape</label><Select id="plShape" value={cur.shape} onCommit={t=>go({shape:t})}>
      <option value="rect">Rectangle</option>
      <option value="ellipse">Round</option></Select></div>
    <div class="field"><label for="plW">Width</label><Field class="len" id="plW" value={cur.w} onCommit={t=>go({w:t})}/></div>
    <div class="field"><label for="plD">Depth</label><Field class="len" id="plD" value={cur.d} onCommit={t=>go({d:t})}/></div>
    <div class="field"><label for="plRot">Rotation</label><Field type="number" class="deg" id="plRot" step="1" value={cur.rot} onCommit={t=>go({rot:t})}/><span class="unit">°</span></div>
    <p class="hint">Drag it in the plan to move it.</p>
    <div class="row actions"><button class="btn sm danger" onClick={()=>deletePillar(pl.id)}>Remove pillar</button></div>
  </>;
}

/** @param {{id: string}} p */
function IWallProps({id}){
  const w=/** @type {import('../../kernel/types.js').IWall} */(iwallOf(id));   // partTitle() said it is there
  const na=nearestOnWalls(w.a), nb=nearestOnWalls(w.b);
  const wa=na?na.i+1:'-', wb=nb?nb.i+1:'-';
  return <>
    <div class="field"><label for="iwLen">Length</label><Field class="len" id="iwLen" value={show(iwallLen(w))} onCommit={t=>{
      const v=len(t);
      transact('room', ()=>{ if(isFinite(v)&&v>=50) setIWallLen(w,v); else flash('Give the wall a length'); });
    }}/></div>
    <div class="field"><label for="iwAng">Direction</label><Field type="number" class="deg" id="iwAng" step="1" value={String(Math.round(iwallAngle(w)))} onCommit={t=>{
      const v=parseFloat(t);
      transact('room', ()=>{ if(isFinite(v)) setIWallAngle(w,v); });
    }}/><span class="unit">°</span></div>
    <div class="field"><label for="iwT">Thickness</label><Field class="len" id="iwT" value={show(w.t)} onCommit={t=>{
      const v=len(t);
      transact('room', ()=>{ if(isFinite(v)&&v>=10) w.t=v; else flash('Give the wall a thickness'); });
    }}/></div>
    <div class="field"><label for="iwDA" title={'Gap from end A to wall '+wa}>End A gap</label><Field class="len" id="iwDA" value={show(na?na.d:0)} disabled={!na} onCommit={t=>{
      const v=len(t);
      transact('room', ()=>{ if(isFinite(v)&&v>=0) setIWallEndDist(w,'a',v); });
    }}/></div>
    <div class="field"><label for="iwDB" title={'Gap from end B to wall '+wb}>End B gap</label><Field class="len" id="iwDB" value={show(nb?nb.d:0)} disabled={!nb} onCommit={t=>{
      const v=len(t);
      transact('room', ()=>{ if(isFinite(v)&&v>=0) setIWallEndDist(w,'b',v); });
    }}/></div>
    <p class="hint">{`Gaps are measured to wall ${wa} and wall ${wb}. Drag an end to resize or snap it; drag the middle to move it. Shift keeps it straight.`}</p>
    <div class="row actions"><button class="btn sm danger" onClick={()=>deleteIWall(w.id)}>Remove wall</button></div>
  </>;
}

export {wallPartTitle, WallProps, CornerProps, PillarProps, IWallProps};
