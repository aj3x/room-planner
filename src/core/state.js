/* State. The single mutable object the whole app reads, plus the blank shapes it
   starts from. A leaf: this module imports nothing.

   Extracted from index.html in Phase 3. The code below is byte-identical to
   what stood there — including `setS`, which landed in index.html in its own
   commit first precisely so this one could stay a move. The only line added is
   the `export` block at the end.

   `S.active = S.layouts[0].id;` is a top-level statement, and stays one: it is
   part of initialising this module's own state, the same as the object literal
   above it. Nothing here reaches outside the module at import time.

   The selection lets (sel, selSet, roomSel, floorSel, mergeSel, the guide
   arrays, treeOpen) did NOT come along. They are reassigned from dozens of
   sites all over the monolith and would each need the setS treatment; that is a
   decision for a later phase, not a move. */

/* ------------------------- state ------------------------- */
const PALETTE=['#6e8b7a','#a8735a','#5c7a99','#b8975a','#8a6e96','#4f6b63','#a55b57','#7e8c99','#6b7f4e','#9c6b8e','#57707d','#8c8577'];
const uid = () => Math.random().toString(36).slice(2,10);
const clone = v => JSON.parse(JSON.stringify(v));
const rectPts = (w,d) => [[0,0],[w,0],[w,d],[0,d]];

function blankFloorPlace(){ return {x:0, y:0, rot:0}; }
function blankLayout(name,folderId){
  return {id:uid(), name:name||'My room', folderId:folderId||null,
    floorId:null, floorPlace:blankFloorPlace(),
    room:{points:rectPts(4270,3660), wall:114, floor:'#f5f3ee', trimOn:false, trim:19, pillars:[], iwalls:[]},
    openings:[], placed:[], measures:[]};
}
let S = {unit:'ftin', snap:'25.4', showSwing:true, showDims:true, showOpen:true, showWalk:false, showMeasure:true, mode:'furniture',
         planMode:'furniture', // the Room/Furniture mode to go back to when returning to the Plan screen
         inventory:[], layouts:[blankLayout()], active:null,
         folders:[],          // {id, name, parentId(null=root), tags:[...]}
         floors:[],           // {id, name, parentId(null=root)} — an arrangement of rooms; see l.floorId / l.floorPlace
         tagFilter:[],        // active tag chips in the Things pane
         untaggedOnly:false,  // the "Untagged" chip in the Things pane
         invSearch:'',        // search text in the Things pane
         onlyAvailable:false, // "only show things I still have stock of"
         invScope:'project',  // how far a thing's stock reaches: 'project' | 'folder' | 'room'
         zoomSpeed:1,         // trackpad/wheel zoom speed multiplier
         leftOpen:true, rightOpen:true,  // side panels open on wide screens
         secClosed:[],        // data-sec keys of the sections folded shut
         lastFolderId:undefined,
         itemFolders:[],       // Inventory tab folder tree: {id, name, parentId, tags:[...]}
         marketFolders:[],     // Marketplace tab folder tree, for ad hoc listings only
         marketListings:[],    // ad hoc listings: {id, name, parentId, kind:'file'|'link'|'paste', ...}
         marketSubs:[],        // subscribed remote marketplaces: {id, url, name, version, addedAt}
         defaultMarketDismissed:false, // user removed the built-in default marketplace subscription; don't re-add it
         uiLib:{tab:'library', libFolderId:null, marketFolderId:null}};
S.active = S.layouts[0].id;
/* S is reassigned wholesale on load and on import. Once it lives in a module
   of its own those writers cannot assign to it — an imported binding is
   read-only — so every write goes through this setter instead. The binding is
   still live: importers see the new object, which is what migrate() relies on
   when reconcileTags reads S.itemFolders. */
function setS(v){ S = v; }

/* The accessors that read S. Moved here after S itself: they are pure lookups
   over the state object, they need nothing else, and core/floor-space.js could
   not move without them. Byte-identical to index.html; §3 did not name a file
   for this block. */
const L = () => S.layouts.find(l=>l.id===S.active) || S.layouts[0];
const RP = () => L().room.points;
const itemOf = id => S.inventory.find(i=>i.id===id);
const instOf = id => L().placed.find(p=>p.id===id);
const openOf = id => L().openings.find(o=>o.id===id);
const roomMode = () => S.mode==='room';
const furnMode = () => S.mode==='furniture';
const floorMode = () => S.mode==='floor';
const folderOf = id => id ? S.folders.find(f=>f.id===id) : null;
const childFolders = pid => S.folders.filter(f=>(f.parentId||null)===(pid||null));
const childLayouts = pid => S.layouts.filter(l=>(l.folderId||null)===(pid||null));
const floorOf = id => id ? S.floors.find(f=>f.id===id) : null;
const childFloors = pid => S.floors.filter(f=>(f.parentId||null)===(pid||null));
/* rooms standing on a floor, in S.layouts order — that order is also their z-order */
const floorLayouts = fid => fid ? S.layouts.filter(l=>l.floorId===fid) : [];

export {PALETTE, uid, clone, rectPts, blankFloorPlace, blankLayout, S, setS,
        L, RP, itemOf, instOf, openOf, roomMode, furnMode, floorMode,
        folderOf, childFolders, childLayouts, floorOf, childFloors, floorLayouts};
