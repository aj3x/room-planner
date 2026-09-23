/* Characterization: what the app looks like the instant it has finished booting,
   from nothing and from each historical saved-state shape. These assertions are
   deliberately about *observable* state, not internals of any one function. */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bootApp, flushSave, stableIds, REPO_ROOT } from '../harness.js';

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'test/fixtures/states', name), 'utf8'));

describe('boot — no saved state', () => {
  it('boots without throwing and without a console error', async () => {
    const { errors } = await bootApp();
    expect(errors).toEqual([]);
  });

  it('starts on one blank room, furniture mode, ft+in', async () => {
    const { t } = await bootApp();
    expect(t.S.layouts).toHaveLength(1);
    expect(t.S.layouts[0].name).toBe('My room');
    expect(t.S.active).toBe(t.S.layouts[0].id);
    expect(t.S.mode).toBe('furniture');
    expect(t.S.unit).toBe('ftin');
    expect(t.S.inventory).toEqual([]);
    expect(t.S.folders).toEqual([]);
    expect(t.S.floors).toEqual([]);
  });

  it('the default room is the documented 4270 x 3660 rectangle', async () => {
    const { t } = await bootApp();
    expect(t.S.layouts[0].room.points).toEqual([[0, 0], [4270, 0], [4270, 3660], [0, 3660]]);
    expect(t.S.layouts[0].room.wall).toBe(114);
  });

  it('actually paints the canvas during boot', async () => {
    const { t } = await bootApp();
    expect(t.ctx.__calls.length).toBeGreaterThan(50);
  });

  it('nothing is selected', async () => {
    const { t } = await bootApp();
    expect(t.sel).toBeNull();
    expect([...t.selSet]).toEqual([]);
  });
});

describe('boot — from a saved state', () => {
  const cases = [
    ['v0 legacy (w/d rectangle, N/E/S/W doors)', 'v0-legacy-rect-doors.json'],
    ['v1 (points + openings, no floors/measures)', 'v1-points-openings.json'],
    ['v2 modern (everything populated)', 'v2-modern-full.json'],
    ['edge (dangling refs and bad enums)', 'edge-dangling-refs.json'],
  ];

  for (const [label, file] of cases) {
    it(`${label} — boots clean`, async () => {
      const { errors, t } = await bootApp({ saved: fixture(file) });
      expect(errors).toEqual([]);
      expect(t.S.layouts.length).toBeGreaterThan(0);
      expect(t.S.layouts.some((l) => l.id === t.S.active)).toBe(true);
    });
  }

  it('v0: the N/E/S/W doors become indexed openings on the right walls', async () => {
    const { t } = await bootApp({ saved: fixture('v0-legacy-rect-doors.json') });
    const l = t.S.layouts[0];
    expect(l.room.points).toEqual([[0, 0], [4270, 0], [4270, 3660], [0, 3660]]);
    expect(l.room.w).toBeUndefined();
    expect(l.doors).toBeUndefined();
    expect(l.openings.map((o) => ({ wall: o.wall, dtype: o.dtype, width: o.width }))).toEqual([
      { wall: 0, dtype: 'hinge', width: 813 },
      { wall: 3, dtype: 'slide', width: 900 },
    ]);
  });

  it('v0: a placement whose item is gone is kept on load (only its drawing is skipped)', async () => {
    const { t } = await bootApp({ saved: fixture('v0-legacy-rect-doors.json') });
    const ids = t.S.layouts[0].placed.map((p) => p.itemId);
    expect(ids).toContain('gone-item');
    // ...but a placement with no itemId at all is dropped, and every survivor gets an id
    expect(t.S.layouts[0].placed.every((p) => p.id && p.itemId)).toBe(true);
  });

  it('v1: item.manualTags is backfilled from item.tags', async () => {
    const { t } = await bootApp({ saved: fixture('v1-points-openings.json') });
    const sofa = t.S.inventory.find((i) => i.id === 'sofa');
    expect(sofa.manualTags).toEqual(['seating', 'living']);
    const lamp = t.S.inventory.find((i) => i.id === 'lamp');
    expect(lamp.tags).toEqual([]);
    expect(lamp.count).toBe(1);
  });

  it('v2: floors, measures, pillars and iwalls all survive a round trip through boot', async () => {
    const { t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const l = t.S.layouts.find((x) => x.id === 'room-a');
    expect(t.S.floors).toHaveLength(1);
    expect(l.floorId).toBe('floor-1');
    expect(l.measures).toHaveLength(2);
    expect(l.room.pillars).toHaveLength(1);
    expect(l.room.iwalls).toHaveLength(1);
    expect(t.S.invScope).toBe('folder');
    expect(t.S.zoomSpeed).toBe(1.5);
  });

  it('v2: a folder tag is materialized onto the items filed under it', async () => {
    const { t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const k = t.S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(k.tags).toEqual(expect.arrayContaining(['ikea', 'storage']));
  });

  it('edge: every dangling reference is repaired rather than thrown on', async () => {
    const { t } = await bootApp({ saved: fixture('edge-dangling-refs.json') });
    const l = t.S.layouts[0];
    expect(l.id).toBeTruthy();                 // a layout with no id gets one
    expect(t.S.active).toBe(l.id);             // active pointed at nothing
    expect(l.floorId).toBeNull();              // its floor had been deleted
    expect(t.S.mode).toBe('furniture');        // 'spelunking' is not a mode
    expect(t.S.invScope).toBe('project');      // 'galaxy' is not a scope
    expect(t.S.zoomSpeed).toBe(1);             // 'fast' is not a number
    expect(t.S.folders).toEqual([]);           // was the string "not-an-array"
    expect(t.S.secClosed).toEqual([]);
    expect(t.S.uiLib).toEqual({ tab: 'library', libFolderId: null, marketFolderId: null });
    expect(t.S.marketSubs[0].id).toBeTruthy(); // a subscription with no id gets one
    expect(t.S.floors[0].extWall).toBe(0);     // a negative exterior wall means "use each room's own"
    expect(l.room.floor).toBe('#f5f3ee');      // 'not-a-colour' falls back to the default
    /* CHARACTERIZED, NOT ENDORSED: y stays null. normLayout guards with
       isFinite(p.y), and isFinite(null) is true because null coerces to 0 — so
       the string "nope" is repaired to 0 but null sails straight through. See
       BACKLOG.md "Known defects". Locked in here so the refactor cannot change
       it by accident; change it deliberately and this test tells you. */
    expect(l.floorPlace).toEqual({ x: 0, y: null, rot: 90 });
  });

  it('edge: the same isFinite(null) hole shows up on pillars', async () => {
    const { t } = await bootApp({ saved: fixture('edge-dangling-refs.json') });
    const pil = t.S.layouts[0].room.pillars.find((p) => p.id === 'pil-ok');
    expect(pil.x).toBe(0);      // "x" is not finite -> repaired
    expect(pil.rot).toBeNull(); // null IS "finite" -> left alone (same defect)
  });

  it('edge: a pillar with an unknown shape type is reset to a 300mm square', async () => {
    const { t } = await bootApp({ saved: fixture('edge-dangling-refs.json') });
    const bad = t.S.layouts[0].room.pillars[0];
    expect(bad.shape).toEqual({ type: 'rect', w: 300, d: 300 });
    expect(bad.id).toBeTruthy();
  });

  it('edge: an interior wall thinner than 10mm is floored at 10mm', async () => {
    const { t } = await bootApp({ saved: fixture('edge-dangling-refs.json') });
    const iw = t.S.layouts[0].room.iwalls.find((w) => w.id === 'iw-ok');
    expect(iw.t).toBe(10);
    const salvaged = t.S.layouts[0].room.iwalls[0];
    expect(salvaged.a).toEqual([0, 0]);
    expect(salvaged.b).toEqual([300, 0]);
  });

  it('edge: only the measurement whose both ends still exist survives', async () => {
    const { t } = await bootApp({ saved: fixture('edge-dangling-refs.json') });
    expect(t.S.layouts[0].measures.map((m) => m.id)).toEqual(['m-live']);
  });

  it('edge: an all-zero open box normalises to null, a 3-digit hex expands', async () => {
    const { t } = await bootApp({ saved: fixture('edge-dangling-refs.json') });
    const chair = t.S.inventory.find((i) => i.id === 'chair');
    expect(chair.open).toBeNull();
    expect(chair.color).toBe('#aabbcc');
  });

  it('unparseable JSON in storage is ignored and the app starts fresh', async () => {
    const { errors, t } = await bootApp({ saved: '{not json at all' });
    expect(errors).toEqual([]);
    expect(t.S.layouts).toHaveLength(1);
    expect(t.S.layouts[0].name).toBe('My room');
  });

  it('a saved state with no layouts is rejected by migrate() and the app starts fresh', async () => {
    const { t } = await bootApp({ saved: { layouts: [], inventory: [] } });
    expect(t.S.layouts).toHaveLength(1);
    expect(t.S.layouts[0].name).toBe('My room');
  });
});

describe('persistence', () => {
  it('save() debounces and writes the whole of S under the app key', async () => {
    const { window, app, t } = await bootApp({ saved: fixture('v1-points-openings.json') });
    t.S.layouts[0].name = 'Renamed studio';
    app.save();
    const written = await flushSave(window);
    expect(written).not.toBeNull();
    expect(written.layouts[0].name).toBe('Renamed studio');
    expect(written.unit).toBe('cm');
  });

  it('saved state never carries blueprint image data (bpState must stay out of S)', async () => {
    const { window, app } = await bootApp({ saved: fixture('v2-modern-full.json') });
    app.save();
    const written = await flushSave(window);
    const raw = JSON.stringify(written);
    expect(raw).not.toContain('data:image');
    expect(raw).not.toContain('base64');
    expect(written.bpState).toBeUndefined();
  });

  it('boot state is stable across a save/reload cycle', async () => {
    const first = await bootApp({ saved: fixture('v2-modern-full.json') });
    first.app.save();
    const written = await flushSave(first.window);
    const second = await bootApp({ saved: written });
    expect(stableIds(second.t.S)).toEqual(stableIds(written));
  });
});
