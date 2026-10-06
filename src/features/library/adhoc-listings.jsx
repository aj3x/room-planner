// @ts-check
/* Ad hoc listings: the add-a-listing dialog. Their views are
   market-views.jsx, their menus folder-menus.jsx. */
import {useRef, useState} from 'preact/hooks';
import {normItem} from '../../kernel/migrate.js';
import {S, clone, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {moError, openDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {nav} from './nav.js';

/** @typedef {'file'|'link'|'paste'} Source */

function AddListingBody(){
  const [mode, setMode] = useState(/** @type {Source} */('file'));
  const [over, setOver] = useState(false);
  const [note, setNote] = useState('');
  /** @type {import('preact').RefObject<any>} what the chosen file holds, parsed — any JSON at all until it is checked below */
  const pending = useRef(null);
  const name = useRef(/** @type {HTMLInputElement|null} */(null));
  const url = useRef(/** @type {HTMLInputElement|null} */(null));
  const paste = useRef(/** @type {HTMLTextAreaElement|null} */(null));
  /** @param {File|undefined|null} file */
  function readFile(file){
    if(!file) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        pending.current=JSON.parse(/** @type {string} */(r.result)); setNote('Loaded “'+file.name+'”');
        const n=name.current; if(n && !n.value.trim()) n.value=file.name.replace(/\.json$/i,'');
      }
      catch(e){ pending.current=null; setNote('That file isn’t valid JSON.'); }
    };
    r.readAsText(file);
  }
  useDialogOk(() => {
    const nm=((name.current && name.current.value)||'').trim()||'Untitled listing';
    if(mode==='link'){
      const u=((url.current && url.current.value)||'').trim();
      if(!/^https?:\/\//i.test(u)){ moError('Enter a valid http(s) link'); return false; }
      transact('lib', ()=>{ S.marketListings.push({id:uid(), name:nm, parentId:nav.marketFolderId, kind:'link', url:u, addedAt:Date.now()}); });
      return;
    }
    /** @type {any} parsed JSON, checked on the next line */
    let raw;
    if(mode==='paste'){
      try{ raw=JSON.parse(paste.current ? paste.current.value : ''); }catch(e){ moError('That is not valid JSON'); return false; }
    } else {
      raw=pending.current;
    }
    if(!raw || !Array.isArray(raw.inventory)){ moError('That file doesn’t look like a Room Planner export — it needs an "inventory" array'); return false; }
    const content={inventory: raw.inventory.filter((/** @type {any} */i)=>i&&typeof i==='object'&&i.shape).map((/** @type {any} */i)=>normItem(clone(i)))};
    transact('lib', ()=>{ S.marketListings.push({id:uid(), name:nm, parentId:nav.marketFolderId, kind:'file', content, addedAt:Date.now()}); });
  });
  /** @param {Source} m @param {string} label */
  const tab = (m, label) => <button type="button" aria-pressed={mode===m} onClick={()=>setMode(m)}>{label}</button>;
  return <>
    <div class="field"><label for="lName">Name</label><input type="text" id="lName" placeholder="A one-off bundle" ref={name}/></div>
    <div class="seg full addmode-tabs" role="group" aria-label="Source">
      {tab('file', 'File')}{tab('link', 'Link')}{tab('paste', 'Paste JSON')}
    </div>
    <div hidden={mode!=='file'}><div class={'dropzone'+(over?' over':'')}
      onDragOver={e=>{ e.preventDefault(); setOver(true); }}
      onDragLeave={()=>setOver(false)}
      onDrop={e=>{ e.preventDefault(); setOver(false); readFile(e.dataTransfer && e.dataTransfer.files[0]); }}>Drop a Room Planner export here<br/>
      <label class="btn sm">Choose file…<input type="file" accept="application/json,.json" hidden
        onChange={e=>readFile(e.currentTarget.files && e.currentTarget.files[0])}/></label></div>
      <p class="hint">{note}</p></div>
    <div hidden={mode!=='link'}><input type="url" id="lUrl" placeholder="https://…/items.json" ref={url}/>
      <p class="hint">Fetched fresh each time you open this listing. This is a flat <code>{'{"inventory":[...]}'}</code> file, not a full marketplace — for a browsable catalog, use "Add marketplace" instead.</p></div>
    <div hidden={mode!=='paste'}><textarea id="lPaste" placeholder='{"inventory":[ ... ]}' rows={6} ref={paste}/></div>
    <p class="hint">Any of these can be a full Room Planner export, or just <code>{'{"inventory":[…]}'}</code>. Adding it here doesn't touch your inventory — you grab items from it one at a time, or all at once, from inside the listing.</p>
  </>;
}

function addListingDialog(){
  openDialog({title: 'Add a listing', ok: 'Add', body: <AddListingBody/>});
}
export {addListingDialog};
