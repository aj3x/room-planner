/* The library grid's own listeners — `bindLibGrid`.
 *
 * Phase 3.6, the last pass before the SCC move. `bindLibGrid -> itemDialog` is
 * one of the six function-call edges that make the 48-name Plan/Library
 * strongly-connected component a component at all, and until this file nothing
 * clicked it: `itemDialog` was reached only from the Furniture pane's ⋯ menu,
 * `#btnAddItem`/`#btnAddItem2` and `#btnNewLibItem`. A tile click is a third
 * edge, and if the move gets that import direction wrong the symptom is a tile
 * that does nothing — no throw, nothing red, nothing in a screenshot.
 *
 * So: click a tile, confirm the dialog opens on the right item, confirm a save
 * writes through to `S` *and* back into the grid (that return trip is the
 * `itemDialog -> renderLibAll` edge, the other half of the cycle).
 *
 * The `dragstart`/`drop` pair is here for the same reason: the layout tree's
 * drag-drop is covered, the grid's is not, and `drop` is the only caller of
 * `moveItemToFolder` from this side.
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

const goLibrary = async (app) => {
  await app.click('#navSeg button[data-nav="inventory"]');
  await settle(app);
};

test.describe('the library grid opens the item editor', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => { await goLibrary(app); });

  test('the root grid is the IKEA folder then the two unfiled items', async ({ app }) => {
    /* renderLibraryFolder lays folders before items, and "ikea/kallax" is
       filed under if-ikea so it is not here. This is the ground the rest of
       the file stands on. */
    expect(await tiles(app)).toEqual([
      ['tile folder', 'IKEA', '1 folder, 1 item'],
      ['tile', 'Sofa', '2.13 m × 0.91 m'],
      ['tile', 'Lamp', '0.4 m × 0.4 m'],
    ]);
    expect(await attrs(app, '#libContent .grid [data-item]', 'data-item')).toEqual(['sofa', 'lamp']);
    /* every item tile is its own drag source and its own button */
    expect(await attrs(app, '#libContent .grid [data-item]', 'draggable')).toEqual(['true', 'true']);
    expect(await attrs(app, '#libContent .grid [data-item]', 'role')).toEqual(['button', 'button']);
    expect(await attrs(app, '#libContent .grid [data-item]', 'aria-label'))
      .toEqual(['Edit Sofa', 'Edit Lamp']);
  });

  test('clicking a tile opens itemDialog on that item — the SCC edge', async ({ app }) => {
    await app.click('#libContent [data-item="sofa"]');
    await settle(app);
    await expect(app.locator('#moTitle')).toHaveText('Edit “Sofa”');
    await expect(app.locator('#iName')).toHaveValue('Sofa');
    await expect(app.locator('#iId')).toHaveValue('sofa');
    await expect(app.locator('#iShape')).toHaveValue('rect');
    await expect(app.locator('#fW')).toHaveValue('2.13 m');
    await expect(app.locator('#fD')).toHaveValue('0.91 m');
    await expect(app.locator('#iCount')).toHaveValue('1');
  });

  test('a second tile opens the dialog on the second item, not the first', async ({ app }) => {
    /* the listener is bound per tile off t.dataset.item, so a grid rebuilt
       with the handlers crossed over would still open *a* dialog */
    await app.click('#libContent [data-item="lamp"]');
    await settle(app);
    await expect(app.locator('#moTitle')).toHaveText('Edit “Lamp”');
    await expect(app.locator('#iShape')).toHaveValue('ellipse');
    await expect(app.locator('#iId')).toHaveValue('lamp');
  });

  test('Enter on a focused tile opens it too, Space as well', async ({ app }) => {
    await app.locator('#libContent [data-item="sofa"]').focus();
    await app.keyboard.press('Enter');
    await settle(app);
    await expect(app.locator('#moTitle')).toHaveText('Edit “Sofa”');
    await app.click('#moCancel');
    await settle(app);

    await app.locator('#libContent [data-item="lamp"]').focus();
    await app.keyboard.press(' ');
    await settle(app);
    await expect(app.locator('#moTitle')).toHaveText('Edit “Lamp”');
  });

  test('the tile\'s own ⋯ opens the row menu instead, and no dialog', async ({ app }) => {
    /* two guards do this, and they are independent: the click handler bails on
       `e.target.closest('[data-act=more]')`, and the ⋯ handler stops the event
       propagating. Either one going missing leaves the other holding it. */
    await app.click('#libContent [data-item="sofa"] [data-act=more]');
    await settle(app);
    await expect(app.locator('#modal')).toBeHidden();
    expect(await menuItems(app)).toEqual([
      'Sofa', 'Edit…', 'Move to folder…', 'Duplicate', 'Export…', '—', 'Delete…',
    ]);
  });

  test('editing through the tile writes to S and back into the grid', async ({ app }) => {
    /* the return trip is the point: itemDialog's onOk calls renderLibAll(),
       the other half of the cycle. A grid that does not refresh here is a
       broken edge, not a stale screenshot. */
    await app.click('#libContent [data-item="sofa"]');
    await settle(app);
    await app.fill('#iName', 'Chesterfield');
    await app.fill('#fW', '2.4 m');
    await app.click('#moOk');
    await settle(app);

    await expect(app.locator('#modal')).toBeHidden();
    const s = await readS(app);
    const sofa = s.inventory.find((i) => i.id === 'sofa');
    expect(sofa.name).toBe('Chesterfield');
    expect(sofa.shape.w).toBe(2400);
    expect(await tiles(app)).toEqual([
      ['tile folder', 'IKEA', '1 folder, 1 item'],
      ['tile', 'Chesterfield', '2.4 m × 0.91 m'],
      ['tile', 'Lamp', '0.4 m × 0.4 m'],
    ]);
  });

  test('a tile inside a folder opens the item filed there', async ({ app }) => {
    await app.click('#libContent [data-openfolder="if-ikea"]');
    await settle(app);
    expect(await attrs(app, '#libContent .grid [data-item]', 'data-item')).toEqual(['ikea/kallax']);
    await app.click('#libContent [data-item="ikea/kallax"]');
    await settle(app);
    await expect(app.locator('#moTitle')).toHaveText('Edit “Kallax”');
    await expect(app.locator('#iId')).toHaveValue('ikea/kallax');
  });

  test('a folder tile navigates instead of opening anything', async ({ app }) => {
    await app.click('#libContent [data-openfolder="if-ikea"]');
    await settle(app);
    await expect(app.locator('#modal')).toBeHidden();
    expect(await app.evaluate(() => window.__rp.nav.libFolderId)).toBe('if-ikea');
    expect(await texts(app, '#libContent .crumbs button')).toEqual(['All items', 'IKEA']);
    expect(await tiles(app)).toEqual([
      ['tile folder', 'Shelves', 'Empty'],
      ['tile', 'Kallax', '1.47 m × 0.39 m'],
    ]);
  });
});

test.describe('dragging a tile onto a folder tile', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => { await goLibrary(app); });

  test('the drop files the item and renames its id under the folder', async ({ app }) => {
    /* moveItemToFolder -> rehomeItemId: an item's id is a path, so filing it
       under the IKEA folder rewrites "sofa" to "IKEA/sofa" and retagItem
       repoints every placement at the new id. applyTags then materialises the
       folder's inherited tag onto it.

       CHARACTERIZED, NOT ENDORSED — the prefix is idSlug(folder.name), which
       preserves case, so the folder named "IKEA" files this item under
       "IKEA/..." while the item already sitting in it is "ikea/kallax". One
       folder, two id paths, and the S3-style grouping the id convention exists
       for is broken for whichever half was not dropped there. See BACKLOG.md
       "Known defects". */
    await app.dragAndDrop('#libContent [data-item="sofa"]', '#libContent [data-openfolder="if-ikea"]');
    await settle(app);

    const s = await readS(app);
    const sofa = s.inventory.find((i) => i.name === 'Sofa');
    expect(sofa.id).toBe('IKEA/sofa');
    expect(sofa.folderId).toBe('if-ikea');
    expect(sofa.tags).toEqual(['ikea']);
    expect(sofa.manualTags).toEqual([]);

    /* the grid rebuilt without it, and the folder's count went up */
    expect(await tiles(app)).toEqual([
      ['tile folder', 'IKEA', '1 folder, 2 items'],
      ['tile', 'Lamp', '0.4 m × 0.4 m'],
    ]);
    await expect(app.locator('#libFlash')).toHaveText('Moved “Sofa”');
  });

  test('a drop repoints the placements that used the old id', async ({ app }) => {
    /* "lamp" stands in the Living room as pl-2. retagItem is the only
       sanctioned id change precisely because it rewrites placed[].itemId and
       the furnHist snapshots, so an undo cannot bring the dead id back. */
    await app.dragAndDrop('#libContent [data-item="lamp"]', '#libContent [data-openfolder="if-ikea"]');
    await settle(app);

    const s = await readS(app);
    expect(s.inventory.find((i) => i.name === 'Lamp').id).toBe('IKEA/lamp');
    const living = s.layouts.find((l) => l.id === 'l-living');
    expect(living.placed.map((p) => p.itemId)).toEqual(['ikea/kallax', 'IKEA/lamp']);
  });

  test('the dragged tile carries the dragging class while it is in flight', async ({ app }) => {
    /* dragstart sets gridDragItem and the class; dragend clears both. Driven
       through the DOM events directly because Playwright's dragAndDrop is one
       atomic step with nothing observable in the middle. */
    const mid = await app.evaluate(() => {
      const t = document.querySelector('#libContent [data-item="sofa"]');
      const dt = new DataTransfer();
      t.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const on = t.classList.contains('dragging');
      t.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return { on, off: t.classList.contains('dragging') };
    });
    expect(mid).toEqual({ on: true, off: false });
  });

  test('a folder tile lights up on dragover and lets go on dragleave', async ({ app }) => {
    const seen = await app.evaluate(() => {
      const src = document.querySelector('#libContent [data-item="sofa"]');
      const dst = document.querySelector('#libContent [data-openfolder="if-ikea"]');
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const over = dst.classList.contains('dragover');
      dst.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: dt }));
      const left = dst.classList.contains('dragover');
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return { over, left };
    });
    expect(seen).toEqual({ over: true, left: false });
  });

  test('a drop with nothing in flight is ignored', async ({ app }) => {
    /* gridDragItem is module state, not the DataTransfer, so a drop that did
       not come from a grid dragstart moves nothing. */
    const before = await readS(app);
    await app.evaluate(() => {
      const dst = document.querySelector('#libContent [data-openfolder="if-ikea"]');
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    });
    await settle(app);
    expect((await readS(app)).inventory).toEqual(before.inventory);
  });
});
