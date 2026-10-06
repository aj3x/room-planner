// @ts-check
/* Floor mode's two sections in the Properties pane, as components: the
   picked room on the floor (or the two picked for a merge), and the floor
   itself. Each reads what it shows while it renders and re-renders when it
   changes (ui-kit/component.js); both wait for the project to be loaded.
   Anything about a room's own shape or contents stays in Room/Furniture
   mode. The commands they run are floors.js's. */
import {useLayoutEffect} from 'preact/hooks';
import {bbox, norm360} from '../../kernel/geometry.js';
import {floorSel, mergeSel} from '../../kernel/selection.js';
import {L, S, floorLayouts, floorMode, floorOf} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fmtLen, parseLen, trimNum} from '../../kernel/units.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {mountComponent} from '../../ui-kit/component.js';
import {plural} from '../../ui-kit/panels.js';
import {Field, Icon, SecHead} from '../../ui-kit/parts.jsx';
import {fit} from '../canvas/index.js';
import {activateLayout, setMode} from '../mode/index.js';
import {deleteBothDialog, mergeLayouts, turnFloorRoom} from './floors.js';

/** @typedef {import('../../kernel/types.js').Layout} Layout */

/** Two rooms picked for a merge. @param {{a: Layout, b: Layout}} p */
function Pair({a, b}){
  const sameFloor=!!(a.floorId && a.floorId===b.floorId);
  return <>
    <p class="hint">{sameFloor ? 'Right-click either room, or use the buttons below.' : 'These rooms aren’t on the same floor, so they can’t be merged.'}</p>
    <div class="row actions">
      {sameFloor ? <button class="btn sm" onClick={()=>mergeLayouts(a.id,b.id)}>{'Merge into “'+a.name+'”'}</button> : null}
      <button class="btn sm quiet danger" onClick={()=>deleteBothDialog(a.id,b.id)}>Delete both…</button>
    </div>
  </>;
}

/** The picked room's place on the floor. @param {{l: Layout}} p */
function Placed({l}){
  const p=l.floorPlace, own=bbox(l.room.points);
  /** @param {'x'|'y'} k @param {number} v */
  const move=(k,v)=>{ if(v==null||!isFinite(v)) return; transact('floor', ()=>{ l.floorPlace[k]=v-(k==='x'?own.x0:own.y0); }); };
  return <>
    <div class="field"><label for="flX">From left</label><Field class="len" id="flX" value={fmtLen(p.x+own.x0,S.unit)} onCommit={t=>move('x',parseLen(t,S.unit))}/></div>
    <div class="field"><label for="flY">From top</label><Field class="len" id="flY" value={fmtLen(p.y+own.y0,S.unit)} onCommit={t=>move('y',parseLen(t,S.unit))}/></div>
    <div class="field"><label for="flRot">Angle</label><Field id="flRot" value={trimNum(p.rot,1)} onCommit={t=>{
      const v=parseFloat(t);
      if(isFinite(v)) transact('floor', ()=>{ l.floorPlace.rot=norm360(v); });
    }}/><span class="unit">°</span>
      <button class="btn quiet sm icon" title="Turn left 90°" aria-label="Turn left 90 degrees" onClick={()=>turnFloorRoom(l,-90)}><Icon name="rot-l"/></button>
      <button class="btn quiet sm icon" title="Turn right 90°" aria-label="Turn right 90 degrees" onClick={()=>turnFloorRoom(l,90)}><Icon name="rot-r"/></button></div>
    {/* a label, not a placement: nothing for the floor's undo to step through */}
    <div class="field"><label for="flDim">Label</label><Field id="flDim" value={l.dimLabel||''} placeholder={fmtLen(own.w,S.unit)+' × '+fmtLen(own.h,S.unit)}
      onCommit={t=>transact('floor', ()=>{ l.dimLabel=t.trim(); }, {history:false})}/></div>
    <div class="row actions">
      <button class="btn sm" onClick={()=>{ transact('project', ()=>{ activateLayout(l.id); setMode('room'); }); fit(); }}>Edit this room</button>
      <button class="btn sm quiet" onClick={()=>transact('project', ()=>{ l.floorId=null; floorSel.value = null; })}>Take off floor</button>
    </div>
  </>;
}

/** @param {{section: HTMLElement}} p */
function FloorSelSection({section}){
  rev.floor.value; rev.room.value; rev.project.value; pref('unit'); pref('mode');
  const ready=loaded.value, picked=mergeSel.value, cur=floorSel.value;
  const pair = ready && floorMode() && picked.size===2 ? [...picked].map(id=>S.layouts.find(x=>x.id===id)) : null;
  const [a, b] = pair && pair[0] && pair[1] ? pair : [null, null];
  const l = !a && ready && cur ? S.layouts.find(x=>x.id===cur) : null;
  useLayoutEffect(() => {
    if(ready) section.classList.toggle('is-empty', !(a && b) && !(floorMode() && l));
  });
  return <>
    <SecHead title={a && b ? a.name+' + '+b.name : floorMode() && l ? l.name : 'Selection'}/>
    <div>{!ready ? null : a && b ? <Pair a={a} b={b}/> : floorMode() && l ? <Placed key={l.id} l={l}/>
      : <p class="hint">Click a room in the plan to move or turn it here.</p>}</div>
  </>;
}

function FloorPropsSection(){
  rev.project.value; pref('unit');
  const fl=loaded.value ? floorOf(L().floorId) : undefined;
  return <>
    <SecHead title="Floor"/>
    <div>{!loaded.value ? null : !fl
      ? <p class="hint">This room is not on a floor yet. Put it on one from its ⋯ menu in the Rooms list.</p>
      : <>
        <div class="field"><label for="flName">Name</label><Field id="flName" value={fl.name} onCommit={t=>{ const v=t.trim(); if(v) transact('project', ()=>{ fl.name=v; }); }}/></div>
        <div class="field"><label for="flExt">Outer wall</label><Field class="len" id="flExt" value={fl.extWall?fmtLen(fl.extWall,S.unit):''} placeholder="Same as each room" onCommit={t=>{
          const raw=t.trim(), v=raw?parseLen(raw,S.unit):0;
          transact('project', ()=>{ fl.extWall = raw && isFinite(v) && v>0 ? v : 0; });
        }}/></div>
        <p class="hint">{plural(floorLayouts(fl.id).length,'room')+' on this floor. Drag one against another and it clicks to a shared wall.'}</p>
        <div class="row actions"><button class="btn sm quiet" onClick={()=>fit()}>Fit floor</button></div>
      </>}</div>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  floorsel(el){ mountComponent(el, <FloorSelSection section={el}/>); },
  floorprops(el){ mountComponent(el, <FloorPropsSection/>); },
};

export {sections};
