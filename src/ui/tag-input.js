/* Tag input: chips plus autocomplete.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. See the note in ui/modal.js about the cycle between the two
   — it is why they landed in one commit. */

import {S} from '../core/state.js';
import {esc} from './panels.js';
import {$} from './modal.js';

/* ------------------------- tag input: chips + autocomplete -------------------------
   Tags are shown as chips, the way they read elsewhere in the app. Tab or comma
   commits what you typed (or the highlighted suggestion); backspace on an empty
   box removes the whole chip before the caret, not one letter of it. */
const tagInputs = new Map();                 // field id -> () => string[]
function tagSuggestions(){
  const s=new Set();
  for(const it of S.inventory) for(const t of (it.tags||[])) s.add(t);
  for(const f of S.folders) for(const t of (f.tags||[])) s.add(t);
  return [...s].sort((a,b)=>a.localeCompare(b));
}
function tagFieldHTML(id, placeholder){
  return `<div class="tagfield" id="${id}">
    <div class="taginput"><input type="text" id="${id}Input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(placeholder||'')}"></div>
    <div class="tagsuggest" role="listbox" hidden></div>
  </div>`;
}
/* mount after openModal has put the HTML in place; read the value with tagFieldValue(id) */
function mountTagField(id, tags){
  const root=$(id), box=root.querySelector('.taginput'),
        inp=box.querySelector('input'), sug=root.querySelector('.tagsuggest');
  const list=(tags||[]).slice();
  let items=[], idx=-1;

  const has = v => list.some(t=>t.toLowerCase()===v.toLowerCase());
  function renderChips(){
    for(const el of [...box.querySelectorAll('.tag')]) el.remove();
    list.forEach((t,i)=>{
      const el=document.createElement('span');
      el.className='tag';
      el.innerHTML=`<span>${esc(t)}</span><button type="button" tabindex="-1" aria-label="Remove ${esc(t)}">×</button>`;
      el.querySelector('button').addEventListener('click', ev=>{
        ev.stopPropagation(); list.splice(i,1); renderChips(); refresh(); inp.focus();
      });
      box.insertBefore(el, inp);
    });
  }
  function commit(text){
    const v=String(text==null?inp.value:text).trim();
    inp.value='';
    if(!v) return false;
    if(!has(v)) list.push(v);
    renderChips(); refresh(); return true;
  }
  function drawSug(){
    if(!items.length){ sug.hidden=true; sug.innerHTML=''; return; }
    sug.innerHTML=items.map((t,i)=>`<button type="button" role="option" data-i="${i}" aria-selected="${i===idx}">${esc(t)}</button>`).join('');
    sug.hidden=false;
    if(idx>=0){ const b=sug.children[idx]; if(b) b.scrollIntoView({block:'nearest'}); }
  }
  function refresh(){
    if(document.activeElement!==inp){ items=[]; idx=-1; drawSug(); return; }
    const q=inp.value.trim().toLowerCase();
    let all=tagSuggestions().filter(t=>!has(t));
    if(q) all=all.filter(t=>t.toLowerCase().includes(q))
                 .sort((a,b)=> a.toLowerCase().indexOf(q)-b.toLowerCase().indexOf(q) || a.localeCompare(b));  // prefix matches first
    items=all.slice(0,8);
    // pre-highlight only a true prefix match, so a new tag that merely contains an
    // existing one ("sofa bed" vs "sofa") isn't swapped out from under you
    idx = (q && items.length && items[0].toLowerCase().startsWith(q)) ? 0 : -1;
    drawSug();
  }
  const pick = i => { if(items[i]!=null) commit(items[i]); inp.focus(); };

  // clicks anywhere in the box (gaps, chips, the × button) keep the caret in the input,
  // so a chip is never re-rendered out from under the click that was removing it
  box.addEventListener('mousedown', e=>{ if(e.target!==inp){ e.preventDefault(); inp.focus(); } });
  sug.addEventListener('mousedown', e=>e.preventDefault());   // keep focus in the input
  sug.addEventListener('click', e=>{
    const b=e.target.closest('button[data-i]'); if(b) pick(+b.dataset.i);
  });
  inp.addEventListener('input', refresh);
  inp.addEventListener('focus', ()=>{ box.classList.add('on'); refresh(); });
  inp.addEventListener('blur', ()=>{ box.classList.remove('on'); commit(); items=[]; idx=-1; drawSug(); });
  inp.addEventListener('keydown', e=>{
    const k=e.key, typed=inp.value.trim(), hot=(idx>=0&&items[idx]!=null)?items[idx]:null;
    if(k===','){ e.preventDefault(); commit(hot&&!typed?hot:null); return; }
    if(k==='Tab'){
      if(hot){ e.preventDefault(); commit(hot); return; }
      if(typed){ e.preventDefault(); commit(); return; }
      return;                                   // empty: let focus move on
    }
    if(k==='Enter'){
      if(hot||typed){ e.preventDefault(); e.stopPropagation(); commit(hot||null); }
      return;                                   // empty: the modal's Enter saves
    }
    if(k==='Backspace' && !inp.value){
      if(list.length){ e.preventDefault(); list.pop(); renderChips(); refresh(); }
      return;
    }
    if((k==='ArrowDown'||k==='ArrowUp') && items.length){
      e.preventDefault();
      idx = k==='ArrowDown' ? (idx+1)%items.length : (idx<=0?items.length-1:idx-1);
      drawSug(); return;
    }
    if(k==='Escape' && !sug.hidden){ e.stopPropagation(); items=[]; idx=-1; drawSug(); }
  });

  renderChips();
  tagInputs.set(id, ()=>{
    const out=list.slice(), pending=inp.value.trim();
    if(pending && !out.some(t=>t.toLowerCase()===pending.toLowerCase())) out.push(pending);
    return out;
  });
  return inp;
}
const tagFieldValue = id => (tagInputs.get(id)||(()=>[]))();

export {tagInputs, tagSuggestions, tagFieldHTML, mountTagField, tagFieldValue};
