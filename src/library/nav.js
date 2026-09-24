/* The Library/Marketplace UI's nav state -- which tab, which folder, what is
   selected. Not persisted, except the tab and folder, which are mirrored into
   S.uiLib by goLibFolder.

   Extracted from index.html in Phase 3, move-only: the body below is
   byte-identical to what stood there, and the `export` block at the end is
   the only line added.

   A leaf that imports nothing, per rule 5. Neither binding is ever
   reassigned -- both are mutated in place -- so neither needed a setter.

   goLibFolder, the third declaration under this banner, did not come: it
   calls renderLibAll and is inside the Plan-panels/Library SCC.
*/

/* ------------------------- nav state (not persisted, except tab + folder) ------------------------- */
let nav={tab:'library', libFolderId:null, marketFolderId:null, searching:false,
  marketSubId:null, subPath:null, marketSelItemId:null, marketSelListingId:null, marketTagFilter:null, showMarketContents:false};
let libTreeOpen=new Set();
export {nav, libTreeOpen};
