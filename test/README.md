# The characterization baseline

## What this is — read this before changing anything here

This is **not** an ordinary unit-test suite. It is a **characterization
baseline**: a recording of how `index.html` behaved on 2026-09-23, captured
*before* the file was split into modules, whose only job is to prove afterwards
that the split changed nothing.

That purpose has one practical consequence, and it is the important part:

> **A failure here during the refactor means the refactor is wrong.**
> It does not mean the test is out of date.

These snapshots were not designed. They were *observed* — taken from the app as
it actually behaves, including in the places where it behaves oddly. Several
assertions deliberately pin behaviour that is arguably wrong; each one is
commented `CHARACTERIZED, NOT ENDORSED` and cross-referenced to an entry under
`## Known defects` in [`BACKLOG.md`](../BACKLOG.md). Those assertions exist so
that the extraction phase cannot *accidentally* change the behaviour — neither
by breaking it further nor by quietly fixing it. Fixing them is a separate
branch, after the refactor lands, and that branch should update these tests in
the same commit as the fix.

**So: do not re-baseline a red test to get a build green.** Read the diff first.
If the diff is genuinely intended, say so in the commit message that updates the
snapshot.

## Running it

```sh
npm install                 # once; installs Vitest, jsdom and Playwright
npx playwright install chromium

npm test                    # everything (~13s)
npm run test:unit           # Suite A only — Vitest + jsdom (~3s)
npm run test:e2e            # Suite B only — Playwright + Chromium (~9s)
```

Between extraction commits, run **`npm test`**. The whole suite is ~13 seconds,
which is well inside the budget for running it after every single move, and that
is how it is meant to be used — a regression that bisects to one commit is worth
far more than the seconds saved. If you ever do need a subset, `npm run
test:unit` (~3s) covers the data model, and `npx playwright test --grep-invert
@network` skips the one test that needs the internet.

## Updating snapshots — deliberately

```sh
npx vitest run -u                     # Suite A goldens
npx playwright test --update-snapshots # Suite B screenshots and JSON goldens
```

Screenshot baselines are per-project **and per-platform**
(`…-chromium-light-darwin.png`), because canvas text and antialiasing differ
between macOS and Linux. A CI box will therefore need its own baselines
generated and committed the first time it runs; that is expected, and is not the
same thing as re-baselining a regression.

## The one hard rule: `index.html` is never modified

Everything here tests the file exactly as it ships. No hooks, no export shims,
no data attributes, no build step. That is deliberate — a baseline that required
editing the subject would not be a baseline of the subject.

Reaching inside the app without touching it works like this. `index.html` is one
classic `<script>` in strict mode. Its top-level `function` declarations become
properties of `globalThis` on their own, so `parseLen`, `migrate`, `draw` and
friends are directly callable. Its top-level `let`/`const` bindings — `S`,
`sel`, `selSet`, `roomHist`, `furnHist`, `bpState`, `nav`, `view`, and every
arrow-function helper — do **not**, and no amount of poking from outside will
reach them.

So both suites append a small capture epilogue
([`test/epilogue.js`](epilogue.js)) to an **in-memory copy** of the script,
which publishes those bindings on `window.__rp`:

- **Suite A** reads `index.html`, cuts the `<script>` body out of the shell,
  builds a jsdom document from the shell, and evaluates `body + EPILOGUE`.
- **Suite B** intercepts the HTTP response with `page.route` and appends the
  same epilogue to the served HTML in flight.

The epilogue is **appended, never prepended**, so `"use strict"` stays the first
statement of the script. Prepending anything would silently drop the app into
sloppy mode and invalidate the entire baseline.

If a future test needs another internal, add it to `epilogue.js`. Do not add an
export to `index.html`.

## Determinism

Nothing here may depend on wall-clock time, random ids or animation timing.

| Source of drift | How it is pinned |
|---|---|
| `uid()` → `Math.random` | seeded mulberry32 installed before any app code runs |
| `exportPayload()` → `new Date()` | clock frozen at 2024-01-01T00:00:00Z |
| ids appearing in snapshots | normalised to ordinals by `stableIds()` — identity is still proven, since the same id maps to the same ordinal everywhere |
| `save()`'s 350ms debounce | `flushSave()` waits it out and reads storage, rather than sleeping arbitrarily |
| rAF-scheduled repaints | `settle()` awaits two frames before any screenshot |
| viewport / DPR | fixed at 1280×800, `deviceScaleFactor: 1` — `fit()` derives the zoom from the canvas box, so the viewport is an input to every screenshot |

## Layout

```
test/
  README.md            this file
  harness.js           Suite A: boots index.html in jsdom
  epilogue.js          the shared capture epilogue (both suites)
  fixtures/states/     saved-state fixtures, shared by both suites
  unit/                Suite A — Vitest + jsdom
    __snapshots__/
  e2e/                 Suite B — Playwright + Chromium
    app-fixture.js     the `app` fixture: interception, determinism, seeding
    static-server.js   dependency-free static server over the repo root
    __screenshots__/
```

Phase 4 adds per-module unit tests under `test/unit/<subdir>/` (mirroring
`src/`), beside `unit/*.test.js`, with no restructuring needed here.

## What each suite covers, and why it is split that way

### Suite A — `test/unit`, Vitest + jsdom

Broad and shallow, on purpose. It proves behaviour; it does not chase coverage.
Tier 2 per-module tests come later, in Phase 4.

- **`boot.test.js`** — booting from nothing, and from four saved-state shapes
  derived from `migrate()`'s own branches: the v0 width/depth rectangle with
  N/E/S/W doors, the v1 points-and-openings era, a fully populated v2 project,
  and one fixture that trips every repair branch at once. Plus persistence: the
  debounced `save()`, and an explicit check that no blueprint image data ever
  reaches `S`.
- **`migrate.golden.test.js`** — golden snapshots of `migrate()` output for each
  fixture, a shape contract that holds for all of them, and **idempotence**
  (`migrate(migrate(x)) === migrate(x)`), which is the check that catches a
  migration that rewrites a user's project a little more on every load.
- **`units.test.js`** — `parseLen`/`fmtLen` across ft+in, in, cm, mm and m;
  fractions, compound input, all four unicode dashes, and round-trips at each
  unit's own displayed precision.
- **`io-roundtrip.test.js`** — `exportPayload` → `readImport` → `applyImport`,
  including all three id-collision rules (keep mine / overwrite mine / add as a
  copy), dropped placements, and folder-id identity.

**jsdom has no canvas.** `index.html` takes a 2D context at top level, so the
harness installs a *recording* context stand-in — enough for `draw()` to run
without throwing, which is what lets the app boot at all. It records calls; it
does not rasterise. Nothing in Suite A asserts a pixel.

### Suite B — `test/e2e`, Playwright + Chromium

Everything that needs a real browser: real pixels, real `getImageData`, a real
file input.

- **`visual.spec.js`** — canvas screenshot baselines for four fixture projects,
  in **both light and dark**, plus door swings inward and outward on both hinge
  sides (the Phase 0 risk area — `swingPoly()` gained a `room` parameter just
  before this branch). The swing arcs are additionally asserted as *millimetre
  geometry*, so a shift cannot hide inside the screenshot tolerance, and the
  dark palette is asserted numerically, because only stage-side colours change
  in dark mode and a screenshot alone would not notice it breaking.
- **`blueprint.spec.js`** — `example blueprints/apartment-1.png` driven through
  the real wizard, asserting **9 rooms and 14 openings** (the figures verified by
  hand in Phase 0) and snapshotting the **room polygons as JSON**, in pixel space
  and again in millimetres after `bpRebuild`. Polygon coordinates are precisely
  what a refactor breaks silently, and what a screenshot would not catch.
- **`smoke.spec.js`** — draw a room → place an item → undo/redo (both stacks,
  independently) → export → re-import → persist across a navigation, plus the
  `file://` deployment contract.

## Known gaps — where the refactor carries unverified risk

Stated plainly, because this is the part worth knowing:

- **OCR is network-dependent.** `bpLoadTesseract()` fetches Tesseract.js from a
  CDN and refuses outright on `file://`. The OCR test is tagged `@network` and
  excluded with `--grep-invert @network`. It ran green here, but it is the one
  test in the suite that can fail for reasons unrelated to the code. OCR runs
  *after* region derivation and never touches `polyPx`, so the geometry goldens
  are unaffected by it.
- **Blueprint goldens are Chromium-specific.** The pipeline starts from
  `drawImage`-scaled pixels, so the coordinates depend on the browser's image
  resampling. They are stable within a Chromium version; a browser upgrade may
  legitimately move them.
- **Side-panel HTML is not characterized.** Only `#cv` is screenshotted. The
  `render*()` functions rebuild panel `innerHTML` and rebind listeners, and that
  is covered only indirectly (a throw would surface as a page error). A module
  boundary that breaks a panel's *appearance* without throwing would not be
  caught.
- **Pointer interaction is barely covered.** The snapping/alignment magnet
  (`canvas/snap.js`, ~730 lines), drag handling and the corner editor are driven
  through state, not through synthetic pointer events. This is the largest
  untested surface in the app.
- **Marketplace fetching is not covered** beyond the boot-time requests being
  observed. Subscriptions, index shards and the item cache all need network or
  an HTTP mock.
- **`migrate()` is not a pure function.** It ends by assigning `S = st` so that
  `reconcileTags()` can read `S.itemFolders`. Every caller reassigns `S` from
  the return value anyway, so it is invisible in practice — but a module split
  must keep that assignment wired to the same live binding, or tag inheritance
  stops working on load with no error. Pinned explicitly in
  `migrate.golden.test.js`.
