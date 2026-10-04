// @ts-check
/* The View section in the Properties pane, as a component: snap size, zoom
   speed and what the plan shows. It reads the settings while it renders
   and re-renders when one is committed (ui-kit/component.js).

   Note for anyone reading SnapSelect: it silently rewrites S.snap to the
   third entry of the list when the current value is not in it (a unit
   change from metric to imperial, say). */
import {S} from '../../kernel/state.js';
import {loaded, pref, rev} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {SNAPS} from '../../kernel/units.js';
import {mountComponent} from '../../ui-kit/component.js';
import {Check, SecHead, Select} from '../../ui-kit/parts.jsx';

function SnapSelect(){
  pref('unit');
  const list = !loaded.value ? [] : (S.unit==='ftin'||S.unit==='in') ? SNAPS.imperial : SNAPS.metric;
  if(list.length && !list.some(([v])=>v===S.snap)) S.snap=list[2][0];
  return <Select id="snapSel" value={S.snap} onCommit={v=>transact('prefs', ()=>{ S.snap=v; }, {canvas:false})}>
    {list.map(([v,t])=><option key={v} value={v}>{t}</option>)}
  </Select>;
}

/** @typedef {'showSwing'|'showDims'|'showOpen'|'showWalk'|'showMeasure'} Shown */
/** @param {{k: Shown, children: string}} p */
function Show({k, children}){
  return <Check checked={S[k]} onCommit={on=>transact('prefs', ()=>{ S[k]=on; })}>{children}</Check>;
}

function ViewSection(){
  rev.prefs.value; rev.project.value; loaded.value;   // S is the saved one once loaded
  return <>
    <SecHead title="View"/>
    <div class="field"><label for="snapSel">Snap to</label><SnapSelect/></div>
    <div class="field"><label for="zoomSpeedSel">Zoom speed</label>
      <Select id="zoomSpeedSel" value={String(S.zoomSpeed)} onCommit={v=>transact('prefs', ()=>{ S.zoomSpeed=parseFloat(v)||1; }, {canvas:false})}>
        <option value="0.5">Slow</option>
        <option value="1">Normal</option>
        <option value="2">Fast</option>
      </Select>
    </div>
    <Show k="showDims">Size of the selected item</Show>
    <Show k="showSwing">Door clearance</Show>
    <Show k="showOpen">Items opened out</Show>
    <Show k="showWalk">Walk paths</Show>
    <Show k="showMeasure">Measurements</Show>
  </>;
}

/** @type {import('../../ui-kit/component.js').Sections} */
const sections = {
  drawing(el){ mountComponent(el, <ViewSection/>); },
};

export {sections};
