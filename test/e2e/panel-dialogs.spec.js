/* `itemDialog` and `openingDialog` — the two SCC members nothing opened.
 *
 * Phase 3.6 asserted the `⋯` menus that *open* these two, item for item, and
 * then stopped at the menu. Both are large modal editors inside the 48-name
 * Plan/Library strongly-connected component, and `itemDialog` sits on four of
 * the six edges that make the cycle (setMode -> renderLibAll,
 * itemDialog -> renderLibAll, createLibItem / libItemMenu / bindLibGrid ->
 * itemDialog), so the single commit that moves the component leans on it more
 * than on anything else in there.
 *
 * What these read: the dialog opening and its fields reflecting the item or the
 * opening, an edit written through to `S` by OK, Cancel writing nothing, the
 * validation branches that keep the modal open, and the Advanced id field —
 * user-editable, held to a URL/S3-safe set by `idProblem()`, with `retagItem()`
 * the only sanctioned way to change an id. `retagItem` rewrites `placed[].itemId`
 * in every layout *and* inside the `furnHist` snapshots, so an undo cannot
 * resurrect the old id; that is asserted explicitly, by undoing.
 *
 * CHARACTERIZED, NOT ENDORSED: what the app does today.
 */

import {
  test, expect, fixtureState, settle, readS, texts, attrs,
} from './app-fixture.js';

/** Value of a form control inside the modal. */
const val = (app, sel) => app.inputValue(sel);

/** The ids of the fields `shapeFieldHTML` built, in order. */
const shapeFields = (app) => app.$$eval('#shapeFields input,#shapeFields select,#shapeFields textarea',
  (els) => els.map((e) => e.id));

const goto = async (app, place) => {
  await app.click(`#navSeg button[data-nav="${place}"]`);
  await settle(app);
};

/** Open the Furniture pane's ⋯ menu for an inventory row, and pick an entry. */
async function invMenu(app, id, label) {
  await app.locator(`#invList li[data-id="${id}"] [data-act=more]`).click();
  await app.locator(`.menu button:text-is("${label}")`).click();
}

/** Open the Openings list's ⋯ menu for one opening, and pick an entry. */
async function openMenu(app, id, label) {
  await app.locator(`#openList li[data-id="${id}"] [data-act=more]`).click();
  await app.locator(`.menu button:text-is("${label}")`).click();
}

/* The fixture opens in Room mode; the inventory list lives in Furniture mode. */
const toFurniture = async (app) => {
  await app.click('#modeSeg button[data-mode="furniture"]');
  await settle(app);
};

test.describe('itemDialog — an existing item', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => {
    await toFurniture(app);
    await invMenu(app, 'ikea/kallax', 'Edit…');
    await expect(app.locator('#modal')).toBeVisible();
  });

  test('every field opens reflecting the item', async ({ app }) => {
    await expect(app.locator('#moTitle')).toHaveText('Edit “Kallax”');
    await expect(app.locator('#moOk')).toHaveText('Save');

    expect(await val(app, '#iName')).toBe('Kallax');
    expect(await val(app, '#iShape')).toBe('rect');
    /* metric fixture, so fmtLen is short and exact */
    expect(await shapeFields(app)).toEqual(['fW', 'fD']);
    expect(await val(app, '#fW')).toBe('1.47 m');
    expect(await val(app, '#fD')).toBe('0.39 m');
    expect(await val(app, '#iCount')).toBe('2');
    expect(await val(app, '#iHex')).toBe('#b8975a');
    expect(await val(app, '#iColPick')).toBe('#b8975a');

    /* the tag field is seeded from manualTags, not from the folder-inherited
       tags the item also carries */
    expect(await texts(app, '#iTags .tag')).toEqual(['storage×']);

    await expect(app.locator('#iPass')).not.toBeChecked();
    await expect(app.locator('#iOpenOn')).toBeChecked();
    await expect(app.locator('#openFields')).toBeVisible();
    expect(await val(app, '#oTop')).toBe('0 m');
    expect(await val(app, '#oBottom')).toBe('0.4 m');

    /* the id is clean, so Advanced stays folded, and the note explains where
       the slash files it */
    await expect(app.locator('details.adv')).not.toHaveAttribute('open', '');
    expect(await val(app, '#iId')).toBe('ikea/kallax');
    await expect(app.locator('#iIdNote')).toHaveText('Filed under ikea, as kallax');
  });

  test('the swatches, the picker and the hex box stay in step', async ({ app }) => {
    /* the item's own colour is in PALETTE, so exactly one swatch opens pressed */
    expect(await attrs(app, '#iSwatches button', 'aria-pressed'))
      .toEqual((await attrs(app, '#iSwatches button', 'data-c')).map((c) => String(c === '#b8975a')));

    const second = app.locator('#iSwatches button').nth(1);
    const colour = await second.getAttribute('data-c');
    await second.click();
    expect(await val(app, '#iHex')).toBe(colour);
    expect(await val(app, '#iColPick')).toBe(colour);
    expect(await attrs(app, '#iSwatches button', 'aria-pressed')).toEqual(
      (await attrs(app, '#iSwatches button', 'data-c')).map((c) => String(c === colour)),
    );

    /* a bad hex marks the box and leaves the live colour alone */
    await app.fill('#iHex', '#zzz');
    await expect(app.locator('#iHex')).toHaveClass(/bad/);
    /* blur repaints it back to the colour actually in force */
    await app.locator('#iName').click();
    expect(await val(app, '#iHex')).toBe(colour);
    await expect(app.locator('#iHex')).not.toHaveClass(/bad/);
  });

  test('the shape picker swaps the field set, keeping the item\'s own values only for its own type', async ({ app }) => {
    /* shapeFieldHTML is handed the item's own shape only when the type still
       matches, so switching away falls back to the 0.9 x 0.6 m defaults and
       the typed-in size is gone */
    await app.selectOption('#iShape', 'ellipse');
    expect(await shapeFields(app)).toEqual(['fW', 'fD']);
    expect(await val(app, '#fW')).toBe('0.9 m');

    await app.selectOption('#iShape', 'lshape');
    expect(await shapeFields(app)).toEqual(['fW', 'fD', 'fCW', 'fCD', 'fCorner']);
    expect(await val(app, '#fW')).toBe('0.9 m');
    expect(await val(app, '#fCorner')).toBe('nw');

    await app.selectOption('#iShape', 'poly');
    expect(await shapeFields(app)).toEqual(['pPts']);

    await app.selectOption('#iShape', 'rect');
    expect(await val(app, '#fW')).toBe('1.47 m');
  });

  test('the open-out fields are revealed and hidden by their own checkbox', async ({ app }) => {
    await app.uncheck('#iOpenOn');
    await expect(app.locator('#openFields')).toBeHidden();
    await app.check('#iOpenOn');
    await expect(app.locator('#openFields')).toBeVisible();
  });

  test('Cancel writes nothing', async ({ app }) => {
    await app.fill('#iName', 'Renamed');
    await app.fill('#fW', '2 m');
    await app.click('#moCancel');
    await expect(app.locator('#modal')).toBeHidden();

    const it = (await readS(app)).inventory.find((i) => i.id === 'ikea/kallax');
    expect(it.name).toBe('Kallax');
    expect(it.shape).toEqual({ type: 'rect', w: 1470, d: 390 });
    await expect(app.locator('#invList li[data-id="ikea/kallax"] .nm')).toHaveText('Kallax');
  });

  test('OK writes every field through to S, and the list redraws', async ({ app }) => {
    await app.fill('#iName', 'Kallax 4x2');
    await app.fill('#fW', '1.5 m');
    await app.fill('#fD', '40 cm');
    await app.fill('#iCount', '5');
    await app.check('#iPass');
    await app.uncheck('#iOpenOn');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    const it = (await readS(app)).inventory.find((i) => i.id === 'ikea/kallax');
    expect(it.name).toBe('Kallax 4x2');
    expect(it.shape).toEqual({ type: 'rect', w: 1500, d: 400 });
    expect(it.count).toBe(5);
    expect(it.passThrough).toBe(true);
    expect(it.open).toBe(null);
    /* manualTags survive untouched and applyTags re-derives the inherited half */
    expect(it.manualTags).toEqual(['storage']);
    expect(it.tags).toEqual(['storage', 'ikea']);
    await expect(app.locator('#invList li[data-id="ikea/kallax"] .nm')).toHaveText('Kallax 4x2');
  });

  test('a width that is not a positive length keeps the dialog open', async ({ app }) => {
    await app.fill('#fW', 'nonsense');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('Width and depth must be positive');
    await expect(app.locator('#modal')).toBeVisible();
    await app.fill('#fW', '0');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('Width and depth must be positive');
    expect((await readS(app)).inventory.find((i) => i.id === 'ikea/kallax').shape.w).toBe(1470);
  });
});

test.describe('itemDialog — the Advanced id field', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test.beforeEach(async ({ app }) => {
    await toFurniture(app);
    await invMenu(app, 'ikea/kallax', 'Edit…');
    await app.locator('details.adv summary').click();
  });

  test('the note follows what is typed, and idProblem marks what it refuses', async ({ app }) => {
    for (const [typed, note] of [
      ['ikea/kallax/4x2', 'Filed under ikea/kallax, as 4x2'],
      ['kallax', 'No folder — sits at the top level.'],
      ['a b', 'Ids can use a–z A–Z 0–9 and - _ . with / between folders'],
      ['/kallax', 'An id can\'t start or end with /'],
      ['ikea//kallax', 'An id can\'t have an empty part between two slashes'],
      ['ikea/../kallax', 'An id can\'t have .. as a part'],
    ]) {
      await app.fill('#iId', typed);
      await expect(app.locator('#iIdNote')).toHaveText(note);
    }
    await expect(app.locator('#iId')).toHaveClass(/bad/);

    /* an empty box is refused but says nothing — the note is blank while the
       field is empty, and the message only arrives on Save */
    await app.fill('#iId', '');
    await expect(app.locator('#iIdNote')).toHaveText('');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('Give it an id');
    await expect(app.locator('#modal')).toBeVisible();
  });

  test('a refused id forces Advanced open rather than saving behind a fold', async ({ app }) => {
    await app.fill('#iId', 'ikea kallax');
    await app.locator('details.adv summary').click();     // fold it away again
    await expect(app.locator('details.adv')).not.toHaveAttribute('open', '');
    await app.click('#moOk');
    await expect(app.locator('details.adv')).toHaveAttribute('open', '');
    await expect(app.locator('#moErr'))
      .toHaveText('Ids can use a–z A–Z 0–9 and - _ . with / between folders');
  });

  test('an id another item already uses is refused', async ({ app }) => {
    await app.fill('#iId', 'sofa');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('Another item already uses that id');
    await expect(app.locator('#modal')).toBeVisible();
    expect((await readS(app)).inventory.map((i) => i.id)).toEqual(['ikea/kallax', 'sofa', 'lamp']);
  });

  test('renaming an id rewrites every placement that points at it', async ({ app }) => {
    await app.fill('#iId', 'ikea/kallax/4x2');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    const s = await readS(app);
    expect(s.inventory.map((i) => i.id)).toEqual(['ikea/kallax/4x2', 'sofa', 'lamp']);
    expect(s.layouts[0].placed.map((p) => p.itemId)).toEqual(['ikea/kallax/4x2', 'lamp']);
    /* the row is still there, so the placement resolved to an item */
    await expect(app.locator('#invList li[data-id="ikea/kallax/4x2"] .nm')).toHaveText('Kallax');
  });
});

test.describe('itemDialog — retagItem and the furniture history', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('an undo cannot bring the old id back', async ({ app }) => {
    await toFurniture(app);

    /* one furniture commit, so furnHist holds a snapshot naming `lamp` */
    await invMenu(app, 'sofa', 'Place in this room');
    await settle(app);
    expect((await readS(app)).layouts[0].placed.map((p) => p.itemId))
      .toEqual(['ikea/kallax', 'lamp', 'sofa']);
    expect(await app.evaluate(() => JSON.stringify(window.__rp.furnHist))).toContain('lamp');

    await invMenu(app, 'lamp', 'Edit…');
    await app.locator('details.adv summary').click();
    await app.fill('#iId', 'lighting/lamp');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    /* retagItem rewrote the live placements AND every furnHist snapshot */
    expect(await app.evaluate(() => JSON.stringify(window.__rp.furnHist))).not.toContain('"lamp"');

    await app.click('#btnUndo');
    await settle(app);
    const s = await readS(app);
    /* back to before the Place, and the old id did not come back with it */
    expect(s.layouts[0].placed.map((p) => p.itemId)).toEqual(['ikea/kallax', 'lighting/lamp']);
    expect(JSON.stringify(s.layouts)).not.toContain('"lamp"');
    expect(s.inventory.map((i) => i.id)).toEqual(['ikea/kallax', 'sofa', 'lighting/lamp']);
  });
});

test.describe('itemDialog — a new item', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('from the Library, it opens empty and is filed in the folder being browsed', async ({ app }) => {
    await goto(app, 'inventory');
    await app.locator('#tree [data-folder="if-ikea"] .nm').click();
    await expect(app.locator('#tree [data-folder="if-ikea"]')).toHaveClass(/active/);

    await app.click('#btnNewLibItem');
    await expect(app.locator('#moTitle')).toHaveText('New item');
    expect(await val(app, '#iName')).toBe('');
    expect(await val(app, '#iCount')).toBe('1');
    expect(await val(app, '#iShape')).toBe('rect');
    expect(await shapeFields(app)).toEqual(['fW', 'fD']);
    expect(await texts(app, '#iTags .tagchip')).toEqual([]);
    /* a generated id, which idProblem() is happy with, so Advanced is folded */
    await expect(app.locator('details.adv')).not.toHaveAttribute('open', '');
    const generated = await val(app, '#iId');
    expect(generated).toMatch(/^[a-z0-9]{8}$/);
    await expect(app.locator('#iIdNote')).toHaveText('No folder — sits at the top level.');

    await app.fill('#iName', 'Billy');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    const s = await readS(app);
    const added = s.inventory.find((i) => i.name === 'Billy');
    expect(added.folderId).toBe('if-ikea');
    /* an untouched id is rehomed under the folder's own path on the way in */
    expect(added.id).toBe(`IKEA/${generated}`);
    expect(added.count).toBe(1);
    expect(added.shape).toEqual({ type: 'rect', w: 900, d: 600 });
  });

  test('a custom outline needs at least three corners', async ({ app }) => {
    await toFurniture(app);
    await app.click('#btnAddItem');
    await app.selectOption('#iShape', 'poly');
    await app.fill('#pPts', '0,0\n1,1');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('An outline needs at least 3 corners');
    await expect(app.locator('#modal')).toBeVisible();

    await app.fill('#pPts', '0,0\n1,0\n1,1');
    await app.fill('#iName', 'Wedge');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();
    const added = (await readS(app)).inventory.find((i) => i.name === 'Wedge');
    expect(added.shape).toEqual({ type: 'poly', points: [[0, 0], [1000, 0], [1000, 1000]] });
  });
});

test.describe('openingDialog — an existing opening', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('a hinged door opens with its wall, width, offset and hinge', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    /* the title is KIND(o) lower-cased, so it names the door's own type */
    await expect(app.locator('#moTitle')).toHaveText('Edit hinged door');

    /* wall 2 is turned off in the fixture, so it is not offered — only the
       three live walls, each labelled with its own length */
    expect(await texts(app, '#dWall option')).toEqual([
      'Wall 1 (5 m)', 'Wall 2 (4 m)', 'Wall 4 (4 m)',
    ]);
    expect(await val(app, '#dWall')).toBe('0');
    expect(await val(app, '#dWidth')).toBe('0.8 m');
    expect(await val(app, '#dCorner')).toBe('cw');
    expect(await val(app, '#dOffset')).toBe('1 m');
    expect(await val(app, '#dType')).toBe('hinge');
    expect(await val(app, '#dHinge')).toBe('start');
    expect(await val(app, '#dSwing')).toBe('in');
    await expect(app.locator('#hingeBits')).toBeVisible();
    /* a door has no sill */
    await expect(app.locator('#dSill')).toHaveCount(0);
  });

  test('the hinge fields belong to the hinged and bi-fold types only', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    await app.selectOption('#dType', 'slide');
    await expect(app.locator('#hingeBits')).toBeHidden();
    await app.selectOption('#dType', 'open');
    await expect(app.locator('#hingeBits')).toBeHidden();
    await app.selectOption('#dType', 'bifold');
    await expect(app.locator('#hingeBits')).toBeVisible();
    await app.selectOption('#dType', 'hinge');
    await expect(app.locator('#hingeBits')).toBeVisible();
  });

  test('a window has a sill instead of a door type', async ({ app }) => {
    await openMenu(app, 'op-win', 'Edit…');
    await expect(app.locator('#moTitle')).toHaveText('Edit window');
    expect(await val(app, '#dWall')).toBe('1');
    expect(await val(app, '#dWidth')).toBe('1.4 m');
    expect(await val(app, '#dSill')).toBe('0.9 m');
    await expect(app.locator('#dType')).toHaveCount(0);
    await expect(app.locator('#hingeBits')).toHaveCount(0);
  });

  test('Cancel writes nothing', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    await app.fill('#dWidth', '1.2 m');
    await app.click('#moCancel');
    await expect(app.locator('#modal')).toBeHidden();
    const o = (await readS(app)).layouts[0].openings.find((x) => x.id === 'op-door');
    expect(o.width).toBe(800);
    expect(o.offset).toBe(1000);
  });

  test('OK writes the opening, selects it and pushes a room undo', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    await app.fill('#dWidth', '1.2 m');
    await app.fill('#dOffset', '1.5 m');
    await app.selectOption('#dSwing', 'out');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    const o = (await readS(app)).layouts[0].openings.find((x) => x.id === 'op-door');
    expect(o.width).toBe(1200);
    expect(o.offset).toBe(1500);
    expect(o.swing).toBe('out');
    expect(o.dtype).toBe('hinge');
    /* the edited opening becomes the selection, which the Properties pane reads */
    expect(await app.evaluate(() => JSON.parse(JSON.stringify(window.__rp.roomSel))))
      .toEqual({ kind: 'opening', id: 'op-door' });

    /* commitRoom() ran, so the room's own undo takes it back */
    await expect(app.locator('#btnUndo')).toBeEnabled();
    await app.click('#btnUndo');
    await settle(app);
    const back = (await readS(app)).layouts[0].openings.find((x) => x.id === 'op-door');
    expect(back.width).toBe(800);
    expect(back.offset).toBe(1000);
  });

  test('an offset measured from the far corner is stored from the near one', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    await app.selectOption('#dCorner', 'ccw');
    await app.fill('#dOffset', '1 m');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();
    /* wall 0 is 5000 long and the door is 800 wide: 5000 - 800 - 1000 */
    const o = (await readS(app)).layouts[0].openings.find((x) => x.id === 'op-door');
    expect(o.offset).toBe(3200);
    expect(o.corner).toBe('ccw');

    /* and it reads back as the same 1 m from that corner */
    await openMenu(app, 'op-door', 'Edit…');
    expect(await val(app, '#dCorner')).toBe('ccw');
    expect(await val(app, '#dOffset')).toBe('1 m');
  });

  test('an offset that would push the opening off the end is clamped', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    await app.fill('#dOffset', '9 m');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();
    const o = (await readS(app)).layouts[0].openings.find((x) => x.id === 'op-door');
    expect(o.offset).toBe(4200);
  });

  test('a width under 100mm or wider than the wall keeps the dialog open', async ({ app }) => {
    await openMenu(app, 'op-door', 'Edit…');
    await app.fill('#dWidth', '50 mm');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('Give it a width of at least 100 mm');
    await expect(app.locator('#modal')).toBeVisible();

    await app.fill('#dWidth', '6 m');
    await app.click('#moOk');
    await expect(app.locator('#moErr')).toHaveText('That is wider than the wall (5 m)');
    await expect(app.locator('#modal')).toBeVisible();

    expect((await readS(app)).layouts[0].openings.find((x) => x.id === 'op-door').width).toBe(800);
  });
});

test.describe('openingDialog — a new opening', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('the + in the Openings head offers a door and a window, each with its defaults', async ({ app }) => {
    await app.click('#btnAddOpening');
    expect(await texts(app, '.menu > *')).toEqual(['Door…', 'Window…']);
    await app.locator('.menu button:text-is("Window…")').click();

    await expect(app.locator('#moTitle')).toHaveText('Add window');
    expect(await val(app, '#dWall')).toBe('0');
    expect(await val(app, '#dWidth')).toBe('1.2 m');
    expect(await val(app, '#dOffset')).toBe('0.6 m');
    expect(await val(app, '#dSill')).toBe('0.9 m');

    await app.selectOption('#dWall', '3');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    const ops = (await readS(app)).layouts[0].openings;
    expect(ops).toHaveLength(4);
    const added = ops[3];
    expect(added.kind).toBe('window');
    expect(added.wall).toBe(3);
    expect(added.width).toBe(1200);
    expect(added.offset).toBe(600);
    expect(added.sill).toBe(900);
    expect(added.dtype).toBe('open');
    /* the Openings list picked it up */
    expect(await texts(app, '#openList li .nm')).toHaveLength(4);
  });

  test('a new door defaults to 813mm and is added to the wall the menu was opened on', async ({ app }) => {
    await app.click('#btnAddOpening');
    await app.locator('.menu button:text-is("Door…")').click();
    await expect(app.locator('#moTitle')).toHaveText('Add door');
    expect(await val(app, '#dWidth')).toBe('0.81 m');
    expect(await val(app, '#dType')).toBe('hinge');
    await app.click('#moOk');
    await expect(app.locator('#modal')).toBeHidden();

    const ops = (await readS(app)).layouts[0].openings;
    expect(ops).toHaveLength(4);
    /* CHARACTERIZED, NOT ENDORSED: 0.81 m is what the field shows for 813mm,
       and that rounded value is what comes back on Save — a door added
       without touching the width is 810mm, not the 813 the default meant. */
    expect(ops[3].width).toBe(810);
    expect(ops[3].kind).toBe('door');
    expect(ops[3].hinge).toBe('start');
    expect(ops[3].swing).toBe('in');
  });
});
