/* End-to-end smoke: draw a room, place an item, undo, redo, export, re-import.
 *
 * Deliberately the shallowest possible pass over the widest possible surface.
 * Its job is to notice that a module boundary drawn in the wrong place has
 * broken the app outright — which is the failure mode of an extraction commit —
 * not to check any one behaviour in detail.
 *
 * Room edits and item edits have SEPARATE undo stacks (roomHist / furnHist),
 * kept per layout, so both are exercised independently.
 */

import { test, expect, fixtureState, readS, flushSave, settle } from './app-fixture.js';

test.describe('smoke', () => {
  test.use({ savedState: fixtureState('vis-rect.json') });

  test('the app boots with no page errors', async ({ page, app, baseURL }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    /* Re-navigating, not reload(): a reload is served from Chromium's cache and
       bypasses the route that appends the capture epilogue, so window.__rp
       would be missing on the far side. */
    await app.goto(`${baseURL}/index.html`);
    await app.waitForFunction(() => window.__rp && window.__rp.S);
    await settle(app);
    expect(errors).toEqual([]);
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
      const l = window.__rp.S.layouts[0];
      l.placed.push({ id: 'smoke-placed', itemId: 'table', x: 2500, y: 2000, rot: 0 });
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
      window.applyImport(
        inc,
        inc.layouts.map((l) => l.id),
        inc.inventory.map((i) => i.id),
        true, true, 'mine',
      );
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
    const written = await flushSave(app);
    expect(written.layouts[0].name).toBe('Persisted room');

    await app.goto(`${baseURL}/index.html`);
    await app.waitForFunction(() => window.__rp && window.__rp.S);
    await settle(app);
    expect((await readS(app)).layouts[0].name).toBe('Persisted room');
  });

  test('switching places does not throw', async ({ app }) => {
    const errors = [];
    app.on('pageerror', (e) => errors.push(String(e)));
    for (const mode of ['room', 'furniture', 'floor', 'inventory', 'marketplace', 'furniture']) {
      await app.evaluate((m) => window.setMode(m), mode);
      await settle(app);
    }
    expect(errors).toEqual([]);
    expect((await readS(app)).mode).toBe('furniture');
  });
});

test.describe('the file:// deployment contract', () => {
  /* "Open the file and it works" is the actual deployment model, and it is what
     the refactor must not break: the shipped artifact has to stay one
     self-contained HTML file with no network dependency. This opens index.html
     straight off disk — no server, no interception, so no __rp here — and
     asserts it boots and paints anyway. */
  test('index.html boots and paints straight off disk', async ({ page }) => {
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith('file://')) external.push(r.url()); });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const { REPO_ROOT } = await import('./app-fixture.js');
    await page.goto(pathToFileURL(path.join(REPO_ROOT, 'index.html')).href);

    await page.waitForFunction(() => document.body.dataset.mode);
    await page.waitForFunction(() => {
      const c = document.getElementById('cv');
      return c && c.width > 0 && c.height > 0;
    });
    await page.waitForTimeout(2000);   // let the boot-time fetches fire
    expect(errors).toEqual([]);

    /* CHARACTERIZED, NOT ENDORSED. The refactor plan states the deployment
       contract as "opened via file:// works with ZERO network requests". That
       is not true today and was not made untrue by this branch: ensureDefaultMarket()
       runs during boot and fetches the built-in marketplace subscription from
       raw.githubusercontent.com, on file:// as much as anywhere else.
       The app degrades gracefully when those fail — no page error above — so
       the app still "works" offline, but it is not request-free.
       Logged in BACKLOG.md "Known defects"; pinned here so Phase 2 does not
       discover it as a surprise regression of its own making. */
    const hosts = [...new Set(external.map((u) => new URL(u).host))];
    expect(hosts).toEqual(['raw.githubusercontent.com']);
    expect(external.every((u) => u.includes('/marketplace/'))).toBe(true);
  });
});
