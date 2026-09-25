/* exportPayload() -> readImport() -> applyImport(): the one path where the app
 * hands data to the outside world and takes it back, and so the clearest
 * statement of what the data model actually IS. The three collision rules
 * (keep mine / overwrite mine / add as a copy) are the subtle part. */

import { describe, it, expect, beforeEach } from 'vitest';
import { fixture, clone } from '../unit-setup.js';
import { S, setS } from '../../src/core/state.js';
import { migrate } from '../../src/core/migrate.js';
import { exportPayload, PREF_KEYS } from '../../src/io/export.js';
import { readImport, applyImport } from '../../src/io/import.js';

/** Load a fixture into the live S, the way boot() does. */
const load = (name) => setS(migrate(clone(fixture(name))));
/** An empty project, the way a first-time visitor has it. */
const fresh = () => setS(migrate({ layouts: [{ name: 'My room', room: { w: 4270, d: 3660 } }], inventory: [] }));

const allIds = () => ({ roomIds: S.layouts.map((l) => l.id), itemIds: S.inventory.map((i) => i.id) });

beforeEach(() => { load('v2-modern-full.json'); });

describe('exportPayload()', () => {
  it('writes the documented envelope, and the prefs only when asked', () => {
    const { roomIds, itemIds } = allIds();
    const out = exportPayload(roomIds, itemIds, false);
    expect(out.app).toBe('room-planner');
    expect(out.version).toBe(2);
    expect(typeof out.exported).toBe('string');
    expect(Object.keys(out).sort()).toEqual(
      ['active', 'app', 'exported', 'floors', 'folders', 'inventory', 'layouts', 'version'].sort(),
    );
    expect(out.unit).toBeUndefined();
    const withPrefs = exportPayload(roomIds, itemIds, true);
    for (const k of PREF_KEYS) expect(withPrefs[k]).toEqual(S[k]);
  });

  it('a room drags its ancestor folders and its floor along', () => {
    const out = exportPayload(['room-a'], [], false);
    expect(out.folders.map((f) => f.id)).toEqual(['fold-home']);
    expect(out.floors.map((f) => f.id)).toEqual(['floor-1']);
    expect(out.layouts).toHaveLength(1);
  });

  it('an items-only export carries no rooms, folders or floors', () => {
    const out = exportPayload([], ['sofa'], false);
    expect([out.layouts, out.folders, out.floors, out.active]).toEqual([[], [], [], undefined]);
    expect(out.inventory.map((i) => i.id)).toEqual(['sofa']);
  });

  it('deep-clones, so mutating the payload cannot corrupt live state', () => {
    const out = exportPayload(['room-a'], ['sofa'], false);
    out.layouts[0].name = 'MUTATED';
    out.layouts[0].room.points[0][0] = 99999;
    expect(S.layouts.find((l) => l.id === 'room-a').name).toBe('Living area');
    expect(S.layouts.find((l) => l.id === 'room-a').room.points[0][0]).toBe(0);
  });
});

describe('readImport()', () => {
  it('reads back what exportPayload wrote', () => {
    const { roomIds, itemIds } = allIds();
    const inc = readImport(exportPayload(roomIds, itemIds, true));
    expect(inc.layouts.map((l) => l.id)).toEqual(roomIds);
    expect(inc.inventory.map((i) => i.id)).toEqual(itemIds);
    expect(inc.floors.map((f) => f.id)).toEqual(['floor-1']);
    expect(inc.prefs.unit).toBe('m');
  });

  it('rejects a file with neither rooms nor items', () => {
    for (const bad of [null, 'a string', {}, { layouts: [], inventory: [] }]) {
      expect(readImport(bad)).toBeNull();
    }
  });

  it('drops an inventory entry with no shape (it could not be drawn)', () => {
    const inc = readImport({ inventory: [
      { id: 'ok', name: 'Fine', shape: { type: 'rect', w: 100, d: 100 } },
      { id: 'shapeless', name: 'Nope' },
    ] });
    expect(inc.inventory.map((i) => i.id)).toEqual(['ok']);
  });

  it('coerces the prefs it accepts and drops the ones it does not', () => {
    const { prefs } = readImport({
      inventory: [{ id: 'x', shape: { type: 'rect', w: 10, d: 10 } }],
      unit: 'parsecs', invScope: 'galaxy', snap: 25.4,
      showSwing: 'yes', showDims: 0, onlyAvailable: 1,
    });
    expect(prefs.unit).toBeUndefined();       // not a known unit
    expect(prefs.invScope).toBeUndefined();   // not a known scope
    expect(prefs.snap).toBe('25.4');          // numbers become strings
    expect(prefs.showSwing).toBe(true);       // truthiness becomes a boolean
    expect([prefs.showDims, prefs.onlyAvailable]).toEqual([false, true]);
  });
});

describe('export -> import round trip is lossless', () => {
  it('replace mode reproduces the project, geometry and all', () => {
    const { roomIds, itemIds } = allIds();
    const payload = exportPayload(roomIds, itemIds, true);
    const pick = (st) => st.layouts.map((l) => ({
      id: l.id, name: l.name, points: l.room.points, wall: l.room.wall,
      floor: l.room.floor, floorId: l.floorId, floorPlace: l.floorPlace,
      openings: l.openings, placed: l.placed,
      pillars: l.room.pillars, iwalls: l.room.iwalls, measures: l.measures,
    }));
    const before = pick(S);

    fresh();
    applyImport(readImport(clone(payload)), roomIds, itemIds, true, true, 'mine');

    expect(S.layouts.map((l) => l.id)).toEqual(roomIds);
    expect(S.inventory.map((i) => i.id)).toEqual(itemIds);
    expect(S.folders.map((f) => f.id)).toEqual(['fold-home']);
    expect(S.floors.map((f) => f.id)).toEqual(['floor-1']);
    for (const k of PREF_KEYS) expect(S[k]).toEqual(payload[k]);
    expect(pick(S)).toEqual(before);
  });
});

describe('the Library folder tree does not survive export/import — characterized defect', () => {
  /* CHARACTERIZED, NOT ENDORSED. exportPayload() writes the LAYOUT folder tree
     (S.folders) and the floors, but never S.itemFolders — while still writing
     each item's folderId. So on import the folderId dangles, and reconcileTags()
     cannot explain the folder-inherited half of item.tags, so it folds them into
     manualTags: an inherited tag is permanently promoted to a hand-picked one,
     after which re-filing the item no longer removes it. Full write-up, with
     the fix, in BACKLOG.md "Known defects". */

  let exported0;
  beforeEach(() => { exported0 = exportPayload(['room-a'], ['ikea/kallax/4x2'], false); });

  it('the export envelope has no itemFolders key, but still writes folderId', () => {
    expect(exported0.itemFolders).toBeUndefined();
    expect(exported0.inventory[0].folderId).toBe('if-ikea');
  });

  it('after import the folder id dangles, and replace promotes the tag at once', () => {
    fresh();
    applyImport(readImport(clone(exported0)), ['room-a'], ['ikea/kallax/4x2'], false, true, 'mine');
    const item = S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(item.folderId).toBe('if-ikea');
    expect(S.itemFolders.find((f) => f.id === 'if-ikea')).toBeUndefined();
    expect(item.manualTags.slice().sort()).toEqual(['ikea', 'storage']);
  });

  it('merge defers the promotion to the next load, but it is just as permanent', () => {
    fresh();
    applyImport(readImport(clone(exported0)), ['room-a'], ['ikea/kallax/4x2'], false, false, 'mine');
    const inSession = S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(inSession.manualTags).toEqual(['storage']);                 // still correct here
    expect(inSession.tags.slice().sort()).toEqual(['ikea', 'storage']); // but 'ikea' is unexplained

    setS(migrate(clone(S)));   // the next load
    const after = S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(after.manualTags.slice().sort()).toEqual(['ikea', 'storage']);
  });
});

describe('applyImport() — merge collision rules', () => {
  /* Both the incoming file and the project hold an item with id 'sofa'; the
     three answers to that are the heart of the merge. */
  const incomingFile = () => ({
    app: 'room-planner', version: 2,
    layouts: [{
      id: 'incoming-room', name: 'Their room',
      room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114, floor: '#ffffff' },
      openings: [],
      placed: [{ id: 'ip1', itemId: 'sofa', x: 500, y: 500, rot: 0 }],
    }],
    inventory: [{ id: 'sofa', name: 'THEIR sofa', shape: { type: 'rect', w: 1000, d: 500 }, color: '#112233', count: 9 }],
  });
  const merge = (rule) =>
    applyImport(readImport(incomingFile()), ['incoming-room'], ['sofa'], false, false, rule);

  const sofas = () => S.inventory.filter((i) => i.id === 'sofa');

  it('"keep mine": my item wins and their room re-points at it', () => {
    merge('mine');
    expect(sofas()).toHaveLength(1);
    expect(sofas()[0].name).toBe('Sofa');         // mine, untouched
    expect(S.layouts.find((l) => l.name === 'Their room').placed[0].itemId).toBe('sofa');
  });

  it('"overwrite mine": their item replaces mine in place, keeping the id', () => {
    merge('theirs');
    expect(sofas()).toHaveLength(1);
    expect(sofas()[0].name).toBe('THEIR sofa');
    expect(sofas()[0].count).toBe(9);
    // my own existing room still points at the same id, so it now shows their item
    expect(S.layouts.find((l) => l.id === 'room-a').placed.some((p) => p.itemId === 'sofa')).toBe(true);
  });

  it('"add as a copy": theirs lands beside mine as sofa-2 and their room follows it', () => {
    merge('copy');
    expect(S.inventory.find((i) => i.id === 'sofa').name).toBe('Sofa');
    const copy = S.inventory.find((i) => i.id === 'sofa-2');
    expect(copy.name).toBe('THEIR sofa');
    expect(S.layouts.find((l) => l.name === 'Their room').placed[0].itemId).toBe('sofa-2');
  });

  it('merging never removes anything that was already there', () => {
    const beforeRooms = S.layouts.map((l) => l.id);
    const beforeItems = S.inventory.map((i) => i.id);
    merge('copy');
    for (const id of beforeRooms) expect(S.layouts.some((l) => l.id === id)).toBe(true);
    for (const id of beforeItems) expect(S.inventory.some((i) => i.id === id)).toBe(true);
  });

  it('a placement whose item was not ticked is dropped', () => {
    const inc = readImport({ inventory: [], layouts: [{
      id: 'r2', name: 'Orphans', openings: [],
      room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114 },
      placed: [{ id: 'q1', itemId: 'nowhere-item', x: 0, y: 0, rot: 0 }],
    }] });
    applyImport(inc, ['r2'], [], false, false, 'mine');
    expect(S.layouts.find((l) => l.name === 'Orphans').placed).toEqual([]);
  });

  it('an incoming folder id that already exists IS that folder, not a second one', () => {
    const inc = readImport({ inventory: [],
      folders: [{ id: 'fold-home', name: 'A DIFFERENT NAME', parentId: null }],
      layouts: [{
        id: 'r3', name: 'Filed', folderId: 'fold-home', openings: [], placed: [],
        room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114 },
      }] });
    applyImport(inc, ['r3'], [], false, false, 'mine');
    expect(S.folders.filter((f) => f.id === 'fold-home')).toHaveLength(1);
    expect(S.folders.find((f) => f.id === 'fold-home').name).toBe('Home'); // mine kept
    expect(S.layouts.find((l) => l.name === 'Filed').folderId).toBe('fold-home');
  });

  it('an imported room gets a fresh id when its id is already taken', () => {
    const inc = readImport({ inventory: [], layouts: [{
      id: 'room-a', name: 'Collides with mine', openings: [], placed: [],
      room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114 },
    }] });
    applyImport(inc, ['room-a'], [], false, false, 'mine');
    const mine = S.layouts.filter((l) => l.id === 'room-a');
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('Living area');
    expect(S.layouts.some((l) => l.name === 'Collides with mine')).toBe(true);
  });
});
