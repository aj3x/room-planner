/* Golden-file tests for migrate() / normLayout() / normItem().
 *
 * The most load-bearing file in the suite: migrate() is what every returning
 * user's saved project passes through on every load, and a silent change to it
 * corrupts real data with no error anywhere. If a snapshot moves, read the diff
 * before re-baselining. Ids are normalised to ordinals (stableIds) so an extra
 * uid() upstream does not rewrite the file; identity is still proven.
 */

import { describe, it, expect } from 'vitest';
import { fixture, clone, stableIds } from '../unit-setup.js';
import { migrate, normLayout, normItem } from '../../src/core/migrate.js';
import { readImport } from '../../src/io/import.js';
import { parseLen, fmtLen } from '../../src/core/units.js';
import { S } from '../../src/core/state.js';

const FIXTURES = [
  'v0-legacy-rect-doors.json',
  'v1-points-openings.json',
  'v2-modern-full.json',
  'edge-dangling-refs.json',
];

describe('migrate() golden output', () => {
  for (const name of FIXTURES) {
    it(`${name} migrates to a stable shape`, () => {
      const out = migrate(clone(fixture(name)));
      expect(stableIds(out)).toMatchSnapshot();
    });
  }
});

describe('migrate() invariants that hold for every fixture', () => {
  for (const name of FIXTURES) {
    it(`${name}: output satisfies the shape contract`, () => {
      const st = migrate(clone(fixture(name)));

      expect(Array.isArray(st.layouts) && st.layouts.length).toBeTruthy();
      for (const key of ['inventory', 'folders', 'floors', 'tagFilter', 'secClosed',
        'itemFolders', 'marketFolders', 'marketListings', 'marketSubs']) expect(Array.isArray(st[key]), key).toBe(true);
      expect(['room', 'furniture', 'floor', 'inventory', 'marketplace']).toContain(st.mode);
      expect(['project', 'folder', 'room']).toContain(st.invScope);
      expect(Number.isFinite(st.zoomSpeed) && st.zoomSpeed > 0).toBe(true);
      expect(st.layouts.some((l) => l.id === st.active)).toBe(true);

      const floorIds = new Set(st.floors.map((f) => f.id));
      for (const l of st.layouts) {
        expect(Array.isArray(l.room.points)).toBe(true);
        expect(l.room.points.length).toBeGreaterThanOrEqual(3);
        for (const a of [l.openings, l.placed, l.measures, l.room.pillars, l.room.iwalls]) {
          expect(Array.isArray(a)).toBe(true);
        }
        expect(typeof l.dimLabel).toBe('string');
        expect(l.id).toBeTruthy();
        expect([l.doors, l.room.w, l.room.d]).toEqual([undefined, undefined, undefined]);
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

describe('migrate() repairs a damaged state rather than throwing', () => {
  it('every dangling reference is repaired', () => {
    const st = migrate(clone(fixture('edge-dangling-refs.json')));
    const l = st.layouts[0];
    expect(l.id).toBeTruthy();              // a layout with no id gets one
    expect(st.active).toBe(l.id);           // active pointed at nothing
    expect(l.floorId).toBeNull();           // its floor had been deleted
    expect(st.mode).toBe('furniture');      // 'spelunking' is not a mode
    expect(st.invScope).toBe('project');    // 'galaxy' is not a scope
    expect(st.folders).toEqual([]);         // was the string "not-an-array"
    expect(l.room.floor).toBe('#f5f3ee');   // 'not-a-colour' falls back to the default
    expect(l.measures.map((m) => m.id)).toEqual(['m-live']);  // the other end was gone
  });

  it('CHARACTERIZED, NOT ENDORSED: isFinite(null) is true, so null coordinates survive', () => {
    /* normLayout guards with isFinite(p.y), and null coerces to 0 — so "nope"
       is repaired to 0 but null sails through, leaving a null where geometry
       code expects a number. Number.isFinite would be the fix.
       See BACKLOG.md "Known defects". */
    const l = migrate(clone(fixture('edge-dangling-refs.json'))).layouts[0];
    expect(l.floorPlace).toEqual({ x: 0, y: null, rot: 90 });
    const pil = l.room.pillars.find((p) => p.id === 'pil-ok');
    expect(pil.x).toBe(0);      // "x" is not finite -> repaired
    expect(pil.rot).toBeNull(); // null IS "finite" -> left alone (same defect)
  });
});

describe('migrate() is idempotent', () => {
  /* Running a migration twice must not drift. Anything that fails here is a
     migration that mutates rather than normalises — the bug class that quietly
     rewrites a user's project a little more on every single load. */
  for (const name of FIXTURES) {
    it(`${name}: migrate(migrate(x)) === migrate(x)`, () => {
      const once = clone(migrate(clone(fixture(name))));
      const twice = clone(migrate(clone(once)));
      expect(stableIds(twice)).toEqual(stableIds(once));
    });
  }
});

describe('migrate() does not validate S.unit — characterized defect', () => {
  /* CHARACTERIZED, NOT ENDORSED. migrate() range-checks mode, planMode,
     invScope and zoomSpeed, but never unit, so a corrupt or hand-edited state
     keeps a nonsense unit forever — while readImport() DOES validate the same
     field, making the import path stricter than the load path. The two halves
     then disagree: fmtLen falls through to its ft+in default while parseLen,
     finding no BARE entry, reads bare numbers as millimetres.
     Logged in BACKLOG.md "Known defects". */
  it('lets an unknown unit through, and the two halves then disagree', () => {
    const st = migrate(clone(fixture('edge-dangling-refs.json')));
    expect(st.unit).toBe('furlongs');
    expect(fmtLen(304.8, st.unit)).toBe(`1'`); // formats as ft+in
    expect(parseLen('12', st.unit)).toBe(12);  // but parses as mm
  });

  it('by contrast, readImport() rejects the same value', () => {
    const inc = readImport({
      layouts: [clone(fixture('v1-points-openings.json')).layouts[0]],
      inventory: [],
      unit: 'furlongs',
      snap: '25.4',
    });
    expect(inc.prefs.unit).toBeUndefined();
  });
});

describe('migrate() rejects a state it cannot use', () => {
  it('returns null for anything without layouts', () => {
    for (const bad of [null, {}, { layouts: [] }, { layouts: 'nope' }]) expect(migrate(bad)).toBeNull();
  });
});

describe('migrate() has a side effect on S — deliberately pinned', () => {
  /* migrate() ends by assigning S (now setS) so reconcileTags can read
     S.itemFolders. Callers reassign from the return value anyway, so it is
     invisible in practice — but migrate() is NOT pure, and that write has to
     stay wired to the same live binding or tag inheritance stops working on
     load, with no error. */
  it('leaves S pointing at the migrated object', () => {
    const out = migrate(clone(fixture('v2-modern-full.json')));
    expect(S).toBe(out);
  });
});

describe('normLayout() and normItem() work standalone', () => {
  /* The importer normalises a single room or item without pushing a whole
     state object through migrate(). */
  it('normLayout repairs one room on its own', () => {
    const l = normLayout({ name: 'Lonely', room: { w: 3000, d: 2000 } });
    expect(l.id).toBeTruthy();
    expect(l.room.points).toEqual([[0, 0], [3000, 0], [3000, 2000], [0, 2000]]);
    expect(l.room.wall).toBe(114);
    expect(l.openings).toEqual([]);
    expect(l.measures).toEqual([]);
    expect(l.folderId).toBeNull();
    expect(l.floorId).toBeNull();
  });

  it('normItem fills in the defaults an item needs to be drawable', () => {
    const i = normItem({ shape: { type: 'rect', w: 100, d: 100 } });
    expect(i.id).toBeTruthy();
    expect(i.name).toBe('Untitled');
    expect(i.tags).toEqual([]);
    expect(i.count).toBe(1);
    expect(i.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(i.open).toBeNull();
  });
});
