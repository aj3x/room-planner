/* The Properties pane's remaining selection kinds.
 *
 * Phase 3.6's last pass. `panel-room.spec.js` covers `renderWallProps` and
 * `renderOpeningProps`; the other three kinds `renderRoomSel` dispatches to —
 * `renderCornerProps`, `renderPillarProps`, `renderIWallProps` — were reached
 * only far enough to confirm a row selects them, and Floor mode's Properties
 * pane (`renderFloorSel`, `renderFloorProps`, and the two-room merge panel)
 * was not read at all.
 *
 * All five are inside the 48-name Plan/Library SCC, which moves in one
 * unbisectable 1,224-line commit. Every one of them rebuilds a panel with
 * `innerHTML` and re-binds its own listeners, and the suite screenshots only
 * `#cv` — so a field that stops rendering, or a listener that stops firing,
 * turns nothing red on its own.
 *
 * Field ids, values, action buttons and the empty state, same style as
 * panel-room.spec.js. CHARACTERIZED, NOT ENDORSED: what the app does today.
 */

import {
  test, expect, fixtureState, settle, readS, texts, attrs,
  frameBox, pointerDownAt, pointerUp,
} from './app-fixture.js';

/** Every field in the selection box as [label, input id, value]. */
const fields = (app, box) => app.$$eval(`${box} .field`, (els) => els.map((e) => {
  const i = e.querySelector('input,select');
  return [
    e.querySelector('label')?.textContent ?? null,
    i?.id ?? null,
    i ? (i.tagName === 'SELECT' ? i.value : i.value) : null,
  ];
}));

const actions = (app, box) => app.$$eval(`${box} .row.actions button`, (els) => els.map((e) => [
  e.id, e.textContent.trim(), e.disabled,
]));

/* ------------------------------------------------------------------ corner */

test.describe('Properties › a corner', () => {
  test.use({ savedState: fixtureState('panels.json') });

  /* A corner is selectable from the plan and nowhere else: no list has a row
     for one. `pickRoom` hit-tests within 11px of the point, so the camera is
     parked first — `assertUsable` would otherwise let a corner sit under the
     floating .island controls. */
  const selectCorner = async (app, at) => {
    await frameBox(app, [0, 0, 5000, 4000]);
    await pointerDownAt(app, at);
    await pointerUp(app);
    await settle(app);
  };

  test('renderCornerProps shows the corner offset from the room bbox', async ({ app }) => {
    /* Corner 1 of [[0,0],[5000,0],[5000,4000],[0,4000]] is [5000,0], and the
       bbox starts at [0,0], so "From left" is the full 5 m and "From top" 0. */
    await selectCorner(app, [5000, 0]);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'corner', i: 1 });
    await expect(app.locator('#roomSelTitle')).toHaveText('Corner 2');
    expect(await fields(app, '#roomSelBox')).toEqual([
      ['From left', 'cX', '5 m'],
      ['From top', 'cY', '0 m'],
    ]);
    expect(await actions(app, '#roomSelBox')).toEqual([
      ['cSq', 'Square this corner', false],
      ['cDel', 'Remove corner', false],
    ]);
    expect(await texts(app, '#roomSelBox .hint')).toEqual([
      'Both walls meeting here move with the corner. Dragging it lines it up with the rest of the room; hold Alt for a free hand.',
    ]);
  });

  test('typing into either field moves the corner and the walls with it', async ({ app }) => {
    await selectCorner(app, [5000, 0]);
    await app.fill('#cX', '4 m');
    await app.dispatchEvent('#cX', 'change');
    await settle(app);

    expect(await app.evaluate(() => window.__rp.RP()[1])).toEqual([4000, 0]);
    /* the panel re-rendered against the new bbox, and the Walls list with it */
    expect(await fields(app, '#roomSelBox')).toEqual([
      ['From left', 'cX', '4 m'],
      ['From top', 'cY', '0 m'],
    ]);
    expect((await texts(app, '#wallList li'))[0]).toBe('Wall 1 4 m · 0°');
  });

  test('a move that would fold the room over itself is rolled back', async ({ app }) => {
    /* tryRoomEdit restores the polygon and flashes. The panel still re-renders
       afterwards, so the field snaps back to the value that survived. */
    await selectCorner(app, [5000, 0]);
    await app.fill('#cX', '-6 m');
    await app.fill('#cY', '5 m');
    await app.dispatchEvent('#cY', 'change');
    await settle(app);
    expect(await app.evaluate(() => window.__rp.RP()[1])).toEqual([5000, 0]);
    await expect(app.locator('#flash')).toBeVisible();
  });

  test('"Square this corner" is a real button and moves the point', async ({ app }) => {
    /* The fixture room is already square, so squareCorner has nothing to do —
       what is pinned is that the button is wired at all, which is the thing a
       re-bound innerHTML panel loses silently. */
    await selectCorner(app, [5000, 0]);
    await app.click('#cSq');
    await settle(app);
    expect(await app.evaluate(() => window.__rp.RP()[1])).toEqual([5000, 0]);
  });

  test('"Remove corner" takes the corner out and clears the selection', async ({ app }) => {
    await selectCorner(app, [5000, 0]);
    await app.click('#cDel');
    await settle(app);
    expect(await app.evaluate(() => window.__rp.RP())).toEqual([[0, 0], [5000, 4000], [0, 4000]]);
    expect(await app.evaluate(() => window.__rp.roomSel)).toBe(null);
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
    expect(await texts(app, '#roomSelBox')).toEqual([
      'Click a wall, corner, door or pillar in the plan to change it here.',
    ]);
  });

  test('at three corners "Remove corner" renders disabled, with a reason', async ({ app }) => {
    await selectCorner(app, [5000, 0]);
    await app.click('#cDel');
    await settle(app);
    /* now a triangle; select one of its corners and the button is off */
    await pointerDownAt(app, [5000, 4000]);
    await pointerUp(app);
    await settle(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'corner', i: 1 });
    expect(await actions(app, '#roomSelBox')).toEqual([
      ['cSq', 'Square this corner', false],
      ['cDel', 'Remove corner', true],
    ]);
    expect(await attrs(app, '#cDel', 'title')).toEqual(['A room needs at least three corners']);
  });

  test('a corner that goes away under the selection drops it', async ({ app }) => {
    /* renderCornerProps' own guard: `if(!p){ setRoomSel(null); return
       renderRoomSel(); }`. Reached by shortening the polygon behind its back. */
    await selectCorner(app, [0, 4000]);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'corner', i: 3 });
    await app.evaluate(() => {
      const r = window.__rp.L().room;
      r.points = [[0, 0], [5000, 0], [5000, 4000]];
      r.wallOff = [false, false, false];
      window.__rp.L().openings = [];   // they are pinned to wall indices that just went
      window.renderAll();
    });
    await settle(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toBe(null);
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
  });
});

/* ------------------------------------------------------------------ pillar */

test.describe('Properties › a pillar', () => {
  test.use({ savedState: fixtureState('panels.json') });

  const selectPillar = async (app) => {
    await app.click('#structList li[data-id="pil-1"]');
    await settle(app);
  };

  test('renderPillarProps shows shape, size and rotation', async ({ app }) => {
    await selectPillar(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'pillar', id: 'pil-1' });
    await expect(app.locator('#roomSelTitle')).toHaveText('Pillar');
    expect(await fields(app, '#roomSelBox')).toEqual([
      ['Shape', 'plShape', 'rect'],
      ['Width', 'plW', '0.3 m'],
      ['Depth', 'plD', '0.3 m'],
      ['Rotation', 'plRot', '0'],
    ]);
    expect(await texts(app, '#roomSelBox select#plShape option')).toEqual(['Rectangle', 'Round']);
    expect(await actions(app, '#roomSelBox')).toEqual([['plDel', 'Remove pillar', false]]);
    expect(await texts(app, '#roomSelBox .hint')).toEqual(['Drag it in the plan to move it.']);
  });

  test('every field writes through one shared handler', async ({ app }) => {
    /* `go()` reads all four inputs on any one change and then re-renders the
       whole panel, which replaces the other three elements — so each field is
       set and allowed to land before the next one is touched. */
    await selectPillar(app);
    await app.selectOption('#plShape', 'ellipse');
    await settle(app);
    await app.fill('#plW', '0.5 m');
    await app.dispatchEvent('#plW', 'change');
    await settle(app);
    await app.fill('#plD', '0.8 m');
    await app.dispatchEvent('#plD', 'change');
    await settle(app);
    await app.fill('#plRot', '30');
    await app.dispatchEvent('#plRot', 'change');
    await settle(app);

    const pl = (await readS(app)).layouts.find((l) => l.id === 'l-living').room.pillars[0];
    expect(pl.shape).toEqual({ type: 'ellipse', w: 500, d: 800 });
    expect(pl.rot).toBe(30);
    expect(await fields(app, '#roomSelBox')).toEqual([
      ['Shape', 'plShape', 'ellipse'],
      ['Width', 'plW', '0.5 m'],
      ['Depth', 'plD', '0.8 m'],
      ['Rotation', 'plRot', '30'],
    ]);
  });

  test('a non-positive size is ignored rather than applied', async ({ app }) => {
    await selectPillar(app);
    await app.fill('#plW', '0 m');
    await app.dispatchEvent('#plW', 'change');
    await settle(app);
    const pl = (await readS(app)).layouts.find((l) => l.id === 'l-living').room.pillars[0];
    expect(pl.shape.w).toBe(300);
    await expect(app.locator('#plW')).toHaveValue('0.3 m');
  });

  test('"Remove pillar" deletes it and empties the Structures list of it', async ({ app }) => {
    await selectPillar(app);
    await app.click('#plDel');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').room.pillars).toEqual([]);
    expect(await texts(app, '#structList li')).toEqual(['Interior wall 11.5 m']);
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
  });

  test('a pillar deleted behind the panel drops the selection', async ({ app }) => {
    await selectPillar(app);
    await app.evaluate(() => {
      window.__rp.L().room.pillars = [];
      window.renderAll();
    });
    await settle(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toBe(null);
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
  });
});

/* ---------------------------------------------------------- interior wall */

test.describe('Properties › an interior wall', () => {
  test.use({ savedState: fixtureState('panels.json') });

  const selectIWall = async (app) => {
    await app.click('#structList li[data-id="iw-1"]');
    await settle(app);
  };

  test('renderIWallProps shows length, direction, thickness and both end gaps', async ({ app }) => {
    /* iw-1 runs [3000,500] -> [3000,2000] in the 5000 x 4000 room: 1.5 m long,
       pointing straight down, so iwallAngle (0 right, 90 up) reads 270.

       The gaps come from nearestOnWalls, which keeps the FIRST wall of a tie
       (`r.d < best.d`). End A is 500 from wall 1 outright. End B is 2000 from
       walls 1, 2 and 3 alike, and wall 1 wins the tie by index — which is why
       both rows name wall 1. */
    await selectIWall(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'iwall', id: 'iw-1' });
    await expect(app.locator('#roomSelTitle')).toHaveText('Interior wall');
    expect(await fields(app, '#roomSelBox')).toEqual([
      ['Length', 'iwLen', '1.5 m'],
      ['Direction', 'iwAng', '270'],
      ['Thickness', 'iwT', '0.09 m'],
      ['End A gap', 'iwDA', '0.5 m'],
      ['End B gap', 'iwDB', '2 m'],
    ]);
    expect(await actions(app, '#roomSelBox')).toEqual([['iwDel', 'Remove wall', false]]);
    expect(await texts(app, '#roomSelBox .hint')).toEqual([
      'Gaps are measured to wall 1 and wall 1. Drag an end to resize or snap it; drag the middle to move it. Shift keeps it straight.',
    ]);
    /* each gap field carries which wall it is measured to in its own title */
    expect(await attrs(app, '#roomSelBox label[for=iwDA]', 'title')).toEqual(['Gap from end A to wall 1']);
  });

  test('length moves end B along the same direction', async ({ app }) => {
    await selectIWall(app);
    await app.fill('#iwLen', '2 m');
    await app.dispatchEvent('#iwLen', 'change');
    await settle(app);
    const w = (await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls[0];
    expect(w.a).toEqual([3000, 500]);
    expect(w.b).toEqual([3000, 2500]);
    await expect(app.locator('#iwLen')).toHaveValue('2 m');
  });

  test('under 50 mm the length is refused and flashed', async ({ app }) => {
    await selectIWall(app);
    await app.fill('#iwLen', '0.01 m');
    await app.dispatchEvent('#iwLen', 'change');
    await settle(app);
    await expect(app.locator('#flash')).toHaveText('Give the wall a length');
    const w = (await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls[0];
    expect(w.b).toEqual([3000, 2000]);
  });

  test('direction turns it about end A', async ({ app }) => {
    await selectIWall(app);
    await app.fill('#iwAng', '0');
    await app.dispatchEvent('#iwAng', 'change');
    await settle(app);
    const w = (await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls[0];
    expect(w.a).toEqual([3000, 500]);
    expect(w.b[0]).toBeCloseTo(4500, 6);
    expect(w.b[1]).toBeCloseTo(500, 6);
  });

  test('thickness under 10 mm is refused and flashed', async ({ app }) => {
    await selectIWall(app);
    await app.fill('#iwT', '0.2 m');
    await app.dispatchEvent('#iwT', 'change');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls[0].t).toBe(200);

    await app.fill('#iwT', '0.005 m');
    await app.dispatchEvent('#iwT', 'change');
    await settle(app);
    await expect(app.locator('#flash')).toHaveText('Give the wall a thickness');
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls[0].t).toBe(200);
  });

  test('an end gap slides that end to sit exactly that far off its wall', async ({ app }) => {
    /* setIWallEndDist keeps the foot-to-end direction and re-seats the end at
       `dist` along the wall's normal. End A is nearest wall 1 (y = 0). */
    await selectIWall(app);
    await app.fill('#iwDA', '1 m');
    await app.dispatchEvent('#iwDA', 'change');
    await settle(app);
    const w = (await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls[0];
    expect(w.a[0]).toBeCloseTo(3000, 6);
    expect(w.a[1]).toBeCloseTo(1000, 6);
    await expect(app.locator('#iwDA')).toHaveValue('1 m');
  });

  test('"Remove wall" deletes it', async ({ app }) => {
    await selectIWall(app);
    await app.click('#iwDel');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').room.iwalls).toEqual([]);
    expect(await texts(app, '#structList li')).toEqual(['Pillar 10.3 m × 0.3 m']);
    await expect(app.locator('#roomSelTitle')).toHaveText('Selection');
  });

  test('a wall deleted behind the panel drops the selection', async ({ app }) => {
    await selectIWall(app);
    await app.evaluate(() => {
      window.__rp.L().room.iwalls = [];
      window.renderAll();
    });
    await settle(app);
    expect(await app.evaluate(() => window.__rp.roomSel)).toBe(null);
  });
});

/* ------------------------------------------------------------- floor mode */

/* Switching to Floor mode and then rendering the pane the way the app's own
   listeners do. The second step is not redundant: setMode() rebuilds
   renderRoomSel / renderWalls / renderOpen / renderSel and does NOT call
   renderFloorSel, so arriving in Floor mode leaves both floor sections showing
   whatever was in them before. Pinned on its own below. */
const toFloor = async (app) => {
  await app.click('#modeSeg button[data-mode="floor"]');
  await settle(app);
  await app.evaluate(() => window.renderAll());
  await settle(app);
};

test.describe('Properties › Floor mode', () => {
  test.use({ savedState: fixtureState('panels.json') });

  test('CHARACTERIZED, NOT ENDORSED: arriving in Floor mode leaves both floor sections stale', async ({ app }) => {
    /* setMode('floor') seeds floorSel with the active room and fits the camera
       so the plan shows that room selected — but it never calls
       renderFloorSel(), and renderFloorProps() is only ever called from inside
       renderFloorSel(). So the Properties pane opens on the "click a room"
       hint with a room already picked, and the Floor section stays empty until
       some other listener re-renders. See BACKLOG.md "Known defects". */
    await app.click('#modeSeg button[data-mode="floor"]');
    await settle(app);
    expect((await readS(app)).mode).toBe('floor');
    expect(await app.evaluate(() => window.__rp.floorSel)).toBe('l-living');
    await expect(app.locator('#floorSelTitle')).toHaveText('Selection');
    expect(await texts(app, '#floorSelBox')).toEqual([
      'Click a room in the plan to move or turn it here.',
    ]);
    expect(await texts(app, '#floorPropsBox .hint')).toEqual([
      '2 rooms on this floor. Drag one against another and it clicks to a shared wall.',
    ]);

    /* any of the pane's own listeners fixes it -- here, the one renderAll runs */
    await app.evaluate(() => window.renderAll());
    await settle(app);
    await expect(app.locator('#floorSelTitle')).toHaveText('Living room');
  });

  test('renderFloorSel opens on the active room, placed and turnable', async ({ app }) => {
    /* setMode('floor') seeds floorSel with the active layout when it is on a
       floor. l-living sits at floorPlace {0,0,0} and its own bbox starts at
       [0,0], so both offsets read 0. */
    await toFloor(app);
    expect(await app.evaluate(() => window.__rp.floorSel)).toBe('l-living');
    await expect(app.locator('#floorSelTitle')).toHaveText('Living room');
    expect(await fields(app, '#floorSelBox')).toEqual([
      ['From left', 'flX', '0 m'],
      ['From top', 'flY', '0 m'],
      ['Angle', 'flRot', '0'],
      ['Label', 'flDim', ''],
    ]);
    /* the Label field's placeholder is the room's own measured size */
    expect(await attrs(app, '#flDim', 'placeholder')).toEqual(['5 m × 4 m']);
    expect(await actions(app, '#floorSelBox')).toEqual([
      ['flEdit', 'Edit this room', false],
      ['flOff', 'Take off floor', false],
    ]);
    /* the two turn buttons sit in the Angle field, not the actions row */
    expect(await attrs(app, '#floorSelBox .field button', 'id')).toEqual(['flRotL', 'flRotR']);
    expect(await attrs(app, '#flRotL', 'aria-label')).toEqual(['Turn left 90 degrees']);
  });

  test('renderFloorProps describes the floor the active room stands on', async ({ app }) => {
    await toFloor(app);
    expect(await fields(app, '#floorPropsBox')).toEqual([
      ['Name', 'flName', 'Ground floor'],
      ['Outer wall', 'flExt', '0.2 m'],
    ]);
    expect(await texts(app, '#floorPropsBox .hint')).toEqual([
      '2 rooms on this floor. Drag one against another and it clicks to a shared wall.',
    ]);
    expect(await actions(app, '#floorPropsBox')).toEqual([['flFit', 'Fit floor', false]]);
  });

  test('the offsets move the room on the floor', async ({ app }) => {
    await toFloor(app);
    await app.fill('#flX', '1.5 m');
    await app.dispatchEvent('#flX', 'change');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').floorPlace)
      .toEqual({ x: 1500, y: 0, rot: 0 });
    await expect(app.locator('#flX')).toHaveValue('1.5 m');
  });

  test('the turn buttons step 90° and the angle field takes a number', async ({ app }) => {
    await toFloor(app);
    await app.click('#flRotR');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').floorPlace.rot).toBe(90);
    await app.click('#flRotL');
    await app.click('#flRotL');
    await settle(app);
    /* norm360 keeps it positive rather than letting it go to -90 */
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').floorPlace.rot).toBe(270);

    await app.fill('#flRot', '45');
    await app.dispatchEvent('#flRot', 'change');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').floorPlace.rot).toBe(45);
  });

  test('the Label field overrides the measured size on the plan', async ({ app }) => {
    await toFloor(app);
    await app.fill('#flDim', 'Lounge');
    await app.dispatchEvent('#flDim', 'change');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').dimLabel).toBe('Lounge');
  });

  test('the floor name and outer wall write back to the floor record', async ({ app }) => {
    await toFloor(app);
    await app.fill('#flName', 'Upstairs');
    await app.dispatchEvent('#flName', 'change');
    await app.fill('#flExt', '0.3 m');
    await app.dispatchEvent('#flExt', 'change');
    await settle(app);
    const fl = (await readS(app)).floors[0];
    expect(fl.name).toBe('Upstairs');
    expect(fl.extWall).toBe(300);

    /* clearing it goes back to 0, which renders as the empty "same as each
       room" placeholder rather than "0 m" */
    await app.fill('#flExt', '');
    await app.dispatchEvent('#flExt', 'change');
    await settle(app);
    expect((await readS(app)).floors[0].extWall).toBe(0);
    await expect(app.locator('#flExt')).toHaveValue('');
    expect(await attrs(app, '#flExt', 'placeholder')).toEqual(['Same as each room']);
  });

  test('"Take off floor" empties the pane back to its hint', async ({ app }) => {
    await toFloor(app);
    await app.click('#flOff');
    await settle(app);
    expect((await readS(app)).layouts.find((l) => l.id === 'l-living').floorId).toBe(null);
    expect(await app.evaluate(() => window.__rp.floorSel)).toBe(null);
    await expect(app.locator('#floorSelTitle')).toHaveText('Selection');
    expect(await texts(app, '#floorSelBox')).toEqual([
      'Click a room in the plan to move or turn it here.',
    ]);
    /* and renderFloorProps loses its floor with it */
    expect(await texts(app, '#floorPropsBox')).toEqual([
      'This room is not on a floor yet. Put it on one from its ⋯ menu in the Rooms list.',
    ]);
  });

  test('"Edit this room" goes back to Room mode on that room', async ({ app }) => {
    await toFloor(app);
    await app.click('#flEdit');
    await settle(app);
    expect((await readS(app)).mode).toBe('room');
    expect((await readS(app)).active).toBe('l-living');
  });

  test('outside Floor mode the pane is the hint and the section is empty', async ({ app }) => {
    expect(await texts(app, '#floorSelBox')).toEqual([
      'Click a room in the plan to move or turn it here.',
    ]);
    expect(await app.evaluate(
      () => document.getElementById('floorSelBox').closest('section').classList.contains('is-empty'),
    )).toBe(true);
  });
});

/* --------------------------------------------------------- the merge panel */

test.describe('Properties › Floor mode › two rooms picked', () => {
  test.use({ savedState: fixtureState('panels.json') });

  /* mergeSel is filled by shift-clicking layout rows in the tree. The floor
     row starts collapsed (treeOpen is empty at boot), so it is opened first. */
  const pick = async (app, ids) => {
    await toFloor(app);
    await app.click('#layoutTree [data-floor="fl-ground"] [data-act=toggle]');
    await settle(app);
    for (const id of ids) {
      await app.click(`#layoutTree [data-layout="${id}"] .nm`, { modifiers: ['Shift'] });
      await settle(app);
    }
  };

  test('two rooms on one floor offer a merge into the first picked', async ({ app }) => {
    await pick(app, ['l-living', 'l-bed']);
    expect(await app.evaluate(() => [...window.__rp.mergeSel])).toEqual(['l-living', 'l-bed']);
    await expect(app.locator('#floorSelTitle')).toHaveText('Living room + Bedroom');
    expect(await texts(app, '#floorSelBox .hint')).toEqual([
      'Right-click either room, or use the buttons below.',
    ]);
    expect(await actions(app, '#floorSelBox')).toEqual([
      ['fmMerge', 'Merge into “Living room”', false],
      ['fmDelete', 'Delete both…', false],
    ]);
    /* the floor's own properties stay rendered underneath the merge panel */
    expect(await attrs(app, '#floorPropsBox .field input', 'id')).toEqual(['flName', 'flExt']);
  });

  test('the order the rooms were picked in names the survivor', async ({ app }) => {
    await pick(app, ['l-bed', 'l-living']);
    await expect(app.locator('#floorSelTitle')).toHaveText('Bedroom + Living room');
    await expect(app.locator('#fmMerge')).toHaveText('Merge into “Bedroom”');
  });

  test('rooms on different floors can only be deleted, not merged', async ({ app }) => {
    /* l-shed sits at the root with floorId null, so the sameFloor test fails
       and the merge button is not rendered at all. */
    await toFloor(app);
    await app.click('#layoutTree [data-floor="fl-ground"] [data-act=toggle]');
    await settle(app);
    await app.click('#layoutTree [data-layout="l-living"] .nm', { modifiers: ['Shift'] });
    await app.click('#layoutTree [data-layout="l-shed"] .nm', { modifiers: ['Shift'] });
    await settle(app);

    await expect(app.locator('#floorSelTitle')).toHaveText('Living room + Shed');
    expect(await texts(app, '#floorSelBox .hint')).toEqual([
      'These rooms aren’t on the same floor, so they can’t be merged.',
    ]);
    expect(await actions(app, '#floorSelBox')).toEqual([['fmDelete', 'Delete both…', false]]);
    expect(await app.locator('#fmMerge').count()).toBe(0);
  });

  test('un-picking one falls back to the single-room panel', async ({ app }) => {
    await pick(app, ['l-living', 'l-bed']);
    await app.click('#layoutTree [data-layout="l-bed"] .nm', { modifiers: ['Shift'] });
    await settle(app);
    expect(await app.evaluate(() => [...window.__rp.mergeSel])).toEqual(['l-living']);
    /* floorSel is still the room setMode seeded, so it is that room's fields */
    await expect(app.locator('#floorSelTitle')).toHaveText('Living room');
    expect(await attrs(app, '#floorSelBox .field input', 'id'))
      .toEqual(['flX', 'flY', 'flRot', 'flDim']);
  });

  test('"Delete both…" asks first', async ({ app }) => {
    await pick(app, ['l-living', 'l-bed']);
    await app.click('#fmDelete');
    await settle(app);
    await expect(app.locator('#modal')).toBeVisible();
    expect((await readS(app)).layouts).toHaveLength(3);
  });
});
