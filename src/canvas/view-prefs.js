/* The View section's settings and the snap-size picker, each an effect on
   the settings it shows (ui/mount.js).

   Note for anyone reading renderSnap: it silently rewrites S.snap to the third
   entry of the list when the current value is not in it. */
import {S} from '../core/state.js';
import {pref, rev} from '../core/signals.js';
import {SNAPS} from '../core/units.js';
import {$} from '../ui/modal.js';
import {mountPanel} from '../ui/mount.js';

function renderSnap(){
  const list=(S.unit==='ftin'||S.unit==='in')?SNAPS.imperial:SNAPS.metric;
  const s=$('snapSel');
  s.innerHTML=list.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
  if(!list.some(([v])=>v===S.snap)) S.snap=list[2][0];
  s.value=S.snap;
}
/* The View section's switches and the header's unit, set from S: on load, on
   import, and whenever a setting is committed. */
function renderViewPrefs(){
  $('unitSel').value=S.unit;
  $('showSwing').checked=S.showSwing; $('showDims').checked=S.showDims; $('showOpen').checked=S.showOpen;
  $('showWalk').checked=S.showWalk; $('showMeasure').checked=S.showMeasure; $('zoomSpeedSel').value=S.zoomSpeed;
}
function mountViewPrefs(){
  mountPanel('snapSel', () => pref('unit'), renderSnap);
  mountPanel(null, () => { rev.prefs.value; rev.project.value; }, renderViewPrefs);
}
export {mountViewPrefs, renderSnap, renderViewPrefs};
