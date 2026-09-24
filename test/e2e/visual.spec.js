/* Canvas screenshot baselines — light and dark.
 *
 * draw() is immediate-mode: every state change repaints the whole canvas from
 * scratch. That makes a canvas screenshot an unusually honest summary of the
 * renderer, and it is the only practical way to characterize ~900 lines of
 * drawing code before moving it.
 *
 * Only #cv is captured, never the whole page. The side panels are HTML, their
 * baselines would churn on any wording or spacing change, and none of that is
 * what the extraction phase puts at risk. The canvas is.
 *
 * These run in both the chromium-light and chromium-dark projects (see
 * playwright.config.js), so each fixture below produces two baselines. Dark
 * mode re-reads PAL() -> CANVAS.dark, which is exactly the kind of thing a
 * careless move of the palette constants would break.
 */

import { test, expect, fixtureState, settle } from './app-fixture.js';

/** Frame the plan identically every time: fit() derives the zoom from the
 *  canvas box, so with a fixed viewport this is fully deterministic. */
async function frame(page) {
  await page.evaluate(() => { window.fit(); window.draw(); });
  await settle(page);
}

const canvas = (page) => page.locator('#cv');

test.describe('canvas baselines', () => {
  test.describe('rectangular room in furniture mode', () => {
    test.use({ savedState: fixtureState('vis-rect.json') });

    test('renders the room, its openings and its items', async ({ app }) => {
      await frame(app);
      await expect(canvas(app)).toHaveScreenshot('rect-furniture.png');
    });

    test('room mode shows the wall furniture mode does not', async ({ app }) => {
      await app.evaluate(() => { window.setMode('room'); window.fit(); window.draw(); });
      await settle(app);
      await expect(canvas(app)).toHaveScreenshot('rect-room-mode.png');
    });

    test('with dimensions and open footprints turned off', async ({ app }) => {
      await app.evaluate(() => {
        window.__rp.S.showDims = false;
        window.__rp.S.showOpen = false;
        window.fit(); window.draw();
      });
      await settle(app);
      await expect(canvas(app)).toHaveScreenshot('rect-no-overlays.png');
    });
  });

  test.describe('L-shaped room in room mode', () => {
    test.use({ savedState: fixtureState('vis-lshape.json') });

    test('renders the non-convex outline, pillar, interior wall and measurements', async ({ app }) => {
      await frame(app);
      await expect(canvas(app)).toHaveScreenshot('lshape-room.png');
    });
  });

  test.describe('walk paths', () => {
    /* Every other fixture has showWalk false, so the 393 lines of
       model/walkpaths.js painted nothing in any baseline — the region moved in
       the draw() round with no coverage whatsoever. This fixture is vis-rect
       with the overlay switched on, so a diff against rect-furniture.png is
       exactly the overlay and nothing else. */
    test.use({ savedState: fixtureState('vis-walkpaths.json') });

    test('draws the reachable floor around the furniture', async ({ app }) => {
      await frame(app);
      await expect(canvas(app)).toHaveScreenshot('walkpaths-on.png');
    });

    test('the overlay is what the toggle controls, and nothing else', async ({ app }) => {
      await frame(app);
      /* Same state, overlay off, must equal the plain vis-rect baseline: proves
         the paths are drawn by this toggle rather than incidental to the fixture. */
      await app.evaluate(() => {
        window.__rp.S.showWalk = false;
        window.fit(); window.draw();
      });
      await settle(app);
      await expect(canvas(app)).toHaveScreenshot('rect-furniture.png');
    });
  });

  test.describe('a fully populated project', () => {
    test.use({ savedState: fixtureState('v2-modern-full.json') });

    test('renders the active room', async ({ app }) => {
      await frame(app);
      await expect(canvas(app)).toHaveScreenshot('modern-active-room.png');
    });

    test('renders the floor arrangement both rooms stand on', async ({ app }) => {
      await app.evaluate(() => { window.setMode('floor'); window.fit(); window.draw(); });
      await settle(app);
      await expect(canvas(app)).toHaveScreenshot('modern-floor-mode.png');
    });
  });
});

test.describe('door swings — the Phase 0 risk area', () => {
  /* swingPoly() took a new `room` parameter immediately before this branch, so
     every hinged door's arc is the thing most likely to have moved. Screenshots
     catch a wrong arc direction or a mirrored hinge instantly, where a numeric
     assertion would need the geometry restated by hand. */
  test.use({ savedState: fixtureState('vis-door-swings.json') });

  test('inward and outward swings, both hinge sides, plus bifold and slider', async ({ app }) => {
    await frame(app);
    await expect(canvas(app)).toHaveScreenshot('door-swings-all.png');
  });

  test('with swings hidden, only the openings remain', async ({ app }) => {
    await app.evaluate(() => { window.__rp.S.showSwing = false; window.fit(); window.draw(); });
    await settle(app);
    await expect(canvas(app)).toHaveScreenshot('door-swings-hidden.png');
  });

  test('swing polygons are geometry, not just pixels', async ({ app }) => {
    /* A screenshot proves the arcs look right; this proves they ARE right, in
       millimetres, so a refactor that shifts them cannot hide behind the
       screenshot tolerance. */
    const polys = await app.evaluate(() => {
      const l = window.__rp.S.layouts[0];
      return l.openings
        .filter((o) => o.dtype === 'hinge')
        .map((o) => ({
          id: o.id, hinge: o.hinge, swing: o.swing,
          poly: (window.swingPoly(o) || []).map((p) => [
            Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000,
          ]),
        }));
    });
    expect(polys).toHaveLength(6);
    for (const p of polys) expect(p.poly.length).toBeGreaterThan(2);
    expect(JSON.stringify(polys, null, 2)).toMatchSnapshot('swing-polygons.json');
  });
});

test.describe('the dark palette is wired to prefers-color-scheme', () => {
  /* The screenshots above would still pass if dark mode quietly stopped
     working, because only STAGE-side colours change (background, walls,
     labels) — selection, handles and warnings sit on the user's own floor
     colour and keep their light values by design. So assert the palette
     numerically as well: this is the check that fails loudly if the CANVAS
     constants or darkMQ get separated during extraction. */
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('PAL() follows the media query and really swaps', async ({ app }, testInfo) => {
    const p = await app.evaluate(() => ({
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      pal: window.__rp.PAL(),
      light: window.__rp.CANVAS.light,
      darkPal: window.__rp.CANVAS.dark,
    }));
    /* Read the scheme off the project's own config rather than its name: since
       Phase 2 each scheme runs under two project names (dev server and dist),
       and a name test would silently assert "light" for the dist dark run. */
    const wantDark = testInfo.project.use.colorScheme === 'dark';
    expect(p.dark).toBe(wantDark);
    expect(p.pal).toEqual(wantDark ? p.darkPal : p.light);
    // and the two palettes really are different objects, not the same one twice
    expect(p.light.wall).not.toBe(p.darkPal.wall);
  });
});
