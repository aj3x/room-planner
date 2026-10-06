// @ts-check
/* The Export dialog: tick the rooms and items that go in the file, and
   whether the settings do; in a Plan mode, save an image of the plan
   instead. A room is no use without the items standing in it, so ticking
   a room locks those on. */
import {useState} from 'preact/hooks';
import {L, S, isCanvasMode} from '../../kernel/state.js';
import {closeModal, moError, openDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {Icon} from '../../ui-kit/parts.jsx';
import {downloadJSON, exportName, exportPayload, savePlanImage} from './export.js';
import {Picker} from './picker.jsx';
import {folderLine} from './pickers.js';

/** The items standing in the rooms picked. @param {Set<string>} rooms */
function itemsIn(rooms){
  /** @type {Set<string>} */
  const need=new Set();
  for(const l of S.layouts) if(rooms.has(l.id)) for(const p of l.placed) need.add(p.itemId);
  return need;
}

function ExportBody(){
  const [rooms, setRooms] = useState(() => new Set(S.layouts.map(l=>l.id)));
  const [items, setItems] = useState(() => new Set(S.inventory.map(i=>i.id)));
  const [prefs, setPrefs] = useState(true);
  const need = itemsIn(rooms);
  useDialogOk(() => {
    const roomIds=S.layouts.filter(l=>rooms.has(l.id)).map(l=>l.id);
    const itemIds=S.inventory.filter(i=>items.has(i.id)||need.has(i.id)).map(i=>i.id);
    if(!roomIds.length && !itemIds.length){ moError('Tick at least one room or item'); return false; }
    const picked=S.layouts.filter(l=>roomIds.includes(l.id));
    downloadJSON(exportPayload(roomIds,itemIds,prefs), exportName(picked,itemIds));
  });
  return <>
    {isCanvasMode(S.mode) ? <>
      <div class="export-img">
        <span class="ico"><Icon name="room"/></span>
        <div class="grow"><div class="nm">{'Image of “'+L().name+'”'}</div><div class="dim">PNG of the plan as it's framed now</div></div>
        <button type="button" class="btn sm" onClick={()=>{ closeModal(); savePlanImage(); }}>Save image</button></div>
      <p class="group-title">Project file</p>
    </> : null}
    <p class="hint">Tick what goes in the file. It can be imported here or on another device.</p>
    <Picker title="Rooms" emptyMsg="You have no rooms to export"
      rows={S.layouts.map(l=>({value:l.id, label:l.name, sub:folderLine(l)}))} ticked={rooms}
      onChange={r=>{
        setRooms(r);
        /* a locked item stays ticked once the room that locked it is unticked */
        setItems(new Set([...items, ...itemsIn(r)]));
      }}/>
    <Picker title="Items" emptyMsg="Your library is empty"
      rows={S.inventory.map(i=>({value:i.id, label:i.name, sub:i.id}))} ticked={items} locked={need} onChange={setItems}/>
    <label class="check"><input type="checkbox" checked={prefs} onChange={e=>setPrefs(e.currentTarget.checked)}/>Settings — units, snap, stock and view</label>
    <p class="hint">{need.size ? 'Items placed in the rooms you picked always come along, so the plan still works at the other end.' : ''}</p>
  </>;
}

function exportDialog(){
  openDialog({title: 'Export', ok: 'Export file', body: <ExportBody/>});
}

export {exportDialog};
