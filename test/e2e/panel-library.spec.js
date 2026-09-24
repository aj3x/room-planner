/* The Library and Marketplace UI — the other half of the SCC.
 *
 * Phase 3.6. `renderLibAll`, `renderLibTools`, `renderLibTree`,
 * `renderLibContent`, `renderLibraryFolder`, `renderLibSearchResults`,
 * `renderMarketTop`, `renderAdhocFolder`, `renderListingDetail` and
 * `bindLibGrid` are all inside the 48-name Plan/Library strongly-connected
 * component. They are half of the 1,224 lines that have to move in a single
 * commit, and they are the half that was covered by nothing at all: no
 * screenshot reaches #paneLibrary, and the six edges that make the cycle
 * (setMode -> renderLibAll, itemDialog -> renderLibAll, createLibItem /
 * libItemMenu / bindLibGrid -> itemDialog, deleteLibItem -> renderSel) are
 * plain function calls, so a boundary drawn wrongly breaks them silently.
 *
 * No test here reaches the network. The fixture's marketSubs list is empty
 * and defaultMarketDismissed is true, so ensureDefaultMarket() returns before
 * it fetches; the one listing whose contents are read is a `kind:'file'`
 * listing, which loadListing() answers straight out of S.
 *
 * CHARACTERIZED, NOT ENDORSED: what the app does today.
 */

import {
  test, expect, fixtureState, settle, readS, texts, attrs, menuItems,
} from './app-fixture.js';

/** Every tile in the content grid as [class, name, subtitle]. */
const tiles = (app) => app.$$eval('#libContent .grid > *', (els) => els.map((e) => [
  e.className,
  e.querySelector('.nm')?.textContent ?? null,
  e.querySelector('.dim')?.textContent ?? null,
]));

const treeRows = (app) => app.$$eval('#tree .tree-row', (els) => els.map((e) => [
  e.dataset.root ? 'root' : e.dataset.folder ? 'folder' : e.dataset.mfolder ? 'mfolder' : 'listing',
  e.textContent.replace(/\s+/g, ' ').trim(),
  e.className,
]));

const goto = async (app, place) => {
  await app.click(`#navSeg button[data-nav="${place}"]`);
  await settle(app);
};

test.describe('switching places swaps the whole layout', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('setMode moves between the canvas layout and the library layout', async ({ app }) => {
    /* applyLayoutMode hides <main> outright and turns #paneLibrary on. This
       is the one thing every other test in this file depends on, and the
       edge setMode -> renderLibAll is one of the six that make the cycle. */
    expect(await app.evaluate(() => document.querySelector('main').style.display)).toBe('');
    expect(await app.evaluate(() => document.getElementById('paneLibrary').classList.contains('on'))).toBe(false);
    expect(await attrs(app, '#navSeg button', 'aria-current')).toEqual(['page', null, null]);

    await goto(app, 'inventory');
    expect(await app.evaluate(() => document.querySelector('main').style.display)).toBe('none');
    expect(await app.evaluate(() => document.getElementById('paneLibrary').classList.contains('on'))).toBe(true);
    expect(await attrs(app, '#navSeg button', 'aria-current')).toEqual([null, 'page', null]);
    await expect(app.locator('#libTitle')).toHaveText('Library');
    await expect(app.locator('#searchBox')).toHaveAttribute('placeholder', 'Search items and tags');
    await expect(app.locator('#searchBox')).toHaveAttribute('aria-label', 'Search items and tags');
    expect(await texts(app, '#explTools button')).toEqual(['New item', 'New folder']);

    await goto(app, 'marketplace');
    await expect(app.locator('#libTitle')).toHaveText('Marketplace');
    await expect(app.locator('#searchBox')).toHaveAttribute('placeholder', 'Search the marketplace');
    expect(await texts(app, '#explTools button')).toEqual(['Add marketplace…', 'Add listing…', '']);
    expect(await attrs(app, '#navSeg button', 'aria-current')).toEqual([null, null, 'page']);

    /* back to Plan returns to the canvas mode it left, not a default */
    await goto(app, 'plan');
    expect(await app.evaluate(() => document.querySelector('main').style.display)).toBe('');
    expect((await readS(app)).mode).toBe('room');
    expect(await app.evaluate(() => document.body.dataset.mode)).toBe('room');
  });
});

test.describe('the Library folder tree', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => { await goto(app, 'inventory'); });

  test('a root row with the whole-library count, then the folders with theirs', async ({ app }) => {
    expect(await treeRows(app)).toEqual([
      ['root', 'All items3', 'tree-row root-row active'],
      ['folder', 'IKEAikea 1', 'tree-row'],
    ]);
    /* the folder's count is its whole subtree, and its tag chip is the
       inherited kind */
    await expect(app.locator('#tree [data-folder="if-ikea"] .count')).toHaveText('1');
    await expect(app.locator('#tree [data-folder="if-ikea"] .tagchip')).toHaveClass(/inherit/);
    await expect(app.locator('#tree [data-folder="if-ikea"] .tagchip'))
      .toHaveAttribute('title', 'Everything inside is tagged: ikea');
    await expect(app.locator('#tree [data-folder="if-ikea"]')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the caret zone expands to the subfolder', async ({ app }) => {
    await app.locator('#tree [data-folder="if-ikea"] [data-act=toggle]').click();
    await settle(app);
    expect(await treeRows(app)).toEqual([
      ['root', 'All items3', 'tree-row root-row active'],
      ['folder', 'IKEAikea 1', 'tree-row'],
      ['folder', 'Shelves', 'tree-row'],
    ]);
    await expect(app.locator('#tree [data-folder="if-ikea"]')).toHaveAttribute('aria-expanded', 'true');
    /* the subfolder holds nothing, so it gets no count badge at all */
    await expect(app.locator('#tree [data-folder="if-shelves"] .count')).toHaveCount(0);
  });

  test('clicking a folder row moves the active mark to it', async ({ app }) => {
    /* the row's own action is held back 190ms by singleClick() so a second
       click can become the rename double-click, so this polls rather than
       reading straight after the click */
    await app.locator('#tree [data-folder="if-ikea"] .nm').click();
    await expect(app.locator('#tree [data-folder="if-ikea"]')).toHaveClass(/active/);
    expect(await app.evaluate(() => window.__rp.nav.libFolderId)).toBe('if-ikea');
    await expect(app.locator('#tree [data-root]')).not.toHaveClass(/active/);
  });
});

test.describe('the Library item grid', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => { await goto(app, 'inventory'); });

  test('the root shows its folders first, then its own items, with the counts above', async ({ app }) => {
    await expect(app.locator('#libContent .crumbs')).toHaveText('All items');
    await expect(app.locator('#libContent .viewhead .hint')).toHaveText('1 folder, 2 items');
    expect(await tiles(app)).toEqual([
      ['tile folder', 'IKEA', '1 folder, 1 item'],
      ['tile', 'Sofa', '2.13 m × 0.91 m'],
      ['tile', 'Lamp', '0.4 m × 0.4 m'],
    ]);
    /* an item tile is a focusable button-role div with its own ⋯ */
    await expect(app.locator('#libContent [data-item="sofa"]')).toHaveAttribute('aria-label', 'Edit Sofa');
    await expect(app.locator('#libContent [data-item="sofa"]')).toHaveAttribute('role', 'button');
    expect(await app.locator('#libContent [data-item] [data-act=more]').count()).toBe(2);
    /* only "Export…" at the root — there is no folder to export */
    expect(await texts(app, '#libContent .viewhead button')).toEqual(['Export…']);
  });

  test('a tag a folder gave the item is marked as inherited, a manual one is not', async ({ app }) => {
    await app.locator('#libContent [data-openfolder="if-ikea"]').click();
    await settle(app);

    await expect(app.locator('#libContent .crumbs')).toHaveText('All items/IKEA');
    await expect(app.locator('#libContent .foldertagbar .lbl')).toHaveText('Everything here is tagged');
    expect(await texts(app, '#libContent .foldertagbar .tagchip')).toEqual(['ikea']);
    expect(await texts(app, '#libContent .viewhead button')).toEqual(['Folder tags…', 'Export folder']);

    expect(await tiles(app)).toEqual([
      ['tile folder', 'Shelves', 'Empty'],
      ['tile', 'Kallax', '1.47 m × 0.39 m'],
    ]);
    /* itemTile marks a tag the item does not hold manually with .inherit */
    expect(await app.$$eval('#libContent [data-item="ikea/kallax"] .chips .tagchip',
      (els) => els.map((e) => [e.textContent, e.className])))
      .toEqual([['storage', 'tagchip'], ['ikea', 'tagchip inherit']]);
  });

  test('an empty folder says so and offers a way out of it', async ({ app }) => {
    await app.locator('#libContent [data-openfolder="if-ikea"]').click();
    await settle(app);
    await app.locator('#libContent [data-openfolder="if-shelves"]').click();
    await settle(app);

    await expect(app.locator('#libContent .crumbs')).toHaveText('All items/IKEA/Shelves');
    await expect(app.locator('#libContent .grid .empty'))
      .toContainText('This folder is empty. Drag items onto it in the tree, or');
    expect(await texts(app, '#libContent .grid .empty button')).toEqual(['New item']);

    /* the crumb walks back up */
    await app.locator('#libContent .crumbs [data-crumb="if-ikea"]').click();
    await settle(app);
    await expect(app.locator('#libContent .crumbs')).toHaveText('All items/IKEA');
    expect(await app.evaluate(() => window.__rp.nav.libFolderId)).toBe('if-ikea');
  });

  test('an empty library reads differently from an empty folder', async ({ app }) => {
    await app.evaluate(() => {
      window.__rp.S.inventory = [];
      window.__rp.S.itemFolders = [];
      window.renderLibAll();
    });
    await settle(app);
    await expect(app.locator('#libContent .grid .empty')).toContainText('Your library is empty.');
    await expect(app.locator('#tree [data-root] .count')).toHaveCount(0);
    /* with nothing to export, the viewhead loses its export button */
    expect(await texts(app, '#libContent .viewhead button')).toEqual([]);
  });

  test('the ⋯ on a tile is the library item menu', async ({ app }) => {
    await app.locator('#libContent [data-item="sofa"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual([
      'Sofa', 'Edit…', 'Move to folder…', 'Duplicate', 'Export…', '—', 'Delete…',
    ]);
  });

  test('search is scoped to the folder being browsed, and says so in the crumbs', async ({ app }) => {
    /* the search box is debounced at 120ms; the expect polls rather than
       sleeping for it */
    await app.fill('#searchBox', 'kallax');
    await expect(app.locator('#libContent .crumbs')).toHaveText('All items/Search: "kallax"');
    expect(await tiles(app)).toEqual([['tile', 'Kallax', '1.47 m × 0.39 m']]);
    expect(await app.evaluate(() => window.__rp.nav.searching)).toBe(true);
    /* searching drops the active mark off every tree row */
    expect(await app.locator('#tree .tree-row.active').count()).toBe(0);

    /* scoped: the same query inside a folder that does not hold it finds
       nothing */
    await app.fill('#searchBox', '');
    await expect(app.locator('#libContent .viewhead')).toBeVisible();
    await app.locator('#libContent [data-openfolder="if-ikea"]').click();
    await settle(app);
    await app.fill('#searchBox', 'sofa');
    await expect(app.locator('#libContent .crumbs')).toHaveText('All items/IKEA/Search: "sofa"');
    await expect(app.locator('#libContent .grid .empty')).toHaveText('Nothing matches \u201csofa\u201d here.');
  });
});

test.describe('the Marketplace place', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => { await goto(app, 'marketplace'); });

  test('with no subscription, the top is an empty state above the ad hoc listings', async ({ app }) => {
    /* renderLibContent draws BOTH renderMarketTop and renderAdhocFolder(null)
       when nothing narrower is selected, so the page holds two grids. */
    await expect(app.locator('#libContent .crumbs')).toHaveText('Marketplaces');
    await expect(app.locator('#libContent .viewhead .hint')).toHaveText(
      'Browse a marketplace and add what you want to your library. Nothing is added until you choose it.',
    );
    await expect(app.locator('#libContent .grid .empty'))
      .toContainText("You haven't added a marketplace yet.");
    /* no subscription means no "Preview contents" toggle either */
    await expect(app.locator('#chkContents')).toHaveCount(0);

    await expect(app.locator('#libContent .lib-section'))
      .toHaveText('Listings — one-off bundles from a file, link or pasted JSON');
    expect(await tiles(app)).toEqual([
      ['empty', null, null],
      ['tile folder', 'Shared', '1 listing'],
      ['tile', 'A pasted bundle', '2 items'],
    ]);
  });

  test('the tree lists folders then listings, and a listing has no caret', async ({ app }) => {
    expect(await treeRows(app)).toEqual([
      ['root', 'Marketplaces & listings', 'tree-row root-row active'],
      ['mfolder', 'Shared', 'tree-row'],
      ['listing', 'A pasted bundle', 'tree-row'],
    ]);
    await expect(app.locator('#tree [data-mfolder="mf-shared"] [data-act=toggle]')).toHaveCount(1);
    await expect(app.locator('#tree [data-listing="ml-file"] [data-act=toggle]')).toHaveCount(0);
    await expect(app.locator('#tree [data-listing="ml-file"]')).toHaveAttribute('draggable', 'false');
  });

  test('opening an ad hoc folder shows the listings filed in it', async ({ app }) => {
    await app.locator('#libContent [data-openfolder="mf-shared"]').click();
    await settle(app);

    await expect(app.locator('#libContent .crumbs')).toHaveText('Listings/Shared');
    /* a link listing's subtitle is the word Link, not its URL */
    expect(await tiles(app)).toEqual([['tile', 'A linked bundle', 'Link']]);
    /* and the standalone folder view drops the "Listings — one-off bundles"
       section heading the top-level view carries */
    await expect(app.locator('#libContent .lib-section')).toHaveCount(0);
  });

  test('with no listings and no listing folders, the ad hoc section offers Add listing', async ({ app }) => {
    await app.evaluate(() => {
      window.__rp.S.marketListings = [];
      window.__rp.S.marketFolders = [];
      window.renderLibAll();
    });
    await settle(app);
    /* two empty states on the page now: the marketplace one from
       renderMarketTop and the listings one from renderAdhocFolder */
    expect(await texts(app, '#libContent .grid .empty')).toEqual([
      "You haven't added a marketplace yet. Add marketplace…",
      'No listings yet. Add listing…',
    ]);
    expect(await texts(app, '#tree .tree-row')).toEqual(['Marketplaces & listings']);
  });
});

test.describe('a listing detail', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => { await goto(app, 'marketplace'); });

  test('renderListingDetail lists the bundle\'s items and adds them one at a time', async ({ app }) => {
    await app.locator('#libContent [data-listing="ml-file"]').click();
    await settle(app);

    await expect(app.locator('#libContent .detail h1')).toHaveText('A pasted bundle');
    await expect(app.locator('#libContent .detail .dhead .dim')).toHaveText('Uploaded file');
    expect(await texts(app, '#libContent .detail .dhead button'))
      .toEqual(['Delete listing…', 'Add all to library']);
    await expect(app.locator('#libContent .crumbs')).toHaveText('Listings');

    /* loadListing resolves off S for a kind:'file' listing — no fetch. The
       body is filled in a promise, so the locator polls for it. */
    await expect(app.locator('#listingBody .tile')).toHaveCount(2);
    expect(await app.$$eval('#listingBody .tile', (els) => els.map((e) => [
      e.querySelector('.nm').textContent,
      e.querySelector('.dim').textContent,
      e.querySelector('[data-addlisting]').textContent,
    ]))).toEqual([
      ['Desk', '1.4 m × 0.7 m', 'Add'],
      ['Chair', '0.5 m × 0.5 m', 'Add'],
    ]);

    await app.locator('#listingBody [data-addlisting="desk"]').click();
    await expect(app.locator('#listingBody .tile')).toHaveCount(2);
    expect((await readS(app)).inventory.map((i) => i.id)).toEqual(['ikea/kallax', 'sofa', 'lamp', 'desk']);

    /* CHARACTERIZED, NOT ENDORSED: the "Added" acknowledgement never shows.
       The handler calls addMarketItemToInventory(), which ends in
       renderLibAll() -> renderListingDetail(), rebuilding #listingBody from
       scratch; only THEN does it set b.textContent='Added' — on a button that
       is already detached. The panel the user is looking at flashes back to
       "Loading…" and returns with both buttons reading "Add", so an item that
       was added looks exactly like one that was not. Logged in BACKLOG.md. */
    expect(await texts(app, '#listingBody [data-addlisting]')).toEqual(['Add', 'Add']);
    expect(await app.$$eval('#listingBody [data-addlisting]', (b) => b.map((x) => x.disabled)))
      .toEqual([false, false]);
  });

  test('"Add all to library" adds every item and disables every button', async ({ app }) => {
    await app.locator('#libContent [data-listing="ml-file"]').click();
    await expect(app.locator('#listingBody .tile')).toHaveCount(2);

    await app.click('#btnAddAllListing');
    await expect(app.locator('#listingBody .tile')).toHaveCount(2);
    expect((await readS(app)).inventory.map((i) => i.id))
      .toEqual(['ikea/kallax', 'sofa', 'lamp', 'desk', 'chair']);
    /* same defect as above: both buttons are rebuilt before they are marked */
    expect(await texts(app, '#listingBody [data-addlisting]')).toEqual(['Add', 'Add']);

    /* and the Library place now shows them */
    await goto(app, 'inventory');
    expect(await texts(app, '#libContent .grid [data-item] .nm')).toEqual(['Sofa', 'Lamp', 'Desk', 'Chair']);
    await expect(app.locator('#tree [data-root] .count')).toHaveText('5');
  });

  test('the ⋯ on a listing tile is the listing menu', async ({ app }) => {
    await app.locator('#libContent [data-listing="ml-file"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual(['A pasted bundle', 'Open', 'Move to folder…', '—', 'Delete…']);
  });
});
