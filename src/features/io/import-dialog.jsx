// @ts-check
/* The Import dialog: what a file holds, ticked, and whether it is added to
   the project or replaces it. readImport() has read the file already; OK
   hands what is ticked to applyImport(). */
import {useState} from 'preact/hooks';
import {moError, openDialog, updateDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {applyImport} from './import.js';
import {Picker} from './picker.jsx';
import {folderLine} from './pickers.js';

/** @param {{inc: import('./import.js').Imported}} p */
function ImportBody({inc}){
  const [how, setHow] = useState('add');
  const [rooms, setRooms] = useState(() => new Set(inc.layouts.map(l=>l.id)));
  const [items, setItems] = useState(() => new Set(inc.inventory.map(i=>i.id)));
  const [prefs, setPrefs] = useState(false);
  const [dupe, setDupe] = useState('mine');
  const rep = how==='replace';
  useDialogOk(() => {
    const roomIds=inc.layouts.filter(l=>rooms.has(l.id)).map(l=>l.id), itemIds=inc.inventory.filter(i=>items.has(i.id)).map(i=>i.id);
    if(!roomIds.length && !itemIds.length){ moError('Tick at least one room or item'); return false; }
    if(rep && !roomIds.length){ moError('Replacing needs at least one room — a project has to have somewhere to stand'); return false; }
    applyImport(inc, roomIds, itemIds, !!inc.prefs && prefs, rep, dupe);
  });
  return <>
    <div class="field"><label for="imHow">Mode</label><select id="imHow" value={how}
      onChange={e=>{ const v=e.currentTarget.value; setHow(v); updateDialog({danger: v==='replace', ok: v==='replace' ? 'Replace project' : 'Import'}); }}>
      <option value="add">Add to my project</option>
      <option value="replace">Replace my project</option></select></div>
    <p class="hint">{rep
      ? 'Everything you have now — rooms, items and all — is replaced by what you tick below. This can’t be undone.'
      : 'What you tick is added to your project. Nothing you already have is touched.'}</p>
    <Picker title="Rooms in this file" emptyMsg="No rooms in this file"
      rows={inc.layouts.map(l=>({value:l.id, label:l.name, sub:folderLine(l,inc.folders)}))} ticked={rooms} onChange={setRooms}/>
    <Picker title="Items in this file" emptyMsg="No items in this file"
      rows={inc.inventory.map(i=>({value:i.id, label:i.name, sub:i.id}))} ticked={items} onChange={setItems}/>
    {inc.prefs ? <label class="check"><input type="checkbox" checked={prefs} onChange={e=>setPrefs(e.currentTarget.checked)}/>Settings — units, snap, stock, and what the plan shows</label> : null}
    <div class="field" hidden={rep}><label for="imDupe">Same id</label><select id="imDupe" value={dupe} onChange={e=>setDupe(e.currentTarget.value)}>
      <option value="mine">Keep mine</option>
      <option value="theirs">Overwrite mine</option>
      <option value="copy">Add theirs as a copy</option></select></div>
    <p class="hint" hidden={rep}>An id already in your library, like <code>ikea/kallax/4x2</code>, means the same product — by default yours is kept and incoming rooms use it. "Overwrite mine" replaces your item's data with the incoming one, in place.</p>
  </>;
}

/** @param {import('./import.js').Imported} inc */
function importDialog(inc){
  openDialog({title: 'Import', ok: 'Import', body: <ImportBody inc={inc}/>});
}

export {importDialog};
