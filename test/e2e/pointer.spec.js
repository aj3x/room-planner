/* The two pointer gestures worth a permanent test.
 *
 * Phase 3.5 wrote 43 of these to make the 766-line `draw()` move safe. That
 * move has landed and the scaffolding is gone; these two stay because they are
 * the app's most intricate interaction and the only tests that go through the
 * browser's real pointer pipeline. Driving the same functions through state
 * skips `pointerdown`'s hit test, skips `applyDragAt`'s arming, and never
 * assigns a guide at all.
 *
 * Geometry all the way down. The fixture room is the 5000 x 4000 rectangle
 *   P = [[0,0], [5000,0], [5000,4000], [0,4000]]
 * and corner 1, [5000,0], is the one dragged. Its magnet references are its two
 * neighbours: corner 0 contributes the line y = 0, corner 2 the line x = 5000,
 * and those two cross at exactly the corner's own position — which is why the
 * landing below is [5000, 0] to the millimetre rather than merely close.
 */

import {
  test, expect, fixtureState, settle,
  camera, project, pointerDownAt, pointerStepTo, pointerUp, liveDrag,
} from './app-fixture.js';

const CORNER = 1;
const CORNER_AT = [5000, 0];

/** Room mode, camera fitted, nothing selected. */
async function roomMode(app) {
  await app.evaluate(() => { window.setMode('room'); window.fit(); });
  await settle(app);
}

const points = (app) => app.evaluate(() => window.__rp.RP().map((p) => p.slice()));
/** `alignRadius()` and `guideSeg`'s overshoot, both in world mm at the live zoom. */
const magnet = (app) => app.evaluate(() => ({
  radius: 18 / Math.max(window.__rp.view.scale, 1e-6),
  over: 10 / Math.max(window.__rp.view.scale, 1e-6),
}));

test.describe('dragging a room corner', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

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

    /* endDrag clears everything it set. */
    await settle(app);
    const after = await liveDrag(app);
    expect(after.drag).toBeNull();
    expect(after.alignNote).toBe('');
    expect(after.alignGuides).toEqual([]);
    expect(after.readout).toContain('4 walls');
  });
});
