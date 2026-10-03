/* Floor mode's Properties pane: the picked room's place on the floor, the
   floor itself, and merging or deleting two picked rooms; and the floor
   commands the layout tree's menus reach (its floor menu is layout-tree.js's).

   The two Properties sections are effects (mountFloorPanels, at the end);
   every command here commits through transact() and leaves the repainting
   to them, the tree and the canvas.
*/
import {mergeGeometry} from '../../kernel/merge-rooms.js';
import {fit} from '../canvas/index.js';
import {floorIWall, floorInst, floorXf} from '../../kernel/floor-space.js';
import {bbox, norm360} from '../../kernel/geometry.js';
import {floorHist, furnHist, roomHist} from '../../kernel/history.js';
import {pruneMeasures} from '../../kernel/migrate.js';
import {floorSel, mergeSel, mergeClear, treeExpand, treeCollapse} from '../../kernel/selection.js';
import {L, S, blankFloorPlace, clone, floorLayouts, floorMode, floorOf} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fmtLen, parseLen, trimNum} from '../../kernel/units.js';
import {clampOpenings, syncWallOff} from '../../kernel/walls.js';
import {flash} from '../../ui-kit/flash.js';
import {$, askConfirm, svgI} from '../../ui-kit/modal.js';
import {esc, plural} from '../../ui-kit/panels.js';
import {activateLayout, setMode} from '../mode/index.js';
import {placeOnFloor} from '../../kernel/floor-space.js';
import {uid} from '../../kernel/state.js';
import {folderLine, pickValues, pickerHTML} from '../io/index.js';
import {menuAtPoint} from '../../ui-kit/menu.js';
import {askText, openModal} from '../../ui-kit/modal.js';
import {pref, rev} from '../../kernel/signals.js';
import {mountPanel} from '../../ui-kit/mount.js';
/* one slot, not a stack \u2014 mirrors bpLastImport's own "undo the last thing" precedent */
let lastMerge=null;
function setLastMerge(v){ lastMerge = v; }
/* `A` is whichever room was picked first (it survives, keeping its name/colours/wall
   thickness); `B` is folded into it and then removed. Both must already share a floor \u2014
   that's the only place "these rooms share a wall" is well defined. */
function mergeLayouts(aId, bId){
  const A=S.layouts.find(x=>x.id===aId), B=S.layouts.find(x=>x.id===bId);
  if(!A || !B) return;
  if(!A.floorId || A.floorId!==B.floorId){ flash('Select two rooms on the same floor to merge them'); return; }
  const geo=mergeGeometry(A,B);
  if(geo.error){ flash(geo.error); return; }
  /* Not an undo step: A gets fresh stacks and mergeUndo takes it back. */
  const run=()=>{
    transact('project', ()=>{
      lastMerge={
        floorId:A.floorId, aId:A.id, aBefore:clone(A), bId:B.id, bBefore:clone(B), bIndex:S.layouts.indexOf(B),
        aRoomHist:roomHist[A.id], aFurnHist:furnHist[A.id], bRoomHist:roomHist[B.id], bFurnHist:furnHist[B.id],
      };
      /* everything each room owns gets carried into the same shared frame the merged
         polygon is already expressed in \u2014 floor space \u2014 the same transform floorInst/
         floorIWall already use to draw one room's things while standing on a floor */
      const tA=floorXf(A), tB=floorXf(B);
      const placed=A.placed.map(p=>floorInst(A,p,tA)).concat(B.placed.map(p=>floorInst(B,p,tB)));
      const pillars=A.room.pillars.map(p=>floorInst(A,p,tA)).concat(B.room.pillars.map(p=>floorInst(B,p,tB)));
      const iwalls=A.room.iwalls.map(w=>floorIWall(A,w,tA)).concat(B.room.iwalls.map(w=>floorIWall(B,w,tB)));

      A.room.points=geo.points; A.room.wallOff=geo.wallOff;
      A.floorPlace=blankFloorPlace();
      syncWallOff(A.room);
      A.openings=geo.openings;
      A.placed=placed;
      A.room.pillars=pillars;
      A.room.iwalls=iwalls;
      clampOpenings(A);
      A.measures=geo.measures;
      pruneMeasures(A);

      if(S.active===B.id) S.active=A.id;
      S.layouts=S.layouts.filter(x=>x.id!==B.id);
      roomHist[A.id]={stack:[JSON.stringify({room:A.room, openings:A.openings})], idx:0};
      furnHist[A.id]={stack:[JSON.stringify({placed:A.placed})], idx:0};
      delete roomHist[B.id]; delete furnHist[B.id]; delete floorHist[A.floorId];
      mergeClear();
    });
    fit();
    flash('Merged into \u201c'+A.name+'\u201d');
  };
  if(geo.removedOpenings>0){
    askConfirm('Merge these rooms?', plural(geo.removedOpenings,'door or window')+' on the shared wall will be removed.', 'Merge', run);
  } else {
    run();
  }
}

function deleteBothDialog(aId,bId){
  const a=S.layouts.find(x=>x.id===aId), b=S.layouts.find(x=>x.id===bId);
  if(!a||!b) return;
  if(S.layouts.length<=2){ flash('You need at least one room'); return; }
  askConfirm('Delete these rooms?', '\u201c'+a.name+'\u201d and \u201c'+b.name+'\u201d will be removed. Your library stays.', 'Delete', ()=>{
    const kill=new Set([aId,bId]);
    transact('project', ()=>{
      S.layouts=S.layouts.filter(x=>!kill.has(x.id));
      for(const id of kill){ delete roomHist[id]; delete furnHist[id]; if(lastMerge && lastMerge.aId===id) lastMerge=null; }
      if(kill.has(S.active)) activateLayout(S.layouts[0].id);
      mergeClear();
    });
    fit();
  });
}

/* Floor mode's Properties: the picked room's place on the floor, and the floor itself.
   Anything about the room's own shape or contents stays in Room/Furniture mode. */
function renderFloorSel(){
  const box=$('floorSelBox'), t=$('floorSelTitle'); if(!box) return;
  if(floorMode() && mergeSel.value.size===2){
    const [a,b]=[...mergeSel.value].map(id=>S.layouts.find(x=>x.id===id));
    box.closest('section').classList.toggle('is-empty', false);
    if(a && b){
      const sameFloor=!!(a.floorId && a.floorId===b.floorId);
      t.textContent=a.name+' + '+b.name;
      box.innerHTML=`
        <p class="hint">${sameFloor ? 'Right-click either room, or use the buttons below.' : 'These rooms aren’t on the same floor, so they can’t be merged.'}</p>
        <div class="row actions">
          ${sameFloor ? `<button class="btn sm" id="fmMerge">Merge into “${esc(a.name)}”</button>` : ''}
          <button class="btn sm quiet danger" id="fmDelete">Delete both…</button>
        </div>`;
      if(sameFloor) $('fmMerge').addEventListener('click', ()=>mergeLayouts(a.id,b.id));
      $('fmDelete').addEventListener('click', ()=>deleteBothDialog(a.id,b.id));
      return;
    }
  }
  const l = floorSel.value && S.layouts.find(x=>x.id===floorSel.value);
  box.closest('section').classList.toggle('is-empty', !(floorMode()&&l));
  if(!floorMode() || !l){
    t.textContent='Selection';
    box.innerHTML='<p class="hint">Click a room in the plan to move or turn it here.</p>';
    return;
  }
  const p=l.floorPlace, own=bbox(l.room.points);
  t.textContent=l.name;
  box.innerHTML=`
    <div class="field"><label for="flX">From left</label><input type="text" class="len" id="flX" value="${esc(fmtLen(p.x+own.x0,S.unit))}"></div>
    <div class="field"><label for="flY">From top</label><input type="text" class="len" id="flY" value="${esc(fmtLen(p.y+own.y0,S.unit))}"></div>
    <div class="field"><label for="flRot">Angle</label><input type="text" id="flRot" value="${trimNum(p.rot,1)}"><span class="unit">°</span>
      <button class="btn quiet sm icon" id="flRotL" title="Turn left 90°" aria-label="Turn left 90 degrees">${svgI('rot-l')}</button>
      <button class="btn quiet sm icon" id="flRotR" title="Turn right 90°" aria-label="Turn right 90 degrees">${svgI('rot-r')}</button></div>
    <div class="field"><label for="flDim">Label</label><input type="text" id="flDim" value="${esc(l.dimLabel||'')}" placeholder="${esc(fmtLen(own.w,S.unit)+' × '+fmtLen(own.h,S.unit))}"></div>
    <div class="row actions">
      <button class="btn sm" id="flEdit">Edit this room</button>
      <button class="btn sm quiet" id="flOff">Take off floor</button>
    </div>`;
  const move=(k,v)=>{ if(v==null||!isFinite(v)) return; transact('floor', ()=>{ l.floorPlace[k]=v-(k==='x'?own.x0:own.y0); }); };
  $('flX').addEventListener('change',e=>move('x',parseLen(e.target.value,S.unit)));
  $('flY').addEventListener('change',e=>move('y',parseLen(e.target.value,S.unit)));
  $('flRot').addEventListener('change',e=>{
    const v=parseFloat(e.target.value);
    if(isFinite(v)) transact('floor', ()=>{ l.floorPlace.rot=norm360(v); });
  });
  // a label, not a placement: nothing for the floor's undo to step through
  $('flDim').addEventListener('change',e=>transact('floor', ()=>{ l.dimLabel=e.target.value.trim(); }, {history:false}));
  $('flRotL').addEventListener('click',()=>turnFloorRoom(l,-90));
  $('flRotR').addEventListener('click',()=>turnFloorRoom(l,90));
  $('flEdit').addEventListener('click',()=>{ transact('project', ()=>{ activateLayout(l.id); setMode('room'); }); fit(); });
  $('flOff').addEventListener('click',()=>transact('project', ()=>{ l.floorId=null; floorSel.value = null; }));
}
function turnFloorRoom(l,deg){
  transact('floor', ()=>{ l.floorPlace.rot=norm360((l.floorPlace.rot||0)+deg); });
}
function renderFloorProps(){
  const box=$('floorPropsBox'); if(!box) return;
  const fl=floorOf(L().floorId);
  if(!fl){
    box.innerHTML='<p class="hint">This room is not on a floor yet. Put it on one from its ⋯ menu in the Rooms list.</p>';
    return;
  }
  const n=floorLayouts(fl.id).length;
  box.innerHTML=`
    <div class="field"><label for="flName">Name</label><input type="text" id="flName" value="${esc(fl.name)}"></div>
    <div class="field"><label for="flExt">Outer wall</label><input type="text" class="len" id="flExt" value="${fl.extWall?esc(fmtLen(fl.extWall,S.unit)):''}" placeholder="Same as each room"></div>
    <p class="hint">${plural(n,'room')} on this floor. Drag one against another and it clicks to a shared wall.</p>
    <div class="row actions"><button class="btn sm quiet" id="flFit">Fit floor</button></div>`;
  $('flName').addEventListener('change',e=>{ const v=e.target.value.trim(); if(v) transact('project', ()=>{ fl.name=v; }); });
  $('flExt').addEventListener('change',e=>{
    const raw=e.target.value.trim(), v=raw?parseLen(raw,S.unit):0;
    transact('project', ()=>{ fl.extWall = raw && isFinite(v) && v>0 ? v : 0; });
  });
  $('flFit').addEventListener('click',()=>fit());
}

/* ---- Phase 3: the rest of this file's region, move-only. ---- */
/* ---- floors: a named arrangement of rooms. A floor owns no geometry of its
        own — each room keeps its outline and carries where it stands. ---- */
function newFloor(){
  askText('New floor','Name','Floor', n=>{
    const fl={id:uid(), name:n, parentId:null, extWall:0};
    transact('project', ()=>{ S.floors.push(fl); treeExpand(fl.id); });
  });
}

function floorRoomsDialog(id){
  const fl=floorOf(id); if(!fl) return;
  const rooms=S.layouts.map(l=>{
    const other = l.floorId && l.floorId!==id ? floorOf(l.floorId) : null;
    return {value:l.id, label:l.name, sub: other ? 'on '+other.name : folderLine(l), checked: l.floorId===id};
  });
  openModal('Rooms on “'+fl.name+'”', `
    <p class="hint">Tick the rooms that make up this floor. A room can only stand on one floor at a time.</p>
    ${pickerHTML('flRooms','Rooms',rooms,'You have no rooms yet')}`,
    'Save', ()=>{
      const picked=new Set(pickValues('flRooms'));
      transact('project', ()=>{
          for(const l of S.layouts){
            if(picked.has(l.id)){ if(l.floorId!==id){ placeOnFloor(l,id); l.floorId=id; } }
            else if(l.floorId===id) l.floorId=null;
          }
          treeExpand(id);
      });
    });
}
/* deleting a floor never deletes a room: the arrangement goes, the rooms stay */
function deleteFloor(id){
  const fl=floorOf(id); if(!fl) return;
  const rooms=floorLayouts(id), n=rooms.length;
  const drop=()=>{
    transact('project', ()=>{
        for(const l of rooms) l.floorId=null;
        S.floors=S.floors.filter(x=>x.id!==id);
        treeCollapse(id);
    });
  };
  if(!n){ askConfirm('Delete this floor?', '“'+fl.name+'” is empty.', 'Delete floor', drop); return; }
  askConfirm('Delete “'+fl.name+'”?',
    n+' room'+(n>1?'s':'')+' stand'+(n>1?'':'s')+' on it. Deleting the floor keeps every room — they go back to their folders.',
    'Delete floor', drop);
}
function putOnFloor(l, fid){ transact('project', ()=>{ placeOnFloor(l,fid); l.floorId=fid; treeExpand(fid); }); }
function newFloorWith(l){
  askText('New floor','Name','Floor', n=>{
    const fl={id:uid(), name:n, parentId:null, extWall:0};
    transact('project', ()=>{ S.floors.push(fl); putOnFloor(l, fl.id); });
  });
}
function putOnFloorDialog(id){
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  const opts=S.floors.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('');
  openModal('Put “'+l.name+'” on a floor', `
    <div class="field"><label for="flPick">Floor</label>
      <select id="flPick">${opts}<option value="">New floor…</option></select></div>
    <p class="hint">The room keeps its own outline, walls and items. It just gains a place to stand.</p>`,
    'Put on floor', ()=>{
      const v=$('flPick').value;
      /* deferred so this modal is closed before the name prompt opens over it */
      if(!v){ setTimeout(()=>newFloorWith(l),0); return; }
      putOnFloor(l, v);
    });
}

function mergeUndo(){
  if(!lastMerge) return;
  const m=lastMerge;
  askConfirm('Undo this merge?', 'The two rooms will be restored as they were.', 'Undo merge', ()=>{
    transact('project', ()=>{
      const a=S.layouts.find(x=>x.id===m.aId);
      if(a) Object.assign(a, clone(m.aBefore));
      if(!S.layouts.some(x=>x.id===m.bId)) S.layouts.splice(Math.min(m.bIndex, S.layouts.length), 0, clone(m.bBefore));
      if(m.aRoomHist) roomHist[m.aId]=m.aRoomHist; else delete roomHist[m.aId];
      if(m.aFurnHist) furnHist[m.aId]=m.aFurnHist; else delete furnHist[m.aId];
      if(m.bRoomHist) roomHist[m.bId]=m.bRoomHist; else delete roomHist[m.bId];
      if(m.bFurnHist) furnHist[m.bId]=m.bFurnHist; else delete furnHist[m.bId];
      delete floorHist[m.floorId];
      setLastMerge(null);
      mergeClear();
      activateLayout(m.aId);
    });
    fit();
  });
}
function openFloorMergeMenu(ids, clientX, clientY){
  const [aId,bId]=ids;
  const a=S.layouts.find(x=>x.id===aId), b=S.layouts.find(x=>x.id===bId);
  if(!a||!b) return;
  menuAtPoint(clientX, clientY, [
    {label:'Merge rooms', fn:()=>mergeLayouts(aId,bId)},
    {sep:true},
    {label:'Delete both rooms\u2026', danger:true, fn:()=>deleteBothDialog(aId,bId)},
  ], a.name+' + '+b.name);
}
/* Floor mode's two Properties sections, each an effect on what it shows
   (ui/mount.js). */
function mountFloorPanels(){
  mountPanel($('floorSelBox').closest('section'), () => {
    rev.floor.value; rev.room.value; rev.project.value; pref('unit'); pref('mode'); floorSel.value; mergeSel.value;
  }, renderFloorSel);
  mountPanel($('floorPropsBox').closest('section'), () => { rev.project.value; pref('unit'); }, renderFloorProps);
}
export {mountFloorPanels, lastMerge, setLastMerge, mergeLayouts, deleteBothDialog, renderFloorSel, renderFloorProps, turnFloorRoom, newFloor, floorRoomsDialog, deleteFloor, putOnFloor, newFloorWith, putOnFloorDialog, mergeUndo, openFloorMergeMenu};
