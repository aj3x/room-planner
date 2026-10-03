// @ts-check
/* Storage. Store wraps window.storage when the host provides one and falls back
   to localStorage; save() debounces. Loading old data is migrate.js's job. */

import {S} from './state.js';

/* ------------------------- storage ------------------------- */
const KEY='room-planner:v2';
const Store=(()=>{
  const api=(typeof window!=='undefined'&&window.storage&&typeof window.storage.get==='function')?window.storage:null;
  /** @type {Record<string, string>} */
  const mem={};
  return {
    /** @param {string} k @returns {Promise<string|null>} */
    async get(k){
      if(api){ try{ const r=await api.get(k); if(r&&r.value!==undefined) return r.value; }catch(e){} }
      try{ const v=localStorage.getItem(k); if(v!==null) return v; }catch(e){}
      return mem[k]??null;
    },
    /** @param {string} k @param {string} v */
    async set(k,v){
      mem[k]=v;
      if(api){ try{ await api.set(k,v); return; }catch(e){} }
      try{ localStorage.setItem(k,v); }catch(e){}
    }
  };
})();
/** @type {ReturnType<typeof setTimeout>|undefined} */
let saveT;
function save(){ clearTimeout(saveT); saveT=setTimeout(()=>Store.set(KEY,JSON.stringify(S)),350); }

export {KEY, Store, save};
