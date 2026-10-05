// @ts-check
/* State. The single mutable object the whole app reads, plus the blank shapes it
   starts from. A leaf: this module imports nothing.

   `S.active = S.layouts[0].id;` is a top-level statement, and stays one: it is
   part of initialising this module's own state, the same as the object literal
   above it. Nothing here reaches outside the module at import time. */

/* ------------------------- state ------------------------- */
const PALETTE=['#6e8b7a','#a8735a','#5c7a99','#b8975a','#8a6e96','#4f6b63','#a55b57','#7e8c99','#6b7f4e','#9c6b8e','#57707d','#8c8577'];
/** @typedef {import('./types.js').State} State */
/** @typedef {import('./types.js').Layout} Layout */
/** @typedef {import('./types.js').Pt} Pt */

/** @returns {string} */
const uid = () => Math.random().toString(36).slice(2,10);
/** @type {<T>(v: T) => T} */
const clone = v => JSON.parse(JSON.stringify(v));
/** @type {(w: number, d: number) => Pt[]} */
const rectPts = (w,d) => [[0,0],[w,0],[w,d],[0,d]];

/** @returns {import('./types.js').FloorPlace} */
function blankFloorPlace(){ return {x:0, y:0, rot:0}; }
/** @param {string} [name] @param {string|null} [folderId] @returns {Layout} */
function blankLayout(name,folderId){
  return {id:uid(), name:name||'My room', folderId:folderId||null,
    floorId:null, floorPlace:blankFloorPlace(),
    room:{points:rectPts(4270,3660), wall:114, floor:'#f5f3ee', trimOn:false, trim:19, pillars:[], iwalls:[]},
    openings:[], placed:[], measures:[]};
}
/** @type {State} */
let S = {unit:'ftin', snap:'25.4', showSwing:true, showDims:true, showOpen:true, showWalk:false, showMeasure:true, mode:'furniture',
         planMode:'furniture', // the Room/Furniture mode to go back to when returning to the Plan screen
         inventory:[], layouts:[blankLayout()], active:'',   // set just below
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
/* S is reassigned wholesale on load and on import, and an imported binding is
   read-only, so every such write goes through this setter. The binding is
   still live: importers see the new object, which is what migrate() relies on
   when reconcileTags reads S.itemFolders. */
/** @param {State} v */
function setS(v){ S = v; }

/* The accessors that read S: pure lookups over the state object. */
/** @type {() => Layout} */
const L = () => S.layouts.find(l=>l.id===S.active) || S.layouts[0];
const RP = () => L().room.points;
/** @param {string|null|undefined} id */
const itemOf = id => S.inventory.find(i=>i.id===id);
/** @param {string|null|undefined} id */
const instOf = id => L().placed.find(p=>p.id===id);
/** @param {string|null|undefined} id */
const openOf = id => L().openings.find(o=>o.id===id);
const roomMode = () => S.mode==='room';
const furnMode = () => S.mode==='furniture';
const floorMode = () => S.mode==='floor';
/** @param {string|null|undefined} id */
const folderOf = id => id ? S.folders.find(f=>f.id===id) : null;
/** @param {string|null|undefined} pid */
const childFolders = pid => S.folders.filter(f=>(f.parentId||null)===(pid||null));
/** @param {string|null|undefined} pid */
const childLayouts = pid => S.layouts.filter(l=>(l.folderId||null)===(pid||null));
/** @param {string|null|undefined} id */
const floorOf = id => id ? S.floors.find(f=>f.id===id) : null;
/** @param {string|null|undefined} pid */
const childFloors = pid => S.floors.filter(f=>(f.parentId||null)===(pid||null));
/* rooms standing on a floor, in S.layouts order — that order is also their z-order */
/** @param {string|null|undefined} fid */
const floorLayouts = fid => fid ? S.layouts.filter(l=>l.floorId===fid) : [];

/** @param {unknown} m @returns {m is import('./types.js').CanvasMode} */
const isCanvasMode = m => m==='room'||m==='furniture'||m==='floor';
export {PALETTE, uid, clone, rectPts, blankFloorPlace, blankLayout, S, setS,
        L, RP, itemOf, instOf, openOf, roomMode, furnMode, floorMode,
        folderOf, childFolders, childLayouts, floorOf, childFloors, floorLayouts, isCanvasMode};
