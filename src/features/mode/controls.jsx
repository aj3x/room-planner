// @ts-check
/* The canvas's mode switch (Floor | Room | Furniture) and its undo and
   redo buttons. Each reads what it shows while it renders. */
import {histAvail, histRev} from '../../kernel/history.js';
import {pref, rev} from '../../kernel/signals.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {redo, setMode, undo} from './mode.js';

/** @type {[import('../../kernel/types.js').Mode, string, string][]} */
const MODES = [
  ['floor', 'Floor', 'See this room beside the others on its floor'],
  ['room', 'Room', 'Edit walls, doors and windows'],
  ['furniture', 'Furniture', 'Place and move items'],
];
function ModeSeg(){
  const mode=pref('mode');
  return <div class="seg" id="modeSeg" role="group" aria-label="Editing mode">
    {MODES.map(([m,label,title])=><button key={m} type="button" data-mode={m} aria-pressed={mode===m} title={title} onClick={()=>setMode(m)}>{label}</button>)}
  </div>;
}

function UndoRedo(){
  histRev.value; pref('mode'); rev.project.value; rev.floor.value;
  const {canUndo, canRedo}=histAvail();
  return <>
    <button class="btn quiet icon" id="btnUndo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}><Icon name="undo"/></button>
    <button class="btn quiet icon" id="btnRedo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}><Icon name="redo"/></button>
  </>;
}

export {ModeSeg, UndoRedo};
