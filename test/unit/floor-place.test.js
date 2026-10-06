/* kernel/model/floor-place.js decides how thick every wall on a floor is drawn and
   where the floor magnet puts a dragged room. It is pure geometry over the
   saved layouts, and nothing else checks it: the e2e suite never opens Floor
   mode, and a wrong depth or snap only shows up as a plan that looks a
   little off. Two 4000 x 3000 rooms with 100mm walls, side by side on a
   floor whose exterior walls are 200mm. */

import { describe, it, expect, beforeEach } from 'vitest';
import { S, setS } from '../../src/kernel/state.js';
import { migrate } from '../../src/kernel/migrate.js';
import { floorMembers, floorEdgeDepths, depthRuns, snapFloorPlace, floorRoomAt } from '../../src/kernel/model/floor-place.js';

const rect = [[0,0],[4000,0],[4000,3000],[0,3000]];
const room = (id, x) => ({ id, name: id, floorId: 'F', floorPlace: { x, y: 0, rot: 0 },
  room: { points: rect, wall: 100, floor: '#ffffff', pillars: [], iwalls: [] }, openings: [], placed: [], measures: [] });
const floor = () => S.floors[0];
const lay = id => S.layouts.find(l => l.id === id);

beforeEach(() => {
  setS(migrate({ layouts: [room('A', 0), room('B', 4100)], floors: [{ id: 'F', name: 'F', extWall: 200 }], inventory: [] }));
});

describe('floorEdgeDepths', () => {
  it('a wall facing a neighbour is as deep as the gap; one facing nothing takes the exterior thickness', () => {
    const [a, b] = floorEdgeDepths(floorMembers(floor()), 200);
    expect(a).toEqual([200, 100, 200, 200]);   // A's right-hand wall is the shared one
    expect(b).toEqual([200, 200, 200, 100]);   // and B's left-hand wall
  });
  it('a wall taken away has no depth at all', () => {
    lay('A').room.wallOff = [false, true, false, false];
    expect(floorEdgeDepths(floorMembers(floor()), 200)[0]).toEqual([200, 0, 200, 200]);
  });
});

describe('depthRuns', () => {
  it('one depth all round strokes closed (null); a change of depth splits runs that overlap at the joins', () => {
    expect(depthRuns(rect, [200, 200, 200, 200])).toBeNull();
    const runs = depthRuns(rect, [200, 100, 200, 200]);
    expect(runs.map(r => r.depth)).toEqual([100, 200]);
    expect(runs[0].pts).toEqual([[4000, -200], [4000, 3200]]);   // carried on by the neighbouring 200mm band
  });
});

describe('snapFloorPlace', () => {
  const grid = p => p;
  it('a room dragged near a neighbour closes to one wall-thickness of gap and lines up', () => {
    const s = snapFloorPlace(lay('B'), 4130, 20, 50, grid);
    expect([s.x, s.y]).toEqual([4100, 0]);
    expect(s.note).toBe('Sharing a wall');
    expect(s.guides).toHaveLength(2);
  });
  it('out of reach, it falls back to the grid', () => {
    const s = snapFloorPlace(lay('B'), 4520, 230, 50, p => [Math.round(p[0] / 100) * 100, Math.round(p[1] / 100) * 100]);
    expect(s).toEqual({ x: 4500, y: 200, guides: [], note: '' });
  });
});

it('floorRoomAt finds the room under a floor-space point', () => {
  expect(floorRoomAt(floor(), [6000, 1500])).toBe('B');
  expect(floorRoomAt(floor(), [4050, 1500])).toBeNull();   // in the wall between them
});
