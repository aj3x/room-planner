/* The Room pane's lists: the snap-size picker, the wall list and the
   structures list (pillars and interior walls), plus the two row helpers the
   other panels share.

   Extracted from index.html in Phase 3, move-only: the block below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   renderRoom, immediately above these in the monolith, did not come. It is
   part of the 48-name reference cycle between the Plan side panels and the
   Library UI (see .claude/plans/refactor-split.md, the plan/ round), and so
   are the listeners that follow renderObstacles here.

   Note for anyone reading renderSnap: it silently rewrites S.snap to the third
   entry of the list when the current value is not in it. That is pre-existing
   behaviour, characterized by the baseline, and moving it does not change it.
*/
import {esc} from '../ui/panels.js';
import {moreBtn} from '../ui/menu.js';
import {$} from '../ui/modal.js';
import {S, L, RP} from '../core/state.js';
import {roomSel} from '../core/selection.js';
import {fmtLen, SNAPS} from '../core/units.js';
import {wallOf, wallIsOff, wallAngle, iwallLen} from '../model/walls.js';

function renderSnap(){
  const list=(S.unit==='ftin'||S.unit==='in')?SNAPS.imperial:SNAPS.metric;
  const s=$('snapSel');
  s.innerHTML=list.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
  if(!list.some(([v])=>v===S.snap)) S.snap=list[2][0];
  s.value=S.snap;
}
function renderWalls(){
  const ul=$('wallList'), P=RP(), room=L().room;
  ul.innerHTML=P.map((_,i)=>{
    const w=wallOf(i);
    const on=roomSel&&roomSel.kind==='wall'&&roomSel.i===i;
    const meta = wallIsOff(room,i) ? 'Open · '+esc(fmtLen(w.len,S.unit))
                                   : esc(fmtLen(w.len,S.unit))+' · '+Math.round(wallAngle(i))+'°';
    return `<li data-i="${i}" class="${on?'on':''}">
      <span class="nm">Wall ${i+1}</span>
      <span class="lmeta">${meta}</span></li>`;
  }).join('');
  renderObstacles();
}
const sizeLabelShape = sh => fmtLen(sh.w,S.unit)+' × '+fmtLen(sh.d,S.unit);
const emptyRow = msg => `<li class="list-empty"><div class="empty">${msg}</div></li>`;
function renderObstacles(){
  const ul=$('structList'), room=L().room;
  let pn=0, wn=0;
  const rows=[
    ...room.pillars.map(pl=>({kind:'pillar', id:pl.id, label:'Pillar '+(++pn), dim:sizeLabelShape(pl.shape)})),
    ...room.iwalls.map(w=>({kind:'iwall', id:w.id, label:'Interior wall '+(++wn), dim:fmtLen(iwallLen(w),S.unit)}))
  ];
  if(!rows.length){ ul.innerHTML=emptyRow('None yet'); return; }
  ul.innerHTML=rows.map(r=>{
    const on=roomSel&&roomSel.kind===r.kind&&roomSel.id===r.id;
    return `<li data-kind="${r.kind}" data-id="${r.id}" class="${on?'on':''}">
      <span class="nm">${esc(r.label)}</span><span class="lmeta">${esc(r.dim)}</span>
      <span class="lact">${moreBtn('')}</span></li>`;
  }).join('');
}

export {renderSnap, renderWalls, sizeLabelShape, emptyRow, renderObstacles};
