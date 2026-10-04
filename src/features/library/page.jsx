// @ts-check
/* The Library/Marketplace page (#paneLibrary), as a component: the title,
   the search box, the toolbar and the folder tree on the left, and on the
   right the view `nav` names (router: Content below).

   The page reads the library, the project, the settings and navRev while it
   renders, so it re-renders on every library, project or settings commit
   (setMode() into a Library place is a prefs commit, so it paints on
   arrival) and on every navChanged(); the views under it subscribe to
   nothing of their own and follow it. While a Plan mode is showing it
   renders nothing new: it hands back what it last rendered, which Preact
   leaves alone, so a hidden page neither repaints nor fetches. Typing in
   the search box shows at once; what it finds follows a moment later.

   mountLibraryPage() is called by the page's partial (pane-library.html)
   with the element it fills. */
import {useRef} from 'preact/hooks';
import {S, isCanvasMode, uid} from '../../kernel/state.js';
import {loaded, rev} from '../../kernel/signals.js';
import {transact} from '../../kernel/tx.js';
import {mountComponent} from '../../ui-kit/component.js';
import {askText} from '../../ui-kit/modal.js';
import {Icon} from '../../ui-kit/parts.jsx';
import {addListingDialog} from './adhoc-listings.js';
import {askNewLibFolder} from './folder-menus.js';
import {createLibItem} from './grid.js';
import {LibrarySearch, LibraryFolder} from './lib-grid.jsx';
import {LibTree} from './lib-tree.jsx';
import {AdhocFolder, ListingDetail, MarketSearch, MarketSub, MarketTop} from './market-views.jsx';
import {addMarketDialog} from './marketplace.js';
import {libQuery, libTreeOpen, nav, navChanged, navRev} from './nav.js';

/** @type {ReturnType<typeof setTimeout>|undefined} */
let searchT;

/** @param {{placeholder: string}} p */
function SearchBox({placeholder}){
  return <div class="search"><Icon name="search"/><input type="text" placeholder={placeholder} aria-label={placeholder} value={libQuery.value}
    onInput={e=>{
      const q=e.currentTarget.value;
      libQuery.value=q;
      clearTimeout(searchT);
      searchT=setTimeout(()=>{ nav.searching=!!q.trim(); navChanged(); }, 120);
    }}/></div>;
}

function newLibFolder(){
  askNewLibFolder('New folder', (n,tags)=>{
    transact('lib', ()=>{
      S.itemFolders.push({id:uid(),name:n,parentId:nav.libFolderId,tags});
      if(nav.libFolderId) libTreeOpen.add(nav.libFolderId);
    });
  });
}
function newMarketFolder(){
  askText('New folder','Name','Folder', n=>{
    transact('lib', ()=>{
      S.marketFolders.push({id:uid(),name:n,parentId:nav.marketFolderId});
      if(nav.marketFolderId) libTreeOpen.add('m:'+nav.marketFolderId);
    });
  });
}

/** @param {{lib: boolean}} p */
function Tools({lib}){
  return lib ? <>
    <button class="btn sm primary" onClick={createLibItem}><Icon name="plus"/>New item</button>
    <button class="btn sm" onClick={newLibFolder}><Icon name="folder-plus"/>New folder</button>
  </> : <>
    <button class="btn sm primary" onClick={addMarketDialog}><Icon name="plus"/>Add marketplace…</button>
    <button class="btn sm" onClick={addListingDialog}>Add listing…</button>
    <button class="btn sm icon" title="New folder for listings" aria-label="New folder for listings" onClick={newMarketFolder}><Icon name="folder-plus"/></button>
  </>;
}

/* ------------------------- main content router ------------------------- */
/** @param {{epoch: number}} p */
function Content({epoch}){
  // a marketplace subscription owns search/filter within itself (scoped to the folder you're
  // browsing there), so route to it before the generic search view even while nav.searching is set
  if(nav.tab==='market' && nav.marketSubId){
    const sub=S.marketSubs.find(s=>s.id===nav.marketSubId);
    if(sub) return <MarketSub key={sub.id} sub={sub} epoch={epoch} q={nav.searching ? libQuery.peek().trim().toLowerCase() : ''}/>;
    nav.marketSubId=null;
  }
  const q=libQuery.peek().trim();
  if(nav.searching) return nav.tab==='library' ? <LibrarySearch q={q} epoch={epoch}/> : <MarketSearch q={q}/>;
  if(nav.tab==='library') return <LibraryFolder folderId={nav.libFolderId} epoch={epoch}/>;
  if(nav.marketSelListingId){
    const l=S.marketListings.find(x=>x.id===nav.marketSelListingId);
    if(l) return <ListingDetail key={l.id} l={l} epoch={epoch}/>;
    nav.marketSelListingId=null;
  }
  if(nav.marketFolderId!=null) return <AdhocFolder folderId={nav.marketFolderId} standalone/>;
  return <><MarketTop epoch={epoch}/><AdhocFolder folderId={null}/></>;
}

function LibraryPage(){
  rev.lib.value; rev.prefs.value; rev.project.value; navRev.value;
  const ready=loaded.value;
  const shown=useRef(/** @type {import('preact').VNode|null} */(null)), epoch=useRef(0);
  if(!ready || isCanvasMode(S.mode)){
    if(shown.current) return shown.current;
    return <>
      <div class="lib-left">
        <h2 class="lib-title">Library</h2>
        <div class="expl-top"><div class="search"><Icon name="search"/><input type="text" placeholder="Search" aria-label="Search"/></div></div>
        <div class="expl-tools"></div>
        <div class="lib-tree"></div>
      </div>
      <div class="lib-content"></div>
    </>;
  }
  epoch.current++;
  nav.tab = S.mode==='marketplace' ? 'market' : 'library';
  const lib=nav.tab==='library';
  shown.current = <>
    <div class="lib-left">
      <h2 class="lib-title">{lib ? 'Library' : 'Marketplace'}</h2>
      <div class="expl-top">
        <SearchBox placeholder={lib ? 'Search items and tags' : 'Search the marketplace'}/>
      </div>
      <div class="expl-tools"><Tools lib={lib}/></div>
      <LibTree/>
    </div>
    <div class="lib-content"><Content epoch={epoch.current}/></div>
  </>;
  return shown.current;
}

/** Render the page into its element, at the point in the document its partial occupies.
    @param {HTMLElement} el */
function mountLibraryPage(el){ mountComponent(el, <LibraryPage/>); }

export {mountLibraryPage};
