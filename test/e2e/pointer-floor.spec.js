/* Arranging rooms on a floor, through real pointer events.
 *
 * Phase 3.5, and the part the plan calls the most valuable: `floorGuides` and
 * `floorSnapNote` are two of the ten selection lets the `draw()` move has to
 * convert to setters, and until this file nothing in the suite read either of
 * them. They only exist between `pointerdown` and `pointerup` — `endDrag()`
 * clears both — so state-driving cannot see them at all.
 *
 * The fixture is two rectangles on one floor:
 *   Room A  4000 x 3000 at floorPlace [0, 0]      -> floor space x 0..4000
 *   Room B  3000 x 3000 at floorPlace [6000, 150] -> floor space x 6000..9000
 * both with `wall: 100`. `floorPt` with rot 0 is a plain translation, so a
 * room's floor-space outline is its own points plus its `floorPlace`.
 *
 * `snapFloorPlace` solves one axis, then the other, and names the result:
 *   'Sharing a wall'  the two rooms' facing edges close to `max(wallA, wallB)`
 *   'Open through'    same, but both sides have their wall switched off
 *   'Lined up'        two edges made collinear without meeting
 *   'Corners meet'    only an end-to-end alignment was taken
 */

import {
  test, expect, fixtureState, settle,
  frameBox, pointerDownAt, pointerStepTo, pointerUp, dragWorld, liveDrag,
} from './app-fixture.js';

const FLOOR_BOX = [-500, -500, 9500, 3500];
const B_CENTRE = [7500, 1650];        // room B's centre in floor space, as the fixture stands

const place = (app, id) => app.evaluate((i) => {
  const l = window.__rp.S.layouts.find((x) => x.id === i);
  return { x: l.floorPlace.x, y: l.floorPlace.y, rot: l.floorPlace.rot || 0 };
}, id);

const readout = (app) => app.evaluate(() => document.getElementById('readout').textContent);

test.describe('arranging rooms on a floor', () => {
  test.use({ savedState: fixtureState('floor-two-rooms.json') });

  test.beforeEach(async ({ app }) => {
    expect(await app.evaluate(() => window.__rp.floorMode())).toBe(true);
    await frameBox(app, FLOOR_BOX);
  });

  test('pointerdown on a room selects it and seeds the merge pair', async ({ app }) => {
    await pointerDownAt(app, B_CENTRE);
    const held = await liveDrag(app);

    expect(held.drag).toMatchObject({ mode: 'floor-room', id: 'rb' });
    expect(await app.evaluate(() => window.__rp.floorSel)).toBe('rb');
    expect(await app.evaluate(() => [...window.__rp.mergeSel])).toEqual(['rb']);
    /* No deadzone here either: 'floor-room' is not in DEADZONE_MODES. */
    expect(held.drag.armed).toBeUndefined();

    await pointerUp(app);
  });

  test('dragged up against its neighbour, the gap closes to one wall thickness', async ({ app }) => {
    /* Room B's left edge is its floorPlace.x. Room A's right edge is 4000.
       `max(wallA, wallB)` is 100, so "sharing a wall" is floorPlace.x = 4100.
       The drag stops 150mm short of that, inside floorSnapRadius() (24 screen
       px, about 260mm at this zoom), and the magnet closes the rest. */
    const target = [B_CENTRE[0] - 1750, B_CENTRE[1] - 150];   // asks for x = 4250, y = 0

    const cam = await pointerDownAt(app, B_CENTRE);
    await pointerStepTo(app, cam, B_CENTRE, target);
    const held = await liveDrag(app);

    expect(held.floorSnapNote).toBe('Sharing a wall');
    expect(held.floorGuides.length).toBeGreaterThan(0);
    /* Each guide is the neighbour edge being lined up with, as a world-mm
       segment. The x correction is taken against room A's right edge, which in
       floor space runs from [4000, 0] to [4000, 3000]. */
    const seg = held.floorGuides.find((g) => Math.abs(g[0][0] - 4000) < 1 && Math.abs(g[1][0] - 4000) < 1);
    expect(seg, `no guide on A's right edge in ${JSON.stringify(held.floorGuides)}`).toBeTruthy();
    expect(seg[0][1]).toBeCloseTo(0, 6);
    expect(seg[1][1]).toBeCloseTo(3000, 6);

    /* The readout says the snap instead of the room count while it holds. */
    expect(await readout(app)).toBe('Sharing a wall');

    expect(await place(app, 'rb')).toMatchObject({ x: 4100 });

    await pointerUp(app);
    await settle(app);

    /* And it stays where the magnet put it once the button comes up. */
    expect(await place(app, 'rb')).toMatchObject({ x: 4100 });
    expect((await liveDrag(app)).floorSnapNote).toBe('');
    expect((await liveDrag(app)).floorGuides).toEqual([]);
    expect(await readout(app)).toContain('2 rooms');
  });

  test('Alt drops the floor magnet and says "Free"', async ({ app }) => {
    const target = [B_CENTRE[0] - 1750, B_CENTRE[1] - 150];

    const held = await dragWorld(app, B_CENTRE, target, {
      modifiers: ['Alt'],
      whileDown: () => liveDrag(app),
    });

    expect(held.floorSnapNote).toBe('Free');
    expect(held.floorGuides).toEqual([]);
    /* liveDrag captures the readout inside the same mid-drag window; reading it
       after the release would see updateFloorReadout's ordinary text, because
       endDrag has cleared floorSnapNote by then. */
    expect(held.readout).toBe('Free');

    /* Not 4100, and not on the grid either: raw pointer position. */
    const p = await place(app, 'rb');
    expect(Math.abs(p.x - 4100)).toBeGreaterThan(50);
    expect(Math.abs(p.x - 4250)).toBeLessThan(60);
  });

  test('far from everything, the floor magnet finds nothing and falls back to the grid', async ({ app }) => {
    /* Straight up, 2000mm clear of room A on both axes. No candidate edge is
       inside floorSnapRadius(), so snapFloorPlace returns the plain grid
       position with an empty note. */
    const held = await dragWorld(app, B_CENTRE, [B_CENTRE[0], B_CENTRE[1] - 2000], {
      whileDown: () => liveDrag(app),
    });

    expect(held.floorSnapNote).toBe('');
    expect(held.floorGuides).toEqual([]);

    const p = await place(app, 'rb');
    /* S.snap is 100 in this fixture, and snapPt rounds the placement itself. */
    expect(Math.abs(p.x / 100 - Math.round(p.x / 100))).toBeLessThan(1e-9);
    expect(Math.abs(p.y / 100 - Math.round(p.y / 100))).toBeLessThan(1e-9);
    expect(p.y).toBeLessThan(-1500);
  });

  test('a floor drag commits to the floor stack, which is a third stack', async ({ app }) => {
    const before = await place(app, 'rb');
    const target = [B_CENTRE[0] - 1750, B_CENTRE[1] - 150];

    await dragWorld(app, B_CENTRE, target);
    await settle(app);
    expect((await place(app, 'rb')).x).toBe(4100);

    await app.evaluate(() => window.__rp.undoFloor());
    await settle(app);
    expect(await place(app, 'rb')).toEqual(before);

    await app.evaluate(() => window.__rp.redoFloor());
    await settle(app);
    expect((await place(app, 'rb')).x).toBe(4100);
  });

  test('shift+click marks a second room for merging instead of moving one', async ({ app }) => {
    await dragWorld(app, B_CENTRE, B_CENTRE, { steps: 1 });     // plain click on B
    expect(await app.evaluate(() => [...window.__rp.mergeSel])).toEqual(['rb']);

    const before = await place(app, 'ra');
    await dragWorld(app, [2000, 1500], [2000, 1500], { steps: 1, modifiers: ['Shift'] });

    expect(await app.evaluate(() => [...window.__rp.mergeSel].sort())).toEqual(['ra', 'rb']);
    expect(await place(app, 'ra')).toEqual(before);
    /* Shift+click returns before any drag is created, so room A never moved and
       floorSel still points at B. */
    expect(await app.evaluate(() => window.__rp.floorSel)).toBe('rb');
  });
});
