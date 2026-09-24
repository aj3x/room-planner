/* The marketplace subscription path — the largest hole Phase 3.6 left.
 *
 * Phase 3.6 covered the *ad hoc* half of the Marketplace UI (listings, listing
 * folders, renderListingDetail), which resolves straight out of `S`. Everything
 * subscription-shaped needed a network, so nothing touched it:
 * `subscribeMarket`, `reloadMarketSub`, `removeMarketSub`, `fetchMarketItem`,
 * `renderMarketSub`, `marketSubTile`, `marketPathChildren`,
 * `renderMarketItemPreview`, the "Preview contents" toggle, the two in-memory
 * caches, and `addMarketItemToInventory()`'s three collision cases. All of it
 * sits inside the 48-name Plan/Library strongly-connected component that has to
 * move in a single commit.
 *
 * The network is a `page.route` stub, not a fetch: a hand-written miniature
 * marketplace (one manifest, two index shards, five item files) served off the
 * page's own origin under `/__market/`, so there is no CORS to satisfy and no
 * server to be running. The repo's own `marketplace/` directory is the same
 * shape but 1,500 items wide and the static server only serves `dist-test/`,
 * so it would not have been reachable from both Playwright projects anyway.
 * The stub also counts requests, which is how the two caches are proved to be
 * caches rather than assumed to be.
 *
 * Nothing sleeps. Every fetch is waited on by polling for the rendered result.
 *
 * CHARACTERIZED, NOT ENDORSED: what the app does today.
 */

import {
  test, expect, fixtureState, settle, readS, texts, attrs, menuItems, flushSave,
} from './app-fixture.js';

/* ---- the stub marketplace (MARKET_SCHEMA.md) ---------------------------- */

const manifest = () => ({
  app: 'room-planner-marketplace',
  version: 1,
  name: 'Test Market',
  index: { shards: ['index/furniture.json', 'index/misc.json'] },
  itemURL: 'items/{id}.json',
});

const itemFile = (id, name, extra = {}) => ({
  app: 'room-planner-item',
  version: 1,
  id,
  name,
  shape: { type: 'rect', w: 770, d: 390 },
  color: '#6e8b7a',
  tags: [],
  count: 1,
  passThrough: false,
  open: null,
  ...extra,
});

const marketFiles = () => ({
  'market.json': manifest(),
  'index/furniture.json': {
    app: 'room-planner-marketplace-index',
    version: 1,
    items: [
      { id: 'ikea/kallax/4x2', name: 'Kallax 4x2', tags: ['shelf', 'storage'] },
      { id: 'ikea/kallax/2x4', name: 'Kallax 2x4', tags: ['shelf', 'storage'] },
      { id: 'ikea/lack', name: 'Lack table', tags: ['table'] },
    ],
  },
  'index/misc.json': {
    app: 'room-planner-marketplace-index',
    version: 1,
    items: [
      /* no tags: the reader defaults them to [] */
      { id: 'herman-miller/aeron', name: 'Sofa' },
      /* no name: the reader falls back to the id */
      { id: 'stool' },
      /* idProblem() rejects a doubled slash, so this entry never reaches the index */
      { id: 'bad//id', name: 'Bad' },
      /* an id that is both a folder above and a leaf here, and that collides
         with panels.json's own `ikea/kallax` */
      { id: 'ikea/kallax', name: 'Kallax', tags: ['storage'] },
    ],
  },
  'items/ikea/lack.json': itemFile('ikea/lack', 'Lack table', { tags: ['table'], color: '#8a6f4a' }),
  'items/ikea/kallax.json': itemFile('ikea/kallax', 'Kallax', { tags: ['storage'] }),
  'items/ikea/kallax/4x2.json': itemFile('ikea/kallax/4x2', 'Kallax 4x2', { tags: ['shelf', 'storage'] }),
  'items/herman-miller/aeron.json': itemFile('herman-miller/aeron', 'Sofa', { color: '#5c7a99' }),
  'items/stool.json': itemFile('stool', 'Stool'),
});

/**
 * Serve the stub under the page's own origin, and record every path asked for.
 *
 * Same-origin on purpose: `fetch` from the app is a plain cross-origin request
 * otherwise, and a fulfilled route would need CORS headers to be readable. The
 * path does not have to exist on either server — the route answers first.
 */
async function stubMarket(app, files = marketFiles()) {
  const hits = [];
  await app.route('**/__market/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*__market\//, '');
    hits.push(path);
    const body = files[path];
    if (body === undefined) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'nope' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return hits;
}

const marketURL = (app) => app.evaluate(() => `${location.origin}/__market/market.json`);

const goto = async (app, place) => {
  await app.click(`#navSeg button[data-nav="${place}"]`);
  await settle(app);
};

/** Open "Add a marketplace", type a URL, press Subscribe. Does not wait. */
async function openAddMarket(app, url) {
  await app.click('#explTools button:has-text("Add marketplace")');
  await expect(app.locator('#moTitle')).toHaveText('Add a marketplace');
  await app.fill('#mUrl', url);
  await app.click('#moOk');
}

/** Subscribe to the stub and wait for the dialog to close behind it. */
async function subscribe(app) {
  await openAddMarket(app, await marketURL(app));
  await expect(app.locator('#modal')).toBeHidden();
  await settle(app);
}

/* Every tile in the FIRST grid of #libContent, as [class, name, subtitle].
   The marketplace top level renders two grids into the same box —
   renderMarketTop's subscriptions, then renderAdhocFolder's listings — and
   only the first belongs to the subscription path. */
const tiles = (app) => app.evaluate(() => [...document.querySelector('#libContent .grid').children]
  .map((e) => [
    e.className,
    e.querySelector('.nm')?.textContent ?? e.querySelector('.tname')?.textContent ?? null,
    e.querySelector('.dim')?.textContent ?? null,
  ]));

const crumbs = (app) => texts(app, '#libContent .crumbs button');

test.describe('subscribing to a marketplace', () => {
  test.use({ savedState: fixtureState('panels.json') });
  test.beforeEach(async ({ app }) => { await goto(app, 'marketplace'); });

  test('a valid manifest plus its shards becomes one subscription and one index', async ({ app }) => {
    const hits = await stubMarket(app);
    await subscribe(app);

    /* the manifest first, then every shard it lists — the whole index up
       front, which is what MARKET_SCHEMA.md's §"Sharding" specifies */
    expect(hits).toEqual(['market.json', 'index/furniture.json', 'index/misc.json']);

    const s = await readS(app);
    expect(s.marketSubs).toHaveLength(1);
    const sub = s.marketSubs[0];
    expect(Object.keys(sub).sort()).toEqual(['addedAt', 'id', 'itemURL', 'name', 'url', 'version']);
    expect(sub.name).toBe('Test Market');
    expect(sub.version).toBe(1);
    expect(sub.itemURL).toBe('items/{id}.json');

    /* the tile: the manifest's name, and the item count out of the index.
       Seven index entries were published across the two shards; `bad//id`
       fails idProblem() and is dropped, so six reach the cache. */
    expect(await tiles(app)).toEqual([['tile subtile', 'Test Market', '6 items']]);
  });

  test('the cached index is never written into S', async ({ app }) => {
    await stubMarket(app);
    await subscribe(app);
    const saved = await flushSave(app, (st) => st.marketSubs && st.marketSubs.length === 1);
    expect(Object.keys(saved.marketSubs[0]).sort())
      .toEqual(['addedAt', 'id', 'itemURL', 'name', 'url', 'version']);
    expect(JSON.stringify(saved)).not.toContain('Kallax 4x2');
  });

  test('a URL that is not http(s) never reaches the network', async ({ app }) => {
    const hits = await stubMarket(app);
    await openAddMarket(app, 'ftp://example.invalid/market.json');
    await expect(app.locator('#moErr')).toHaveText('Enter a valid http(s) link to a market.json');
    await expect(app.locator('#modal')).toBeVisible();
    expect(hits).toEqual([]);
  });

  test('the same URL twice is refused before fetching', async ({ app }) => {
    await stubMarket(app);
    await subscribe(app);
    await openAddMarket(app, await marketURL(app));
    await expect(app.locator('#moErr')).toHaveText('You already subscribe to that marketplace');
    expect((await readS(app)).marketSubs).toHaveLength(1);
  });

  for (const [what, mutate, message] of [
    ['a missing file', (f) => { delete f['market.json']; }, 'Couldn’t reach that marketplace (HTTP 404)'],
    ['a foreign app field', (f) => { f['market.json'].app = 'something-else'; },
      'That doesn’t look like a Room Planner marketplace file'],
    ['an unknown manifest version', (f) => { f['market.json'].version = 2; },
      'This marketplace uses a format this app doesn’t understand yet'],
    ['no shards at all', (f) => { f['market.json'].index = { shards: [] }; },
      'That marketplace has no index'],
    ['a shard that 404s', (f) => { delete f['index/misc.json']; },
      'Couldn’t load that marketplace’s index (HTTP 404)'],
    ['a shard with the wrong app field', (f) => { f['index/misc.json'].app = 'room-planner-item'; },
      'One of that marketplace’s index shards is invalid'],
    ['a shard with an unknown version', (f) => { f['index/misc.json'].version = 9; },
      'One of that marketplace’s index shards is invalid'],
  ]) {
    test(`${what} is refused, and the dialog stays open`, async ({ app }) => {
      const files = marketFiles();
      mutate(files);
      await stubMarket(app, files);
      await openAddMarket(app, await marketURL(app));
      await expect(app.locator('#moErr')).toHaveText(message);
      await expect(app.locator('#modal')).toBeVisible();
      /* the button re-enables so the URL can be corrected in place */
      await expect(app.locator('#moOk')).toBeEnabled();
      expect((await readS(app)).marketSubs).toEqual([]);
    });
  }
});

test.describe('browsing a subscription', () => {
  test.use({ savedState: fixtureState('panels.json') });

  let hits;
  test.beforeEach(async ({ app }) => {
    hits = await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);
    await app.click('#libContent [data-opensub]');
    await settle(app);
  });

  test('the folders come from the id path segments, with no folder list', async ({ app }) => {
    expect(await crumbs(app)).toEqual(['Marketplaces', 'Test Market']);
    /* marketPathChildren at the root: `ikea` counts all four ids beginning
       `ikea/`, `herman-miller` its one, and `stool` is the only leaf. */
    expect(await tiles(app)).toEqual([
      ['ttile', 'ikea', '4 items'],
      ['ttile', 'herman-miller', '1 item'],
      ['ttile', 'stool', null],
    ]);
    /* `stool` published no name, so the reader fell back to its id */
    await expect(app.locator('[data-mitemopen="stool"] .tname')).toHaveText('stool');
  });

  test('an id can be a folder and a leaf at the same time', async ({ app }) => {
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    expect(await crumbs(app)).toEqual(['Marketplaces', 'Test Market', 'ikea']);
    /* `ikea/kallax` is a folder of two AND an item of its own; both render */
    expect(await tiles(app)).toEqual([
      ['ttile', 'kallax', '2 items'],
      ['ttile', 'Lack table', null],
      ['ttile', 'Kallax', null],
    ]);

    await app.click('[data-mopenfolder="ikea/kallax"]');
    await settle(app);
    expect(await crumbs(app)).toEqual(['Marketplaces', 'Test Market', 'ikea', 'kallax']);
    expect(await tiles(app)).toEqual([
      ['ttile', 'Kallax 4x2', null],
      ['ttile', 'Kallax 2x4', null],
    ]);
  });

  test('the crumbs walk back up, and no further fetch is made', async ({ app }) => {
    const before = hits.length;
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.click('[data-mopenfolder="ikea/kallax"]');
    await settle(app);
    await app.click('[data-mcrumb="ikea"]');
    await settle(app);
    expect(await crumbs(app)).toEqual(['Marketplaces', 'Test Market', 'ikea']);
    await app.click('[data-toroot]');
    await settle(app);
    expect(await crumbs(app)).toEqual(['Marketplaces', 'Test Market']);
    await app.click('[data-back]');
    await settle(app);
    expect(await crumbs(app)).toEqual(['Marketplaces']);
    /* the whole browse is served out of marketIndexCache */
    expect(hits.length).toBe(before);
  });

  test('the tag chips are scoped to the folder being browsed', async ({ app }) => {
    expect(await texts(app, '#libContent [data-mtag]')).toEqual(['shelf', 'storage', 'table']);
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.click('[data-mopenfolder="ikea/kallax"]');
    await settle(app);
    expect(await texts(app, '#libContent [data-mtag]')).toEqual(['shelf', 'storage']);
    expect(await attrs(app, '#libContent [data-mtag]', 'aria-pressed')).toEqual(['false', 'false']);

    await app.click('[data-mtag="shelf"]');
    await settle(app);
    expect(await attrs(app, '#libContent [data-mtag]', 'aria-pressed')).toEqual(['true', 'false']);
    expect(await tiles(app)).toEqual([
      ['ttile', 'Kallax 4x2', null],
      ['ttile', 'Kallax 2x4', null],
    ]);
    /* the same chip again clears the filter */
    await app.click('[data-mtag="shelf"]');
    await settle(app);
    expect(await attrs(app, '#libContent [data-mtag]', 'aria-pressed')).toEqual(['false', 'false']);
  });

  test('search inside a subscription matches name, id and tag, and stays scoped', async ({ app }) => {
    await app.fill('#searchBox', 'kallax');
    /* the search box debounces 120ms; poll for the result rather than sleep */
    await expect.poll(() => tiles(app)).toEqual([
      ['ttile', 'Kallax 4x2', null],
      ['ttile', 'Kallax 2x4', null],
      ['ttile', 'Kallax', null],
    ]);

    /* a tag match, and one that is only in the id */
    await app.fill('#searchBox', 'table');
    await expect.poll(() => tiles(app)).toEqual([['ttile', 'Lack table', null]]);
    await app.fill('#searchBox', 'herman');
    await expect.poll(() => tiles(app)).toEqual([['ttile', 'Sofa', null]]);

    /* scoped to the folder: the same query inside ikea/ cannot see it */
    await app.fill('#searchBox', '');
    await expect.poll(() => tiles(app)).toHaveLength(3);
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.fill('#searchBox', 'herman');
    await expect.poll(() => texts(app, '#libContent .empty')).toEqual(['No matches.']);
  });

  test('leaving the subscription with a search still typed falls to the generic search view', async ({ app }) => {
    await app.fill('#searchBox', 'kallax');
    await expect.poll(() => app.evaluate(() => window.__rp.nav.searching)).toBe(true);
    await app.click('[data-back]');
    await settle(app);
    /* renderLibContent routes to the subscription before the generic search
       view, so the search only applied inside it. Going back leaves
       nav.searching set and the box full, and what renders is
       renderLibSearchResults' marketplace branch — which searches the ad hoc
       listings, not the marketplace just left. */
    expect(await app.evaluate(() => window.__rp.nav.searching)).toBe(true);
    await expect(app.locator('#searchBox')).toHaveValue('kallax');
    /* CHARACTERIZED, NOT ENDORSED: the query the user typed was answered by
       the subscription, but the moment they step back out it is answered by
       renderLibSearchResults' marketplace branch instead — which searches the
       ad hoc listings only. The box still reads "kallax" and the answer is
       "Nothing matches", about a different collection than the one just
       searched. See BACKLOG.md "Known defects". */
    expect(await crumbs(app)).toEqual(['Listings', 'Search: "kallax"']);
    expect(await texts(app, '#libContent .empty')).toEqual(['Nothing matches “kallax” here.']);
  });
});

test.describe('the Preview contents toggle', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('the tile grows a chip per first path segment, and each chip opens there', async ({ app }) => {
    await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);

    await expect(app.locator('#chkContents')).not.toBeChecked();
    expect(await texts(app, '#libContent .subtile .tagchip')).toEqual([]);

    await app.click('#chkContents');
    await settle(app);
    /* grouped by the first id segment; a top-level leaf is its own chip,
       shown by name rather than with a trailing slash */
    expect(await texts(app, '#libContent .subtile .tagchip'))
      .toEqual(['ikea/', 'herman-miller/', 'stool']);
    expect(await app.evaluate(() => window.__rp.nav.showMarketContents)).toBe(true);

    await app.click('[data-mfolder2="ikea"]');
    await settle(app);
    expect(await crumbs(app)).toEqual(['Marketplaces', 'Test Market', 'ikea']);

    /* the leaf chip opens the sub AND selects the item, which opens its preview */
    await app.click('[data-back]');
    await settle(app);
    await app.click('[data-mitem="stool"]');
    await expect(app.locator('#moTitle')).toHaveText('Stool');
  });

  test('the toggle is not offered when there is no subscription', async ({ app }) => {
    await goto(app, 'marketplace');
    await expect(app.locator('#chkContents')).toHaveCount(0);
    expect(await texts(app, '#libContent .empty')).toEqual([
      'You haven\'t added a marketplace yet. Add marketplace…',
    ]);
  });
});

test.describe('the item preview dialog', () => {
  test.use({ savedState: fixtureState('panels.json') });

  let hits;
  test.beforeEach(async ({ app }) => {
    hits = await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);
    await app.click('#libContent [data-opensub]');
    await settle(app);
  });

  test('it opens on the index name, then fills in from the item file', async ({ app }) => {
    await app.click('[data-mitemopen="stool"]');
    /* the dialog opens immediately, titled from the index entry, with the
       primary button disabled until the fetch lands */
    await expect(app.locator('#modal')).toBeVisible();
    await expect(app.locator('#moOk')).toHaveText('Add to library');

    /* the item file's own name replaces the index entry's, and the status
       line is the size, the tags (none here) and the id */
    await expect(app.locator('#moTitle')).toHaveText('Stool');
    await expect(app.locator('#moOk')).toBeEnabled();
    await expect(app.locator('#mPrevInfo')).toHaveText('0.77 m × 0.39 mstool');
    expect(hits).toContain('items/stool.json');

    /* selecting an item clears the selection as the preview opens, so
       closing it does not reopen it */
    expect(await app.evaluate(() => window.__rp.nav.marketSelItemId)).toBe(null);
    await app.click('#moCancel');
    await expect(app.locator('#modal')).toBeHidden();
    expect((await readS(app)).inventory.map((i) => i.id)).toEqual(['ikea/kallax', 'sofa', 'lamp']);
  });

  test('an item file the market cannot serve says so in the dialog', async ({ app }) => {
    /* `ikea/kallax/2x4` is in the index but has no item file behind it */
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.click('[data-mopenfolder="ikea/kallax"]');
    await settle(app);
    await app.click('[data-mitemopen="ikea/kallax/2x4"]');
    await expect(app.locator('#mPrevInfo')).toHaveText('Couldn’t load that item (HTTP 404)');
    await expect(app.locator('#mPrevInfo')).toHaveClass('hint warn');
    /* OK stays disabled, and pressing it complains rather than adding nothing */
    await expect(app.locator('#moOk')).toBeDisabled();
  });

  test('the item cache serves the second look at the same item', async ({ app }) => {
    await app.click('[data-mitemopen="stool"]');
    await expect(app.locator('#moOk')).toBeEnabled();
    await app.click('#moCancel');
    const after = hits.filter((h) => h === 'items/stool.json').length;
    expect(after).toBe(1);

    await app.click('[data-mitemopen="stool"]');
    await expect(app.locator('#moOk')).toBeEnabled();
    expect(hits.filter((h) => h === 'items/stool.json').length).toBe(1);
  });
});

test.describe('addMarketItemToInventory: the three collision cases', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => {
    await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);
    await app.click('#libContent [data-opensub]');
    await settle(app);
  });

  test('no collision: the item is copied in and filed under its id path', async ({ app }) => {
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.click('[data-add="ikea/lack"]');
    await expect(app.locator('#libFlash')).toHaveText('Added to your library');

    const s = await readS(app);
    const added = s.inventory.find((i) => i.id === 'ikea/lack');
    expect(added).toBeTruthy();
    expect(added.name).toBe('Lack table');
    expect(added.shape).toEqual({ type: 'rect', w: 770, d: 390 });
    expect(added.manualTags).toEqual(['table']);

    /* the folder comes from the id path. CHARACTERIZED, NOT ENDORSED:
       ensureItemFolderPath matches a folder by exact name, so the lowercase
       `ikea` segment does not find the existing "IKEA" folder and a second,
       separate folder is created beside it. See BACKLOG.md "Known defects". */
    const folder = s.itemFolders.find((f) => f.id === added.folderId);
    expect(folder.name).toBe('ikea');
    expect(folder.parentId).toBe(null);
    expect(s.itemFolders.filter((f) => f.parentId === null).map((f) => f.name))
      .toEqual(['IKEA', 'ikea']);
    /* the folder carries no tags, so the item's tags are its manual ones */
    expect(added.tags).toEqual(['table']);
  });

  test('case 1 — the same id and an identical body just says so', async ({ app }) => {
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.click('[data-add="ikea/lack"]');
    await expect(app.locator('#libFlash')).toHaveText('Added to your library');
    const first = (await readS(app)).inventory.length;

    /* the same add again: itemsDeepEqual ignores folderId/manualTags, which
       are the only two fields the first add set */
    await app.click('[data-add="ikea/lack"]');
    await expect(app.locator('#libFlash')).toHaveText('You already have this');
    await expect(app.locator('#modal')).toBeHidden();
    expect((await readS(app)).inventory).toHaveLength(first);
    /* the tile reads "Added" once the id is in the library */
    await expect(app.locator('[data-add="ikea/lack"]')).toHaveText('Added');
  });

  test('case 2 — the same id, a different body, offers "Take theirs"', async ({ app }) => {
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    const before = (await readS(app)).inventory.find((i) => i.id === 'ikea/kallax');
    expect(before.shape).toEqual({ type: 'rect', w: 1470, d: 390 });

    await app.click('[data-add="ikea/kallax"]');
    await expect(app.locator('#moTitle')).toHaveText('Already in your library');
    await expect(app.locator('#moBody')).toContainText('You already have ikea/kallax, but this copy is different.');
    await expect(app.locator('#moOk')).toHaveText('Take theirs');

    /* Cancel writes nothing */
    await app.click('#moCancel');
    expect((await readS(app)).inventory.find((i) => i.id === 'ikea/kallax').shape)
      .toEqual({ type: 'rect', w: 1470, d: 390 });

    await app.click('[data-add="ikea/kallax"]');
    await app.click('#moOk');
    await expect(app.locator('#libFlash')).toHaveText('Replaced your copy');

    const after = (await readS(app)).inventory.find((i) => i.id === 'ikea/kallax');
    /* their geometry and colour, your id, your folder and your manual tags */
    expect(after.shape).toEqual({ type: 'rect', w: 770, d: 390 });
    expect(after.color).toBe('#6e8b7a');
    expect(after.folderId).toBe('if-ikea');
    expect(after.manualTags).toEqual(['storage']);
    /* applyTags puts the manual tags first, then the folder's inherited ones */
    expect(after.tags).toEqual(['storage', 'ikea']);
    /* and the placement in the Living room still points at it */
    const s = await readS(app);
    expect(s.layouts[0].placed.map((p) => p.itemId)).toEqual(['ikea/kallax', 'lamp']);
    expect(s.inventory).toHaveLength(3);
  });

  test('case 3 — a different id that shares a name is added beside it, with a warning', async ({ app }) => {
    await app.click('[data-mopenfolder="herman-miller"]');
    await settle(app);
    await app.click('[data-add="herman-miller/aeron"]');
    await expect(app.locator('#libFlash'))
      .toHaveText('Added — you also have another "Sofa" under a different id');

    const s = await readS(app);
    expect(s.inventory.filter((i) => i.name === 'Sofa').map((i) => i.id))
      .toEqual(['sofa', 'herman-miller/aeron']);
  });

  test('the preview\'s own Add defers until the dialog has closed', async ({ app }) => {
    await app.click('[data-mopenfolder="ikea"]');
    await settle(app);
    await app.click('[data-mitemopen="ikea/kallax"]');
    await expect(app.locator('#moOk')).toBeEnabled();
    await app.click('#moOk');
    /* the preview closes, and the collision dialog opens in its place —
       the setTimeout in renderMarketItemPreview is what makes that possible */
    await expect(app.locator('#moTitle')).toHaveText('Already in your library');
    await app.click('#moOk');
    await expect(app.locator('#libFlash')).toHaveText('Replaced your copy');
  });
});

test.describe('reloading and removing a subscription', () => {
  test.use({ savedState: fixtureState('panels.json') });

  let hits;
  test.beforeEach(async ({ app }) => {
    hits = await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);
  });

  test('Reload refetches under the sub\'s own id and drops the item cache', async ({ app }) => {
    /* warm the item cache first */
    await app.click('#libContent [data-opensub]');
    await settle(app);
    await app.click('[data-mitemopen="stool"]');
    await expect(app.locator('#moOk')).toBeEnabled();
    await app.click('#moCancel');
    await app.click('[data-back]');
    await settle(app);

    const id0 = (await readS(app)).marketSubs[0].id;
    await app.click('#libContent .subtile [data-act=more]');
    expect(await menuItems(app)).toEqual(['Test Market', 'Open', 'Reload', '—', 'Remove…']);
    await app.click('.menu button:has-text("Reload")');
    await expect(app.locator('#libFlash')).toHaveText('Reloaded');

    /* reloadMarketSub subscribes again under a fresh id, moves the index onto
       the old one and deletes the temporary record — one subscription, same id */
    const s = await readS(app);
    expect(s.marketSubs).toHaveLength(1);
    expect(s.marketSubs[0].id).toBe(id0);
    expect(hits.filter((h) => h === 'market.json')).toHaveLength(2);

    /* the item cache went with it: the same item is fetched again */
    await app.click('#libContent [data-opensub]');
    await settle(app);
    await app.click('[data-mitemopen="stool"]');
    await expect(app.locator('#moOk')).toBeEnabled();
    expect(hits.filter((h) => h === 'items/stool.json')).toHaveLength(2);
  });

  test('Remove forgets the subscription and its index', async ({ app }) => {
    await app.click('#libContent .subtile [data-act=more]');
    await app.click('.menu button:has-text("Remove…")');
    await expect(app.locator('#moTitle')).toHaveText('Remove this marketplace?');
    await expect(app.locator('#moBody'))
      .toContainText('“Test Market” and its cached index will be forgotten. Your library isn’t affected.');
    await app.click('#moOk');
    await settle(app);

    const s = await readS(app);
    expect(s.marketSubs).toEqual([]);
    expect(s.inventory).toHaveLength(3);
    expect(await texts(app, '#libContent .empty')).toEqual([
      'You haven\'t added a marketplace yet. Add marketplace…',
    ]);
  });

  test('removing the default marketplace is remembered as a dismissal', async ({ app }) => {
    /* the default sub is the one ensureDefaultMarket() adds at boot; the
       fixture dismisses it so nothing fetches, so this puts the flag back and
       marks the stub as the default to reach the branch */
    await app.evaluate(() => {
      window.__rp.S.defaultMarketDismissed = false;
      window.__rp.S.marketSubs[0].isDefault = true;
    });
    await app.click('#libContent .subtile [data-act=more]');
    await app.click('.menu button:has-text("Remove…")');
    await app.click('#moOk');
    await settle(app);
    expect((await readS(app)).defaultMarketDismissed).toBe(true);
  });
});

test.describe('the caches are in-memory only', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('a reload starts with an empty index and refetches on demand', async ({ app }) => {
    await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);
    await flushSave(app, (st) => st.marketSubs && st.marketSubs.length === 1);

    await app.reload();
    await app.waitForFunction(() => !!(window.__rp && window.__rp.S));
    await settle(app);
    /* Math.random is seeded per page load, so after a reload the next uid()
       is byte-for-byte the one the first load handed this subscription.
       reloadMarketSub() subscribes again under a fresh id and then deletes
       that record — with the two ids equal it would delete the subscription
       itself. One throwaway uid() puts the sequence past it. This is a
       property of the deterministic seed, not of the app. */
    await app.evaluate(() => window.__rp.uid());
    /* the subscription survived; its index did not, so the tile falls back to
       showing the URL instead of a count */
    const url = await marketURL(app);
    expect(await tiles(app)).toEqual([['tile subtile', 'Test Market', url]]);

    /* opening it shows Loading… and refetches the whole index through
       reloadMarketSub, which is the only way the cache is ever refilled */
    await app.click('#libContent [data-opensub]');
    await expect.poll(() => tiles(app)).toEqual([
      ['ttile', 'ikea', '4 items'],
      ['ttile', 'herman-miller', '1 item'],
      ['ttile', 'stool', null],
    ]);
  });

  test('with Preview contents on, a cold tile loads itself', async ({ app }) => {
    await stubMarket(app);
    await goto(app, 'marketplace');
    await subscribe(app);
    await flushSave(app, (st) => st.marketSubs && st.marketSubs.length === 1);

    await app.reload();
    await app.waitForFunction(() => !!(window.__rp && window.__rp.S));
    await settle(app);
    /* Math.random is seeded per page load, so after a reload the next uid()
       is byte-for-byte the one the first load handed this subscription.
       reloadMarketSub() subscribes again under a fresh id and then deletes
       that record — with the two ids equal it would delete the subscription
       itself. One throwaway uid() puts the sequence past it. This is a
       property of the deterministic seed, not of the app. */
    await app.evaluate(() => window.__rp.uid());
    /* nav is not persisted either, so the toggle comes back off */
    await expect(app.locator('#chkContents')).not.toBeChecked();
    await app.click('#chkContents');
    /* the index cache is cold, so the tile renders [data-loadsub] ("Loading…")
       and reloads itself in place. The chips can only arrive through that
       branch — the poll is on the outcome, never on a timer. */
    await expect.poll(() => texts(app, '#libContent .subtile .tagchip'))
      .toEqual(['ikea/', 'herman-miller/', 'stool']);
  });
});
