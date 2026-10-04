/* Ad hoc listings: the add-a-listing dialog. Their views are
   market-views.jsx, their menus folder-menus.js. */
import {normItem} from '../../kernel/migrate.js';
import {S, clone, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {$, moError, openModal} from '../../ui-kit/modal.js';
import {nav} from './nav.js';

let pendingFile=null;
function addListingDialog(){
  pendingFile=null;
  openModal('Add a listing', `
    <div class="field"><label for="lName">Name</label><input type="text" id="lName" placeholder="A one-off bundle"></div>
    <div class="seg full addmode-tabs" role="group" aria-label="Source">
      <button type="button" data-lmode="file" aria-pressed="true">File</button>
      <button type="button" data-lmode="link" aria-pressed="false">Link</button>
      <button type="button" data-lmode="paste" aria-pressed="false">Paste JSON</button>
    </div>
    <div id="modeFile"><div class="dropzone" id="dropZone">Drop a Room Planner export here<br>
      <label class="btn sm">Choose file…<input type="file" id="lFile" accept="application/json,.json" hidden></label></div>
      <p class="hint" id="lFileNote"></p></div>
    <div id="modeLink" hidden><input type="url" id="lUrl" placeholder="https://…/items.json">
      <p class="hint">Fetched fresh each time you open this listing. This is a flat <code>{"inventory":[...]}</code> file, not a full marketplace — for a browsable catalog, use "Add marketplace" instead.</p></div>
    <div id="modePaste" hidden><textarea id="lPaste" placeholder='{"inventory":[ ... ]}' rows="6"></textarea></div>
    <p class="hint">Any of these can be a full Room Planner export, or just <code>{"inventory":[…]}</code>. Adding it here doesn't touch your inventory — you grab items from it one at a time, or all at once, from inside the listing.</p>`,
    'Add', ()=>{
      const name=($('lName').value||'').trim()||'Untitled listing';
      const mode=$('modeFile').hidden ? ($('modeLink').hidden?'paste':'link') : 'file';
      if(mode==='link'){
        const url=($('lUrl').value||'').trim();
        if(!/^https?:\/\//i.test(url)){ moError('Enter a valid http(s) link'); return false; }
        transact('lib', ()=>{ S.marketListings.push({id:uid(), name, parentId:nav.marketFolderId, kind:'link', url, addedAt:Date.now()}); });
        return;
      }
      let raw=null;
      if(mode==='paste'){
        try{ raw=JSON.parse($('lPaste').value); }catch(e){ moError('That is not valid JSON'); return false; }
      } else {
        raw=pendingFile;
      }
      if(!raw || !Array.isArray(raw.inventory)){ moError('That file doesn’t look like a Room Planner export — it needs an "inventory" array'); return false; }
      const content={inventory: raw.inventory.filter(i=>i&&typeof i==='object'&&i.shape).map(i=>normItem(clone(i)))};
      transact('lib', ()=>{ S.marketListings.push({id:uid(), name, parentId:nav.marketFolderId, kind:'file', content, addedAt:Date.now()}); });
    },
    ()=>{
      const tabs=[.../** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('.addmode-tabs button'))];
      tabs.forEach(b=>b.addEventListener('click', ()=>{
        tabs.forEach(x=>x.setAttribute('aria-pressed', String(x===b)));
        $('modeFile').hidden = b.dataset.lmode!=='file';
        $('modeLink').hidden = b.dataset.lmode!=='link';
        $('modePaste').hidden = b.dataset.lmode!=='paste';
      }));
      const dz=$('dropZone'), fileIn=$('lFile');
      function readFile(file){
        if(!file) return;
        const r=new FileReader();
        r.onload=()=>{ try{ pendingFile=JSON.parse(/** @type {string} */(r.result)); $('lFileNote').textContent='Loaded “'+file.name+'”'; if(!$('lName').value.trim()) $('lName').value=file.name.replace(/\.json$/i,''); }
          catch(e){ pendingFile=null; $('lFileNote').textContent='That file isn’t valid JSON.'; } };
        r.readAsText(file);
      }
      fileIn.addEventListener('change', ()=>readFile(fileIn.files[0]));
      dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', ()=>dz.classList.remove('over'));
      dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
    });
}
export {addListingDialog};
