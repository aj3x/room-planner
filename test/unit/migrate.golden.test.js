/* Golden-file characterization of migrate() / normLayout() / normItem().
 *
 * These snapshots are the single most load-bearing artifact of the whole
 * baseline: migrate() is what every returning user's saved project passes
 * through on every load, and a silent change to it corrupts real data with no
 * error anywhere. If one of these snapshots moves during the refactor, the
 * refactor is wrong — do not re-baseline without understanding the diff.
 *
 * Ids are normalised to ordinals (see stableIds) so that an extra uid() call
 * upstream doesn't rewrite the whole file; identity is still proven, because
 * the same id in two places maps to the same ordinal in both.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bootApp, stableIds, clone, REPO_ROOT } from '../harness.js';

const DIR = path.join(REPO_ROOT, 'test/fixtures/states');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));

const FIXTURES = [
  'v0-legacy-rect-doors.json',
  'v1-points-openings.json',
  'v2-modern-full.json',
  'edge-dangling-refs.json',
];

describe('migrate() golden output', () => {
  for (const name of FIXTURES) {
    it(`${name} migrates to a stable shape`, async () => {
      const { app } = await bootApp();
      const out = app.migrate(clone(fixture(name)));
      expect(stableIds(out)).toMatchSnapshot();
    });
  }
});

describe('migrate() invariants that hold for every fixture', () => {
  for (const name of FIXTURES) {
    it(`${name}: output satisfies the shape contract`, async () => {
      const { app } = await bootApp();
      const st = app.migrate(clone(fixture(name)));

      expect(Array.isArray(st.layouts) && st.layouts.length).toBeTruthy();
      for (const key of ['inventory', 'folders', 'floors', 'tagFilter', 'secClosed',
        'itemFolders', 'marketFolders', 'marketListings', 'marketSubs']) {
        expect(Array.isArray(st[key]), `${key} must be an array`).toBe(true);
      }
      expect(['room', 'furniture', 'floor', 'inventory', 'marketplace']).toContain(st.mode);
      expect(['project', 'folder', 'room']).toContain(st.invScope);
      expect(typeof st.zoomSpeed).toBe('number');
      expect(Number.isFinite(st.zoomSpeed) && st.zoomSpeed > 0).toBe(true);
      expect(st.layouts.some((l) => l.id === st.active)).toBe(true);

      const floorIds = new Set(st.floors.map((f) => f.id));
      for (const l of st.layouts) {
        expect(Array.isArray(l.room.points)).toBe(true);
        expect(l.room.points.length).toBeGreaterThanOrEqual(3);
        expect(Array.isArray(l.openings)).toBe(true);
        expect(Array.isArray(l.placed)).toBe(true);
        expect(Array.isArray(l.measures)).toBe(true);
        expect(Array.isArray(l.room.pillars)).toBe(true);
        expect(Array.isArray(l.room.iwalls)).toBe(true);
        expect(typeof l.dimLabel).toBe('string');
        expect(l.id).toBeTruthy();
        expect(l.doors).toBeUndefined();
        expect(l.room.w).toBeUndefined();
        expect(l.room.d).toBeUndefined();
        if (l.floorId) expect(floorIds.has(l.floorId)).toBe(true);
        for (const o of l.openings) expect(['cw', 'ccw']).toContain(o.corner);
        for (const p of l.placed) expect(p.id && p.itemId).toBeTruthy();
      }
      for (const it2 of st.inventory) {
        expect(it2.id).toBeTruthy();
        expect(typeof it2.name).toBe('string');
        expect(Array.isArray(it2.tags)).toBe(true);
        expect(Array.isArray(it2.manualTags)).toBe(true);
        expect(it2.color).toMatch(/^#[0-9a-f]{6}$/);
        expect(it2.count == null).toBe(false);
      }
    });
  }
});

describe('migrate() is idempotent', () => {
  /* Running a migration twice must not drift. Anything that fails here is a
     migration that mutates rather than normalises — the bug class that quietly
     rewrites a user's project a little more on every single load. */
  for (const name of FIXTURES) {
    it(`${name}: migrate(migrate(x)) === migrate(x)`, async () => {
      const { app } = await bootApp();
      const once = clone(app.migrate(clone(fixture(name))));
      const twice = clone(app.migrate(clone(once)));
      expect(stableIds(twice)).toEqual(stableIds(once));
    });
  }
});

describe('migrate() does not validate S.unit — characterized defect', () => {
  /* CHARACTERIZED, NOT ENDORSED. migrate() range-checks mode, planMode,
     invScope and zoomSpeed, but never unit — so a corrupt or hand-edited saved
     state keeps a nonsense unit forever. readImport() DOES validate the same
     field, so the import path is stricter than the load path. Downstream the
     two halves disagree: fmtLen falls through to its ft+in default while
     parseLen, finding no BARE entry, reads bare numbers as millimetres.
     Logged in BACKLOG.md "Known defects". */
  it('lets an unknown unit through, and the two halves then disagree', async () => {
    const { app } = await bootApp();
    const st = app.migrate(clone(fixture('edge-dangling-refs.json')));
    expect(st.unit).toBe('furlongs');
    expect(app.fmtLen(304.8, st.unit)).toBe(`1'`); // formats as ft+in
    expect(app.parseLen('12', st.unit)).toBe(12);  // but parses as mm
  });

  it('by contrast, readImport() rejects the same value', async () => {
    const { app } = await bootApp();
    const inc = app.readImport({
      layouts: [clone(fixture('v1-points-openings.json')).layouts[0]],
      inventory: [],
      unit: 'furlongs',
      snap: '25.4',
    });
    expect(inc.prefs.unit).toBeUndefined();
  });
});

describe('migrate() rejects a state it cannot use', () => {
  it('returns null for anything without layouts', async () => {
    const { app } = await bootApp();
    expect(app.migrate(null)).toBeNull();
    expect(app.migrate({})).toBeNull();
    expect(app.migrate({ layouts: [] })).toBeNull();
    expect(app.migrate({ layouts: 'nope' })).toBeNull();
  });
});

describe('migrate() has a side effect on S — characterized deliberately', () => {
  /* migrate() ends with `S = st` so that reconcileTags can read S.itemFolders.
     Every caller reassigns S from the return value anyway, so this is invisible
     in practice — but it means migrate() is NOT a pure function, and a refactor
     that moves it into a module must keep that assignment wired to the same
     live binding or tag inheritance silently stops working on load. */
  it('leaves S pointing at the migrated object', async () => {
    const { app, t } = await bootApp();
    const out = app.migrate(clone(fixture('v2-modern-full.json')));
    expect(t.S).toBe(out);
  });
});

describe('normLayout() and normItem() work standalone', () => {
  /* The importer lifts a single room or item out of a file and normalises it
     without pushing a whole state object through migrate(). */
  it('normLayout repairs one room on its own', async () => {
    const { app } = await bootApp();
    const l = app.normLayout({ name: 'Lonely', room: { w: 3000, d: 2000 } });
    expect(l.id).toBeTruthy();
    expect(l.room.points).toEqual([[0, 0], [3000, 0], [3000, 2000], [0, 2000]]);
    expect(l.room.wall).toBe(114);
    expect(l.openings).toEqual([]);
    expect(l.measures).toEqual([]);
    expect(l.folderId).toBeNull();
    expect(l.floorId).toBeNull();
  });

  it('normItem fills in the defaults an item needs to be drawable', async () => {
    const { app } = await bootApp();
    const i = app.normItem({ shape: { type: 'rect', w: 100, d: 100 } });
    expect(i.id).toBeTruthy();
    expect(i.name).toBe('Untitled');
    expect(i.tags).toEqual([]);
    expect(i.count).toBe(1);
    expect(i.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(i.open).toBeNull();
  });
});
