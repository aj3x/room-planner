// @ts-check
/* Furniture mode's Selection panel, as a component: what to press when
   nothing is picked, the two buttons for several picked items, and for one
   its place, angle and warnings. It reads the furniture, the items, the room,
   the unit, the mode and the selection while it renders, and re-renders when
   they change (ui-kit/component.js); its commands are selection-panel.js's. */
import {useLayoutEffect} from 'preact/hooks';
import {bbox, worldPoly} from '../../kernel/geometry.js';
import {hasOpen, openSizeLabel} from '../../kernel/model/open-state.js';
import {sel, selSet, selectClear} from '../../kernel/selection.js';
import {RP, S, furnMode, instOf, itemOf} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fmtLen, parseLen} from '../../kernel/units.js';
import {centreInside, getConflicts, isBad, validate} from '../../kernel/model/validity.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {flash} from '../../ui-kit/flash.js';
import {Field, Icon, SecHead} from '../../ui-kit/parts.jsx';
import {itemDialog} from '../library/index.js';
import {duplicateSel, place, removeSel, rotate} from './selection-panel.js';

/** @typedef {import('../../kernel/types.js').Placed} Placed */
/** @typedef {import('../../kernel/types.js').Item} Item */

/** The keys, for when nothing is picked. @param {{multi?: boolean}} p */
function Keys({multi}){
  return <>
    <p class="hint">Click an item in the plan to move, turn or remove it.</p>
    <dl class="kbd">
      <dt>Nudge</dt><dd><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dd>
      <dt>Turn 90°</dt><dd><kbd>R</kbd></dd>
      <dt>Remove</dt><dd><kbd>Del</kbd></dd>
      <dt>Drag without snap</dt><dd><kbd>Alt</kbd></dd>
      {multi ? <><dt>Select multiple</dt><dd><kbd>Shift</kbd>+click, or drag on empty space</dd></> : null}
    </dl>
  </>;
}

function Several(){
  return <>
    <div class="selhead"><span class="nm">{selSet.value.size+' items selected'}</span></div>
    <div class="row actions">
      <button class="btn sm" onClick={duplicateSel}>Duplicate</button>
      <button class="btn sm danger" onClick={removeSel}>Remove</button>
    </div>
    <dl class="kbd">
      <dt>Nudge</dt><dd><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dd>
      <dt>Remove</dt><dd><kbd>Del</kbd></dd>
    </dl>
  </>;
}

/** @param {{inst: Placed, it: Item}} p */
function One({inst, it}){
  const b=bbox(worldPoly(inst,it)), rb=bbox(RP());
  const openWhy = hasOpen(it) ? getConflicts().openBad.get(inst.id) : null;
  const badWhy = isBad(inst) ? validate(inst,worldPoly(inst,it)).why : null;
  /** @param {'x'|'y'} which @param {string} val */
  const move=(which,val)=>{
    const mm=parseLen(val,S.unit);
    if(!isFinite(mm)) return;   // the box shows the model's value again
    const loose=isBad(inst), bb=bbox(worldPoly(inst,it)), ox=inst.x, oy=inst.y;
    // history:false: no undo step — a known defect, see BACKLOG.md
    transact('furn', ()=>{
      if(which==='x') inst.x+=(rb.x0+mm)-bb.x0; else inst.y+=(rb.y0+mm)-bb.y0;
      if(!validate(inst,worldPoly(inst,it)).ok){
        if(loose){ if(!centreInside(inst)){ inst.x=ox; inst.y=oy; } }
        else { inst.x=ox; inst.y=oy; flash('No room there'); }
      }
    }, {history:false});
  };
  return <>
    <div class="selhead"><span class="sw" style={'background:'+it.color}></span><span class="nm" title={it.name}>{it.name}</span>
      <button class="btn quiet sm" title="Change this item's size, shape or colour everywhere" onClick={()=>itemDialog(it.id)}>Edit item…</button></div>
    {badWhy ? <p class="hint warn">{badWhy}</p> : null}
    {openWhy ? <p class="hint warn">{openWhy}</p> : null}
    <div class="field"><label for="sX">From left</label><Field class="len" id="sX" value={fmtLen(b.x0-rb.x0,S.unit)} onCommit={t=>move('x',t)}/></div>
    <div class="field"><label for="sY">From top</label><Field class="len" id="sY" value={fmtLen(b.y0-rb.y0,S.unit)} onCommit={t=>move('y',t)}/></div>
    <div class="field"><label for="sR">Angle</label>
      <span class="inline-ctl"><Field type="number" class="deg" id="sR" step="15" value={String(Math.round(inst.rot||0))} onCommit={t=>rotate((parseFloat(t)||0)-(inst.rot||0))}/>
      <button class="btn icon" title="Turn 90° left (Shift+R)" aria-label="Turn 90° left" onClick={()=>rotate(-90)}><Icon name="rot-l"/></button>
      <button class="btn icon" title="Turn 90° right (R)" aria-label="Turn 90° right" onClick={()=>rotate(90)}><Icon name="rot-r"/></button></span></div>
    {hasOpen(it) ? <p class="hint">{'Opens out to '+openSizeLabel(it)+'.'}</p> : null}
    <div class="row actions">
      <button class="btn sm" onClick={()=>place(inst.itemId)}>Duplicate</button>
      <button class="btn sm danger" onClick={removeSel}>Remove</button>
    </div>
  </>;
}

/** @param {{section: HTMLElement}} p */
function SelSection({section}){
  rev.furn.value; rev.lib.value; rev.room.value; rev.project.value; pref('unit'); pref('mode');
  const ready=loaded.value, n=selSet.value.size, id=sel.value;
  const inst = ready && furnMode() && n===1 ? instOf(id) : null, it = inst ? itemOf(inst.itemId) : null;
  const one = !!(inst && it);
  const stale = ready && furnMode() && n===1 && !one;   // the item went away under the selection
  useLayoutEffect(() => {
    if(!ready) return;
    section.classList.toggle('is-empty', !furnMode() || n===0 || (n===1 && !one));
    if(stale) selectClear();
  });
  return <>
    <SecHead title="Selection"/>
    <div>{!ready ? null : !furnMode() || n===0 ? <Keys multi/> : n>1 ? <Several/>
      : inst && it ? <One key={inst.id} inst={inst} it={it}/> : <Keys/>}</div>
  </>;
}

export {SelSection};
