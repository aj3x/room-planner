// @ts-check
/* The two floor dialogs the layout tree's menus open: which rooms make up
   a floor, and which floor a room stands on. */
import {useState} from 'preact/hooks';
import {treeExpand} from '../../kernel/selection.js';
import {S, floorOf} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {placeOnFloor} from '../../kernel/model/floor-space.js';
import {openDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {Picker, folderLine} from '../io/index.js';
import {newFloorWith, putOnFloor} from './floors.js';

/** @param {{id: string}} p a floor */
function FloorRoomsBody({id}){
  const [ticked, setTicked] = useState(() => new Set(S.layouts.filter(l=>l.floorId===id).map(l=>l.id)));
  useDialogOk(() => {
    transact('project', ()=>{
        for(const l of S.layouts){
          if(ticked.has(l.id)){ if(l.floorId!==id){ placeOnFloor(l,id); l.floorId=id; } }
          else if(l.floorId===id) l.floorId=null;
        }
        treeExpand(id);
    });
  });
  return <>
    <p class="hint">Tick the rooms that make up this floor. A room can only stand on one floor at a time.</p>
    <Picker title="Rooms" emptyMsg="You have no rooms yet" ticked={ticked} onChange={setTicked}
      rows={S.layouts.map(l=>{
        const other = l.floorId && l.floorId!==id ? floorOf(l.floorId) : null;
        return {value:l.id, label:l.name, sub: other ? 'on '+other.name : folderLine(l)};
      })}/>
  </>;
}
/** @param {string} id a floor */
function floorRoomsDialog(id){
  const fl=floorOf(id); if(!fl) return;
  openDialog({title: 'Rooms on “'+fl.name+'”', ok: 'Save', body: <FloorRoomsBody id={id}/>});
}

/** @param {{pick: import('preact').RefObject<HTMLSelectElement>}} p */
function PutOnFloorBody({pick}){
  return <>
    <div class="field"><label for="flPick">Floor</label>
      <select id="flPick" ref={pick}>{S.floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}<option value="">New floor…</option></select></div>
    <p class="hint">The room keeps its own outline, walls and items. It just gains a place to stand.</p>
  </>;
}
/** @param {string} id a layout */
function putOnFloorDialog(id){
  const l=S.layouts.find(x=>x.id===id); if(!l) return;
  /** @type {import('preact').RefObject<HTMLSelectElement>} */
  const pick={current: null};
  openDialog({title: 'Put “'+l.name+'” on a floor', ok: 'Put on floor', body: <PutOnFloorBody pick={pick}/>, onOk: ()=>{
    const v=pick.current ? pick.current.value : '';
    /* deferred so this dialog is closed before the name prompt opens over it */
    if(!v){ setTimeout(()=>newFloorWith(l),0); return; }
    putOnFloor(l, v);
  }});
}

export {floorRoomsDialog, putOnFloorDialog};
