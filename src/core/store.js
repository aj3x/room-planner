/* Storage. Store wraps window.storage when the host provides one and falls back
   to localStorage; save() debounces.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   migrate/normLayout/normItem, which §3 also files here, did NOT come along:
   migrate calls reconcileTags(), which lives in the Inventory tab's folder tree
   (library/item-folders.js) and has not moved. They follow once it has. */

import {S} from './state.js';

/* ------------------------- storage ------------------------- */
const KEY='room-planner:v2';
const Store=(()=>{
  const api=(typeof window!=='undefined'&&window.storage&&typeof window.storage.get==='function')?window.storage:null;
  const mem={};
  return {
    async get(k){
      if(api){ try{ const r=await api.get(k); if(r&&r.value!==undefined) return r.value; }catch(e){} }
      try{ const v=localStorage.getItem(k); if(v!==null) return v; }catch(e){}
      return mem[k]??null;
    },
    async set(k,v){
      mem[k]=v;
      if(api){ try{ await api.set(k,v); return; }catch(e){} }
      try{ localStorage.setItem(k,v); }catch(e){}
    }
  };
})();
let saveT=null;
function save(){ clearTimeout(saveT); saveT=setTimeout(()=>Store.set(KEY,JSON.stringify(S)),350); }

export {KEY, Store, save};
