/* Drawing, through real pointer events: a room outline, a freestanding wall,
 * and a divider that cuts one room into two.
 *
 * Phase 3.5. These three tools share `drawCursor` and the `alignGuides`/
 * `alignNote` readout with the corner drag, and all three live inside the
 * connected component the `draw()` move must lift in one commit. They are
 * driven here the way a person drives them: click, move, click.
 *
 * Note which listener does what. A click goes to `pointerdown`, which pushes a
 * point and then immediately clears the guides. The guides are *set* by
 * `mousemove` -> `applyDrawCursorAt` -> `drawSnapPoint`. So a test that wants
 * to see a guide has to move the pointer without pressing it, which is exactly
 * what a person does between clicks.
 *
 * `S.snap` is raised to 500mm in the outline tests. The first corner of an
 * outline has no other corner to line up with, so it lands on the plain grid,
 * and at the fixture's 25.4mm that is two screen pixels — a coordinate a test
 * cannot predict. At 500mm the same click is unambiguous.
 */

import {
  test, expect, fixtureState, settle,
  frameBox, clickWorld, pointerDownAt, pointerUp, liveDrag, camera, project,
  useCoarseSnap, confirmModal,
} from './app-fixture.js';

const ROOM_BOX = [0, 0, 5000, 4000];

const roomPoints = (app) => app.evaluate(() => window.__rp.RP().map((p) => p.slice()));
const hover = async (app, world) => {
  const cam = await camera(app);
  const p = project(cam, world);
  await app.mouse.move(p.x, p.y);
  await settle(app);
};

test.describe('drawing a room outline', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test.beforeEach(async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startCustomDraw());
    await frameBox(app, ROOM_BOX);
  });

  test('startCustomDraw arms the tool and shows the hint', async ({ app }) => {
    expect(await app.evaluate(() => window.__rp.drawState)).toEqual({ pts: [] });
    expect(await app.evaluate(() => document.getElementById('drawHint').hidden)).toBe(false);
    expect(await app.evaluate(() => window.__rp.S.mode)).toBe('room');
  });

  test('four clicks and a close make an exact rectangle', async ({ app }) => {
    const want = [[1000, 1000], [4000, 1000], [4000, 3000], [1000, 3000]];
    for (const pt of want) await clickWorld(app, pt);
    await settle(app);

    expect(await app.evaluate(() => window.__rp.drawState.pts)).toEqual(want);

    /* Closing: a click within 12 screen px of the first point finishes the
       outline rather than adding a fifth corner. */
    await clickWorld(app, want[0]);
    await settle(app);

    expect(await app.evaluate(() => window.__rp.drawState)).toBeNull();
    expect(await app.evaluate(() => document.getElementById('drawHint').hidden)).toBe(true);
    expect(await roomPoints(app)).toEqual(want);
  });

  test('the magnet reports "Right angle" for the corner that closes the box', async ({ app }) => {
    for (const pt of [[1000, 1000], [4000, 1000], [4000, 3000]]) await clickWorld(app, pt);

    /* Hovering, not clicking: pointerdown clears the guides the instant it
       pushes a point, so this readout only exists between clicks. */
    await hover(app, [1000, 3000]);
    const held = await liveDrag(app);

    expect(held.alignNote).toBe('Right angle');
    expect(held.snapSpan).toBe('Right angle');
    /* One guide off the corner just placed ([4000,3000], line y = 3000) and one
       off the corner the loop will close on ([1000,1000], line x = 1000). */
    expect(held.alignGuides).toHaveLength(2);
    expect(await app.evaluate(() => window.__rp.drawCursor)).toEqual([1000, 3000]);
  });

  test('Shift is the 45-degree lock and says "Straight"', async ({ app }) => {
    await clickWorld(app, [1000, 1000]);

    await app.keyboard.down('Shift');
    await hover(app, [3000, 1300]);       // 2000 across, 300 down: 8.5 degrees
    const held = await liveDrag(app);

    expect(held.alignNote).toBe('Straight');
    expect(held.alignGuides).toEqual([]);

    /* Locked onto the nearest 45 degree multiple off the previous point — 0,
       due east — keeping the raw DISTANCE of 2022mm rather than the raw x, then
       put on the 500mm grid. So the cursor ends further east than the pointer. */
    expect(await app.evaluate(() => window.__rp.drawCursor)).toEqual([3000, 1000]);
    await app.keyboard.up('Shift');
  });

  test('fewer than three corners is refused and the tool stays armed', async ({ app }) => {
    const before = await roomPoints(app);
    await clickWorld(app, [1000, 1000]);
    await clickWorld(app, [4000, 1000]);
    await clickWorld(app, [1000, 1000]);      // a close attempt with only 2 corners

    /* pts.length >= 3 gates the close, so this is simply a third corner. */
    expect(await app.evaluate(() => window.__rp.drawState.pts)).toHaveLength(3);
    expect(await roomPoints(app)).toEqual(before);
  });
});

test.describe('drawing a freestanding wall', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('two clicks add an interior wall, snapped onto the room', async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startWallDraw());
    await frameBox(app, ROOM_BOX);

    expect(await app.evaluate(() => window.__rp.wallDrawState)).toEqual({ a: null });

    /* snapWallPoint is magnetic unless Alt is held: a click near a room wall is
       projected onto it exactly, and a click near a corner takes the corner. */
    await clickWorld(app, [2500, 60]);        // just inside the top wall
    expect(await app.evaluate(() => window.__rp.wallDrawState.a)).toEqual([2500, 0]);

    await clickWorld(app, [2500, 3950]);      // just inside the bottom wall
    await settle(app);

    expect(await app.evaluate(() => window.__rp.wallDrawState)).toBeNull();
    const iw = await app.evaluate(() => window.__rp.L().room.iwalls.map((w) => ({ a: w.a, b: w.b, t: w.t })));
    expect(iw).toHaveLength(1);
    expect(iw[0].a).toEqual([2500, 0]);
    expect(iw[0].b).toEqual([2500, 4000]);
    expect(iw[0].t).toBe(114);                // inherits the room's wall thickness

    /* The new wall is selected, and the whole thing is one room-stack edit. */
    expect(await app.evaluate(() => window.__rp.roomSel.kind)).toBe('iwall');
    await app.evaluate(() => window.__rp.undoRoom());
    await settle(app);
    expect(await app.evaluate(() => window.__rp.L().room.iwalls)).toHaveLength(0);
  });

  test('a wall shorter than 50mm is refused', async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startWallDraw());
    await frameBox(app, ROOM_BOX);

    await clickWorld(app, [2500, 2000]);
    await clickWorld(app, [2500, 2000]);      // same point again
    await settle(app);

    expect(await app.evaluate(() => window.__rp.L().room.iwalls)).toHaveLength(0);
    expect(await app.evaluate(() => window.__rp.wallDrawState.a)).toEqual([2500, 2000]);
    expect(await app.evaluate(() => document.getElementById('flash').textContent))
      .toBe('Drag out a longer wall');
  });
});

test.describe('splitting a room along a divider', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('two boundary clicks cut the rectangle into two rooms', async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startSplitRoom(window.__rp.S.active));
    await frameBox(app, ROOM_BOX);

    expect(await app.evaluate(() => window.__rp.splitDrawState)).toEqual({ pts: [] });

    /* Wall 0 is the top, y = 0; wall 2 is the bottom, y = 4000. Both clicks are
       60mm shy of the wall, which is inside snapWallPoint's magnet, so each
       lands exactly on the boundary and boundaryHit (a 1mm tolerance) accepts
       it. */
    await clickWorld(app, [2500, 60]);
    const started = await app.evaluate(() => window.__rp.splitDrawState.pts.map((p) => ({ i: p.i, pt: p.pt })));
    expect(started).toEqual([{ i: 0, pt: [2500, 0] }]);

    await clickWorld(app, [2500, 3940]);
    await settle(app);

    /* The cut is not applied on the second click: trySplitLine hands off to
       openSplitChoice, a modal asking whether the new boundary carries a wall.
       "Split with a wall" is the primary button; the other option is an extra
       button inserted beside it on mount. */
    await confirmModal(app, 'Split this room into two?');

    expect(await app.evaluate(() => window.__rp.splitDrawState)).toBeNull();

    const rooms = await app.evaluate(() => window.__rp.S.layouts.map((l) => l.room.points));
    expect(rooms).toHaveLength(2);
    /* Two 2500 x 4000 halves, and the cut is a shared edge in both, walked in
       opposite directions. */
    for (const pts of rooms) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBe(4000);
      expect(Math.max(...xs) - Math.min(...xs)).toBe(2500);
    }
    expect(rooms.map((pts) => Math.min(...pts.map((p) => p[0]))).sort((a, b) => a - b)).toEqual([0, 2500]);
  });

  test('a divider that does not start on a wall is refused', async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startSplitRoom(window.__rp.S.active));
    await frameBox(app, ROOM_BOX);

    await clickWorld(app, [2500, 2000]);      // the middle of the room, no boundary under it
    await settle(app);

    expect(await app.evaluate(() => window.__rp.splitDrawState.pts)).toEqual([]);
    expect(await app.evaluate(() => window.__rp.S.layouts)).toHaveLength(1);
    expect(await app.evaluate(() => document.getElementById('flash').textContent))
      .toBe("Click a point on the room's wall");
  });

  test('a bent divider takes an interior point on the way', async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startSplitRoom(window.__rp.S.active));
    await frameBox(app, ROOM_BOX);

    await clickWorld(app, [2500, 60]);        // start on the top wall
    await clickWorld(app, [3500, 2000]);      // bend, strictly inside the room
    expect(await app.evaluate(() => window.__rp.splitDrawState.pts)).toHaveLength(2);

    await clickWorld(app, [2500, 3940]);      // finish on the bottom wall
    await settle(app);
    await confirmModal(app, 'Split this room into two?');

    const rooms = await app.evaluate(() => window.__rp.S.layouts.map((l) => l.room.points));
    expect(rooms).toHaveLength(2);
    /* The bend becomes a real corner of both halves: five corners each, not
       four, and the two share it. */
    expect(rooms.map((r) => r.length).sort()).toEqual([5, 5]);
    const bend = await app.evaluate(() => window.__rp.S.layouts
      .map((l) => l.room.points.filter((p) => Math.abs(p[1] - 2000) < 1).length));
    expect(bend).toEqual([1, 1]);
  });

  test('pointerdown on a canvas with the split tool armed does not start a drag', async ({ app }) => {
    await useCoarseSnap(app);
    await app.evaluate(() => window.startSplitRoom(window.__rp.S.active));
    await frameBox(app, ROOM_BOX);

    await pointerDownAt(app, [2500, 60]);
    /* The split branch returns before any of the room-editing branches, so
       nothing is dragging even while the button is held. */
    expect((await liveDrag(app)).drag).toBeNull();
    await pointerUp(app);
  });
});
