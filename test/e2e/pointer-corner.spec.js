/* Dragging a room corner, through real pointer events.
 *
 * Phase 3.5. Everything here goes through `mouse.down`/`move`/`up` on #cv,
 * because the code under test — the drag deadzone, the alignment magnet and
 * the `alignGuides`/`alignNote` readout — is reachable no other way. Driving
 * the same functions through state, which is all the baseline did before, skips
 * `pointerdown`'s hit test, skips `applyDragAt`'s arming, and never assigns a
 * guide at all.
 *
 * These are characterization tests: they pin what the app does today, in exact
 * millimetres. The whole point is that the `draw()` move cannot change any of
 * it without a red test.
 *
 * Geometry all the way down. The fixture room is the 5000 x 4000 rectangle
 *   P = [[0,0], [5000,0], [5000,4000], [0,4000]]
 * and corner 1, [5000,0], is the one dragged throughout. Its magnet references
 * are its two neighbours: corner 0 contributes the line y = 0, corner 2 the
 * line x = 5000, and those two cross at exactly the corner's own position —
 * which is why "Shift from anywhere" below lands back on [5000, 0] to the
 * millimetre rather than somewhere merely close.
 */

import {
  test, expect, fixtureState, settle,
  camera, project, pointerDownAt, pointerStepTo, pointerUp, dragWorld, liveDrag,
} from './app-fixture.js';

const CORNER = 1;
const CORNER_AT = [5000, 0];

/** Room mode, camera fitted, nothing selected — the state every test starts in. */
async function roomMode(app) {
  await app.evaluate(() => { window.setMode('room'); window.fit(); });
  await settle(app);
}

const points = (app) => app.evaluate(() => window.__rp.RP().map((p) => p.slice()));
/** `alignRadius()` and `guideSeg`'s overshoot, both in world mm at the live zoom. */
const magnet = (app) => app.evaluate(() => ({
  radius: 18 / Math.max(window.__rp.view.scale, 1e-6),
  over: 10 / Math.max(window.__rp.view.scale, 1e-6),
  scale: window.__rp.view.scale,
}));

test.describe('dragging a room corner', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('pointerdown on a corner selects it and arms nothing yet', async ({ app }) => {
    await roomMode(app);
    const before = await points(app);

    await pointerDownAt(app, CORNER_AT);
    const state = await liveDrag(app);

    expect(state.drag).toMatchObject({ mode: 'corner', i: CORNER, armed: false });
    expect(await app.evaluate(() => window.__rp.roomSel)).toEqual({ kind: 'corner', i: CORNER });
    expect(await points(app)).toEqual(before);

    await pointerUp(app);
  });

  test('the deadzone: 3px moves nothing, 5px arms the drag', async ({ app }) => {
    await roomMode(app);
    const before = await points(app);

    /* DEADZONE_PX is 4, measured in canvas px from where the pointer went down,
       so this is the one gesture that has to be expressed in pixels. Alt is
       held throughout: without it the magnet re-latches the corner onto the
       crossing it started on and a 5px move lands back on [5000,0] exactly,
       which would make "armed" and "not armed" look identical in the polygon.
       The deadzone itself does not care about modifiers — it is keyed on
       drag.mode via DEADZONE_MODES. */
    const modifiers = ['Alt'];
    const cam = await pointerDownAt(app, CORNER_AT, { modifiers });
    const origin = project(cam, CORNER_AT);

    for (const d of [1, 2, 3]) {
      await app.mouse.move(origin.x + d, origin.y);
      const s = await liveDrag(app);
      expect(s.drag.armed, `${d}px is inside the deadzone`).toBe(false);
      expect(s.drag.snap, 'nothing is snapshotted before the drag arms').toBeUndefined();
      expect(await points(app), `${d}px must not nudge the corner`).toEqual(before);
    }

    /* 5px clears it. Note what arming does NOT do: it does not replay the
       movement it swallowed. The corner goes to wherever the pointer is now. */
    await app.mouse.move(origin.x + 5, origin.y);
    const armed = await liveDrag(app);
    expect(armed.drag.armed).toBe(true);

    const after = await points(app);
    expect(after).not.toEqual(before);
    const cam2 = await camera(app);
    expect(after[CORNER][0] - before[CORNER][0]).toBeCloseTo(5 / cam2.scale, 1);
    expect(after[CORNER][1]).toBeCloseTo(before[CORNER][1], 1);

    await pointerUp(app, { modifiers });
  });

  test('the magnet re-latches the moment the drag arms', async ({ app }) => {
    await roomMode(app);
    const before = await points(app);

    /* The same 5px nudge without Alt. The drag arms — applyDragAt no longer
       returns early — but 5px is well inside alignRadius(), so snapCorner
       finds both neighbour lines and puts the corner back on their crossing,
       to the millimetre. Armed and un-armed therefore look the same in the
       polygon and different in alignGuides; that distinction is the assertion. */
    const cam = await pointerDownAt(app, CORNER_AT);
    const origin = project(cam, CORNER_AT);

    await app.mouse.move(origin.x + 3, origin.y);
    expect((await liveDrag(app)).alignGuides).toEqual([]);

    await app.mouse.move(origin.x + 5, origin.y);
    const armed = await liveDrag(app);
    expect(armed.drag.armed).toBe(true);
    expect(armed.alignNote).toBe('Right angle');
    expect(armed.alignGuides).toHaveLength(2);
    expect(await points(app)).toEqual(before);

    await pointerUp(app);
  });

  test('a plain drag out of magnet range leaves no guides and lands on the grid', async ({ app }) => {
    await roomMode(app);
    /* [3000, 1200] is 1200mm from y=0 and 2000mm from x=5000; the magnet's
       reach at this zoom is about 120mm, so nothing bites and snapToLines
       falls back to the ordinary grid — S.snap is 25.4 in this fixture. */
    const { radius } = await magnet(app);
    expect(radius).toBeLessThan(600);

    const held = await dragWorld(app, CORNER_AT, [3000, 1200], { whileDown: () => liveDrag(app) });

    expect(held.alignNote).toBe('');
    expect(held.alignGuides).toEqual([]);
    expect(held.snapSpan).toBeNull();            // no `.snap` span in the readout

    const [x, y] = (await points(app))[CORNER];
    /* snapPt rounds to S.snap, 25.4mm in this fixture. Tested as "a whole
       number of grid steps" rather than with %, which carries float error. */
    const onGrid = (v) => Math.abs(v / 25.4 - Math.round(v / 25.4));
    expect(onGrid(x)).toBeLessThan(1e-9);
    expect(onGrid(y)).toBeLessThan(1e-9);
    expect(x).toBeGreaterThan(3000 - 200);
    expect(x).toBeLessThan(3000 + 200);
    expect(y).toBeGreaterThan(1200 - 200);
    expect(y).toBeLessThan(1200 + 200);
  });

  test('one line in reach: the corner latches onto the neighbour x and reads "Lined up"', async ({ app }) => {
    await roomMode(app);
    const { radius, over } = await magnet(app);

    /* Half a magnet radius off the x = 5000 line, and a long way down it, so
       only that one line is in range. */
    const target = [5000 + radius * 0.5, 1500];

    const cam = await pointerDownAt(app, CORNER_AT);
    await pointerStepTo(app, cam, CORNER_AT, [4200, 1500]);   // travel first, so the drag is armed
    await pointerStepTo(app, cam, [4200, 1500], target);
    const held = await liveDrag(app);
    await pointerUp(app);

    expect(held.alignNote).toBe('Lined up');
    expect(held.snapSpan).toBe('Lined up');
    expect(held.alignGuides).toHaveLength(1);

    const [x, y] = (await points(app))[CORNER];
    expect(x).toBeCloseTo(5000, 6);          // projected exactly onto the neighbour's x
    expect(y).toBeGreaterThan(1500 - 200);
    expect(y).toBeLessThan(1500 + 200);

    /* The guide is the dashed line drawn from the corner it hangs off to where
       the dragged point landed, run `over` mm past both ends. */
    const [[gx0, gy0], [gx1, gy1]] = held.alignGuides[0];
    expect(gx0).toBeCloseTo(5000, 6);
    expect(gx1).toBeCloseTo(5000, 6);
    expect(gy0).toBeCloseTo(4000 + over, 3);     // pinned on corner 2, [5000, 4000]
    expect(gy1).toBeCloseTo(y - over, 3);
  });

  test('two lines in reach: the corner lands on their crossing and reads "Right angle"', async ({ app }) => {
    await roomMode(app);
    const { radius, over } = await magnet(app);

    const target = [5000 + radius * 0.4, radius * 0.4];

    const cam = await pointerDownAt(app, CORNER_AT);
    await pointerStepTo(app, cam, CORNER_AT, [4200, 800]);    // arm the drag well clear of the deadzone
    await pointerStepTo(app, cam, [4200, 800], target);
    const held = await liveDrag(app);
    await pointerUp(app);

    expect(held.alignNote).toBe('Right angle');
    expect(held.snapSpan).toBe('Right angle');
    expect(held.alignGuides).toHaveLength(2);

    /* lineCross of y = 0 and x = 5000: exact, not grid-rounded. */
    expect((await points(app))[CORNER]).toEqual([5000, 0]);

    /* Guide 1 hangs off corner 0, [0,0], and runs along y = 0 to the landing
       point; guide 2 hangs off corner 2, [5000,4000], and runs up x = 5000. */
    const [g1, g2] = held.alignGuides;
    expect(g1[0][0]).toBeCloseTo(-over, 3);
    expect(g1[0][1]).toBeCloseTo(0, 6);
    expect(g1[1][0]).toBeCloseTo(5000 + over, 3);
    expect(g1[1][1]).toBeCloseTo(0, 6);
    expect(g2[0][0]).toBeCloseTo(5000, 6);
    expect(g2[0][1]).toBeCloseTo(4000 + over, 3);
    expect(g2[1][0]).toBeCloseTo(5000, 6);
    expect(g2[1][1]).toBeCloseTo(-over, 3);
  });

  test('Alt drops the magnet entirely and says so', async ({ app }) => {
    await roomMode(app);
    const { radius } = await magnet(app);
    const target = [5000 + radius * 0.4, radius * 0.4];

    const cam = await pointerDownAt(app, CORNER_AT, { modifiers: ['Alt'] });
    await pointerStepTo(app, cam, CORNER_AT, [4200, 800]);
    await pointerStepTo(app, cam, [4200, 800], target);
    const held = await liveDrag(app);
    await pointerUp(app, { modifiers: ['Alt'] });

    expect(held.alignNote).toBe('Free');
    expect(held.snapSpan).toBe('Free');
    expect(held.alignGuides).toEqual([]);

    /* Alt is the raw pointer position — no magnet and no grid either. */
    const [x, y] = (await points(app))[CORNER];
    expect(x).toBeGreaterThan(5000);
    expect(Math.abs(x - target[0])).toBeLessThan(60);
    expect(Math.abs(y - target[1])).toBeLessThan(60);
  });

  test('Shift reaches past the magnet radius and squares the corner from anywhere', async ({ app }) => {
    await roomMode(app);

    /* The same drag as "a plain drag out of magnet range" above — 1200mm from
       the nearest line, an order of magnitude beyond alignRadius() — but with
       Shift held, which passes Infinity as the reach. Every line is now a
       candidate, the two cheapest are the neighbours' y = 0 and x = 5000, and
       their crossing is the corner's own original position. */
    const held = await dragWorld(app, CORNER_AT, [3000, 1200], {
      modifiers: ['Shift'],
      whileDown: () => liveDrag(app),
    });

    expect(held.alignNote).toBe('Right angle');
    expect(held.alignGuides).toHaveLength(2);
    expect((await points(app))[CORNER]).toEqual([5000, 0]);
  });

  test('a corner drag commits to the room stack and is undoable', async ({ app }) => {
    await roomMode(app);
    const before = await points(app);

    await dragWorld(app, CORNER_AT, [3000, 1200]);
    await settle(app);
    const after = await points(app);
    expect(after).not.toEqual(before);

    await app.evaluate(() => window.__rp.undoRoom());
    await settle(app);
    expect(await points(app)).toEqual(before);

    await app.evaluate(() => window.__rp.redoRoom());
    await settle(app);
    expect(await points(app)).toEqual(after);
  });

  test('endDrag clears the guides and the readout goes back to area + wall count', async ({ app }) => {
    await roomMode(app);
    const { radius } = await magnet(app);

    const cam = await pointerDownAt(app, CORNER_AT);
    await pointerStepTo(app, cam, CORNER_AT, [4200, 800]);
    await pointerStepTo(app, cam, [4200, 800], [5000 + radius * 0.4, radius * 0.4]);
    expect((await liveDrag(app)).alignNote).toBe('Right angle');

    await pointerUp(app);
    await settle(app);

    const after = await liveDrag(app);
    expect(after.drag).toBeNull();
    expect(after.alignNote).toBe('');
    expect(after.alignGuides).toEqual([]);
    expect(after.snapSpan).toBeNull();
    expect(after.readout).toContain('4 walls');
  });
});
