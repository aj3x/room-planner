/* The Measure tool, through real pointer events.
 *
 * Phase 3.5. `measureOn` diverts `pointerdown` to `measurePointerDown()`
 * before any of the editing branches are reached, in either canvas mode — one
 * of the five interaction lets that gate the `draw()` move, and the only one
 * whose whole purpose is to change what a click means. Nothing drove it
 * through a pointer before.
 */

import {
  test, expect, fixtureState, settle,
  frameBox, clickWorld, pointerDownAt, pointerUp, liveDrag, camera, project,
} from './app-fixture.js';

const ROOM_BOX = [0, 0, 5000, 4000];
const BED = [900, 700];        // p1's centre
const SOFA = [3200, 2600];     // p2's centre

const measures = (app) => app.evaluate(() => window.__rp.L().measures.map((m) => ({ a: m.a, b: m.b })));
const barText = (app) => app.evaluate(() => document.getElementById('measureBar').textContent);

test.describe('measuring between two anchors', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test.beforeEach(async ({ app }) => {
    await frameBox(app, ROOM_BOX);
  });

  test('the toolbar button and the M key both toggle the tool', async ({ app }) => {
    expect(await app.evaluate(() => window.__rp.measureOn)).toBe(false);

    await app.click('#btnMeasure');
    await settle(app);
    expect(await app.evaluate(() => window.__rp.measureOn)).toBe(true);
    expect(await app.getAttribute('#btnMeasure', 'aria-pressed')).toBe('true');
    expect(await app.evaluate(() => document.getElementById('measureBar').hidden)).toBe(false);
    expect(await app.evaluate(() => document.getElementById('cv').classList.contains('measuring'))).toBe(true);
    expect(await barText(app)).toContain('Pick a corner, side, centre or door swing');

    await app.keyboard.press('m');
    await settle(app);
    expect(await app.evaluate(() => window.__rp.measureOn)).toBe(false);
    expect(await app.evaluate(() => document.getElementById('measureBar').hidden)).toBe(true);
  });

  test('turning the tool on drops the selection, so a click cannot edit', async ({ app }) => {
    /* Select the sofa first, the ordinary way. */
    await clickWorld(app, SOFA);
    await settle(app);
    expect(await app.evaluate(() => window.__rp.sel)).toBe('p2');

    await app.click('#btnMeasure');
    await settle(app);
    expect(await app.evaluate(() => window.__rp.sel)).toBeNull();
  });

  test('two clicks on two item centres make a measurement', async ({ app }) => {
    await app.click('#btnMeasure');
    await settle(app);
    expect(await measures(app)).toEqual([]);

    /* measurePick offers an object's centre at tier 0 within 9 screen px, so a
       click on an item's own centre takes the `whole` anchor. */
    await clickWorld(app, BED);
    await settle(app);
    expect(await app.evaluate(() => window.__rp.measureStart))
      .toEqual({ k: 'item', id: 'p1', part: 'whole' });
    expect(await measures(app)).toEqual([]);          // one end is not a measurement
    expect(await barText(app)).toContain('Now pick the second one');

    await clickWorld(app, SOFA);
    await settle(app);

    expect(await measures(app)).toEqual([{
      a: { k: 'item', id: 'p1', part: 'whole' },
      b: { k: 'item', id: 'p2', part: 'whole' },
    }]);
    expect(await app.evaluate(() => window.__rp.measureStart)).toBeNull();
    expect(await barText(app)).toContain('Pick a corner, side, centre or door swing');
  });

  test('an item corner is a distinct anchor from the item itself', async ({ app }) => {
    await app.click('#btnMeasure');
    await settle(app);

    /* p2 is the sofa: rect 2130 x 910 at rot 90, so its corners are the four
       combinations of x = 3200 +/- 455 and y = 2600 +/- 1065. Corners are
       offered within 10 screen px and outrank the centre. */
    await clickWorld(app, [3200 - 455, 2600 - 1065]);
    await settle(app);
    const start = await app.evaluate(() => window.__rp.measureStart);
    expect(start).toMatchObject({ k: 'item', id: 'p2', part: 'corner' });
    expect(typeof start.n).toBe('number');

    await clickWorld(app, BED);
    await settle(app);
    const [m] = await measures(app);
    expect(m.a).toEqual(start);
    expect(m.b).toEqual({ k: 'item', id: 'p1', part: 'whole' });
  });

  test('picking the same anchor twice does not make a zero-length measurement', async ({ app }) => {
    await app.click('#btnMeasure');
    await settle(app);

    await clickWorld(app, BED);
    await clickWorld(app, BED);
    await settle(app);

    /* anchorKey(t.a) !== anchorKey(measureStart) guards the second end, but the
       first end is NOT cleared by the rejected click — it stays armed. */
    expect(await measures(app)).toEqual([]);
    expect(await app.evaluate(() => window.__rp.measureStart))
      .toEqual({ k: 'item', id: 'p1', part: 'whole' });
  });

  test('a click on nothing pans instead of editing, and never starts a room drag', async ({ app }) => {
    await app.evaluate(() => window.setMode('room'));
    await app.click('#btnMeasure');
    await frameBox(app, ROOM_BOX);

    /* Room mode, Measure on, pointer down on a room CORNER. Without the tool
       this is a `corner` drag; with it, measurePointerDown takes the click and
       offers the wall anchors instead. The corner must not move. */
    const before = await app.evaluate(() => window.__rp.RP().map((p) => p.slice()));
    await pointerDownAt(app, [5000, 0]);
    const held = await liveDrag(app);
    expect(held.drag === null || held.drag.mode === 'pan').toBe(true);
    await pointerUp(app);
    expect(await app.evaluate(() => window.__rp.RP().map((p) => p.slice()))).toEqual(before);

    /* And an empty patch of stage, where there is no anchor at all, becomes a
       pan drag — the tool's own fallback. */
    const cam = await camera(app);
    const p = project(cam, [2500, 2000]);
    await app.mouse.move(p.x, p.y);
    await app.mouse.down();
    expect((await liveDrag(app)).drag).toMatchObject({ mode: 'pan' });
    await app.mouse.up();
  });

  test('a measurement has no undo history of its own', async ({ app }) => {
    await app.click('#btnMeasure');
    await settle(app);
    await clickWorld(app, BED);
    await clickWorld(app, SOFA);
    await settle(app);
    expect(await measures(app)).toHaveLength(1);

    /* Measurements have no undo history of their own — pinned here because it
       is exactly the kind of asymmetry a refactor might "correct". */
    await app.evaluate(() => window.__rp.undoFurn());
    await settle(app);
    expect(await measures(app)).toHaveLength(1);
  });

  test('the Done button in the measure bar puts the tool away', async ({ app }) => {
    await app.click('#btnMeasure');
    await settle(app);
    await app.click('#measureBar button[data-act="done"]');
    await settle(app);

    expect(await app.evaluate(() => window.__rp.measureOn)).toBe(false);
    expect(await app.evaluate(() => window.__rp.measureStart)).toBeNull();
  });
});
