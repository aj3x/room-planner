// @ts-check
/* The room's two sections in the Properties pane, as components: the
   Selection panel (whichever part of the room is picked, shown by that
   part's own view — walls/wall-props.jsx, openings/opening-props.jsx) and
   the Room section (size, wall thickness, floor colour, baseboard, area,
   and replacing the outline). Each reads the room, the unit and the
   selection while it renders and re-renders when they change
   (ui-kit/component.js); both wait for the project to be loaded. */
import {useLayoutEffect, useState} from 'preact/hooks';
import {L, RP, S, roomMode} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtArea, fmtLen, parseLen} from '../../kernel/units.js';
import {bbox, polyArea} from '../../kernel/geometry.js';
import {normHex} from '../../kernel/color.js';
import {transact} from '../../kernel/tx.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {isRectRoom, setRectSize} from '../../kernel/model/walls.js';
import {mountComponent} from '../../ui-kit/component.js';
import {Check, Field, SecHead} from '../../ui-kit/parts.jsx';
import {OpeningProps, openingTitle} from '../openings/index.js';
import {CornerProps, IWallProps, PillarProps, WallProps, wallPartTitle} from '../walls/index.js';
import {presetL, presetRect, toggleCustomDraw} from './outline-presets.jsx';

/** What both sections show: the room and the unit. */
function watchRoom(){ rev.room.value; rev.project.value; pref('unit'); }

/** @param {import('../../kernel/types.js').RoomSel} s */
function partView(s){
  switch(s.kind){
    case 'wall': return <WallProps key={'w'+s.i} i={s.i}/>;
    case 'corner': return <CornerProps key={'c'+s.i} i={s.i}/>;
    case 'pillar': return <PillarProps key={s.id} id={s.id}/>;
    case 'iwall': return <IWallProps key={s.id} id={s.id}/>;
    default: return <OpeningProps key={s.id} id={s.id}/>;
  }
}

/** @param {{section: HTMLElement}} p */
function RoomSelSection({section}){
  watchRoom(); pref('mode');
  const ready=loaded.value, s=ready && roomMode() ? roomSel.value : null;
  const title = s ? (s.kind==='opening' ? openingTitle(s.id) : wallPartTitle(s)) : 'Selection';
  const gone = !!s && title===null;   // the part went away under the selection
  useLayoutEffect(() => {
    if(!ready) return;
    section.classList.toggle('is-empty', !s || gone);
    if(gone) roomSel.value = null;
  });
  return <>
    <SecHead title={title || 'Selection'}/>
    <div>{!ready ? null : s && !gone ? partView(s)
      : <p class="hint">Click a wall, corner, door or pillar in the plan to change it here.</p>}</div>
  </>;
}

/* Called on every `input` of the colour picker and the hex box, so it is no
   undo step of its own; letting go of the picker, or committing the box, is. */
/** @param {string} hex */
function setFloorColor(hex){ transact('room', ()=>{ L().room.floor=hex; }, {history:false}); }

/** @param {string} t @param {(mm: number) => void} set */
function setLen(t, set){
  const mm=parseLen(t,S.unit);
  transact('room', ()=>{ if(isFinite(mm)&&mm>0) set(mm); });
}

function RectDims(){
  const b=bbox(RP()), ws=fmtLen(b.w,S.unit), ds=fmtLen(b.h,S.unit);
  if(!isRectRoom()) return <div class="field"><label>Bounds</label><span>{ws+' × '+ds}</span></div>;
  /** @param {string} wt @param {string} dt */
  const go=(wt,dt)=>{
    const w=parseLen(wt,S.unit), d=parseLen(dt,S.unit);
    transact('room', ()=>{ if(isFinite(w)&&isFinite(d)&&w>200&&d>200) setRectSize(w,d); });
  };
  return <>
    <div class="field"><label for="roomW">Width</label><Field class="len" id="roomW" value={ws} onCommit={t=>go(t,ds)}/></div>
    <div class="field"><label for="roomD">Depth</label><Field class="len" id="roomD" value={ds} onCommit={t=>go(ws,t)}/></div>
  </>;
}

function ShapeSection(){
  watchRoom();
  const r=loaded.value ? L().room : null;
  /* a hex code half typed in, or mistyped: it is marked, and the plan keeps its colour until the code is whole */
  const [bad, setBad] = useState(false);
  return <>
    <SecHead title="Room"/>
    <div>{r ? <RectDims/> : null}</div>
    <div class="field"><label for="wallT">Wall thickness</label>
      <Field class="len" id="wallT" value={r ? fmtLen(r.wall,S.unit) : ''} onCommit={t=>setLen(t, v=>{ L().room.wall=v; })}/></div>
    <div class="field"><label for="floorCol">Floor</label>
      <input type="color" id="floorCol" aria-label="Floor colour" value={r ? r.floor : undefined}
        onInput={e=>{ setFloorColor(e.currentTarget.value); setBad(false); }}
        onChange={()=>transact('room')}/>
      <Field class={'hex'+(bad?' bad':'')} maxLength={7} spellcheck={false} aria-label="Floor colour hex code" value={r ? r.floor : ''}
        onInput={e=>{ const c=normHex(e.currentTarget.value); setBad(!c); if(c) setFloorColor(c); }}
        onCommit={()=>{ setBad(false); transact('room'); }}
        onBlur={()=>setBad(false)}/></div>
    <div class="field"><Check checked={!!(r && r.trimOn)} onCommit={on=>transact('room', ()=>{ L().room.trimOn=on; })}>Baseboard</Check>
      <Field class="len" aria-label="Baseboard depth" value={r ? fmtLen(r.trim,S.unit) : ''} disabled={!(r && r.trimOn)} onCommit={t=>setLen(t, v=>{ L().room.trim=v; })}/></div>
    <div class="field"><label>Area</label><span>{r ? fmtArea(polyArea(RP()),S.unit) : ''}</span></div>
    <div class="group">
      <p class="group-title">Replace the outline</p>
      <div class="row">
        <button class="btn sm" onClick={presetRect}>Rectangle…</button>
        <button class="btn sm" onClick={presetL}>L-shape…</button>
        <button class="btn sm" onClick={toggleCustomDraw}>Draw…</button>
      </div>
    </div>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  roomsel(el){ mountComponent(el, <RoomSelSection section={el}/>); },
  shape(el){ mountComponent(el, <ShapeSection/>); },
};

export {sections};
