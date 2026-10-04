// @ts-check
/* The Room pane's Walls section and its Pillars & interior walls section, as
   components. Each reads what it shows while it renders — the room's
   revision, the unit, the selection — and re-renders when that changes
   (ui-kit/component.js); its rows wait for the project to be loaded. A row's click selects its part (in Room mode); a
   wall row's double-click types its length in (wallDialog), a structure
   row's ⋯ opens its menu. */
import {L, RP, S, roomMode} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen} from '../../kernel/units.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {iwallLen, wallAngle, wallIsOff, wallOf} from '../../kernel/model/walls.js';
import {wallDrawState} from '../canvas/index.js';
import {openMenu} from '../../ui-kit/menu.js';
import {mountComponent} from '../../ui-kit/component.js';
import {ActButton, EmptyRow, MoreButton, SecHead} from '../../ui-kit/parts.jsx';
import {setMode} from '../mode/index.js';
import {addPillar, deleteIWall, deletePillar, sizeLabelShape, wallDialog} from './walls-panel.js';
import {cancelWallDraw, startWallDraw} from './wall-draw.js';

/** What the room-scoped lists show: the room, the unit and the selection. */
function watchRoom(){ rev.room.value; rev.project.value; pref('unit'); return roomSel.value; }

/** @param {import('../../kernel/types.js').RoomSel} s */
function pick(s){
  if(!roomMode()) setMode('room');
  roomSel.value = s;
}

function WallsSection(){
  const cur=watchRoom(), room=L().room;
  return <>
    <SecHead title="Walls"/>
    <ul class="list">
      {loaded.value && RP().map((_,i)=>{
        const w=wallOf(i);
        const on=!!cur&&cur.kind==='wall'&&cur.i===i;
        const meta = wallIsOff(room,i) ? 'Open · '+fmtLen(w.len,S.unit)
                                       : fmtLen(w.len,S.unit)+' · '+Math.round(wallAngle(i))+'°';
        return <li key={i} class={on?'on':''} onClick={()=>pick({kind:'wall', i})} onDblClick={()=>wallDialog(i)}>
          <span class="nm">Wall {i+1}</span>
          <span class="lmeta">{meta}</span>
        </li>;
      })}
    </ul>
    <p class="hint">Drag a corner or wall in the plan. Double-click a wall to type its length.</p>
  </>;
}

/** @param {MouseEvent} e */
function addStructMenu(e){
  openMenu(/** @type {Element} */(e.currentTarget), [
    {label:'Pillar', fn:addPillar},
    {label:'Interior wall', fn:()=>{ wallDrawState.value?cancelWallDraw():startWallDraw(); }},
  ]);
}

function StructureSection(){
  const cur=watchRoom(), room=L().room, ready=loaded.value;
  let pn=0, wn=0;
  /** @type {{kind: 'pillar'|'iwall', id: string, label: string, dim: string}[]} */
  const rows=[
    ...room.pillars.map(pl=>({kind:/** @type {const} */('pillar'), id:pl.id, label:'Pillar '+(++pn), dim:sizeLabelShape(pl.shape)})),
    ...room.iwalls.map(w=>({kind:/** @type {const} */('iwall'), id:w.id, label:'Interior wall '+(++wn), dim:fmtLen(iwallLen(w),S.unit)}))
  ];
  return <>
    <SecHead title="Pillars & interior walls">
      <ActButton icon="plus" label="Add pillar or interior wall" onClick={addStructMenu}/>
    </SecHead>
    <ul class="list">
      {!ready ? null : !rows.length ? <EmptyRow>None yet</EmptyRow> : rows.map(r=>{
        const on=!!cur&&cur.kind===r.kind&&cur.id===r.id;
        return <li key={r.id} class={on?'on':''}
          onClick={e=>{ if(!/** @type {Element} */(e.target).closest('button')) pick({kind:r.kind, id:r.id}); }}>
          <span class="nm">{r.label}</span><span class="lmeta">{r.dim}</span>
          <span class="lact"><MoreButton onClick={e=>openMenu(/** @type {Element} */(e.currentTarget), [
            {label:'Select', fn:()=>pick({kind:r.kind, id:r.id})},
            {sep:true},
            {label:'Delete', danger:true, fn:()=>r.kind==='pillar'?deletePillar(r.id):deleteIWall(r.id)},
          ], r.label)}/></span>
        </li>;
      })}
    </ul>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  walls(el){ mountComponent(el, <WallsSection/>); },
  structure(el){ mountComponent(el, <StructureSection/>); },
};

export {sections};
