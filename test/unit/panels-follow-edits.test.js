/* Every pane section and the Library page must repaint after an edit made in
   place. The model is mutated, not replaced, so a component that
   @preact/signals memoises (it reads a signal or holds useState) and gets the
   same object as a prop is silently skipped by its parent's re-render — the
   page shows stale data, nothing throws, and no other test looks at panel
   text. So: mount them all, commit one in-place edit per scope each shows,
   and check what is on screen changed. */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { S, setS, L } from '../../src/kernel/state.js';
import { migrate } from '../../src/kernel/migrate.js';
import { loaded } from '../../src/kernel/signals.js';
import { floorSel, roomSel, selectOnly } from '../../src/kernel/selection.js';
import { transact } from '../../src/kernel/tx.js';
import { undoRoom, redoRoom } from '../../src/kernel/history.js';
import { fillSlots } from '../../src/app/slots.js';
import { mountLibraryPage, nav } from '../../src/features/library/index.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const $ = (sel) => document.querySelector(sel);
const sec = (k) => $(`section[data-sec="${k}"]`);
const shown = (el) => el.textContent + '|' + [...el.querySelectorAll('input,select')].map((i) => i.value).join('|');
async function follows(el, edit, want){
  await flush();
  const before = shown(el);
  edit();
  await flush();
  expect(shown(el)).not.toBe(before);
  if (want) expect(shown(el)).toContain(want);
}
const mode = (m) => transact('prefs', () => { S.mode = m; }, { canvas: false });

beforeAll(() => {
  const st = JSON.parse(fs.readFileSync('test/fixtures/states/v2-modern-full.json', 'utf8'));
  setS(migrate(st));
  fillSlots()();
  mountLibraryPage(document.getElementById('paneLibrary'));
  loaded.value = true;
});

describe('pane sections and the Library page follow in-place edits', () => {
  it('Room mode: the Room section and a door in the Selection panel', async () => {
    mode('room'); roomSel.value = { kind: 'opening', id: 'op-1' };
    await follows(sec('shape'), () => transact('room', () => { L().room.wall = 200; }), '0.2 m');
    await follows(sec('roomsel'), () => transact('room', () => { L().openings[0].width = 900; }), '0.9 m');
  });
  it('Room mode: undo and redo, which replay a snapshot rather than commit', async () => {
    mode('room'); transact('room', () => { L().room.wall = 250; });
    await follows(sec('shape'), () => undoRoom());
    await follows(sec('shape'), () => redoRoom(), '0.25 m');
  });
  it('Furniture mode: the Selection panel', async () => {
    mode('furniture'); selectOnly('p2');
    await follows(sec('sel'), () => transact('furn', () => { L().placed[1].rot = 90; }));
  });
  it('Floor mode: the picked room and the floor', async () => {
    mode('floor'); floorSel.value = 'room-a';
    await follows(sec('floorsel'), () => transact('floor', () => { L().floorPlace.x += 500; }));
    await follows(sec('floorprops'), () => transact('project', () => { S.floors[0].name = 'Upper'; }), 'Upper');
  });
  it('the View section', async () => {
    await follows(sec('drawing'), () => transact('prefs', () => { S.snap = '500'; }));
  });
  it('the Library: item and folder tiles, and the unit', async () => {
    nav.libFolderId = null; mode('inventory');
    const content = $('#paneLibrary .lib-content');
    await follows(content, () => transact('lib', () => { S.inventory.find((i) => i.id === 'sofa').name = 'Couch'; }), 'Couch');
    await follows(content, () => transact('lib', () => { S.itemFolders[0].name = 'Shelving'; }), 'Shelving');
    await follows(content, () => transact('prefs', () => { S.unit = 'cm'; }), 'cm');
  });
  it('the Library after a trip to the plan, where the edit was made', async () => {
    mode('inventory'); await flush(); mode('furniture');
    await follows($('#paneLibrary .lib-content'), () => {
      transact('lib', () => { S.inventory.find((i) => i.id === 'sofa').name = 'Settee'; }); mode('inventory');
    }, 'Settee');
  });
  it('the Marketplace: ad hoc folders', async () => {
    mode('marketplace');
    await follows($('#paneLibrary .lib-content'), () => transact('lib', () => { S.marketFolders[0].name = 'Common'; }), 'Common');
  });
});
