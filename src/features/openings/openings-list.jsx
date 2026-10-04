// @ts-check
/* The Room pane's Doors & windows section, as a component: the head with
   its + menu (door or window, on the selected wall, else the first), and a
   row per opening whose click selects it (in Room mode) and whose ⋯ edits or
   deletes it. It reads the room revision, the unit and the selection while
   rendering and re-renders on its own (ui-kit/component.js). */
import {L, S, roomMode} from '../../kernel/state.js';
import {roomSel} from '../../kernel/selection.js';
import {fmtLen} from '../../kernel/units.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {KIND} from '../../kernel/model/openings.js';
import {openMenu} from '../../ui-kit/menu.js';
import {mountComponent} from '../../ui-kit/component.js';
import {ActButton, EmptyRow, MoreButton, SecHead} from '../../ui-kit/parts.jsx';
import {setMode} from '../mode/index.js';
import {openingDialog} from './opening-dialog.js';
import {deleteOpening} from './openings-panel.js';

/** @param {MouseEvent} e */
function addOpeningMenu(e){
  const wi = roomSel.value&&roomSel.value.kind==='wall' ? roomSel.value.i : 0;
  openMenu(/** @type {Element} */(e.currentTarget), [
    {label:'Door…', fn:()=>openingDialog(null,'door',wi)},
    {label:'Window…', fn:()=>openingDialog(null,'window',wi)},
  ]);
}

/** @param {string} id */
function pick(id){
  if(!roomMode()) setMode('room');
  roomSel.value = {kind:'opening', id};
}

function OpeningsSection(){
  rev.room.value; rev.project.value; pref('unit');
  const cur=roomSel.value, os=L().openings;
  return <>
    <SecHead title="Doors & windows">
      <ActButton icon="plus" label="Add door or window" onClick={addOpeningMenu}/>
    </SecHead>
    <ul class="list">
      {!loaded.value ? null : !os.length ? <EmptyRow>None yet</EmptyRow> : os.map(o=>{
        const on=!!cur&&cur.kind==='opening'&&cur.id===o.id;
        return <li key={o.id} class={on?'on':''}
          onClick={e=>{ if(!/** @type {Element} */(e.target).closest('button')) pick(o.id); }}>
          <span class="lmain"><span class="nm">{KIND(o)}</span><span class="meta">Wall {o.wall+1} · {fmtLen(o.width,S.unit)} wide</span></span>
          <span class="lact"><MoreButton onClick={e=>openMenu(/** @type {Element} */(e.currentTarget), [
            {label:'Edit…', fn:()=>openingDialog(o.id)},
            {sep:true},
            {label:'Delete', danger:true, fn:()=>deleteOpening(o.id)},
          ], KIND(o))}/></span>
        </li>;
      })}
    </ul>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  openings(el){ mountComponent(el, <OpeningsSection/>); },
};

export {sections};
