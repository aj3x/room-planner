/* Adding a marketplace item to the library: the three collision cases of
   MARKET_SCHEMA.md §4.

   Extracted from index.html in Phase 3 as part of the 49-name SCC commit,
   move-only.
*/
import {idParts} from '../../kernel/ids.js';
import {normItem} from '../../kernel/migrate.js';
import {S, clone} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {libFlash} from '../../ui-kit/flash.js';
import {openModal} from '../../ui-kit/modal.js';
import {esc} from '../../ui-kit/panels.js';
import {applyTags, ensureItemFolderPath} from './item-folders.js';

/* ------------------------- add to inventory: the 3 collision cases (MARKET_SCHEMA.md §4) ------------------------- */
function itemsDeepEqual(a,b){
  const strip=o=>{ const c=clone(o); delete c.folderId; delete c.manualTags; return c; };
  return JSON.stringify(strip(a))===JSON.stringify(strip(b));
}
function addMarketItemToInventory(raw){
  const incoming=normItem(clone(raw));
  const existing=S.inventory.find(x=>x.id===incoming.id);
  if(existing){
    if(itemsDeepEqual(existing, incoming)){ libFlash('You already have this'); return; }
    openModal('Already in your library', `
      <p>You already have <code>${esc(incoming.id)}</code>, but this copy is different.</p>
      <p class="hint">Taking theirs replaces your copy's shape, colour and other fields, but keeps the same id — anywhere you've placed it keeps its spot, now with the new geometry.</p>`,
      'Take theirs', ()=>{
        const folderId=existing.folderId, manualTags=existing.manualTags;
        transact('lib', ()=>{ Object.assign(existing, incoming, {id:existing.id, folderId, manualTags}); applyTags(existing); });
        libFlash('Replaced your copy');
      });
    return;
  }
  const sameName=S.inventory.find(x=>x.name===incoming.name);
  transact('lib', ()=>{
    const parts=idParts(incoming.id); parts.pop();   // drop the leaf, keep the folder path
    incoming.folderId=parts.length ? ensureItemFolderPath(parts) : null;
    incoming.manualTags=(incoming.tags||[]).slice();
    applyTags(incoming);
    S.inventory.push(incoming);
  });
  libFlash(sameName ? 'Added — you also have another "'+incoming.name+'" under a different id' : 'Added to your library');
}
export {itemsDeepEqual, addMarketItemToInventory};
