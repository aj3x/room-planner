// @ts-check
/* Tag input: chips plus autocomplete.

   Tags are shown as chips, the way they read elsewhere in the app. Tab or
   comma commits what you typed (or the highlighted suggestion); backspace on
   an empty box removes the whole chip before the caret, not one letter of
   it. The suggestions are every tag in use. */
import {useLayoutEffect, useReducer, useRef} from 'preact/hooks';
import {S} from '../kernel/state.js';

/** @returns {string[]} every tag in use, sorted */
function tagSuggestions(){
  /** @type {Set<string>} */
  const s=new Set();
  for(const it of S.inventory) for(const t of (it.tags||[])) s.add(t);
  for(const f of S.folders) for(const t of (f.tags||[])) s.add(t);
  return [...s].sort((a,b)=>a.localeCompare(b));
}

/** What a dialog's OK reads the field through: its tags, plus whatever is
    typed and not yet committed. @typedef {{current: (() => string[])|null}} TagRead */

/** The field. `initialTags` seeds it once; from then on it is the user's,
    and `read.current()` is its value. The text box's id is `id+'Input'`,
    for a <label for>.
    @param {{id: string, initialTags: string[], placeholder?: string, read: TagRead}} p */
function TagField({id, initialTags, placeholder, read}){
  /* The field's model is plain mutable state, the way the keyboard handling
     below reasons about it (commit, then refresh the suggestions against the
     new list); `paint` re-renders after each change. */
  const m = useRef(/** @type {{list: string[], items: string[], idx: number, on: boolean}|null} */(null));
  if(!m.current) m.current = {list: initialTags.slice(), items: [], idx: -1, on: false};
  const st = m.current;
  const [, paint] = useReducer(/** @param {number} n */ n => n+1, 0);
  const inpRef = useRef(/** @type {HTMLInputElement|null} */(null));
  const sugRef = useRef(/** @type {HTMLDivElement|null} */(null));
  const inp = () => /** @type {HTMLInputElement} */(inpRef.current);   // rendered below

  read.current = () => {
    const out=st.list.slice(), pending=(inpRef.current ? inpRef.current.value : '').trim();
    if(pending && !out.some(t=>t.toLowerCase()===pending.toLowerCase())) out.push(pending);
    return out;
  };
  /* the highlighted suggestion stays in view */
  useLayoutEffect(() => {
    const sug=sugRef.current;
    if(sug && st.idx>=0){ const b=sug.children[st.idx]; if(b) b.scrollIntoView({block:'nearest'}); }
  });

  const has = (/** @type {string} */v) => st.list.some(t=>t.toLowerCase()===v.toLowerCase());
  /** @param {string|null} [text] what to add; the typed text when absent */
  function commit(text){
    const v=String(text==null?inp().value:text).trim();
    inp().value='';
    if(!v) return false;
    if(!has(v)) st.list.push(v);
    refresh(); return true;
  }
  function refresh(){
    if(document.activeElement!==inp()){ st.items=[]; st.idx=-1; paint(0); return; }
    const q=inp().value.trim().toLowerCase();
    let all=tagSuggestions().filter(t=>!has(t));
    if(q) all=all.filter(t=>t.toLowerCase().includes(q))
                 .sort((a,b)=> a.toLowerCase().indexOf(q)-b.toLowerCase().indexOf(q) || a.localeCompare(b));  // prefix matches first
    st.items=all.slice(0,8);
    // pre-highlight only a true prefix match, so a new tag that merely contains an
    // existing one ("sofa bed" vs "sofa") isn't swapped out from under you
    st.idx = (q && st.items.length && st.items[0].toLowerCase().startsWith(q)) ? 0 : -1;
    paint(0);
  }
  const pick = (/** @type {number} */i) => { if(st.items[i]!=null) commit(st.items[i]); inp().focus(); };

  /** @param {KeyboardEvent} e */
  function onKeyDown(e){
    const k=e.key, typed=inp().value.trim(), hot=(st.idx>=0&&st.items[st.idx]!=null)?st.items[st.idx]:null;
    if(k===','){ e.preventDefault(); commit(hot&&!typed?hot:null); return; }
    if(k==='Tab'){
      if(hot){ e.preventDefault(); commit(hot); return; }
      if(typed){ e.preventDefault(); commit(); return; }
      return;                                   // empty: let focus move on
    }
    if(k==='Enter'){
      if(hot||typed){ e.preventDefault(); e.stopPropagation(); commit(hot||null); }
      return;                                   // empty: the dialog's Enter is OK
    }
    if(k==='Backspace' && !inp().value){
      if(st.list.length){ e.preventDefault(); st.list.pop(); refresh(); }
      return;
    }
    if((k==='ArrowDown'||k==='ArrowUp') && st.items.length){
      e.preventDefault();
      st.idx = k==='ArrowDown' ? (st.idx+1)%st.items.length : (st.idx<=0?st.items.length-1:st.idx-1);
      paint(0); return;
    }
    if(k==='Escape' && st.items.length){ e.stopPropagation(); st.items=[]; st.idx=-1; paint(0); }
  }

  return <div class="tagfield" id={id}>
    {/* clicks anywhere in the box (gaps, chips, the × button) keep the caret in the input,
        so a chip is never re-rendered out from under the click that was removing it */}
    <div class={'taginput'+(st.on?' on':'')} onMouseDown={e=>{ if(e.target!==inpRef.current){ e.preventDefault(); inp().focus(); } }}>
      {st.list.map((t,i)=><span class="tag" key={t}><span>{t}</span><button type="button" tabIndex={-1} aria-label={'Remove '+t}
        onClick={ev=>{ ev.stopPropagation(); st.list.splice(i,1); refresh(); inp().focus(); }}>×</button></span>)}
      <input type="text" id={id+'Input'} ref={inpRef} autocomplete="off" autocapitalize="none" spellcheck={false} placeholder={placeholder||''}
        onInput={refresh}
        onFocus={()=>{ st.on=true; refresh(); }}
        onBlur={()=>{ st.on=false; commit(); st.items=[]; st.idx=-1; paint(0); }}
        onKeyDown={onKeyDown}/>
    </div>
    <div class="tagsuggest" role="listbox" ref={sugRef} hidden={!st.items.length}
      onMouseDown={e=>e.preventDefault()}>{/* keep focus in the input */}
      {st.items.map((t,i)=><button type="button" role="option" key={t} aria-selected={i===st.idx} onClick={()=>pick(i)}>{t}</button>)}
    </div>
  </div>;
}

export {TagField};
