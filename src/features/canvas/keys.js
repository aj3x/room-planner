// @ts-check
/* The canvas's claims on the keyboard: Escape abandons a gesture in flight,
   Space held down pans, and the live tool (drawing an outline, a wall or a
   split line; measuring) gets every key before the app's commands do. */
import {S, isCanvasMode} from '../../kernel/state.js';
import {KEY_ORDER} from '../../ui-kit/shortcuts.js';
import {cancelGesture, gestureTool, isGesturing, onCanvasKey} from './interaction.js';
import {panTool, setSpaceDown} from './pan-tool.js';
import {cv} from './view.js';

/** @type {import('../../ui-kit/shortcuts.js').Shortcut[]} */
const shortcuts = [
  {id: 'canvas.cancel-gesture', priority: KEY_ORDER.gesture, keys: ['Escape'], inFields: true,
    run: e => { if(!isGesturing()) return false; e.preventDefault(); cancelGesture(); }},
  {id: 'canvas.pan', priority: KEY_ORDER.pan, keys: ['Space'],
    run: e => {
      if(e.code!=='Space' || e.repeat || !isCanvasMode(S.mode)) return false;
      setSpaceDown(true); cv.style.cursor=panTool.cursor; e.preventDefault();
    }},
  /* a canvas tool that is live claims its keys first */
  {id: 'canvas.tool', priority: KEY_ORDER.tool, run: e => onCanvasKey(e)},
  /* Space's other half. It does NOT clear the cursor mid-pan: a pan started
     with Space keeps its grabbing cursor until the pointer comes up. */
  {id: 'canvas.pan-release', priority: KEY_ORDER.pan, keys: ['Space'], phase: 'up', inFields: true,
    run: e => {
      if(e.code!=='Space') return false;
      setSpaceDown(false);
      if(gestureTool()!==panTool) cv.style.cursor='';
    }},
];

export {shortcuts};
