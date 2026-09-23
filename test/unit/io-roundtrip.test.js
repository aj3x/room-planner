/* Characterization: exportPayload() -> readImport() -> applyImport().
 *
 * This is the one path where the app hands data to the outside world and takes
 * it back, so it is the clearest statement of what the data model actually IS.
 * The collision rules (keep mine / overwrite mine / add as a copy) are the
 * subtle part and are covered case by case.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bootApp, flushSave, stableIds, clone, REPO_ROOT } from '../harness.js';

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'test/fixtures/states', name), 'utf8'));

const allOf = (t) => ({
  roomIds: t.S.layouts.map((l) => l.id),
  itemIds: t.S.inventory.map((i) => i.id),
});

describe('exportPayload()', () => {
  it('writes the documented envelope', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(t);
    const out = app.exportPayload(roomIds, itemIds, false);
    expect(out.app).toBe('room-planner');
    expect(out.version).toBe(2);
    expect(typeof out.exported).toBe('string');
    expect(Object.keys(out).sort()).toEqual(
      ['active', 'app', 'exported', 'floors', 'folders', 'inventory', 'layouts', 'version'].sort(),
    );
  });

  it('only includes the prefs when they were asked for', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(t);
    expect(app.exportPayload(roomIds, itemIds, false).unit).toBeUndefined();
    const withPrefs = app.exportPayload(roomIds, itemIds, true);
    for (const k of t.PREF_KEYS) expect(withPrefs[k]).toEqual(t.S[k]);
  });

  it('a room drags its ancestor folders and its floor along', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const out = app.exportPayload(['room-a'], [], false);
    expect(out.folders.map((f) => f.id)).toEqual(['fold-home']);
    expect(out.floors.map((f) => f.id)).toEqual(['floor-1']);
    expect(out.layouts).toHaveLength(1);
  });

  it('an items-only export carries no rooms, folders or floors', async () => {
    const { app } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const out = app.exportPayload([], ['sofa'], false);
    expect(out.layouts).toEqual([]);
    expect(out.folders).toEqual([]);
    expect(out.floors).toEqual([]);
    expect(out.inventory.map((i) => i.id)).toEqual(['sofa']);
    expect(out.active).toBeUndefined();
  });

  it('deep-clones, so mutating the payload cannot corrupt live state', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const out = app.exportPayload(['room-a'], ['sofa'], false);
    out.layouts[0].name = 'MUTATED';
    out.layouts[0].room.points[0][0] = 99999;
    expect(t.S.layouts.find((l) => l.id === 'room-a').name).toBe('Living area');
    expect(t.S.layouts.find((l) => l.id === 'room-a').room.points[0][0]).toBe(0);
  });

  it('is a stable golden for a fully populated project', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(t);
    expect(stableIds(app.exportPayload(roomIds, itemIds, true))).toMatchSnapshot();
  });
});

describe('readImport()', () => {
  it('reads back what exportPayload wrote', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(t);
    const inc = app.readImport(app.exportPayload(roomIds, itemIds, true));
    expect(inc).not.toBeNull();
    expect(inc.layouts.map((l) => l.id)).toEqual(roomIds);
    expect(inc.inventory.map((i) => i.id)).toEqual(itemIds);
    expect(inc.floors.map((f) => f.id)).toEqual(['floor-1']);
    expect(inc.prefs.unit).toBe('m');
  });

  it('accepts an items-only file', async () => {
    const { app } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport(app.exportPayload([], ['sofa'], false));
    expect(inc).not.toBeNull();
    expect(inc.layouts).toEqual([]);
    expect(inc.inventory).toHaveLength(1);
  });

  it('rejects a file with neither rooms nor items', async () => {
    const { app } = await bootApp();
    expect(app.readImport(null)).toBeNull();
    expect(app.readImport('a string')).toBeNull();
    expect(app.readImport({})).toBeNull();
    expect(app.readImport({ layouts: [], inventory: [] })).toBeNull();
  });

  it('drops an inventory entry with no shape (it could not be drawn)', async () => {
    const { app } = await bootApp();
    const inc = app.readImport({
      inventory: [
        { id: 'ok', name: 'Fine', shape: { type: 'rect', w: 100, d: 100 } },
        { id: 'shapeless', name: 'Nope' },
      ],
    });
    expect(inc.inventory.map((i) => i.id)).toEqual(['ok']);
  });

  it('coerces the prefs it does accept, and drops the ones it does not', async () => {
    const { app } = await bootApp();
    const inc = app.readImport({
      inventory: [{ id: 'x', shape: { type: 'rect', w: 10, d: 10 } }],
      unit: 'parsecs', invScope: 'galaxy', snap: 25.4,
      showSwing: 'yes', showDims: 0, onlyAvailable: 1,
    });
    expect(inc.prefs.unit).toBeUndefined();
    expect(inc.prefs.invScope).toBeUndefined();
    expect(inc.prefs.snap).toBe('25.4');      // numbers become strings
    expect(inc.prefs.showSwing).toBe(true);   // truthiness becomes a boolean
    expect(inc.prefs.showDims).toBe(false);
    expect(inc.prefs.onlyAvailable).toBe(true);
  });

  it('flattens an incoming floor to the root', async () => {
    const { app } = await bootApp();
    const inc = app.readImport({
      layouts: [{ id: 'r', name: 'R', floorId: 'f', room: { w: 1000, d: 1000 } }],
      floors: [{ id: 'f', name: 'F', parentId: 'somewhere-else', extWall: -3 }],
    });
    expect(inc.floors[0].parentId).toBeNull();
    expect(inc.floors[0].extWall).toBe(0);
  });
});

describe('export -> import round trip is lossless', () => {
  it('replace mode reproduces the project', async () => {
    const before = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(before.t);
    const payload = before.app.exportPayload(roomIds, itemIds, true);

    // a fresh app, then import the file over the top of it
    const after = await bootApp();
    const inc = after.app.readImport(clone(payload));
    after.app.applyImport(inc, roomIds, itemIds, true, true, 'mine');

    const S = after.t.S;
    expect(S.layouts.map((l) => l.id)).toEqual(roomIds);
    expect(S.inventory.map((i) => i.id)).toEqual(itemIds);
    expect(S.folders.map((f) => f.id)).toEqual(['fold-home']);
    expect(S.floors.map((f) => f.id)).toEqual(['floor-1']);
    for (const k of after.t.PREF_KEYS) expect(S[k]).toEqual(payload[k]);
  });

  it('every room, opening, placement, pillar, iwall and measurement survives', async () => {
    const before = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(before.t);
    const payload = before.app.exportPayload(roomIds, itemIds, true);

    const after = await bootApp();
    const inc = after.app.readImport(clone(payload));
    after.app.applyImport(inc, roomIds, itemIds, true, true, 'mine');

    const pick = (st) => st.layouts.map((l) => ({
      id: l.id, name: l.name, points: l.room.points, wall: l.room.wall,
      floor: l.room.floor, floorId: l.floorId, floorPlace: l.floorPlace,
      openings: l.openings, placed: l.placed,
      pillars: l.room.pillars, iwalls: l.room.iwalls, measures: l.measures,
    }));
    expect(pick(after.t.S)).toEqual(pick(before.t.S));
  });

  it('a second round trip changes nothing EXCEPT the item tag split (known defect)', async () => {
    const a = await bootApp({ saved: fixture('v2-modern-full.json') });
    const { roomIds, itemIds } = allOf(a.t);
    const first = a.app.exportPayload(roomIds, itemIds, true);

    const b = await bootApp();
    b.app.applyImport(b.app.readImport(clone(first)), roomIds, itemIds, true, true, 'mine');
    const second = b.app.exportPayload(roomIds, itemIds, true);

    const strip = (p) => {
      const c = clone(p);
      for (const i of c.inventory) delete i.manualTags;
      return stableIds(c);
    };
    expect(strip(second)).toEqual(strip(first));

    /* ...and here is the one thing that does move. See the dedicated
       describe() below for what causes it. */
    const k1 = first.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    const k2 = second.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(k1.manualTags).toEqual(['storage']);
    expect(k2.manualTags.sort()).toEqual(['ikea', 'storage']);
  });
});

describe('the Library folder tree does not survive export/import — characterized defect', () => {
  /* CHARACTERIZED, NOT ENDORSED. exportPayload() writes the LAYOUT folder tree
     (S.folders) and the floors, but never S.itemFolders — the Inventory tab's
     own folder tree. readImport()/applyImport() have no notion of it either.
     So an exported item keeps its item.folderId while the folder it names is
     left behind, and two things follow on import:

       1. item.folderId is a dangling reference in the receiving project;
       2. reconcileTags() cannot explain the folder-inherited half of item.tags,
          so it folds those tags into manualTags — permanently promoting an
          inherited tag to a hand-picked one. Re-filing the item later will no
          longer take that tag away.

     ITEM_SCHEMA.md documents the export envelope and likewise has no slot for
     itemFolders, so the Library tab's own Export has the same hole.
     Logged in BACKLOG.md "Known defects". Pinned here so the refactor cannot
     change it by accident in either direction. */

  const exported = async () => {
    const a = await bootApp({ saved: fixture('v2-modern-full.json') });
    return a.app.exportPayload(['room-a'], ['ikea/kallax/4x2'], false);
  };

  it('the export envelope has no itemFolders key at all', async () => {
    const payload = await exported();
    expect(payload.itemFolders).toBeUndefined();
    expect(payload.inventory[0].folderId).toBe('if-ikea'); // ...but the reference is still written
  });

  it('after import the folder id dangles in the receiving project', async () => {
    const payload = await exported();
    const b = await bootApp();
    b.app.applyImport(b.app.readImport(clone(payload)), ['room-a'], ['ikea/kallax/4x2'], false, false, 'mine');

    const item = b.t.S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(item.folderId).toBe('if-ikea');
    expect(b.t.S.itemFolders.find((f) => f.id === 'if-ikea')).toBeUndefined();
  });

  it('replace promotes the inherited tag immediately', async () => {
    const payload = await exported();
    const b = await bootApp();
    b.app.applyImport(b.app.readImport(clone(payload)), ['room-a'], ['ikea/kallax/4x2'], false, true, 'mine');
    const item = b.t.S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(item.manualTags.slice().sort()).toEqual(['ikea', 'storage']);
  });

  it('merge defers the promotion to the next load, but it is just as permanent', async () => {
    const payload = await exported();
    const b = await bootApp();
    b.app.applyImport(b.app.readImport(clone(payload)), ['room-a'], ['ikea/kallax/4x2'], false, false, 'mine');

    const inSession = b.t.S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(inSession.manualTags).toEqual(['storage']);                 // still correct here
    expect(inSession.tags.slice().sort()).toEqual(['ikea', 'storage']); // but 'ikea' is unexplained

    b.app.save();
    const written = await flushSave(b.window);
    const reloaded = await bootApp({ saved: written });
    const after = reloaded.t.S.inventory.find((i) => i.id === 'ikea/kallax/4x2');
    expect(after.manualTags.slice().sort()).toEqual(['ikea', 'storage']); // reconcileTags promoted it
  });
});

describe('applyImport() — merge collision rules', () => {
  /* The incoming file and the project both hold an item with id 'sofa'.
     The three answers to that are the heart of the merge. */
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

  it('"keep mine": my item wins and their room re-points at it', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport(incomingFile());
    app.applyImport(inc, ['incoming-room'], ['sofa'], false, false, 'mine');

    const sofas = t.S.inventory.filter((i) => i.id === 'sofa');
    expect(sofas).toHaveLength(1);
    expect(sofas[0].name).toBe('Sofa');           // mine, untouched
    const theirRoom = t.S.layouts.find((l) => l.name === 'Their room');
    expect(theirRoom.placed[0].itemId).toBe('sofa');
  });

  it('"overwrite mine": their item replaces mine in place, keeping the id', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport(incomingFile());
    app.applyImport(inc, ['incoming-room'], ['sofa'], false, false, 'theirs');

    const sofas = t.S.inventory.filter((i) => i.id === 'sofa');
    expect(sofas).toHaveLength(1);
    expect(sofas[0].name).toBe('THEIR sofa');
    expect(sofas[0].count).toBe(9);
    // my own existing room still points at the same id, so it now shows their item
    expect(t.S.layouts.find((l) => l.id === 'room-a').placed.some((p) => p.itemId === 'sofa')).toBe(true);
  });

  it('"add as a copy": theirs lands beside mine as sofa-2 and their room follows it', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport(incomingFile());
    app.applyImport(inc, ['incoming-room'], ['sofa'], false, false, 'copy');

    expect(t.S.inventory.find((i) => i.id === 'sofa').name).toBe('Sofa');
    const copy = t.S.inventory.find((i) => i.id === 'sofa-2');
    expect(copy).toBeTruthy();
    expect(copy.name).toBe('THEIR sofa');
    const theirRoom = t.S.layouts.find((l) => l.name === 'Their room');
    expect(theirRoom.placed[0].itemId).toBe('sofa-2');
  });

  it('a placement whose item was not ticked is dropped', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport({
      layouts: [{
        id: 'r2', name: 'Orphans',
        room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114 },
        openings: [],
        placed: [{ id: 'q1', itemId: 'nowhere-item', x: 0, y: 0, rot: 0 }],
      }],
      inventory: [],
    });
    app.applyImport(inc, ['r2'], [], false, false, 'mine');
    const room = t.S.layouts.find((l) => l.name === 'Orphans');
    expect(room.placed).toEqual([]);
  });

  it('an incoming folder id that already exists IS that folder, not a second one', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport({
      layouts: [{
        id: 'r3', name: 'Filed', folderId: 'fold-home',
        room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114 },
        openings: [], placed: [],
      }],
      folders: [{ id: 'fold-home', name: 'A DIFFERENT NAME', parentId: null }],
      inventory: [],
    });
    app.applyImport(inc, ['r3'], [], false, false, 'mine');
    expect(t.S.folders.filter((f) => f.id === 'fold-home')).toHaveLength(1);
    expect(t.S.folders.find((f) => f.id === 'fold-home').name).toBe('Home'); // mine kept
    expect(t.S.layouts.find((l) => l.name === 'Filed').folderId).toBe('fold-home');
  });

  it('merging never removes anything that was already there', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const beforeRooms = t.S.layouts.map((l) => l.id);
    const beforeItems = t.S.inventory.map((i) => i.id);
    const inc = app.readImport(incomingFile());
    app.applyImport(inc, ['incoming-room'], ['sofa'], false, false, 'copy');
    for (const id of beforeRooms) expect(t.S.layouts.some((l) => l.id === id)).toBe(true);
    for (const id of beforeItems) expect(t.S.inventory.some((i) => i.id === id)).toBe(true);
  });

  it('an imported room gets a fresh id when its id is already taken', async () => {
    const { app, t } = await bootApp({ saved: fixture('v2-modern-full.json') });
    const inc = app.readImport({
      layouts: [{
        id: 'room-a', name: 'Collides with mine',
        room: { points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]], wall: 114 },
        openings: [], placed: [],
      }],
      inventory: [],
    });
    app.applyImport(inc, ['room-a'], [], false, false, 'mine');
    const mine = t.S.layouts.filter((l) => l.id === 'room-a');
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('Living area');
    expect(t.S.layouts.some((l) => l.name === 'Collides with mine')).toBe(true);
  });
});
