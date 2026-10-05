// @ts-check
/* The page's chrome, as components the features' controls are composed
   into: the header (the places, the units, Import and Export), the controls
   over the canvas, and the two side panels' heads. Each is rendered into an
   element the shell (index.html) provides, by mountChrome(), which boot()
   calls before anything else; each part reads what it shows while it
   renders. */
import {S, isCanvasMode} from '../kernel/state.js';
import {loaded, pref, rev} from '../kernel/signals.js';
import {transact} from '../kernel/tx.js';
import {mountComponent} from '../ui-kit/component.js';
import {flash} from '../ui-kit/flash.js';
import {showShortcuts} from '../ui-kit/modal.jsx';
import {Icon, PaneHead, Select} from '../ui-kit/parts.jsx';
import {Toast} from '../ui-kit/toast.jsx';
import {Readout, ZoomControls} from '../features/canvas/index.js';
import {exportDialog, importDialog, readImport} from '../features/io/index.js';
import {MeasureBar, MeasureButton} from '../features/measure/index.js';
import {ModeSeg, UndoRedo, setMode, togglePane} from '../features/mode/index.js';
import {DrawHint} from '../features/room/index.js';

/** @type {[string, string][]} */
const PLACES = [['plan', 'Plan'], ['inventory', 'Library'], ['marketplace', 'Marketplace']];
/** @type {[string, string][]} */
const UNITS = [['ftin', 'Feet & inches'], ['in', 'Inches'], ['cm', 'Centimetres'], ['mm', 'Millimetres'], ['m', 'Metres']];

/** @param {Event & {currentTarget: HTMLInputElement}} e */
function importFile(e){
  const input=e.currentTarget, f=input.files && input.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    let inc=null;
    try{ inc=readImport(JSON.parse(/** @type {string} */(rd.result))); }catch(err){ inc=null; }
    if(!inc){ flash("That file isn't a Room Planner export"); return; }
    importDialog(inc);
  };
  rd.readAsText(f);
  input.value='';
}

/* places (Plan / Library / Marketplace) live in the header; the Room/Furniture mode lives on the canvas it changes */
function Header(){
  rev.prefs.value; rev.project.value; pref('mode');
  const place = loaded.value ? (isCanvasMode(S.mode) ? 'plan' : S.mode) : null;
  /** @type {import('preact').RefObject<HTMLInputElement>} */
  const file = {current: null};
  return <>
    <h1 class="brand"><Icon name="plan"/><span>Room Planner</span></h1>
    <nav class="nav" id="navSeg" aria-label="Sections">
      {PLACES.map(([p,label])=><button key={p} type="button" data-nav={p} aria-current={p===place ? 'page' : undefined} onClick={()=>{
        if(p==='plan'){ if(!isCanvasMode(S.mode)) setMode(S.planMode||'furniture'); }
        else if(p!==S.mode) setMode(/** @type {import('../kernel/types.js').Mode} */(p));   // a place is a mode
      }}>{label}</button>)}
    </nav>
    <div class="spacer"></div>
    <div class="hgroup">
      <Select id="unitSel" aria-label="Units" title="Units" value={S.unit}
        onCommit={v=>transact('prefs', ()=>{ S.unit=/** @type {import('../kernel/types.js').Unit} */(v); })   // one of UNITS
        }>
        {UNITS.map(([u,label])=><option key={u} value={u}>{label}</option>)}
      </Select>
      <button class="btn" id="btnImport" onClick={()=>{ if(file.current) file.current.click(); }}>Import…</button>
      <button class="btn" id="btnExport" onClick={exportDialog}>Export…</button>
      <input type="file" id="fileIn" accept="application/json,.json" hidden ref={file} onChange={importFile}/>
    </div>
  </>;
}

/* The controls over the canvas. The toast is here too: it moves down out of
   the way of the drawing hint, which it must follow in the document for that. */
function StageControls(){
  return <>
    <div class="island" id="ctlMode">
      <ModeSeg/>
      <span class="sep" aria-hidden="true"></span>
      <MeasureButton/>
      <MeasureBar/>
    </div>
    <div class="island" id="ctlHist">
      <UndoRedo/>
      <button class="btn quiet icon" id="btnShortcuts" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={showShortcuts}>?</button>
    </div>
    <ZoomControls/>
    <Readout/>
    <DrawHint/>
    <Toast/>
  </>;
}

/** @param {string} id */
const el = id => /** @type {HTMLElement} */(document.getElementById(id));   // the shell's

function mountChrome(){
  mountComponent(el('header'), <Header/>);
  mountComponent(el('stageControls'), <StageControls/>);
  mountComponent(el('paneHeadLeft'), <PaneHead side="left" name="Plan" label="the plan panel" onToggle={()=>togglePane('left')}/>);
  mountComponent(el('paneHeadRight'), <PaneHead side="right" name="Properties" label="the properties panel" onToggle={()=>togglePane('right')}/>);
}

export {mountChrome};
