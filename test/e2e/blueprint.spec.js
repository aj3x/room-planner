/* Blueprint detection golden — `example blueprints/apartment-1.png`.
 *
 * ~2,450 lines of the file are the blueprint importer, and almost all of it is
 * pixel work: thresholding, connected components, run-length wall banding,
 * region derivation, polygon tracing and cleanup. None of that can run under
 * jsdom, so this is where it is characterized.
 *
 * The polygons are the point. A screenshot of the review stage would go green
 * on a pipeline that had drifted by a few millimetres everywhere; a coordinate
 * golden will not. Counts are asserted explicitly on top, because "9 rooms and
 * 14 openings" is the number a human verified against the real photo, and it is
 * what makes the golden meaningful rather than merely self-consistent.
 *
 * OCR is deliberately not tested: bpLoadTesseract pulls the library from a CDN
 * at run time, so any test of it fails for reasons unrelated to the code. It
 * runs AFTER region derivation and never touches polyPx, so leaving it out
 * costs the geometry golden nothing. The scale it normally supplies is pinned
 * to a fixed 13 mm/px below instead.
 */

import { test, expect, BLUEPRINT_PNG, settle } from './app-fixture.js';

/* Detection is CPU-bound pixel work on a ~933x1009 image. */
const DETECT_TIMEOUT = 120_000;

/** Drive the real wizard as far as a finished detection proposal. */
async function detect(page) {
  await page.click('#btnImportBlueprint');
  await page.waitForSelector('#bpFile', { state: 'attached' });
  await page.setInputFiles('#bpFile', BLUEPRINT_PNG);
  // choosing a photo is itself the confirmation; the wizard advances to crop
  await page.waitForSelector('#bpCrop', { state: 'attached' });
  // accept the default crop box
  await page.click('#moOk');
  await page.waitForFunction(
    () => window.__rp.bpState && window.__rp.bpState.proposal,
    null,
    { timeout: DETECT_TIMEOUT },
  );
  await settle(page);
}

test.describe('blueprint detection', () => {
  test.slow();

  test('finds 9 rooms and 14 openings in apartment-1.png', async ({ app }) => {
    await detect(app);
    const counts = await app.evaluate(() => {
      const p = window.__rp.bpState.proposal;
      return { regions: p.regions.length, openings: p.openings.length, work: [p.w, p.h] };
    });
    /* Verified by hand against the photo during Phase 0. If these move, the
       pipeline changed — that is the whole signal. */
    expect(counts.regions).toBe(9);
    expect(counts.openings).toBe(14);
    expect(counts.work).toEqual([933, 1009]);
  });

  test('rooms rebuilt at a fixed scale are a stable golden in millimetres', async ({ app }) => {
    await detect(app);
    /* Detection runs entirely in pixel space; the scale is a separate, later
       input. OCR usually supplies it, but OCR needs the network — so pin a
       fixed 13 mm/px here. That makes this a pure test of bpRebuild ->
       bpCleanPoly -> polySimple, which is where the "rooms came out
       permanently uneditable" class of bug lives. */
    const draft = await app.evaluate(() => {
      window.__rp.bpState.edits.scale = { x: 13, y: 13, source: 'read' };
      const d = window.bpRebuild();
      const r3 = (n) => Math.round(n * 1000) / 1000;
      return {
        problems: d.problems,
        layouts: d.layouts
          .map((l) => ({
            wall: l.room.wall,
            floorPlace: { x: r3(l.floorPlace.x), y: r3(l.floorPlace.y), rot: l.floorPlace.rot },
            points: l.room.points.map((p) => [r3(p[0]), r3(p[1])]),
            openings: l.openings.map((o) => ({
              kind: o.kind, dtype: o.dtype, wall: o.wall,
              offset: r3(o.offset), width: r3(o.width),
            })),
          }))
          .sort((a, b) => a.floorPlace.y - b.floorPlace.y || a.floorPlace.x - b.floorPlace.x),
      };
    });
    expect(draft.layouts).toHaveLength(9);
    expect(draft.problems).toEqual([]);
    expect(JSON.stringify(draft, null, 2)).toMatchSnapshot('apartment-1-rooms-mm.json');
  });

  test('every rebuilt room passes the polygon gate that makes it editable', async ({ app }) => {
    /* bpCleanPoly normalises winding, drops collinear vertices and merges
       sub-50mm edges BEFORE polySimple, which is the only polygon gate in the
       app. A weakened copy of that gate is what made an earlier attempt's rooms
       permanently uneditable, so assert the real one directly. */
    await detect(app);
    const ok = await app.evaluate(() => {
      window.__rp.bpState.edits.scale = { x: 13, y: 13, source: 'read' };
      return window.bpRebuild().layouts.map((l) => window.polySimple(l.room.points));
    });
    expect(ok).toHaveLength(9);
    expect(ok.every(Boolean)).toBe(true);
  });

  test('the photo never reaches S, so save() cannot be poisoned', async ({ app }) => {
    /* save() serialises the whole of S into localStorage. Megabytes of base64
       there breaks saving permanently and silently, which is why bpState is a
       module-level binding and not part of S. */
    await detect(app);
    const leak = await app.evaluate(() => {
      const raw = JSON.stringify(window.__rp.S);
      return {
        bytes: raw.length,
        hasImage: raw.includes('data:image') || raw.includes('base64'),
        bpStateLive: !!window.__rp.bpState.full,
      };
    });
    expect(leak.bpStateLive).toBe(true); // the image really is loaded...
    expect(leak.hasImage).toBe(false);   // ...and really is not in S
    expect(leak.bytes).toBeLessThan(200_000);
  });
});
