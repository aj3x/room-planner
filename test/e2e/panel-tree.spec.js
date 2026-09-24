/* The left pane's layout tree, as text and state.
 *
 * Phase 3.6. `renderTree`/`renderTreeLevel`/`floorRowHTML`/`layoutRowHTML` and
 * the three rename helpers moved into src/plan/layout-tree.js in the plan/
 * round with no coverage at all, and everything that *acts* on a row —
 * enterFloor, the three ⋯ menus, the drag-and-drop listeners — is still in
 * index.html, inside the 48-name Plan/Library SCC that has to move in one
 * commit. A silent break here (rows missing, wrong indent, a caret that does
 * not expand, an absent ⋯) throws nothing and the suite screenshots only #cv.
 *
 * CHARACTERIZED, NOT ENDORSED. Everything below records what the app does
 * today, defects included. See BACKLOG.md "Known defects" for the two pinned
 * here.
 */

import {
  test, expect, fixtureState, settle, readS, attrs, menuItems,
} from './app-fixture.js';

const ROWS = '#layoutTree .tree-row, #layoutTree .tree-empty';

/** Every tree row as [kind, name-ish text, padding-left]. */
const treeRows = (app) => app.$$eval(ROWS, (els) => els.map((e) => [
  e.dataset.floor ? 'floor' : e.dataset.folder ? 'folder' : e.dataset.layout ? 'layout' : 'empty',
  e.textContent.replace(/\s+/g, ' ').trim(),
  e.style.paddingLeft,
]));

/** Wait for the tree to hold a row for `id` (or not to). */
const rowFor = (app, id) =>
  app.locator(`#layoutTree [data-floor="${id}"], #layoutTree [data-folder="${id}"], #layoutTree [data-layout="${id}"]`);

test.describe('the layout tree', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('the root renders floors first, then folders, then rooms on no floor', async ({ app }) => {
    /* Order is load-bearing: renderTreeLevel emits childFloors(null) before
       childFolders(parentId) before the loose layouts, and only at depth 0 are
       floors emitted at all. */
    expect(await treeRows(app)).toEqual([
      ['floor', 'Ground floor 2 rooms', '4px'],
      ['folder', 'Home', '4px'],
      ['layout', 'Shed', '26px'],
    ]);

    /* Both collapsible kinds start collapsed — treeOpen is a Set that is never
       persisted, so a reload always lands here. */
    expect(await attrs(app, '#layoutTree [data-floor], #layoutTree [data-folder]', 'aria-expanded'))
      .toEqual(['false', 'false']);

    /* every row offers its ⋯, including the floor */
    expect(await app.locator('#layoutTree .tree-row [data-act=more]').count()).toBe(3);
  });

  test('a floor row counts its rooms, and pluralises', async ({ app }) => {
    await expect(app.locator('#layoutTree [data-floor="fl-ground"] .tagchip')).toHaveText('2 rooms');

    await app.evaluate(() => {
      window.__rp.S.layouts = window.__rp.S.layouts.filter((l) => l.id !== 'l-bed');
      window.__rp.S.active = 'l-shed';
      window.draw();
    });
    await app.evaluate(() => window.renderAll());
    await settle(app);
    await expect(app.locator('#layoutTree [data-floor="fl-ground"] .tagchip')).toHaveText('1 room');
  });

  test('the caret expands a floor and its rooms appear indented under it', async ({ app }) => {
    await expect(rowFor(app, 'l-living')).toHaveCount(0);

    const caret = app.locator('#layoutTree [data-floor="fl-ground"] .caret');
    await expect(caret).toHaveAttribute('aria-label', 'Expand');
    await caret.click();
    await settle(app);

    await expect(app.locator('#layoutTree [data-floor="fl-ground"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(app.locator('#layoutTree [data-floor="fl-ground"] .caret')).toHaveAttribute('aria-label', 'Collapse');

    /* depth 0 floor -> its rooms at depth 1 -> 1*12 + 26 = 38px */
    expect(await treeRows(app)).toEqual([
      ['floor', 'Ground floor 2 rooms', '4px'],
      ['layout', 'Living room', '38px'],
      ['layout', 'Bedroom', '38px'],
      ['folder', 'Home', '4px'],
      ['layout', 'Shed', '26px'],
    ]);

    /* the active room is marked, and only it */
    expect(await attrs(app, '#layoutTree [data-layout]', 'aria-current')).toEqual(['true', null, null]);
    expect(await app.locator('#layoutTree .layout-row.active').count()).toBe(1);
    await expect(app.locator('#layoutTree .layout-row.active .nm')).toHaveText('Living room');

    await app.locator('#layoutTree [data-floor="fl-ground"] .caret').click();
    await settle(app);
    await expect(rowFor(app, 'l-living')).toHaveCount(0);
  });

  test('CHARACTERIZED, NOT ENDORSED: the active room is not visible at boot when its floor is collapsed', async ({ app }) => {
    /* treeOpen starts empty and is never persisted, so a room standing on a
       floor is hidden on every load — including the one the app is currently
       showing on the canvas. The tree offers no "reveal the active room".
       Pinned as-is; logged in BACKLOG.md under Known defects. */
    expect((await readS(app)).active).toBe('l-living');
    await expect(rowFor(app, 'l-living')).toHaveCount(0);
    await expect(app.locator('#layoutTree .layout-row.active')).toHaveCount(0);
  });

  test('a folder expands to its subfolders, and an empty one says so', async ({ app }) => {
    await app.locator('#layoutTree [data-folder="f-home"] .caret').click();
    await settle(app);

    /* Attic carries two tags; folderLabel shows the first plus a +N count. */
    const attic = app.locator('#layoutTree [data-folder="f-attic"]');
    await expect(attic.locator('.nm')).toHaveText('Attic');
    await expect(attic.locator('.tagchip')).toHaveText('cold +1');
    await expect(attic.locator('.tagchip')).toHaveAttribute('title', 'Tag filter: cold, dusty');
    /* depth 1 folder -> 1*12 + 4 */
    expect(await attrs(app, '#layoutTree [data-folder="f-attic"]', 'style')).toEqual(['padding-left:16px']);

    await attic.locator('.caret').click();
    await settle(app);
    expect(await treeRows(app)).toEqual([
      ['floor', 'Ground floor 2 rooms', '4px'],
      ['folder', 'Home', '4px'],
      ['folder', 'Atticcold +1', '16px'],
      ['empty', 'Empty', '50px'],
      ['layout', 'Shed', '26px'],
    ]);
  });

  test('an expanded floor with no rooms left on it says "No rooms yet"', async ({ app }) => {
    await app.locator('#layoutTree [data-floor="fl-ground"] .caret').click();
    await settle(app);
    await app.evaluate(() => {
      for (const l of window.__rp.S.layouts) l.floorId = null;
      window.__rp.S.active = 'l-shed';
    });
    await app.evaluate(() => window.renderAll());
    await settle(app);

    const rows = await treeRows(app);
    expect(rows[0]).toEqual(['floor', 'Ground floor 0 rooms', '4px']);
    expect(rows[1]).toEqual(['empty', 'No rooms yet', '38px']);
  });

  test('the ⋯ opens the right menu for each kind of row', async ({ app }) => {
    await app.locator('#layoutTree [data-floor="fl-ground"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual([
      'Ground floor', 'Rename', 'Rooms on this floor…',
      'Import a blueprint onto this floor…', '—', 'Delete floor…',
    ]);
    await app.keyboard.press('Escape');

    await app.locator('#layoutTree [data-folder="f-home"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual([
      'Home', 'Rename', 'Add a room here', 'Add a subfolder', '—',
      'Move to folder…', 'Edit tag filter…', '—', 'Delete folder…',
    ]);
    await app.keyboard.press('Escape');

    await app.locator('#layoutTree [data-layout="l-shed"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual([
      'Shed', 'Open', 'Rename', 'Duplicate', 'Split room…', 'Move to folder…',
      'Put on a floor…', '—', 'Delete room…',
    ]);
    await app.keyboard.press('Escape');
    await expect(app.locator('.menu')).toHaveCount(0);
  });

  test('a room already on a floor is offered "Take off" instead of "Put on"', async ({ app }) => {
    await app.locator('#layoutTree [data-floor="fl-ground"] .caret').click();
    await settle(app);
    await app.locator('#layoutTree [data-layout="l-living"] [data-act=more]').click();
    expect(await menuItems(app)).toContain('Take off “Ground floor”');
    expect(await menuItems(app)).not.toContain('Put on a floor…');
  });
});

test.describe('renaming a tree row in place', () => {
  test.use({ savedState: fixtureState('panels.json') });

  /* inlineEdit replaces the .nm span with an <input class="inline-edit">, and
     singleClick() holds the row's own click action back 190ms so the second
     click of a double-click can land. Nothing sleeps here: the input is polled
     for by the locator. */
  const editor = (app) => app.locator('#layoutTree input.inline-edit');

  test('double-clicking a room name opens an editor seeded with the name, and Enter keeps it', async ({ app }) => {
    await app.locator('#layoutTree [data-layout="l-shed"] .nm').dblclick();
    await expect(editor(app)).toBeVisible();
    await expect(editor(app)).toHaveValue('Shed');

    await editor(app).fill('Workshop');
    await editor(app).press('Enter');
    await expect(editor(app)).toHaveCount(0);

    await expect(app.locator('#layoutTree [data-layout="l-shed"] .nm')).toHaveText('Workshop');
    expect((await readS(app)).layouts.find((l) => l.id === 'l-shed').name).toBe('Workshop');
  });

  test('Escape leaves the name alone', async ({ app }) => {
    await app.locator('#layoutTree [data-layout="l-shed"] .nm').dblclick();
    await editor(app).fill('Nope');
    await editor(app).press('Escape');
    await expect(editor(app)).toHaveCount(0);
    await expect(app.locator('#layoutTree [data-layout="l-shed"] .nm')).toHaveText('Shed');
    expect((await readS(app)).layouts.find((l) => l.id === 'l-shed').name).toBe('Shed');
  });

  test('a folder and a floor rename the same way', async ({ app }) => {
    await app.locator('#layoutTree [data-folder="f-home"] .nm').dblclick();
    await editor(app).fill('House');
    await editor(app).press('Enter');
    await expect(app.locator('#layoutTree [data-folder="f-home"] .nm')).toHaveText('House');
    expect((await readS(app)).folders.find((f) => f.id === 'f-home').name).toBe('House');

    await app.locator('#layoutTree [data-floor="fl-ground"] .nm').dblclick();
    await editor(app).fill('Downstairs');
    await editor(app).press('Enter');
    await expect(app.locator('#layoutTree [data-floor="fl-ground"] .nm')).toHaveText('Downstairs');
    expect((await readS(app)).floors.find((f) => f.id === 'fl-ground').name).toBe('Downstairs');
  });

  test('an editor open on a row turns that row\'s drag off', async ({ app }) => {
    /* inlineEdit clears draggable on the closest [draggable] so the text stays
       selectable — a small thing, but it is what makes the box usable at all. */
    await app.locator('#layoutTree [data-layout="l-shed"] .nm').dblclick();
    await expect(editor(app)).toBeVisible();
    expect(await app.getAttribute('#layoutTree [data-layout="l-shed"]', 'draggable')).toBe('false');
  });
});

test.describe('dragging a row in the tree', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('dropping a room on the middle of a folder row files it in that folder', async ({ app }) => {
    expect((await readS(app)).layouts.find((l) => l.id === 'l-shed').folderId).toBeNull();

    await app.dragAndDrop('#layoutTree [data-layout="l-shed"]', '#layoutTree [data-folder="f-home"]');
    await settle(app);

    /* dropHalf puts the centre of the row in the 0.3..0.7 band, which is
       treeDropSpot's 'into'. The folder is opened by the drop, so the row is
       now visible one level down. */
    expect((await readS(app)).layouts.find((l) => l.id === 'l-shed').folderId).toBe('f-home');
    await expect(app.locator('#layoutTree [data-folder="f-home"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(app.locator('#layoutTree [data-layout="l-shed"]')).toHaveCount(1);
  });

  test('dropping a room on a floor row stands it on that floor', async ({ app }) => {
    await app.dragAndDrop('#layoutTree [data-layout="l-shed"]', '#layoutTree [data-floor="fl-ground"]');
    await settle(app);

    expect((await readS(app)).layouts.find((l) => l.id === 'l-shed').floorId).toBe('fl-ground');
    await expect(app.locator('#layoutTree [data-floor="fl-ground"] .tagchip')).toHaveText('3 rooms');
  });
});
