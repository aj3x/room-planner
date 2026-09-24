/* Ad hoc listing tiles.

   Extracted from index.html in Phase 3, move-only: the two functions below
   are byte-identical to what stood there, and the `export` block at the end
   is the only line added.

   The rest of the `ad hoc listings` banner -- renderAdhocFolder, listingMenu,
   moveListingDialog, addListingDialog, pendingFile and renderListingDetail --
   did not come: every one of them reaches renderLibAll or bindLibGrid, and is
   inside the Plan-panels/Library SCC.
*/
import {childMarketFolders, listingsInFolder} from './adhoc-folders.js';
import {svgI} from '../ui/modal.js';
import {esc, plural} from '../ui/panels.js';
import {sizeLabel} from '../canvas/draw.js';
import {normItem} from '../core/migrate.js';
import {S, clone, uid} from '../core/state.js';
import {save} from '../core/store.js';
import {libFlash} from '../ui/flash.js';
import {openMenu} from '../ui/menu.js';
import {$, askConfirm, moError, openModal} from '../ui/modal.js';
import {addMarketItemToInventory} from './add-to-inventory.js';
import {adhocCache, loadListing} from './adhoc-folders.js';
import {bindCrumbs, bindLibGrid, crumbsHTML} from './grid.js';
import {drawPreview, selectListing} from './marketplace.js';
import {nav} from './nav.js';
import {renderLibAll} from './shell.js';

function listingTile(l){
  const sub = l.kind==='link' ? 'Link' : (l.content&&Array.isArray(l.content.inventory) ? plural(l.content.inventory.length,'item') : 'File');
  return `<button type="button" class="tile" data-listing="${l.id}">
    <span class="more" data-act="more" title="More actions" aria-label="More actions">${svgI('more')}</span>
    <div class="thumb">${svgI(l.kind==='link'?'link':'box')}</div>
    <div class="body"><div class="nm" title="${esc(l.name)}">${esc(l.name)}</div><div class="dim">${esc(sub)}</div></div>
  </button>`;
}
function adhocFolderTile(f){
  const n=childMarketFolders(f.id).length, m=listingsInFolder(f.id).length;
  const bits=[]; if(n) bits.push(n+' folder'+(n>1?'s':'')); if(m) bits.push(m+' listing'+(m>1?'s':''));
  return `<button type="button" class="tile folder" data-openfolder="${f.id}">
    <div class="thumb">${svgI('folder')}</div>
    <div class="body"><div class="nm">${esc(f.name)}</div><div class="dim">${bits.length?esc(bits.join(', ')):'Empty'}</div></div>
  </button>`;
}

/* ---- Phase 3, the SCC commit: the rest of this file's region, which could
   not move until the whole 49-name component could. Move-only. ---- */
function renderAdhocFolder(box, folderId, standalone){
  const subs=childMarketFolders(folderId), listings=listingsInFolder(folderId);
  let html=standalone ? crumbsHTML('market', folderId) : `<div class="lib-section">Listings — one-off bundles from a file, link or pasted JSON</div>`;
  if(!subs.length && !listings.length){
    html+=`<div class="grid"><div class="empty">No listings yet.
      <div class="row"><button class="btn sm" data-addlisting-empty>Add listing…</button></div></div></div>`;
  } else {
    html+=`<div class="grid">${subs.map(adhocFolderTile).join('')}${listings.map(listingTile).join('')}</div>`;
  }
  let target=box;
  if(standalone){ box.innerHTML=html; }
  else { target=document.createElement('div'); target.innerHTML=html; box.appendChild(target); }
  bindCrumbs(target,'market');
  bindLibGrid(target,'market');
  const al=target.querySelector('[data-addlisting-empty]'); if(al) al.addEventListener('click', addListingDialog);
}
function listingMenu(id, anchor){
  const l=S.marketListings.find(x=>x.id===id); if(!l) return;
  openMenu(anchor, [
    {label:'Open', fn:()=>selectListing(id)},
    {label:'Move to folder…', fn:()=>moveListingDialog(l)},
    {sep:true},
    {label:'Delete…', danger:true, fn:()=>askConfirm('Delete this listing?', '“'+l.name+'” will be removed. Your library isn’t affected.', 'Delete', ()=>{
      S.marketListings=S.marketListings.filter(x=>x.id!==id);
      adhocCache.delete(id);
      if(nav.marketSelListingId===id) nav.marketSelListingId=null;
      save(); renderLibAll();
    })},
  ], l.name);
}
function moveListingDialog(l){
  const cur=l.parentId||'';
  let opts=`<option value="" ${cur?'':'selected'}>No folder (top level)</option>`;
  (function walk(pid,depth){
    for(const f of childMarketFolders(pid)){
      opts+=`<option value="${f.id}" ${f.id===cur?'selected':''}>${' '.repeat(depth)}${esc(f.name)}</option>`;
      walk(f.id,depth+1);
    }
  })(null,0);
  openModal('Move “'+l.name+'”', `<label class="stack-label">Folder</label>
    <select id="moFolder">${opts}</select>`, 'Move', ()=>{
      l.parentId=$('moFolder').value||null;
      save(); renderLibAll();
    });
}
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
        S.marketListings.push({id:uid(), name, parentId:nav.marketFolderId, kind:'link', url, addedAt:Date.now()});
        save(); renderLibAll();
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
      S.marketListings.push({id:uid(), name, parentId:nav.marketFolderId, kind:'file', content, addedAt:Date.now()});
      save(); renderLibAll();
    },
    ()=>{
      const tabs=[...document.querySelectorAll('.addmode-tabs button')];
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
        r.onload=()=>{ try{ pendingFile=JSON.parse(r.result); $('lFileNote').textContent='Loaded “'+file.name+'”'; if(!$('lName').value.trim()) $('lName').value=file.name.replace(/\.json$/i,''); }
          catch(e){ pendingFile=null; $('lFileNote').textContent='That file isn’t valid JSON.'; } };
        r.readAsText(file);
      }
      fileIn.addEventListener('change', ()=>readFile(fileIn.files[0]));
      dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', ()=>dz.classList.remove('over'));
      dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
    });
}
function renderListingDetail(box, id){
  const l=S.marketListings.find(x=>x.id===id);
  if(!l){ nav.marketSelListingId=null; return; }
  box.innerHTML = crumbsHTML('market', l.parentId) + `
    <div class="detail wide">
      <div class="dhead"><div class="grow"><h1>${esc(l.name)}</h1>
        <div class="dim">${l.kind==='link'?esc(l.url):'Uploaded file'}</div></div>
        <div class="row">
          <button class="btn sm danger" id="btnDelListing">Delete listing…</button>
          <button class="btn sm primary" id="btnAddAllListing">Add all to library</button>
        </div></div>
      <div id="listingBody"><div class="listing-status">Loading…</div></div>
    </div>`;
  bindCrumbs(box,'market');
  $('btnDelListing').addEventListener('click', ()=>{
    askConfirm('Delete this listing?', '“'+l.name+'” will be removed.', 'Delete', ()=>{
      S.marketListings=S.marketListings.filter(x=>x.id!==id);
      nav.marketSelListingId=null; save(); renderLibAll();
    });
  });
  loadListing(l).then(res=>{
    if(nav.marketSelListingId!==id) return;
    const body=$('listingBody'); if(!body) return;
    if(res.error){ body.innerHTML=`<p class="hint warn">${esc(res.error)}</p>`; return; }
    if(!res.items.length){ body.innerHTML=`<div class="empty">This listing has no items.</div>`; return; }
    body.innerHTML=`<div class="grid flush">${res.items.map(it=>`
      <div class="tile static">
        <div class="thumb"><canvas data-lprev="${esc(it.id)}"></canvas></div>
        <div class="body"><div class="nm" title="${esc(it.name)}">${esc(it.name)}</div>
          <div class="tile-foot"><span class="dim">${esc(sizeLabel(it))}</span>
          <button class="btn sm" data-addlisting="${esc(it.id)}">Add</button></div></div>
      </div>`).join('')}</div>`;
    body.querySelectorAll('canvas[data-lprev]').forEach(c=>{ const it=res.items.find(x=>x.id===c.dataset.lprev); if(it) drawPreview(c,it); });
    body.querySelectorAll('[data-addlisting]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const it=res.items.find(x=>x.id===b.dataset.addlisting);
        addMarketItemToInventory(it);
        b.textContent='Added'; b.classList.add('quiet'); b.disabled=true;
      });
    });
    $('btnAddAllListing').addEventListener('click', ()=>{
      for(const it of res.items) addMarketItemToInventory(it);
      libFlash('Added '+res.items.length+' item'+(res.items.length===1?'':'s')+' to your library');
      body.querySelectorAll('[data-addlisting]').forEach(b=>{ b.textContent='Added'; b.disabled=true; });
    });
  });
}
export {listingTile, adhocFolderTile, renderAdhocFolder, listingMenu, moveListingDialog, addListingDialog, renderListingDetail};
