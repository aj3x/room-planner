/* The Room pane's lists and the Properties pane's selection editors.
 *
 * Phase 3.6. `renderSnap`/`renderWalls`/`renderObstacles`/`renderOpen` moved
 * into src/plan/room-panel.js in the plan/ round; `renderRoom`, `renderRoomSel`,
 * `renderWallProps` and `renderOpeningProps` did NOT — they are inside the
 * 48-name Plan/Library SCC that has to move in a single 1,224-line commit.
 * Every one of them rebuilds a panel with innerHTML, and the suite screenshots
 * only #cv, so a break that does not throw turns nothing red.
 *
 * CHARACTERIZED, NOT ENDORSED. These record what the app does today. The snap
 * picker's silent rewrite of S.snap is pinned below exactly as it behaves.
 */

import {
  test, expect, fixtureState, settle, readS, texts, attrs, menuItems, confirmModal,
} from './app-fixture.js';

test.describe('Room pane › Walls', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('one row per wall, numbered from 1, with length and direction', async ({ app }) => {
    /* The fixture room is 5000 x 4000 in metric, and wallOff[2] is true.
       wallAngle is norm360(-atan2(dy,dx)): 0 points right, 90 up, so the
       downward wall reads 270. A wall that is off shows "Open · <length>"
       and drops the angle entirely. */
    expect(await texts(app, '#wallList li')).toEqual([
      'Wall 1 5 m · 0°',
      'Wall 2 4 m · 270°',
      'Wall 3 Open · 5 m',
      'Wall 4 4 m · 90°',
    ]);
    expect(await attrs(app, '#wallList li', 'data-i')).toEqual(['0', '1', '2', '3']);
  });

  test('clicking a row marks it, and only it', async ({ app }) => {
    expect(await app.locator('#wallList li.on').count()).toBe(0);
    await app.locator('#wallList li[data-i="1"]').click();
    await settle(app);
    expect(await attrs(app, '#wallList li', 'class')).toEqual(['', 'on', '', '']);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'wall', i: 1 });
  });

  test('the rows follow the display unit', async ({ app }) => {
    await app.selectOption('#unitSel', 'ftin');
    await settle(app);
    expect(await texts(app, '#wallList li')).toEqual([
      'Wall 1 16\' 4 7/8" · 0°',
      'Wall 2 13\' 1 1/2" · 270°',
      'Wall 3 Open · 16\' 4 7/8"',
      'Wall 4 13\' 1 1/2" · 90°',
    ]);
  });

  test('the Walls list shrinks and grows with the polygon', async ({ app }) => {
    await app.evaluate(() => {
      window.__rp.L().room.points = [[0, 0], [4000, 0], [4000, 3000], [2000, 3000], [0, 2000]];
      window.__rp.L().room.wallOff = [false, false, false, false, false];
      window.renderAll();
    });
    await settle(app);
    expect(await texts(app, '#wallList li')).toHaveLength(5);
    expect((await texts(app, '#wallList li'))[0]).toBe('Wall 1 4 m · 0°');
  });
});

test.describe('Room pane › Structures', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('pillars are numbered, then interior walls, each with its dimension', async ({ app }) => {
    /* renderObstacles numbers the two kinds independently — pn and wn — and
       always lists every pillar before every interior wall, whatever order
       they were added in. */
    expect(await texts(app, '#structList li')).toEqual([
      'Pillar 10.3 m × 0.3 m',
      'Interior wall 11.5 m',
    ]);
    expect(await attrs(app, '#structList li', 'data-kind')).toEqual(['pillar', 'iwall']);
    expect(await attrs(app, '#structList li', 'data-id')).toEqual(['pil-1', 'iw-1']);
    /* each row carries its own ⋯ */
    expect(await app.locator('#structList li [data-act=more]').count()).toBe(2);
  });

  test('"None yet" only when there really are none', async ({ app }) => {
    await app.evaluate(() => {
      const r = window.__rp.L().room;
      r.pillars = []; r.iwalls = [];
      window.renderAll();
    });
    await settle(app);
    expect(await texts(app, '#structList li')).toEqual(['None yet']);
    await expect(app.locator('#structList li')).toHaveClass(/list-empty/);
  });

  test('clicking a row selects that structure and marks the row', async ({ app }) => {
    await app.locator('#structList li[data-id="iw-1"]').click();
    await settle(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'iwall', id: 'iw-1' });
    expect(await attrs(app, '#structList li', 'class')).toEqual(['', 'on']);
  });

  test('the ⋯ on a structure row offers Select and Delete', async ({ app }) => {
    await app.locator('#structList li[data-id="pil-1"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual(['Pillar 1', 'Select', '—', 'Delete']);
  });
});

test.describe('Room pane › Openings', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('each opening shows its kind label, its wall number and its width', async ({ app }) => {
    /* KIND() maps kind/dtype onto the five labels. Wall numbers are 1-based,
       so op-slide on wall index 3 reads "Wall 4". */
    expect(await texts(app, '#openList li')).toEqual([
      'Hinged doorWall 1 · 0.8 m wide',
      'WindowWall 2 · 1.4 m wide',
      'Sliding doorWall 4 · 1.6 m wide',
    ]);
    expect(await attrs(app, '#openList li', 'data-id')).toEqual(['op-door', 'op-win', 'op-slide']);
  });

  test('the other two kind labels', async ({ app }) => {
    await app.evaluate(() => {
      const os = window.__rp.L().openings;
      os[0].dtype = 'open'; os[2].dtype = 'bifold';
      window.renderAll();
    });
    await settle(app);
    expect(await texts(app, '#openList li')).toEqual([
      'DoorwayWall 1 · 0.8 m wide',
      'WindowWall 2 · 1.4 m wide',
      'Bi-fold doorWall 4 · 1.6 m wide',
    ]);
  });

  test('"None yet" when the room has no openings', async ({ app }) => {
    await app.evaluate(() => { window.__rp.L().openings = []; window.renderAll(); });
    await settle(app);
    expect(await texts(app, '#openList li')).toEqual(['None yet']);
  });

  test('clicking a row selects the opening and marks it', async ({ app }) => {
    await app.locator('#openList li[data-id="op-win"]').click();
    await settle(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'opening', id: 'op-win' });
    expect(await attrs(app, '#openList li', 'class')).toEqual(['', 'on', '']);
  });

  test('the ⋯ is titled with the opening\'s kind', async ({ app }) => {
    await app.locator('#openList li[data-id="op-slide"] [data-act=more]').click();
    expect(await menuItems(app)).toEqual(['Sliding door', 'Edit…', '—', 'Delete']);
  });
});

test.describe('Room pane › the snap picker', () => {
  test.use({ savedState: fixtureState('panels.json') });

  const options = (app) => app.$$eval('#snapSel option', (os) => os.map((o) => [o.value, o.textContent]));

  test('the metric list, with the saved value selected', async ({ app }) => {
    expect(await options(app)).toEqual([
      ['0', 'No snap'], ['10', '1 cm'], ['50', '5 cm'],
      ['100', '10 cm'], ['250', '25 cm'], ['500', '50 cm'],
    ]);
    await expect(app.locator('#snapSel')).toHaveValue('100');
    expect((await readS(app)).snap).toBe('100');
  });

  test('switching the unit to ft+in swaps the whole option list', async ({ app }) => {
    await app.selectOption('#unitSel', 'ftin');
    await settle(app);
    expect(await options(app)).toEqual([
      ['0', 'No snap'], ['12.7', '½ inch'], ['25.4', '1 inch'],
      ['76.2', '3 inches'], ['152.4', '6 inches'], ['304.8', '1 foot']],
    );
  });

  test('CHARACTERIZED, NOT ENDORSED: renderSnap silently rewrites S.snap when the value is not in the list', async ({ app }) => {
    /* This is the trap the plan/ round named and deliberately did not fix.
       100mm is metric-only, so moving to ft+in leaves it unrepresentable and
       renderSnap resets it to the THIRD entry of SNAPS.imperial — 25.4 — with
       no flash, no confirmation and no undo. The user's snap size changes
       under them because they changed units.

       It bites the other way too: any code that sets S.snap directly and then
       triggers a re-render loses the setting. startSplitRoom() calls
       renderAll(), which is why useCoarseSnap() has to set the unit as well.

       Logged in BACKLOG.md under Known defects. Pinned here as-is. */
    expect((await readS(app)).snap).toBe('100');

    await app.selectOption('#unitSel', 'ftin');
    await settle(app);

    expect((await readS(app)).snap).toBe('25.4');
    await expect(app.locator('#snapSel')).toHaveValue('25.4');

    /* and the same in reverse: 25.4 is not in SNAPS.metric, so coming back
       lands on the metric list's third entry, not on the 100 it started at */
    await app.selectOption('#unitSel', 'm');
    await settle(app);
    expect((await readS(app)).snap).toBe('50');
    await expect(app.locator('#snapSel')).toHaveValue('50');
  });

  test('CHARACTERIZED, NOT ENDORSED: a snap set behind the picker survives until the next renderAll', async ({ app }) => {
    await app.evaluate(() => { window.__rp.S.unit = 'ftin'; window.__rp.S.snap = '500'; });
    expect((await readS(app)).snap).toBe('500');
    await app.evaluate(() => window.renderAll());
    await settle(app);
    expect((await readS(app)).snap).toBe('25.4');
  });

  test('a value that IS in the list is left alone', async ({ app }) => {
    await app.selectOption('#snapSel', '250');
    await settle(app);
    await app.evaluate(() => window.renderAll());
    await settle(app);
    expect((await readS(app)).snap).toBe('250');
    await expect(app.locator('#snapSel')).toHaveValue('250');
  });
});

test.describe('Properties › the room itself', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('a rectangular room gets editable Width and Depth, plus area', async ({ app }) => {
    await expect(app.locator('#roomW')).toHaveValue('5 m');
    await expect(app.locator('#roomD')).toHaveValue('4 m');
    await expect(app.locator('#areaOut')).toHaveText('20 m²');
    await expect(app.locator('#wallT')).toHaveValue('0.1 m');
    await expect(app.locator('#floorHex')).toHaveValue('#f5f3ee');
    expect(await app.locator('#trimD').isDisabled()).toBe(true);
  });

  test('typing a new width reshapes the room and the Walls list follows', async ({ app }) => {
    await app.fill('#roomW', '6 m');
    await app.locator('#roomW').press('Enter');
    await app.locator('#roomD').focus();
    await settle(app);
    expect((await texts(app, '#wallList li'))[0]).toBe('Wall 1 6 m · 0°');
    await expect(app.locator('#areaOut')).toHaveText('24 m²');
  });

  test('a non-rectangular room shows read-only Bounds instead', async ({ app }) => {
    await app.evaluate(() => {
      window.__rp.L().room.points = [[0, 0], [4000, 0], [4000, 3000], [2000, 3000], [0, 2000]];
      window.__rp.L().room.wallOff = [false, false, false, false, false];
      window.renderAll();
    });
    await settle(app);
    await expect(app.locator('#roomW')).toHaveCount(0);
    expect(await texts(app, '#rectDims')).toEqual(['Bounds4 m × 3 m']);
  });
});

test.describe('Properties › the selection editors', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('nothing selected reads as a hint, and the section is marked empty', async ({ app }) => {
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
    await expect(app.locator('#roomSelBox')).toHaveText('Click a wall, corner, door or pillar in the plan to change it here.');
    await expect(app.locator('section[data-sec=roomsel]')).toHaveClass(/is-empty/);
  });

  test('selecting a wall gives its length, its angle and the actions for a live wall', async ({ app }) => {
    await app.locator('#wallList li[data-i="0"]').click();
    await settle(app);
    await expect(app.locator('#roomSelTitle')).toHaveText('Wall 1');
    await expect(app.locator('#wLen')).toHaveValue('5 m');
    await expect(app.locator('#wAng')).toHaveValue('0');
    expect(await texts(app, '#roomSelBox .row.actions button')).toEqual([
      'Add door…', 'Add window…', 'Split', 'Open this side',
    ]);
    await expect(app.locator('section[data-sec=roomsel]')).not.toHaveClass(/is-empty/);
  });

  test('a wall that is off loses its door/window buttons and offers to put the wall back', async ({ app }) => {
    await app.locator('#wallList li[data-i="2"]').click();
    await settle(app);
    await expect(app.locator('#roomSelTitle')).toHaveText('Wall 3');
    expect(await texts(app, '#roomSelBox .row.actions button')).toEqual(['Split', 'Put the wall back']);
    expect(await texts(app, '#roomSelBox p.hint')).toContain(
      'This side is open: the corner stays, the wall is gone. The room still keeps its floor area.',
    );
  });

  test('"Open this side" warns about the door on the wall, then round-trips', async ({ app }) => {
    await app.locator('#wallList li[data-i="0"]').click();
    await settle(app);
    await app.click('#wOff');

    /* Wall 1 holds op-door, so the action goes through askConfirm first. */
    await expect(app.locator('#moTitle')).toHaveText('Open this side?');
    await expect(app.locator('#moBody')).toContainText(
      'Wall 1 holds 1 door or window. Opening the side removes it too.',
    );
    await confirmModal(app);

    expect((await texts(app, '#wallList li'))[0]).toBe('Wall 1 Open · 5 m');
    /* and the door really is gone from the Openings list */
    expect(await texts(app, '#openList li')).toEqual([
      'WindowWall 2 · 1.4 m wide',
      'Sliding doorWall 4 · 1.6 m wide',
    ]);
    expect(await texts(app, '#roomSelBox .row.actions button')).toEqual(['Split', 'Put the wall back']);

    /* putting it back needs no confirmation, and the opening does not return */
    await app.click('#wOff');
    await settle(app);
    expect((await texts(app, '#wallList li'))[0]).toBe('Wall 1 5 m · 0°');
    expect(await texts(app, '#openList li')).toHaveLength(2);
  });

  test('selecting an opening gives its kind as the title and a wall picker that hides the open side', async ({ app }) => {
    await app.locator('#openList li[data-id="op-door"]').click();
    await settle(app);
    await expect(app.locator('#roomSelTitle')).toHaveText('Hinged door');
    await expect(app.locator('#oW')).toHaveValue('0.8 m');

    /* renderOpeningProps drops a wall from the picker when it is off and is
       not the one this opening is already on. Wall 3 (index 2) is off. */
    expect(await app.$$eval('#oWall option', (os) => os.map((o) => [o.value, o.textContent])))
      .toEqual([['0', 'Wall 1'], ['1', 'Wall 2'], ['3', 'Wall 4']]);
    await expect(app.locator('#oWall')).toHaveValue('0');

    /* a hinged door carries the hinge/swing block, visible */
    expect(await app.evaluate(() => document.getElementById('oHingeBits').hidden)).toBe(false);
    expect(await texts(app, '#roomSelBox p.hint')).toContain(
      'Wall 1 is 5 m long. Drag the circle in the plan to slide it along, or onto another wall.',
    );
  });

  test('a window gets a sill height instead of hinge and swing', async ({ app }) => {
    await app.locator('#openList li[data-id="op-win"]').click();
    await settle(app);
    await expect(app.locator('#roomSelTitle')).toHaveText('Window');
    await expect(app.locator('#oSill')).toHaveValue('0.9 m');
    await expect(app.locator('#oHingeBits')).toHaveCount(0);
    await expect(app.locator('#oType')).toHaveCount(0);
  });

  test('a sliding door keeps the type picker but hides hinge and swing', async ({ app }) => {
    await app.locator('#openList li[data-id="op-slide"]').click();
    await settle(app);
    await expect(app.locator('#oType')).toHaveValue('slide');
    expect(await app.evaluate(() => document.getElementById('oHingeBits').hidden)).toBe(true);
  });

  test('deleting the selected opening clears the panel and the row', async ({ app }) => {
    await app.locator('#openList li[data-id="op-win"]').click();
    await settle(app);
    await app.click('#oDel');
    await settle(app);
    expect(await texts(app, '#openList li')).toEqual([
      'Hinged doorWall 1 · 0.8 m wide',
      'Sliding doorWall 4 · 1.6 m wide',
    ]);
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
  });
});

test.describe('the undo and redo buttons', () => {
  test.use({ savedState: fixtureState('panels.json') });

  const hist = (app) => app.evaluate(() => ({
    undo: document.getElementById('btnUndo').disabled,
    redo: document.getElementById('btnRedo').disabled,
  }));

  test('both start disabled, and a room edit enables undo only', async ({ app }) => {
    /* updateHistButtons reads the per-layout stack for whichever of the three
       modes is current. A freshly seeded stack has one entry, so idx is 0 and
       both ends are at the end. Nothing asserted this before Phase 3.6. */
    expect(await hist(app)).toEqual({ undo: true, redo: true });

    await app.fill('#roomW', '6 m');
    await app.locator('#roomW').press('Enter');
    await app.locator('#roomD').focus();
    await settle(app);
    expect(await hist(app)).toEqual({ undo: false, redo: true });

    await app.click('#btnUndo');
    await settle(app);
    expect(await hist(app)).toEqual({ undo: true, redo: false });
    await expect(app.locator('#roomW')).toHaveValue('5 m');

    await app.click('#btnRedo');
    await settle(app);
    expect(await hist(app)).toEqual({ undo: false, redo: true });
    await expect(app.locator('#roomW')).toHaveValue('6 m');
  });

  test('the room and furniture stacks are separate, and the buttons follow the mode', async ({ app }) => {
    await app.fill('#roomW', '6 m');
    await app.locator('#roomW').press('Enter');
    await app.locator('#roomD').focus();
    await settle(app);
    expect(await hist(app)).toEqual({ undo: false, redo: true });

    /* Furniture mode reads furnHist, which nothing has touched. */
    await app.evaluate(() => window.setMode('furniture'));
    await settle(app);
    expect(await hist(app)).toEqual({ undo: true, redo: true });

    await app.evaluate(() => window.setMode('room'));
    await settle(app);
    expect(await hist(app)).toEqual({ undo: false, redo: true });
  });
});

test.describe('the measure readout bar', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('renderMeasureBar writes a bar, a pressed state and a canvas class', async ({ app }) => {
    /* The bar is aria-live, so what it says is the whole of the tool's
       feedback outside the canvas. Nothing read its text before Phase 3.5,
       and nothing read the Clear-all branch before 3.6. */
    expect(await app.evaluate(() => document.getElementById('measureBar').hidden)).toBe(true);
    await expect(app.locator('#btnMeasure')).toHaveAttribute('aria-pressed', 'false');

    await app.click('#btnMeasure');
    await settle(app);
    expect(await app.evaluate(() => document.getElementById('measureBar').hidden)).toBe(false);
    await expect(app.locator('#btnMeasure')).toHaveAttribute('aria-pressed', 'true');
    await expect(app.locator('#measureBar .mb-msg')).toHaveText('Pick a corner, side, centre or door swing');
    /* with no measurements on this room there is nothing to clear */
    expect(await texts(app, '#measureBar button')).toEqual(['Done']);
    expect(await app.evaluate(() => document.getElementById('cv').classList.contains('measuring'))).toBe(true);

    /* a live measurement adds the Clear all… action */
    await app.evaluate(() => {
      window.__rp.L().measures.push({
        id: 'm-x',
        a: { k: 'item', id: 'pl-1', part: 'whole' },
        b: { k: 'item', id: 'pl-2', part: 'whole' },
      });
      window.renderAll();
    });
    await settle(app);
    expect(await texts(app, '#measureBar button')).toEqual(['Clear all…', 'Done']);

    await app.click('#measureBar [data-act=done]');
    await settle(app);
    expect(await app.evaluate(() => document.getElementById('measureBar').hidden)).toBe(true);
    expect(await app.evaluate(() => document.getElementById('cv').classList.contains('measuring'))).toBe(false);
  });
});
