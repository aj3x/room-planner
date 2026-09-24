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
npm install                 # once; Vite, Sass, Vitest, jsdom, Playwright, ESLint
npx playwright install chromium

npm test                    # everything (~35s)
npm run test:unit           # Suite A + the build-pipeline tests — Vitest (~3s)
npm run test:e2e            # Suite B — builds, then Playwright + Chromium (~32s)
```

Since Phase 2 there is a build, and `npm run test:e2e` runs it first (`npm run
build && npm run build:test`) because both of its targets are build outputs. See
**Two targets** below.

Between extraction commits, run **`npm test`**. The whole suite is ~35 seconds,
which is well inside the budget for running it after every single move, and that
is how it is meant to be used — a regression that bisects to one commit is worth
far more than the seconds saved. If you ever do need a subset, `npm run
test:unit` (~3s) covers the data model, and `npm run test:e2e:offline` skips the
one test that needs the internet.

## Updating snapshots — deliberately

```sh
npx vitest run -u            # Suite A goldens
npm run test:e2e:update      # Suite B screenshots and JSON goldens (rebuilds first)
```

Screenshot baselines are per-platform and per *colour scheme*
(`…-chromium-light-darwin.png`; the `dist-*` projects reuse the `chromium-*`
files on purpose — see **Two targets**), because canvas text and antialiasing differ
between macOS and Linux. A CI box will therefore need its own baselines
generated and committed the first time it runs; that is expected, and is not the
same thing as re-baselining a regression.

## The one hard rule: `index.html` is never modified

Everything here tests the code exactly as it ships. No hooks, no export shims,
no data attributes. That is deliberate — a baseline that required editing the
subject would not be a baseline of the subject. Phase 2 added a build, so "as it
ships" now means the build output as well as the source; the one edit Phase 2
made to `index.html` was its `<script>` tag, and the section below is about what
that cost and how it was paid for outside the file.

Reaching inside the app without touching it works like this. `index.html` is one
`<script>` in strict mode, and its top-level `let`/`const` bindings — `S`, `sel`,
`selSet`, `roomHist`, `furnHist`, `bpState`, `nav`, `view`, and every
arrow-function helper — are unreachable from outside no matter how hard you poke.

So both suites append a small capture epilogue
([`test/epilogue.js`](epilogue.js)) to an **in-memory copy** of the script,
which publishes those bindings on `window.__rp`.

The epilogue is **appended, never prepended**, so `"use strict"` stays the first
statement of the script. Prepending anything would silently drop the app into
sloppy mode and invalidate the entire baseline.

If a future test needs another internal, add it to `epilogue.js`. Do not add an
export to `index.html`.

The converse, as Phase 3 proceeds: a binding that **moves into `src/`** is no
longer in `index.html`'s scope, so `epilogue.js` cannot capture it any more and
will throw a `ReferenceError` on every boot if it tries. Delete it from `__rp`
and let tests import the module directly — which is strictly better, and is what
`MM`/`BARE` did when `core/units.js` moved. The capture lists shrink as the
monolith does. The recipe an extraction agent follows is in
[`.claude/plans/refactor-split.md`](../.claude/plans/refactor-split.md) §4.

The `ui/` round cost the epilogue nothing — it captures no modal, menu, tag,
drag or toast binding. The `canvas/` round cost it one entry and taught it a
new trick.

`ctx` and `cv` did move, into `src/canvas/view.js`, but the epilogue did not
have to change for them: `index.html` still imports both, so both are still in
its scope and `__rp` captures them exactly as before. That is the first of the
two outcomes §4 step 4 allows, and it is the cheap one.

`CANVAS` was the other. It left with the palette into `src/canvas/draw.js`, and
`index.html` stopped referencing it entirely — so importing it back would have
been an unused import and a lie about the dependency graph, while dropping it
from `__rp` would have broken `visual.spec.js`, which asserts the dark palette
numerically. **So the epilogue imports it.** The epilogue text is appended
*inside* the app's own module, which means a bare

```js
import {CANVAS} from './src/canvas/draw.js';
```

resolves exactly as `index.html`'s own specifiers do, and hoists, so
`"use strict"` keeps its place. Verified in Suite A and in all four Suite B
projects, the built `dist-*` pair included.

This is strictly better than a capture and it is the tool to reach for from now
on: when a moved binding is still needed by a test but no longer by the
monolith, **import it in the epilogue** rather than importing it back into
`index.html` just to keep `__rp` fed.

The `draw()` round moved the selection lets into `src/core/selection.js`, the
interaction lets into `src/canvas/interaction-state.js` and the measure lets
into `src/canvas/measure-state.js` — but `index.html` imports most of them
back, so `__rp`'s `sel`/`selSet`/`roomSel`/`floorSel`/`mergeSel`/`drag`/
`drawState`/`wallDrawState`/`splitDrawState`/`measureOn`/`measureStart`/
`measureSel` getters are untouched. Six names did lose their last reader in
`index.html` and are now **imported by the epilogue**, the `CANVAS` way:
`alignGuides`, `alignNote`, `floorGuides`, `floorSnapNote`, `drawCursor` and
`swingPoly`.

`swingPoly` is the one to learn from. It is in **`GLOBALS`**, not `__rp`, and
`GLOBALS` assigns inside a `try/catch` — so when `drawOpening` moved into
`src/canvas/draw.js` and `index.html` stopped referencing it, the name simply
stopped being on `window`, with no error at boot. It surfaced four tests later
as `window.swingPoly is not a function` in `visual.spec.js`. **After any move,
check `GLOBALS` by name as well as the `__rp` getters**: `__rp` fails loudly at
boot, `GLOBALS` fails silently and late.

The `library/`+`io/`+SCC round moved eleven more names this way, and taught the
sharpest version of the lesson so far.

**`__rp` is not linted.** ESLint lints `index.html` on its own; it never sees
`epilogue.js` appended to it. So when the last `index.html` reader of an `__rp`
name moves into `src/`, nothing goes red at lint time — the app throws a bare
`ReferenceError: idFolder is not defined` during *module evaluation*, the
epilogue never runs, and every unit test fails with `harness: capture epilogue
did not run`. That message does not name the missing binding. Worse, **the build
and the browser stay green**: `npm run build` succeeds and `dist/index.html`
boots in Chromium without a console error, because the failure is about which
names are in `index.html`'s closure, not about whether the app works. It
happened twice in one round, on `idFolder` and on `INV_SCOPES`.

To find the name when it happens: build the bundle with `appBundle()`, evaluate
it in a jsdom you control with a `VirtualConsole` listening for `jsdomError`,
and print `e.message`. The harness throws before it can hand you its own
`errors` array.

Better, do not let it happen. **Audit the epilogue after every move**: read every
name `__rp` and `GLOBALS` reference, and check each one is either declared or
imported in `index.html`, or imported by the epilogue itself. That check is
mechanical, takes a second, and is the cheapest step in the whole extraction
loop. `__rp` fails loudly and late; `GLOBALS` fails silently and later.

Names the epilogue now imports, in the order they lost their last reader:
`CANVAS`, `alignGuides`, `alignNote`, `floorGuides`, `floorSnapNote`,
`drawCursor`, `ctx`, `swingPoly`, `exportPayload`, `idFolder`, `idLeaf`,
`hasOpen`, `fileSlug`, `applyImport`, `PREF_KEYS`, `INV_SCOPES`, `normItem`,
`pickValues`, `clone`.

All 25 `GLOBALS` entries survived the SCC move inside `index.html`'s scope,
`setMode` and `renderLibAll` included — index.html still drives both from its
listeners. `snapRoom`, `commitRoom`/`commitFurn` and the six undo/redo entry
points likewise stayed in scope when `core/history.js` became whole.

### What Phase 2 changed about that, and why

Phase 2 made the one `<script>` a `type="module"` tag so Vite has an entry point.
The tag is the only edit; the 10,000 lines inside it are byte-identical. But a
module has its own scope, and two things followed from that:

1. **Top-level `function` declarations no longer land on `globalThis`.** They
   used to, which is how the suites called `window.draw()`, `window.setMode()`
   and friends directly. The epilogue now republishes that handful of entry
   points explicitly — see `GLOBALS` in `epilogue.js`, and add to it rather than
   adding an export to `index.html`.

2. **The epilogue can no longer be grafted onto the HTTP response.** Suite B used
   to append it with `page.route`, which worked only because the script's body
   was sitting in the HTML. The dev server hoists an inline module out of the
   HTML into a proxy module, and the build wraps the bundle in an IIFE, so in
   both cases appended text would land *outside* the app's scope and capture
   nothing. It is injected in `vite.config.js` instead, under
   `--mode instrumented`, before Vite's own HTML handling. Same in-memory-copy
   contract, one stage earlier in the pipeline.

### What Phase 2.5 changed, and why

Suite A used to cut the script body out of the shell and evaluate it as a
**classic script** in jsdom, which worked only while the app was one blob:
**jsdom does not run ES modules**, so the first real `import` in `src/` would
have broken the harness outright — at exactly the moment the baseline is the
only thing proving the extraction faithful.

So the harness no longer evaluates source. It **bundles** it, with the same
bundler that builds the shipped artifact: `index.html`'s script body (plus the
capture epilogue) is handed to Vite as a virtual entry module at the repo root,
so its `./src/...` specifiers resolve exactly as they do in `npm run build`, and
the output is a classic IIFE — the one thing jsdom *can* evaluate. Tree-shaking
and minification are off; the point is to run the code, not a smaller equivalent
of it. It costs about 60ms, once per test file, and nothing is written to disk.

The alternative — `await import()` the `src/` modules in Node and inject them
into the jsdom window — was rejected: module code would then evaluate in
**Node's** realm, where `document` and `window` are the wrong ones or missing
entirely. Harmless for `core/units.js`; fatal by the time `ui/` and `canvas/`
move. Bundling keeps the whole app in one realm, the jsdom one.

One consequence, and it is an improvement. Inside an IIFE, top-level `function`
declarations are closure-scoped rather than global — which is exactly how the
browser has scoped them since the `type="module"` tag. Suite A now reaches entry
points the same way Suite B does, through `GLOBALS` in `epilogue.js`. The
scoping divergence between the two suites is gone, so a name that goes missing
during extraction now fails in **both**.

### Two targets

Suite B runs everything twice, against both halves of the new build:

| project | served by | what it proves |
|---|---|---|
| `chromium-light` / `chromium-dark` | `vite --mode instrumented` | the dev server a contributor actually uses |
| `dist-light` / `dist-dark` | `dist-test/` over the static server | the bundled, minified artifact that ships |

The `dist-*` projects **deliberately share the `chromium-*` screenshot
baselines** (via a per-project `snapshotPathTemplate`). That is the stronger
assertion: bundling and minification must not move a single pixel, and a build
that did would fail against the pre-build baseline instead of quietly growing a
baseline of its own.

`dist-test/` is `dist/` plus the capture epilogue, built by
`npm run build:test`. `dist/` itself stays uninstrumented, and it is what the
`file://` test opens.

### The `file://` contract moved to `dist/index.html`

It used to open the source `index.html` off disk. It cannot any more: a
`type="module"` script is fetched under CORS rules that an opaque `file://`
origin can never satisfy, so the source file no longer runs off disk at all.

Nothing about the *shipped* artifact regressed — `dist/index.html` is one
self-contained file whose inlined `<script>` is classic, and it boots and paints
off disk exactly as before. This is also what the refactor plan's Tier 3 always
specified ("`dist/index.html` opened via `file://` boots and paints off disk").
Keeping it working took two deliberate steps in `vite.config.js`: emitting the
bundle as an IIFE and rewriting Vite's `<script type="module" crossorigin>` tag
to a classic one positioned at the end of `<body>`. Both are commented there.

## Determinism

Nothing here may depend on wall-clock time, random ids or animation timing.

| Source of drift | How it is pinned |
|---|---|
| `uid()` → `Math.random` | seeded mulberry32 installed before any app code runs |
| `exportPayload()` → `new Date()` | clock frozen at 2024-01-01T00:00:00Z |
| ids appearing in snapshots | normalised to ordinals by `stableIds()` — identity is still proven, since the same id maps to the same ordinal everywhere |
| `save()`'s 350ms debounce | `flushSave()` **polls** storage until the write lands (pass a predicate when a *particular* write must be seen). It used to sleep 450ms, a 100ms margin a loaded machine ate — that was the reload flake. |
| rAF-scheduled repaints | `settle()` awaits two frames before any screenshot |
| viewport / DPR | fixed at 1280×800, `deviceScaleFactor: 1` — `fit()` derives the zoom from the canvas box, so the viewport is an input to every screenshot |

## Layout

```
test/
  README.md            this file
  harness.js           Suite A: bundles index.html + src/, boots it in jsdom
  epilogue.js          the shared capture epilogue (both suites)
  fixtures/states/     saved-state fixtures, shared by both suites
  fixtures/build/      a miniature app (HTML + module + SCSS) for the build tests
  unit/                Suite A — Vitest + jsdom
    __snapshots__/
  build/               NOT characterization — see below
  e2e/                 Suite B — Playwright + Chromium
    app-fixture.js     the `app` fixture: determinism, seeding, pointer
                       helpers (3.5) and panel-text helpers (3.6)
    static-server.js   dependency-free static server, rooted at dist-test/
    pointer-*.spec.js  Phase 3.5 — real pointer input on #cv
    panel-*.spec.js    Phase 3.6 — the side panels and the Library UI
    __screenshots__/
```

`test/build/` is the one thing here that is not a characterization test. It runs
the real `vite.config.js` over `test/fixtures/build/` and asserts the three
properties the deployment model rests on: SCSS compiles (with design tokens
surviving as CSS custom properties, which is what makes dark mode work), the
output is exactly one file, and its script tag is classic so it opens from
`file://`. It uses a fixture because Phase 2 may not split the real CSS or JS —
so the pipeline is proved *before* the code that depends on it arrives, rather
than discovered to be wrong in the middle of Phase 3.

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
- **`pointer-*.spec.js`** (five files) — real `mouse.down`/`move`/`up` on `#cv`:
  the drag deadzone, the alignment magnet, item snapping, drawing, splitting,
  measuring and floor arrangement. Phase 3.5; see **Pointer coverage** below.
- **`panel-*.spec.js`** (four files) — the side panels and the Library UI read
  as **text and state**, never as screenshots. Phase 3.6; see **Panel coverage**
  below.

## Known gaps — where the refactor carries unverified risk

- ~~**Walk paths were drawn in no baseline at all.**~~ **Closed.** Every fixture had
  `showWalk` false, so the 393 lines of `model/walkpaths.js` painted nothing — the region
  moved in the `draw()` round with zero coverage. `vis-walkpaths.json` is `vis-rect` with the
  overlay on, and a paired test turns it back off and asserts the plain `rect-furniture`
  baseline, so the diff between them *is* the overlay. Verified the two baselines really
  differ (34.7 kB vs 30.3 kB) rather than assuming the fixture took effect.

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
- ~~**Side-panel HTML is not characterized.**~~ **Largely closed by Phase
  3.6**, which added four `panel-*.spec.js` files — 79 tests — reading the
  panels the `render*()` functions build. See **Panel coverage** below for what
  they reach and what they do not.

  The reason it was the weakest spot in the repo: the extraction round after it
  had to move the Plan+Library cycle in a **single** commit, and every
  `render*()` in it writes `innerHTML` into a panel no screenshot reaches. A
  break that does not throw turns nothing red. Phase 3.6 was to that commit what
  Phase 3.5 was to the `draw()` keystone.

  **That commit has now happened** — 49 names, 1,326 lines, one commit, into 15
  modules (`plan/room-panel.js`, `plan/selection-panel.js`, `plan/item-dialog.js`,
  `plan/opening-dialog.js`, `plan/mode.js`, `canvas/corners.js`, `library/shell.js`,
  `library/grid.js`, `library/router.js` and the rest). These 79 tests are what
  stood behind it, so the gap list below is the **manual-review list for that
  move**, not a forecast. The panels are no longer in `index.html`.
- ~~**Pointer interaction is barely covered.**~~ **Largely closed by Phase
  3.5**, which added five `pointer-*.spec.js` files driving `mouse.down` /
  `mouse.move` / `mouse.up` on `#cv`. See **Pointer coverage** below for what
  they reach and — more usefully — what they still do not.

  The code is **no longer in `index.html`**: the `draw()` round moved the
  alignment magnet into `src/canvas/snap.js` and `draw()` with its whole
  banner into `src/canvas/draw.js`, move-only and byte-identical, and this
  suite is what stood behind each of those sixteen commits. The gap list below
  is therefore the manual-review list for that round, not a forecast. Three dependency-free helpers inside the magnet
  (`lineProject`, `lineCross`, `isSquare`) were verified movable and
  deliberately left. Phase 3.5 exists so that the `draw()` move — one
  unbisectable ~1,500-line commit — is made against real evidence rather than
  hope.
- ~~**`smoke › an edit survives a reload through localStorage` is flaky.**~~
  **Fixed.** It failed three times across Phase 2.5 and the `core/`+`model/`
  extraction, always passing on re-run — the test, not the code. Cause:
  `flushSave()` slept a flat 450ms against `save()`'s 350ms debounce, and a
  loaded machine ate the 100ms margin. It now polls for the write and takes an
  optional predicate so a test can demand that a *particular* write landed.
  Verified with three consecutive full e2e runs, 72/72 each.

  **There is no longer a sanctioned flaky test in this suite.** A failure here
  means the refactor is wrong. Do not re-run until green — investigate.

- ~~**Marketplace fetching is not covered.**~~ **Closed by Phase 3.6's second
  pass**, which added `panel-market.spec.js` (32 tests) over a `page.route`
  stub: a miniature marketplace served off the page's own origin under
  `/__market/`, so nothing reaches the real network and there is no CORS to
  satisfy. `subscribeMarket`, `reloadMarketSub`, `removeMarketSub`,
  `fetchMarketItem`, `renderMarketSub`, `marketSubTile`, `marketPathChildren`,
  `renderMarketItemPreview`, the "Preview contents" toggle, both in-memory
  caches and `addMarketItemToInventory()`'s three collision cases are all read
  now. What is left is `ensureDefaultMarket()` at boot and `loadRegistry()` —
  see **What Phase 3.6 does not cover** below.
- **`migrate()` is not a pure function.** It ends by assigning `S` so that
  `reconcileTags()` can read `S.itemFolders`. Every caller reassigns `S` from
  the return value anyway, so it is invisible in practice — but a module split
  must keep that assignment wired to the same live binding, or tag inheritance
  stops working on load with no error. Pinned explicitly in
  `migrate.golden.test.js`.

  Phase 3 moved `S` into `src/core/state.js`, and you cannot assign to an
  imported binding, so the write is now `setS(st)` — a setter exported beside
  the declaration. The binding is still live and `reconcileTags()` still reads
  the new object on the same tick; `setS` does exactly what the assignment did.
  The epilogue's `set S(v)` goes through it too.

## Pointer coverage (Phase 3.5)

Added before the `draw()` move, because that move is one connected component of
about 1,500 lines that cannot be cut into green intermediate commits, and it
contains the least-tested code in the app. Everything here is a
**characterization** test in the sense above: it records what the app does
today, defects included.

Five files, 42 tests, all against real browser pointer input:

| file | what it drives |
|---|---|
| `pointer-corner.spec.js` | dragging a room corner: the deadzone, the magnet, Alt, Shift |
| `pointer-item.spec.js` | dragging a placed item: grid, walls, other items, Alt-duplicate, marquee |
| `pointer-draw.spec.js` | drawing an outline, a freestanding wall, and a room split |
| `pointer-measure.spec.js` | the Measure tool: toggling it, picking two anchors, what it blocks |
| `pointer-floor.spec.js` | arranging rooms on a floor: `floorGuides` / `floorSnapNote` |

The helpers live in `e2e/app-fixture.js` alongside the rest:
`camera`/`project` (world mm to viewport px, re-read per gesture because the
camera moves), `pointerDownAt`/`pointerStepTo`/`pointerUp`/`dragWorld`,
`liveDrag` (one read of everything in flight), `clickWorld`, `frameBox` and
`useCoarseSnap`.

Four things about them are load-bearing:

1. **Drags are stepped.** `DEADZONE_PX` is 4 canvas px and a drag arms only on a
   `pointermove` further than that from the press. One jump arms it *and*
   applies the whole travel in a single step, which is not the path a real drag
   takes.
2. **Guides can only be read mid-drag.** `endDrag()` clears `alignGuides`,
   `alignNote`, `floorGuides` and `floorSnapNote`, so every assertion on them
   goes through `dragWorld`'s `whileDown` hook or an explicit
   down / step / read / up sequence. The same is true of `#readout`'s
   `.snap` span.
3. **Geometry, not pixels.** Landings are asserted in millimetres —
   `[5000, 0]` exactly for a corner on `lineCross`, `4100` exactly for a floor
   placement sharing a wall, guide endpoints against `guideSeg`'s 10px
   overshoot. Screenshots are not involved.
4. **No point may land near a canvas edge.** `assertUsable` throws if a
   projected point falls within 56px of one: that band is `edgePanVel`'s 40px
   auto-pan zone plus the floating `.island` controls, and a gesture that
   strays into either is not testing what it thinks it is. `frameBox` is the
   way out — it parks the camera so the room occupies the middle of the canvas,
   which `fit()` deliberately does not.

`useCoarseSnap` deserves its own note. Several tests assert an exact landing
coordinate, and at the fixtures' 25.4mm snap one grid cell is under four screen
pixels — which cell a click lands in is then not predictable. It sets 500mm,
**and** the unit, because `renderSnap()` rebuilds the snap `<select>` from
`SNAPS.imperial` or `SNAPS.metric` and *resets `S.snap`* when the current value
is not one of the options. 500 is metric-only, so on a ft+in project it
survives exactly until the next `renderAll()` — which `startSplitRoom()` calls.

### What Phase 3.5 still does not cover

As useful as the list above. These are where the `draw()` move stays unverified
and wants a pass by hand:

- **`snapCorner` against a non-rectangular room.** Every magnet assertion is on
  the 5000 x 4000 rectangle, where the two neighbour lines cross at the corner's
  own position. The `bias` ordering in `alignPoint` — near corner 0, far corner
  0.3, the square-to-this edge line +0.35 — is therefore never the thing that
  decides an outcome. An L-shape or an imported outline would exercise it.
- **`drag.mode` `'wall'`, `'open'`, `'pillar'`, `'iwall'` and `'iwall-end'`.**
  Four of the six `DEADZONE_MODES` are only covered *as* deadzone modes, through
  `'corner'`. Dragging a whole wall perpendicular to itself, sliding a door
  along a wall, and `axisLockFrom` on an interior wall's end are all untested.
- **`'rot'`.** The rotate handle, its 15-degree default step, Shift for a free
  turn, and the roll-back when the rotated footprint fails `validate`.
- **Edge auto-pan.** `edgePanVel`/`edgePanTick` is deliberately avoided by
  `assertUsable`, so the one piece of interaction that runs off `requestAnimationFrame`
  rather than events has no coverage at all.
- **`cancelDrag()`.** Escape mid-drag restores `drag.snap`; nothing presses it.
- **Touch and pen.** Everything goes through a mouse pointer. `setPointerCapture`,
  multi-touch and `touch-action` are untouched.
- **`'Open through'`, `'Lined up'` and `'Corners meet'`** — three of
  `snapFloorPlace`'s four notes. Only `'Sharing a wall'`, `'Free'` and the empty
  fallback are asserted.
- **The canvas drawing itself.** These tests assert state and DOM readouts. That
  `drawAlignGuides`, `drawSquareTick` and `drawSplitOverlay` actually paint what
  the state says is still only covered by the four `visual.spec.js` fixtures,
  none of which is mid-drag.

## Panel coverage (Phase 3.6)

Added before the Plan+Library SCC move, for the same reason Phase 3.5 was added
before the `draw()` move: that move is one strongly-connected component of 48
names and 1,224 lines, it cannot be cut into green intermediate commits, and it
contains the least-covered code in the repo. The suite screenshots only `#cv`,
so every `render*()` that writes `innerHTML` into a side panel or into
`#paneLibrary` was unverified — a break that did not throw turned nothing red.

Everything here is a **characterization** test in the sense above: it records
what the app does today, defects included.

Six files, 135 tests. The first four are the main pass; the last two closed
the two holes it left, and are the reason the bullets about them above are
struck through.

| file | what it reads |
|---|---|
| `panel-tree.spec.js` (14) | the left pane's layout tree: root ordering, indent, carets, the room-count chip, folder tag chips, the active mark, all three ⋯ menus, inline rename, tree drag-drop |
| `panel-room.spec.js` (32) | Walls, Structures, Openings, the snap picker, `renderRoom`, `renderWallProps`, `renderOpeningProps`, `updateHistButtons`, `renderMeasureBar` |
| `panel-furniture.spec.js` (16) | `renderInv` (stock, counts, Place enabled/disabled, scope, search, empty), `renderTagChips`, `renderSel` at zero / one / two selections |
| `panel-library.spec.js` (17) | `setMode`'s layout swap, the Library folder tree and item grid, folder-scoped search, `renderMarketTop`, `renderAdhocFolder`, `renderListingDetail` |
| `panel-market.spec.js` (32) | the subscription path: `subscribeMarket` and its seven refusals, `marketPathChildren`'s path-derived folders, scoped tag chips and scoped search, the "Preview contents" chips, `renderMarketItemPreview`, the three collision cases, `reloadMarketSub`, `removeMarketSub`, and both caches proved in-memory by reloading the page |
| `panel-dialogs.spec.js` (24) | `itemDialog` — every field, the colour trio, the shape-picker field swap, OK / Cancel, both validation branches, the Advanced id field and `retagItem` under an undo — and `openingDialog` — the wall select, the hinge block, a window's sill, the offset corner and clamp, both width refusals, and the Add door / Add window defaults |

`panel-market.spec.js` reaches the network through a **`page.route` stub**, not
a fetch: a hand-written miniature marketplace (one manifest, two index shards,
five item files) served off the page's own origin under `/__market/`. Same
origin on purpose — a cross-origin fulfilled route needs CORS headers to be
readable — and the path need not exist on either server, since the route
answers first. The stub also **counts requests**, which is how the index cache
and the item cache are proved to be caches rather than assumed to be. One thing
it taught: `Math.random` is seeded per page load, so after a `page.reload()`
the next `uid()` is byte-for-byte the one the first load handed the
subscription — and `reloadMarketSub()` deletes the record it subscribed under a
"fresh" id, which with two equal ids would delete the subscription itself. The
two tests that reload burn one `uid()` first, with a comment saying why. That
is a property of the deterministic seed, not of the app.

`test/fixtures/states/panels.json` backs all four. It is metric so `fmtLen`
output is short and exact, and it is built so that every branch these panels
have is reachable from one load: a folder tree two deep with a tagged folder, a
floor with two rooms plus one loose room, a wall turned off, a pillar and an
interior wall, three kinds of opening on three walls, an inventory holding a
tagged item, an untagged one (so the Untagged chip earns its place) and one
placed to exhaustion (so Place renders disabled), a nested item folder, an ad
hoc listing folder and two listings.

Four things about these tests are load-bearing:

1. **Text and state, never a panel screenshot.** Row counts, labels,
   `disabled`, `aria-pressed`, `aria-expanded`, the order of entries, the
   option list of a `<select>`. A DOM-text assertion says *what* broke; a panel
   screenshot only says something did, and goes red on every legitimate style
   change. The helpers are `texts`, `attrs` and `menuItems` in
   `e2e/app-fixture.js`.
2. **Nothing sleeps.** Several paths are deliberately delayed —
   `singleClick()` holds a row's own action back 190ms so a double-click can
   land, the library search box debounces 120ms, and `loadListing()` fills
   `#listingBody` from a promise. Every one of those is waited on with a
   polling `expect`, never a fixed sleep.
3. **No network.** `panels.json` sets `defaultMarketDismissed: true` and an
   empty `marketSubs`, so `ensureDefaultMarket()` returns before it fetches;
   the one listing whose contents are read is `kind:'file'`, which
   `loadListing()` answers straight out of `S`.
4. **The epilogue, not an export.** Where a test needed an internal it went
   into `test/epilogue.js`'s `GLOBALS` — `renderAll`, `renderLibAll`,
   `selectOnly`, `selectSet`, `selectClear` — so a test sets up a selection or
   a re-render the way the app does. `GLOBALS` assigns inside a `try/catch` and
   fails **silently**, so each name was verified by actually calling it.

### What Phase 3.6 does not cover

As useful as the list above. These are where the SCC move stays unverified and
wants a pass by hand:

- **`ensureDefaultMarket()` and `loadRegistry()`.** The one subscription path
  still unread, and it is the one that runs by itself: `ensureDefaultMarket()`
  fetches `DEFAULT_MARKET_URL` during boot, *before* a test can install a
  route, and every fixture sets `defaultMarketDismissed` so it returns early.
  Its `isDefault` flag is therefore reached only by poking it onto the stub
  subscription, which is what the `removeMarketSub` dismissal test does.
  `loadRegistry()` and the registry picker inside "Add a marketplace"
  (`#mRegistry`, and its buttons that fill `#mUrl`) are likewise never
  asserted — the dialog is driven by typing a URL. Reaching either would mean
  routing before `page.goto`, in the fixture rather than in a test.
- **`fetchJSON`'s timeout.** The 10s `AbortController` and its "timed out"
  message have no test; every stubbed response is immediate.
- **`drawPreview`.** The preview dialog is asserted through `#mPrevInfo` and
  the enabled state of its button. Nothing reads `#mPrevCv`, so what the
  preview actually *paints* — including the dashed open-out box — is uncovered.
- **`marketSubTile`'s eight-group cap** (`slice(0,8)`) and `renderMarketSub`'s
  twenty-tag cap (`slice(0,20)`): the stub is smaller than both.
- **The other ways into `openingDialog`.** Only the Openings list's ⋯ menu and
  `#btnAddOpening` are driven. The wall ⋯ menu's Door…/Window… entries, the
  `#wDoor`/`#wWin` buttons in `renderWallProps`, and moving an *existing*
  opening to a different wall on Save are all untouched.
- **The other ways into `itemDialog`.** `#btnAddItem` / `#btnAddItem2`, the
  Furniture pane's ⋯ menu and `#btnNewLibItem` are driven; the library grid's
  own tile click (`bindLibGrid` -> `itemDialog`, one of the six cycle edges) is
  not, and neither is its `dragstart`/`drop` pair.
- **Inside `itemDialog`:** editing an existing `poly` item's outline, the
  l-shape `cw`/`cd` clamp (`Math.max(1,Math.min(…, w-1))`), `normOpen`'s
  handling of negative open-out values, and the tag field's autocomplete
  suggestions (chips are asserted; the `.tagsuggest` list is not).
- **The blueprint dialogs** (`bpUploadDialog` and the rest of the four-stage
  wizard) are covered by `blueprint.spec.js`, which asserts geometry, not the
  panel HTML around it.
- **`renderCornerProps`, `renderPillarProps`, `renderIWallProps`.** The wall
  and opening editors are asserted; the other three selection kinds are reached
  only far enough to confirm the row selects them.
- **`renderFloorSel` and `renderFloorProps`.** Floor mode's Properties pane,
  including the two-room merge panel, is not read at all.
- **`renderLibSearchResults` in the marketplace tab.** Only the library branch
  of it is driven.
- **Drag-and-drop in the library grid.** `bindLibGrid`'s `dragstart`/`drop`
  pair, which moves an item into a folder, is not exercised; the layout tree's
  drag-drop is.
- **Narrow layouts.** Everything runs at 1280x800. Under 900px the panes become
  `display:contents` and sections reorder, and nothing asserts that.
