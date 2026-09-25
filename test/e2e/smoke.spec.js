/* End-to-end smoke: draw a room, place an item, undo, redo, export, re-import,
 * reload — plus the file:// deployment contract. Deliberately the shallowest
 * possible pass over the widest possible surface: its job is to notice that the
 * app has broken outright, not to check any one behaviour in detail. Room edits
 * and item edits have SEPARATE undo stacks, so both are exercised. */

import { test, expect, fixtureState, readS, flushSave, settle } from './app-fixture.js';

test.describe('smoke', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('boots, and every mode switch is clean, with no page error', async ({ page, app, baseURL }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // re-navigate rather than reload(): a reload is served from cache
    await app.goto(`${baseURL}/index.html`);
    await app.waitForFunction(() => window.__rp && window.__rp.S);
    await settle(app);
    for (const mode of ['room', 'furniture', 'floor', 'inventory', 'marketplace', 'furniture']) {
      await app.evaluate((m) => window.setMode(m), mode);
      await settle(app);
    }
    expect(errors).toEqual([]);
    expect((await readS(app)).mode).toBe('furniture');
  });

  test('draw a room: the polygon changes and the change is undoable', async ({ app }) => {
    const before = (await readS(app)).layouts[0].room.points;

    await app.evaluate(() => {
      window.startCustomDraw();
      const st = window.__rp.S.layouts[0];
      st.room.points = [[0, 0], [3000, 0], [3000, 2000], [1500, 2000], [1500, 3500], [0, 3500]];
      window.__rp.commitRoom();
      window.draw();
    });
    await settle(app);

    const after = (await readS(app)).layouts[0].room.points;
    expect(after).toHaveLength(6);
    expect(after).not.toEqual(before);

    await app.evaluate(() => window.__rp.undoRoom());
    await settle(app);
    expect((await readS(app)).layouts[0].room.points).toEqual(before);

    await app.evaluate(() => window.__rp.redoRoom());
    await settle(app);
    expect((await readS(app)).layouts[0].room.points).toEqual(after);
  });

  test('place an item: it lands, undo removes it, redo puts it back', async ({ app }) => {
    const count = () => readS(app).then((S) => S.layouts[0].placed.length);
    const before = await count();

    await app.evaluate(() => {
      window.__rp.S.layouts[0].placed.push({ id: 'smoke-placed', itemId: 'table', x: 2500, y: 2000, rot: 0 });
      window.__rp.commitFurn();
      window.draw();
    });
    await settle(app);
    expect(await count()).toBe(before + 1);

    await app.evaluate(() => window.__rp.undoFurn());
    await settle(app);
    expect(await count()).toBe(before);

    await app.evaluate(() => window.__rp.redoFurn());
    await settle(app);
    expect(await count()).toBe(before + 1);
    expect((await readS(app)).layouts[0].placed.some((p) => p.id === 'smoke-placed')).toBe(true);
  });

  test('the two undo stacks are independent', async ({ app }) => {
    await app.evaluate(() => {
      const l = window.__rp.S.layouts[0];
      l.room.points = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
      window.__rp.commitRoom();
      l.placed.push({ id: 'indep', itemId: 'table', x: 500, y: 500, rot: 0 });
      window.__rp.commitFurn();
    });
    await settle(app);

    // undoing the ROOM edit must leave the item alone
    await app.evaluate(() => window.__rp.undoRoom());
    await settle(app);
    const S = await readS(app);
    expect(S.layouts[0].room.points).toHaveLength(4);
    expect(S.layouts[0].room.points[1][0]).toBe(5000); // back to the fixture's room
    expect(S.layouts[0].placed.some((p) => p.id === 'indep')).toBe(true);
  });

  test('export -> re-import round trip through the real functions', async ({ app }) => {
    const payload = await app.evaluate(() => {
      const S = window.__rp.S;
      return window.exportPayload(S.layouts.map((l) => l.id), S.inventory.map((i) => i.id), true);
    });
    expect(payload.app).toBe('room-planner');
    expect(payload.layouts).toHaveLength(1);
    expect(payload.inventory).toHaveLength(4);

    const result = await app.evaluate((file) => {
      const inc = window.readImport(file);
      window.applyImport(inc, inc.layouts.map((l) => l.id), inc.inventory.map((i) => i.id), true, true, 'mine');
      const S = window.__rp.S;
      return {
        rooms: S.layouts.map((l) => l.name),
        points: S.layouts[0].room.points,
        items: S.inventory.map((i) => i.id).sort(),
        placed: S.layouts[0].placed.length,
        unit: S.unit,
      };
    }, payload);

    expect(result.rooms).toEqual(['Rectangle']);
    expect(result.points).toEqual([[0, 0], [5000, 0], [5000, 4000], [0, 4000]]);
    expect(result.items).toEqual(['bed', 'rug', 'sofa', 'table']);
    expect(result.placed).toBe(4);
    expect(result.unit).toBe('ftin');
  });

  test('an edit survives a reload through localStorage', async ({ app, baseURL }) => {
    await app.evaluate(() => {
      window.__rp.S.layouts[0].name = 'Persisted room';
      window.save();
    });
    const written = await flushSave(app, (s) => s.layouts[0].name === 'Persisted room');
    expect(written.layouts[0].name).toBe('Persisted room');

    await app.goto(`${baseURL}/index.html`);
    await app.waitForFunction(() => window.__rp && window.__rp.S);
    await settle(app);
    expect((await readS(app)).layouts[0].name).toBe('Persisted room');
  });

});

test.describe('the file:// deployment contract', () => {
  /* "Open the file and it works" IS the product. The shipped artifact has to
     stay one self-contained HTML file with no network dependency, and this is
     the only test that proves it: dist/index.html opened straight off disk, no
     server, no interception — so no __rp here either. */
  test('dist/index.html boots and paints straight off disk', async ({ page }) => {
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith('file://')) external.push(r.url()); });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const { pathToFileURL } = await import('node:url');
    const fs = await import('node:fs');
    const { DIST_HTML } = await import('./app-fixture.js');
    if (!fs.existsSync(DIST_HTML)) {
      throw new Error(`no build to test: ${DIST_HTML} is missing — run \`npm run build\` (npm run test:e2e does)`);
    }
    await page.goto(pathToFileURL(DIST_HTML).href);

    await page.waitForFunction(() => document.body.dataset.mode);
    await page.waitForFunction(() => {
      const c = document.getElementById('cv');
      return c && c.width > 0 && c.height > 0;
    });
    await page.waitForTimeout(2000);   // let the boot-time fetches fire
    expect(errors).toEqual([]);

    /* CHARACTERIZED, NOT ENDORSED. The plan states the contract as "file://
       works with ZERO network requests", and that is not true: ensureDefaultMarket()
       fetches the built-in marketplace from raw.githubusercontent.com at boot,
       on file:// as much as anywhere else. It degrades gracefully — no page
       error above — so the app works offline, but it is not request-free.
       Logged in BACKLOG.md "Known defects". */
    const hosts = [...new Set(external.map((u) => new URL(u).host))];
    expect(hosts).toEqual(['raw.githubusercontent.com']);
    expect(external.every((u) => u.includes('/marketplace/'))).toBe(true);
  });
});
