// @ts-check
/* Floor mode's commands: merging or deleting two picked rooms, turning one,
   and the floor commands the layout tree's menus reach (its floor menu is
   layout-tree.js's). The Properties sections that run some of them are
   sections.jsx. Every command here commits through transact() and leaves
   the repainting to the views.
*/
import {mergeGeometry} from '../room/index.js';
import {fit} from '../canvas/index.js';
import {floorIWall, floorInst, floorXf} from '../../kernel/model/floor-space.js';
import {norm360} from '../../kernel/geometry.js';
import {floorHist, furnHist, roomHist} from '../../kernel/history.js';
import {pruneMeasures} from '../../kernel/migrate.js';
import {mergeClear, treeExpand, treeCollapse} from '../../kernel/selection.js';
import {S, blankFloorPlace, clone, floorLayouts, floorOf} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {clampOpenings, syncWallOff} from '../../kernel/model/walls.js';
import {flash} from '../../ui-kit/flash.js';
import {$, askConfirm} from '../../ui-kit/modal.js';
import {esc, plural} from '../../ui-kit/panels.js';
import {activateLayout} from '../mode/index.js';
import {placeOnFloor} from '../../kernel/model/floor-space.js';
import {uid} from '../../kernel/state.js';
import {folderLine, pickValues, pickerHTML} from '../io/index.js';
import {menuAtPoint} from '../../ui-kit/menu.js';
import {askText, openModal} from '../../ui-kit/modal.js';

/* one slot, not a stack \u2014 mirrors bpLastImport's own "undo the last thing" precedent */
/** Enough to put two merged rooms back: each one before, B's place in the list, their undo stacks.
    @typedef {{floorId: string|null, aId: string, aBefore: Layout, bId: string, bBefore: Layout, bIndex: number,
      aRoomHist?: Hist, aFurnHist?: Hist, bRoomHist?: Hist, bFurnHist?: Hist}} LastMerge */
/** @typedef {import('../../kernel/types.js').Layout} Layout */
/** @typedef {import('../../kernel/types.js').Hist} Hist */
/** @type {LastMerge|null} */
let lastMerge=null;
/** @param {LastMerge|null} v */
function setLastMerge(v){ lastMerge = v; }
/* `A` is whichever room was picked first (it survives, keeping its name/colours/wall
   thickness); `B` is folded into it and then removed. Both must already share a floor \u2014
   that's the only place "these rooms share a wall" is well defined. */
/** Fold room bId into room aId. @param {string} aId @param {string} bId */
function mergeLayouts(aId, bId){
  const A=S.layouts.find(x=>x.id===aId), B=S.layouts.find(x=>x.id===bId);
  if(!A || !B) return;
  if(!A.floorId || A.floorId!==B.floorId){ flash('Select two rooms on the same floor to merge them'); return; }
  const geo=mergeGeometry(A,B);
  if(geo.error){ flash(geo.error); return; }
  const ok=/** @type {import('../room/index.js').MergeOk} */(geo);   // no error: it merged
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

      A.room.points=ok.points; A.room.wallOff=ok.wallOff;
      A.floorPlace=blankFloorPlace();
      syncWallOff(A.room);
      A.openings=ok.openings;
      A.placed=placed;
      A.room.pillars=pillars;
      A.room.iwalls=iwalls;
      clampOpenings(A);
      A.measures=ok.measures;
      pruneMeasures(A);

      if(S.active===B.id) S.active=A.id;
      S.layouts=S.layouts.filter(x=>x.id!==B.id);
      roomHist[A.id]={stack:[JSON.stringify({room:A.room, openings:A.openings})], idx:0};
      furnHist[A.id]={stack:[JSON.stringify({placed:A.placed})], idx:0};
      delete roomHist[B.id]; delete furnHist[B.id]; delete floorHist[/** @type {string} */(A.floorId)];
      mergeClear();
    });
    fit();
    flash('Merged into \u201c'+A.name+'\u201d');
  };
  if(ok.removedOpenings>0){
    askConfirm('Merge these rooms?', plural(ok.removedOpenings,'door or window')+' on the shared wall will be removed.', 'Merge', run);
  } else {
    run();
  }
}

/** @param {string} aId @param {string} bId */
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

/** @param {Layout} l @param {number} deg */
function turnFloorRoom(l,deg){
  transact('floor', ()=>{ l.floorPlace.rot=norm360((l.floorPlace.rot||0)+deg); });
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

/** @param {string} id a floor */
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
/** @param {string} id */
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
/** @param {Layout} l @param {string} fid */
function putOnFloor(l, fid){ transact('project', ()=>{ placeOnFloor(l,fid); l.floorId=fid; treeExpand(fid); }); }
/** @param {Layout} l */
function newFloorWith(l){
  askText('New floor','Name','Floor', n=>{
    const fl={id:uid(), name:n, parentId:null, extWall:0};
    transact('project', ()=>{ S.floors.push(fl); putOnFloor(l, fl.id); });
  });
}
/** @param {string} id a layout */
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
      delete floorHist[/** @type {string} */(m.floorId)];
      setLastMerge(null);
      mergeClear();
      activateLayout(m.aId);
    });
    fit();
  });
}
/** @param {string[]} ids @param {number} clientX @param {number} clientY */
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
export {lastMerge, setLastMerge, mergeLayouts, deleteBothDialog, turnFloorRoom, newFloor, floorRoomsDialog, deleteFloor, putOnFloor, newFloorWith, putOnFloorDialog, mergeUndo, openFloorMergeMenu};
