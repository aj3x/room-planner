/* transact() is where every edit becomes an undo step and a write to storage.
   Get it wrong and undo silently splits one action into two, swallows one, or
   a cancelled gesture leaks into the saved project — none of which the e2e
   suite would see outside the two gestures it drives. So: its four rules. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S, setS, L } from '../../src/kernel/state.js';
import { migrate } from '../../src/kernel/migrate.js';
import { roomHist, furnHist, seedHistFor } from '../../src/kernel/history.js';
import { SCOPES, rev, planRev, effect } from '../../src/kernel/signals.js';
import { KEY } from '../../src/kernel/store.js';
import { transact, preview } from '../../src/kernel/tx.js';

const steps = (map) => map[L().id].stack.length;
/* Each run of this effect is one notification views would see: the scopes
   whose revision moved, with '+plan' when the canvas was asked to redraw. */
let changed, stop;
function watch(){
  let last = null;
  return effect(() => {
    const now = SCOPES.map(sc => rev[sc].value).concat(planRev.value);
    if(last){
      const moved = SCOPES.filter((sc, i) => now[i] !== last[i]);
      changed.push(moved.join(',') + (now[SCOPES.length] !== last[SCOPES.length] ? '+plan' : ''));
    }
    last = now;
  });
}

beforeEach(() => {
  setS(migrate({ layouts: [{ name: 'R', room: { w: 4000, d: 3000 } }], inventory: [] }));
  for (const k of Object.keys(roomHist)) delete roomHist[k];
  for (const k of Object.keys(furnHist)) delete furnHist[k];
  seedHistFor();
  stop?.();
  changed = [];
  stop = watch();
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

const saved = async () => { await vi.runAllTimersAsync(); return localStorage.getItem(KEY); };

describe('transact()', () => {
  it('records one step on its own stack, saves, bumps the revision, notifies once', async () => {
    const r0 = L()._rev || 0;
    transact('room', () => { L().room.wall = 99; });
    expect([steps(roomHist), steps(furnHist)]).toEqual([2, 1]);
    expect(L()._rev).toBe(r0 + 1);
    expect(changed).toEqual(['room+plan']);
    expect(JSON.parse(await saved()).layouts[0].room.wall).toBe(99);
  });

  it('history:false saves without an undo step', async () => {
    transact('room', () => { L().room.floor = '#123456'; }, { history: false });
    expect(steps(roomHist)).toBe(1);
    expect(await saved()).toContain('#123456');
  });

  it('nested calls commit once, at the outermost, for every scope touched', () => {
    transact('room', () => {
      L().room.wall = 50;
      transact('room', () => { L().room.trim = 20; });
      transact('prefs', () => { S.unit = 'cm'; });
      expect(steps(roomHist)).toBe(1);   // nothing recorded mid-action
    });
    expect(steps(roomHist)).toBe(2);
    expect(changed).toEqual(['room,prefs+plan']);   // one batch: views run once
  });

  it('a throwing fn commits nothing and leaves the next transact working', () => {
    expect(() => transact('room', () => { L().room.wall = 7; throw new Error('no'); })).toThrow('no');
    expect(steps(roomHist)).toBe(1);
    expect(changed).toEqual([]);
    transact('room', () => {});
    expect(steps(roomHist)).toBe(2);   // the earlier edit lands with this one
  });

  it('preview (a gesture frame) neither records nor saves; the pointerup commits once', async () => {
    for (let i = 0; i < 5; i++) preview('room', () => { L().room.points[0][0] += 10; });
    expect(steps(roomHist)).toBe(1);
    expect(await saved()).toBeNull();
    transact('room');
    expect(steps(roomHist)).toBe(2);
    expect(changed).toEqual(Array(6).fill('room+plan'));
  });

  it('prefs leave the derived caches alone; canvas:false asks for no redraw', () => {
    const r0 = L()._rev || 0;
    transact('prefs', () => { S.invSearch = 'sofa'; }, { canvas: false });
    transact('prefs', () => { S.showDims = true; });
    expect(L()._rev || 0).toBe(r0);
    expect(changed).toEqual(['prefs', 'prefs+plan']);
  });

  it('refuses a scope it does not know', () => {
    expect(() => transact('rooms', () => {})).toThrow(/unknown scope/);
  });
});
