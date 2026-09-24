/* The Furniture pane: the inventory list, the tag chips and the Selected panel.
 *
 * Phase 3.6. `renderInv`/`renderTagChips` moved into src/plan/item-list.js in
 * the plan/ round; `renderSel` did not — it is one of the 48 names in the
 * Plan/Library SCC, and `deleteLibItem` calls straight into it, which is one
 * of the six edges that make the cycle. All three rebuild a panel with
 * innerHTML and none of them was asserted before this file.
 *
 * CHARACTERIZED, NOT ENDORSED: what the app does today, defects included.
 */

import {
  test, expect, fixtureState, settle, readS, texts, attrs, menuItems,
} from './app-fixture.js';

/** Each inventory row as [name, meta, count badge, Place-disabled]. */
const invRows = (app) => app.$$eval('#invList li', (els) => els.map((e) => [
  e.querySelector('.nm')?.textContent ?? null,
  e.querySelector('.meta')?.textContent ?? null,
  e.querySelector('.count')?.textContent ?? null,
  e.querySelector('[data-act=place]')?.disabled ?? null,
]));

const chips = (app) => app.$$eval('#tagChips button', (els) =>
  els.map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.className]));

test.describe('Furniture pane › Inventory', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => {
    await app.evaluate(() => window.setMode('furniture'));
    await settle(app);
  });

  test('one row per item, with size, stock and the in-this-room count', async ({ app }) => {
    /* The fixture owns 2 Kallax and has placed 1, owns 1 Lamp and has placed
       it. The "N of M free" half of the meta only appears when the item is
       either multiple or partly used — the Sofa shows size alone. */
    expect(await invRows(app)).toEqual([
      ['Kallax', '1.47 m × 0.39 m · 1 of 2 free', '1', false],
      ['Sofa', '2.13 m × 0.91 m', null, false],
      ['Lamp', '0.4 m × 0.4 m · 0 of 1 free', '1', true],
    ]);
    expect(await attrs(app, '#invList li', 'data-id')).toEqual(['ikea/kallax', 'sofa', 'lamp']);
  });

  test('Place is disabled exactly when nothing is left, and the row is dimmed', async ({ app }) => {
    expect(await attrs(app, '#invList li', 'class')).toEqual(['', '', 'off']);
    await expect(app.locator('#invList li[data-id="lamp"] [data-act=place]'))
      .toHaveAttribute('title', 'None left to place');
    await expect(app.locator('#invList li[data-id="sofa"] [data-act=place]'))
      .toHaveAttribute('title', 'Place in this room');

    /* placing the last free Kallax flips its Place button too */
    await app.locator('#invList li[data-id="ikea/kallax"] [data-act=place]').click();
    await settle(app);
    expect(await invRows(app)).toEqual([
      ['Kallax', '1.47 m × 0.39 m · 0 of 2 free', '2', true],
      ['Sofa', '2.13 m × 0.91 m', null, false],
      ['Lamp', '0.4 m × 0.4 m · 0 of 1 free', '1', true],
    ]);
  });

  test('the scope picker rewrites the hint and the stock arithmetic', async ({ app }) => {
    await expect(app.locator('#invScopeHint'))
      .toHaveText('One pool for every room: placing an item anywhere takes it out of stock everywhere.');

    await app.selectOption('#invScope', 'room');
    await settle(app);
    await expect(app.locator('#invScopeHint'))
      .toHaveText('Every room starts with full stock. Only this room’s placements count.');
    /* the active room is the one holding both placements, so the numbers do
       not move — what changes is which rooms are counted */
    expect((await invRows(app))[0]).toEqual(['Kallax', '1.47 m × 0.39 m · 1 of 2 free', '1', false]);

    await app.selectOption('#invScope', 'folder');
    await settle(app);
    await expect(app.locator('#invScopeHint'))
      .toHaveText('Rooms directly in the same folder share a pool. A subfolder keeps its own stock.');
  });

  test('the "Only what is free" filter hides the exhausted item', async ({ app }) => {
    await app.click('label.chip-toggle');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Kallax', 'Sofa']);
    expect((await readS(app)).onlyAvailable).toBe(true);

    await app.click('label.chip-toggle');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Kallax', 'Sofa', 'Lamp']);
  });

  test('search matches name and tag, and an empty result says so', async ({ app }) => {
    await app.fill('#invSearch', 'sof');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Sofa']);

    await app.fill('#invSearch', 'lighting');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Lamp']);

    await app.fill('#invSearch', 'zzz');
    await settle(app);
    expect(await texts(app, '#invList li')).toEqual(['Nothing matches this filter.']);
  });

  test('an empty library hides the search and filter rows and shows the empty block', async ({ app }) => {
    await app.evaluate(() => { window.__rp.S.inventory = []; window.renderAll(); });
    await settle(app);
    expect(await app.locator('#invList li').count()).toBe(0);
    expect(await app.evaluate(() => document.getElementById('invEmpty').hidden)).toBe(false);
    expect(await app.evaluate(() => document.querySelector('#invSearch').closest('.search').hidden)).toBe(true);
    expect(await app.evaluate(() => document.querySelector('#onlyAvail').closest('.filters').hidden)).toBe(true);
  });

  test('the ⋯ on an item row', async ({ app }) => {
    await app.locator('#invList li[data-id="sofa"] [data-act=more]').click();
    expect((await menuItems(app))[0]).toBe('Sofa');
    expect(await menuItems(app)).toContain('Edit…');
    expect(await menuItems(app)).toContain('Delete…');
  });

  test('double-clicking an item name renames it in place', async ({ app }) => {
    await app.locator('#invList li[data-id="sofa"] .nm').dblclick();
    const box = app.locator('#invList input.inline-edit');
    await expect(box).toHaveValue('Sofa');
    await box.fill('Couch');
    await box.press('Enter');
    await expect(app.locator('#invList li[data-id="sofa"] .nm')).toHaveText('Couch');
    expect((await readS(app)).inventory.find((i) => i.id === 'sofa').name).toBe('Couch');
  });
});

test.describe('Furniture pane › tag chips', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => {
    await app.evaluate(() => window.setMode('furniture'));
    await settle(app);
  });

  test('one chip per tag, sorted, plus Untagged — and no Clear until something is on', async ({ app }) => {
    /* allTags() unions the item tags with the item-folder tags, so "ikea"
       arrives from both the Kallax and the IKEA folder and appears once. */
    expect(await chips(app)).toEqual([
      ['ikea', 'false', ''],
      ['lighting', 'false', ''],
      ['storage', 'false', ''],
      ['Untagged', 'false', 'untagged'],
    ]);
    expect(await app.evaluate(() => document.getElementById('tagChips').hidden)).toBe(false);
  });

  test('pressing a chip filters the list, sets aria-pressed and grows a Clear', async ({ app }) => {
    await app.click('#tagChips button[data-t="storage"]');
    await settle(app);
    expect(await chips(app)).toEqual([
      ['ikea', 'false', ''],
      ['lighting', 'false', ''],
      ['storage', 'true', ''],
      ['Untagged', 'false', 'untagged'],
      ['Clear', null, 'clear'],
    ]);
    expect(await texts(app, '#invList li .nm')).toEqual(['Kallax']);

    /* chips read as "any of these" */
    await app.click('#tagChips button[data-t="lighting"]');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Kallax', 'Lamp']);

    await app.click('#tagChips button[data-clear]');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Kallax', 'Sofa', 'Lamp']);
    expect(await chips(app)).toHaveLength(4);
  });

  test('the Untagged chip is one of the "any of these", not an extra narrowing', async ({ app }) => {
    await app.click('#tagChips button[data-untagged]');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Sofa']);

    await app.click('#tagChips button[data-t="lighting"]');
    await settle(app);
    expect(await texts(app, '#invList li .nm')).toEqual(['Sofa', 'Lamp']);
  });

  test('the Untagged chip disappears when every item carries a tag, and the flag is cleared with it', async ({ app }) => {
    await app.click('#tagChips button[data-untagged]');
    await settle(app);
    expect((await readS(app)).untaggedOnly).toBe(true);

    await app.evaluate(() => {
      window.__rp.S.inventory.find((i) => i.id === 'sofa').tags = ['seating'];
      window.renderAll();
    });
    await settle(app);
    expect(await app.locator('#tagChips button[data-untagged]').count()).toBe(0);
    expect((await readS(app)).untaggedOnly).toBe(false);
  });

  test('the chip strip hides itself when there are no tags at all', async ({ app }) => {
    await app.evaluate(() => {
      for (const i of window.__rp.S.inventory) { i.tags = []; i.manualTags = []; }
      for (const f of window.__rp.S.itemFolders) f.tags = [];
      window.renderAll();
    });
    await settle(app);
    expect(await app.evaluate(() => document.getElementById('tagChips').hidden)).toBe(true);
    expect(await app.locator('#tagChips button').count()).toBe(0);
  });
});

test.describe('Furniture pane › the Selected panel', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => {
    await app.evaluate(() => window.setMode('furniture'));
    await settle(app);
  });

  test('nothing selected shows the keyboard crib sheet and marks the section empty', async ({ app }) => {
    await expect(app.locator('section[data-sec=sel]')).toHaveClass(/is-empty/);
    await expect(app.locator('#selBox p.hint')).toHaveText('Click an item in the plan to move, turn or remove it.');
    expect(await texts(app, '#selBox dl.kbd dt')).toEqual([
      'Nudge', 'Turn 90°', 'Remove', 'Drag without snap', 'Select multiple',
    ]);
  });

  test('one item selected shows its name, its place in the room and its angle', async ({ app }) => {
    await app.evaluate(() => { window.selectOnly('pl-1'); window.renderAll(); });
    await settle(app);

    await expect(app.locator('section[data-sec=sel]')).not.toHaveClass(/is-empty/);
    await expect(app.locator('#selBox .selhead .nm')).toHaveText('Kallax');
    /* the Kallax sits at (900,700) with a 1470 x 390 footprint, so its box
       starts 165mm from the left wall and 505mm from the top */
    await expect(app.locator('#sX')).toHaveValue('0.17 m');
    await expect(app.locator('#sY')).toHaveValue('0.51 m');
    await expect(app.locator('#sR')).toHaveValue('0');
    expect(await texts(app, '#selBox .row.actions button')).toEqual(['Duplicate', 'Remove']);
    /* the Kallax opens 400mm out of its back, so the open-footprint note is on */
    expect(await texts(app, '#selBox p.hint')).toContain('Opens out to 1.47 m × 0.79 m.');
  });

  test('two items selected collapse to a count and a shorter crib sheet', async ({ app }) => {
    await app.evaluate(() => { window.selectSet(['pl-1', 'pl-2']); window.renderAll(); });
    await settle(app);

    await expect(app.locator('#selBox .selhead .nm')).toHaveText('2 items selected');
    expect(await texts(app, '#selBox .row.actions button')).toEqual(['Duplicate', 'Remove']);
    expect(await texts(app, '#selBox dl.kbd dt')).toEqual(['Nudge', 'Remove']);
    await expect(app.locator('#sX')).toHaveCount(0);
  });
});
