/* The status corner under the plan: what is true of this room right now,
   and what is wrong with it. Not paint — it writes #readout — but it says
   what this frame shows, so it runs with the frame, last. */

import {$} from '../../ui/modal.js';
import {esc, plural} from '../../ui/panels.js';
import {polyArea, shapePoly} from '../../core/geometry.js';
import {alignNote} from '../../core/selection.js';
import {L, RP, S, itemOf, roomMode} from '../../core/state.js';
import {fmtArea} from '../../core/units.js';

/* the status corner: what is true of this room right now, and what's wrong with it */
function updateReadout(bad,openBad){
  const el=$('readout'), n=bad?bad.size:0, no=openBad?openBad.size:0;
  const bits=[];
  if(roomMode()){
    bits.push(esc(fmtArea(polyArea(RP()),S.unit)), plural(RP().length,'wall'));
  } else {
    let used=0;
    for(const p of L().placed){
      const it=itemOf(p.itemId);
      if(it&&!it.passThrough) used+=polyArea(shapePoly(it.shape));
    }
    const total=polyArea(RP())||1;
    bits.push(L().placed.length+' placed', Math.round(used/total*100)+'% covered');
  }
  let html=bits.join(' · ');
  if(alignNote.value) html=`<span class="snap">${esc(alignNote.value)}</span> · `+html;
  if(n) html+=`<span class="bad">${n} ${n===1?"doesn't":"don't"} fit</span>`;
  if(no) html+=`<span class="bad">${no} can't open</span>`;
  el.innerHTML=html;
}

const readoutLayer = {
  id:'readout', z:1000, scene:'room',
  deps(){ alignNote.value; },
  draw(ctx, view, {bad, openBad}){ updateReadout(bad, openBad); }
};

export {readoutLayer};
