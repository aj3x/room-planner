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

npm test                    # everything (~25s)
npm run test:unit           # Suite A + the build-pipeline tests — Vitest (~3s)
npm run test:e2e            # Suite B — builds, then Playwright + Chromium (~20s)
```

Since Phase 2 there is a build, and `npm run test:e2e` runs it first (`npm run
build && npm run build:test`) because both of its targets are build outputs. See
**Two targets** below.

Between extraction commits, run **`npm test`**. The whole suite is ~25 seconds,
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
    app-fixture.js     the `app` fixture: determinism and seeding
    static-server.js   dependency-free static server, rooted at dist-test/
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
- ~~**`smoke › an edit survives a reload through localStorage` is flaky.**~~
  **Fixed.** It failed three times across Phase 2.5 and the `core/`+`model/`
  extraction, always passing on re-run — the test, not the code. Cause:
  `flushSave()` slept a flat 450ms against `save()`'s 350ms debounce, and a
  loaded machine ate the 100ms margin. It now polls for the write and takes an
  optional predicate so a test can demand that a *particular* write landed.
  Verified with three consecutive full e2e runs, 72/72 each.

  **There is no longer a sanctioned flaky test in this suite.** A failure here
  means the refactor is wrong. Do not re-run until green — investigate.

- **Marketplace fetching is not covered** beyond the boot-time requests being
  observed. Subscriptions, index shards and the item cache all need network or
  an HTTP mock.
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
