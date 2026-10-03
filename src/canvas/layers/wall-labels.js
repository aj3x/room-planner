/* Each wall's length, set outside it along the wall, in accent when the
   wall is selected. */

import {ctx, sx, sy, view} from '../view.js';
import {PAL} from '../paint.js';
import {roomSel} from '../../core/selection.js';
import {L, RP, S} from '../../core/state.js';
import {fmtLen} from '../../core/units.js';
import {wallOf} from '../../model/walls.js';

function drawWallLabels(){
  const P=RP(), C=PAL();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let i=0;i<P.length;i++){
    const w=wallOf(i);
    if(w.len*view.scale<26) continue;
    const off=L().room.wall*view.scale+13;
    const x=sx(w.mid[0])-w.nrm[0]*off, y=sy(w.mid[1])-w.nrm[1]*off;
    let a=Math.atan2(w.dir[1],w.dir[0]);
    if(a>Math.PI/2||a<-Math.PI/2) a+=Math.PI;
    ctx.save(); ctx.translate(x,y); ctx.rotate(a);
    const on = roomSel.value&&roomSel.value.kind==='wall'&&roomSel.value.i===i;
    ctx.fillStyle = on?C.stageAccent:C.ink2;
    ctx.font = (on?'600 ':'500 ')+'11.5px ui-sans-serif,-apple-system,system-ui,sans-serif';
    ctx.fillText(fmtLen(w.len,S.unit),0,0);
    ctx.restore();
  }
}

const wallLabelsLayer = {id:'wall-labels', z:100, scene:'room', deps(){ roomSel.value; }, draw(){ drawWallLabels(); }};

export {wallLabelsLayer};
