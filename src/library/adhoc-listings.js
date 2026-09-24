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
export {listingTile, adhocFolderTile};
