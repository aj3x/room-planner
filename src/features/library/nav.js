// @ts-check
/* The Library/Marketplace page's browsing state -- which tab, which folder,
   what is selected, which tile is being dragged -- and the two moves that
   change it. Not persisted, except the tab and folder, which goLibFolder
   mirrors into S.uiLib through a prefs commit (the page is an effect on it).
   Everything else that browses changes `nav` and calls navChanged(); the
   content (router.js) is an effect on navRev (shell.js), so the views that
   browse need not import the router that imports them. */
import {S} from '../../kernel/state.js';
import {signal} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {$} from '../../ui-kit/modal.js';

/* ------------------------- nav state (not persisted, except tab + folder) ------------------------- */
/** Where the Library and Marketplace are browsing. Not saved and not a signal: navigation repaints by hand.
    @typedef {{tab: string, libFolderId: string|null, marketFolderId: string|null, searching: boolean,
      marketSubId: string|null, subPath: string|null, marketSelItemId: string|null, marketSelListingId: string|null,
      marketTagFilter: string|null, showMarketContents: boolean}} Nav */
/** @type {Nav} */
let nav={tab:'library', libFolderId:null, marketFolderId:null, searching:false,
  marketSubId:null, subPath:null, marketSelItemId:null, marketSelListingId:null, marketTagFilter:null, showMarketContents:false};
/** @type {Set<string>} */
let libTreeOpen=new Set();
/** @type {string|null} the item id being dragged out of the grid */
let gridDragItem=null;
/** @param {string|null} v */
function setGridDragItem(v){ gridDragItem = v; }

const navRev = signal(0);
function navChanged(){ navRev.value++; }

/** @param {'library'|'market'} kind @param {string|null} id */
function goLibFolder(kind,id){
  transact('prefs', ()=>{
    if(kind==='library'){ nav.libFolderId=id; S.uiLib.libFolderId=id; }
    else { nav.marketFolderId=id; S.uiLib.marketFolderId=id; nav.marketSubId=null; nav.subPath=null; nav.marketSelListingId=null; }
    nav.searching=false; $('searchBox').value='';
  }, {canvas:false});
}
/** @param {string|null} id */
function selectListing(id){ nav.marketSelListingId=id; navChanged(); }

export {nav, libTreeOpen, gridDragItem, setGridDragItem, navRev, navChanged, goLibFolder, selectListing};
