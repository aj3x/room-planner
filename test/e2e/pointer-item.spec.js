/* Dragging a placed item, through real pointer events.
 *
 * Phase 3.5, companion to pointer-corner.spec.js. Same reasoning: the
 * `drag.mode === 'move'` branch of `applyDragAt` — grid snapping off the
 * item's own bounding box, then `slideToValid` against walls and other items —
 * is inside the connected component the `draw()` move has to lift, and nothing
 * drove it through a pointer before.
 *
 * The subject is `p2`, the sofa, from the vis-rect fixture:
 *   shape  rect 2130 x 910, rot 90  ->  half-extents 455 (x) by 1065 (y)
 *   at     [3200, 2600]             ->  bbox x 2745..3655, y 1535..3665
 * in the 5000 x 4000 room. It is chosen because it is the one placement in
 * that fixture that is *valid* — the bed and the rug both poke out through
 * y = 0, which makes `drag.loose` true and puts a drag on them down an
 * entirely different path (see the last test, which pins that too).
 */

import {
  test, expect, fixtureState, settle,
  camera, project, pointerDownAt, pointerUp, dragWorld, liveDrag, useCoarseSnap,
} from './app-fixture.js';

const SOFA = 'p2';
const SOFA_AT = [3200, 2600];
const HX = 455, HY = 1065;           // half-extents of the sofa at rot 90
const ROOM = { x0: 0, y0: 0, x1: 5000, y1: 4000 };

const placed = (app, id) => app.evaluate((i) => {
  const p = window.__rp.L().placed.find((q) => q.id === i);
  return p ? { x: p.x, y: p.y, rot: p.rot || 0 } : null;
}, id);

const box = ({ x, y }) => ({ x0: x - HX, x1: x + HX, y0: y - HY, y1: y + HY });

test.describe('dragging a placed item', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('pointerdown selects the item and the drag arms immediately', async ({ app }) => {
    /* 'move' is deliberately NOT in DEADZONE_MODES — that list is
       ['open','corner','pillar','iwall','iwall-end','wall'] — so an item has
       no deadzone at all and a one-pixel twitch moves it. Pinned because it is
       an asymmetry a refactor could "tidy up" without anyone noticing. */
    const before = await placed(app, SOFA);

    const cam = await pointerDownAt(app, SOFA_AT);
    const down = await liveDrag(app);
    expect(down.drag).toMatchObject({ mode: 'move', anchorId: SOFA });
    expect(down.drag.armed).toBeUndefined();
    expect(await app.evaluate(() => window.__rp.sel)).toBe(SOFA);

    const origin = project(cam, SOFA_AT);
    await app.mouse.move(origin.x + 1, origin.y);
    expect(await placed(app, SOFA)).not.toEqual(before);

    await pointerUp(app);
  });

  test('the item snaps to the grid by its own bounding box, not its centre', async ({ app }) => {
    /* A 500mm grid rather than the fixture's 25.4mm, so "snapped" and "not
       snapped" are tens of millimetres apart instead of a couple of pixels. */
    await useCoarseSnap(app);

    await dragWorld(app, SOFA_AT, [2600, 2200]);
    await settle(app);

    const p = await placed(app, SOFA);
    /* applyDragAt rounds `anx + b.x0` — the item's LEFT edge — onto the grid,
       and `any + b.y0`, its TOP edge. The centre lands wherever that puts it. */
    const b = box(p);
    expect(Math.abs(b.x0 / 500 - Math.round(b.x0 / 500))).toBeLessThan(1e-9);
    expect(Math.abs(b.y0 / 500 - Math.round(b.y0 / 500))).toBeLessThan(1e-9);
    expect(Math.abs(p.x - 2600)).toBeLessThan(300);
    expect(Math.abs(p.y - 2200)).toBeLessThan(300);
  });

  test('Alt+drag duplicates the item and drags the copy, off the grid', async ({ app }) => {
    /* Alt on an ITEM is not the Alt that drops the magnet on a corner: it takes
       the `hit && e.altKey` branch out of pointerdown, which pushes a copy of
       the clicked item into `placed`, selects the copies and drags those. The
       original never moves. The copy does still see `mods.altKey` inside
       applyDragAt, so it is also the no-grid path — both halves asserted here. */
    await useCoarseSnap(app);
    const before = await placed(app, SOFA);
    const countBefore = await app.evaluate(() => window.__rp.L().placed.length);

    await dragWorld(app, SOFA_AT, [2600, 2200], { modifiers: ['Alt'] });
    await settle(app);

    expect(await placed(app, SOFA)).toEqual(before);        // the original stayed put
    const after = await app.evaluate(() => window.__rp.L().placed.map((q) => ({ id: q.id, itemId: q.itemId, x: q.x, y: q.y })));
    expect(after).toHaveLength(countBefore + 1);

    const copy = after[after.length - 1];
    expect(copy.itemId).toBe('sofa');
    expect(copy.id).not.toBe(SOFA);
    expect(await app.evaluate(() => window.__rp.sel)).toBe(copy.id);

    const { scale } = await camera(app);
    /* No rounding at all: the copy sits where the pointer left it, so the only
       error is the pixel the pointer is quantised to. */
    expect(Math.abs(copy.x - 2600)).toBeLessThan(1 / scale);
    expect(Math.abs(copy.y - 2200)).toBeLessThan(1 / scale);

    /* And undo takes the copy away in one step, together with the drag — the
       snapshot is taken BEFORE the duplicates are pushed, on purpose. */
    await app.evaluate(() => window.__rp.undoFurn());
    await settle(app);
    expect(await app.evaluate(() => window.__rp.L().placed.length)).toBe(countBefore);
  });

  test('pushed at a wall, the item stops flush against it', async ({ app }) => {
    /* Straight right, far enough that the requested position would put the
       sofa's right edge 250mm outside the room. slideToValid bisects along the
       way and leaves it against the wall rather than back where the last event
       that still fitted happened to be. */
    await dragWorld(app, SOFA_AT, [4800, 2600]);
    await settle(app);

    const p = await placed(app, SOFA);
    const b = box(p);
    expect(b.x1).toBeGreaterThan(ROOM.x1 - 1);
    expect(b.x1).toBeLessThanOrEqual(ROOM.x1);
    expect(b.y0).toBeGreaterThan(ROOM.y0);
    expect(b.y1).toBeLessThan(ROOM.y1);
    /* It went as far as it could and no further: the pointer asked for 4800. */
    expect(p.x).toBeLessThan(4800);
  });

  test('pushed at another item, it stops flush against that', async ({ app }) => {
    /* `p3` is the round table: an ellipse 1070 x 1070 at [1400, 2900], i.e. a
       circle of radius 535 whose rightmost point is x = 1935. Driving the sofa
       left along y = 2600 brings its left edge onto that point — the sofa's
       y span, 1535..3665, straddles the circle's centre row, so the contact is
       the circle's true extreme and not a chord. Flush is therefore
       x = 1935 + 455 = 2390, less the 2mm EPS that `collides` shrinks each
       polygon by before testing them (4mm of allowed interpenetration). */
    await dragWorld(app, SOFA_AT, [2100, 2600]);
    await settle(app);

    const p = await placed(app, SOFA);
    /* y is untouched by the collision but still grid-rounded: the sofa's TOP
       edge, y - 1065, lands on a multiple of the fixture's 25.4mm grid, which
       puts the centre one step below the 2600 asked for. */
    expect(Math.abs((p.y - HY) / 25.4 - Math.round((p.y - HY) / 25.4))).toBeLessThan(1e-9);
    expect(Math.abs(p.y - 2600)).toBeLessThan(25.4);
    expect(p.x).toBeGreaterThan(2386 - 2);
    expect(p.x).toBeLessThan(2390 + 1);
    expect(p.x).toBeGreaterThan(2100);          // it did not reach the pointer
  });

  test('an item drag commits to the furniture stack, and only that stack', async ({ app }) => {
    const before = await placed(app, SOFA);
    const roomBefore = await app.evaluate(() => window.__rp.RP().map((q) => q.slice()));

    await dragWorld(app, SOFA_AT, [2900, 2300]);
    await settle(app);
    const after = await placed(app, SOFA);
    expect(after).not.toEqual(before);

    await app.evaluate(() => window.__rp.undoFurn());
    await settle(app);
    expect(await placed(app, SOFA)).toEqual(before);
    expect(await app.evaluate(() => window.__rp.RP().map((q) => q.slice()))).toEqual(roomBefore);

    await app.evaluate(() => window.__rp.redoFurn());
    await settle(app);
    expect(await placed(app, SOFA)).toEqual(after);
  });

  test('an empty-canvas drag is a marquee and selects what it covers', async ({ app }) => {
    /* The other branch out of pointerdown in furniture mode. The rubber band
       runs [2200,1300]..[3900,3700] in world mm and is tested against each
       item's BOUNDING BOX, not its outline: it catches `p2` (the sofa,
       2745..3655 x 1535..3665) and `p4` (the rug, 2640..4160 x -320..2120),
       and misses `p3` (the table, 865..1935 x ...) which ends 265mm short of
       the band's left edge. The rug is pass-through, which excludes it from
       collision but not from selection. `bringToFront` then moves both to the
       end of `placed`, which is a view-order change and must NOT land on the
       undo stack. */
    const depth = await app.evaluate(() => window.__rp.furnHist[window.__rp.S.active]?.i ?? null);

    await dragWorld(app, [2200, 1300], [3900, 3700], {
      whileDown: () => liveDrag(app),
    });
    await settle(app);

    const selected = await app.evaluate(() => [...window.__rp.selSet].sort());
    expect(selected).toEqual(['p2', 'p4']);
    expect(await app.evaluate(() => window.__rp.furnHist[window.__rp.S.active]?.i ?? null)).toBe(depth);
  });

  test('CHARACTERIZED, NOT ENDORSED: a placement that already sticks out drags loose', async ({ app }) => {
    /* `p1`, the bed, sits at [900, 700] with half-extents 765 x 1015, so its
       top edge is at y = -315 — outside the room before anything is touched.
       `drag.loose` is seeded from `isBad(hit)`, and while it is true the only
       constraint is `centreInside`: the piece can be dragged further out of
       the room, not just back in. It turns strict again the moment the
       placement becomes valid. See BACKLOG.md "Known defects". */
    const bed = await placed(app, 'p1');
    expect(bed.y - 1015).toBeLessThan(0);        // already outside, as the fixture stands

    await dragWorld(app, [900, 700], [900, 400]);
    await settle(app);

    const after = await placed(app, 'p1');
    expect(after.y).toBeLessThan(bed.y);         // it moved FURTHER out, and was allowed to
    expect(after.y - 1015).toBeLessThan(0);
    expect(after.y).toBeGreaterThan(0);          // but the centre stayed in the room
  });
});
