# The test suite

## The rule that shapes this directory

> **Test code stays under 20% of the codebase, and ideally under 10%.**

Measured as `test/**/*.js` against `index.html` + `src/**`. Check it before
adding a file:

```sh
find test -name '*.js' -not -path '*__screenshots__*' | xargs wc -l | tail -1
find index.html src -type f \( -name '*.html' -o -name '*.js' -o -name '*.jsx' -o -name '*.scss' \) | xargs wc -l | tail -1
```

This is not an arbitrary cap. Every test here has to earn its lines **from here
on**, for somebody maintaining the app — not because it was once useful. A suite
that grows without that question turns into a second codebase that has to be
kept in step with the first, and the first is the one users run.

**So a new test needs an argument, not just a green tick.** What does it catch
that nothing else does? If the answer is "it covers a function", that is not an
argument. If the answer is "a silent break here corrupts a user's saved
project", it is.

### Scaffolding has a finish line

Characterization tests written to make one large change safe — pinning how
the code behaves so a move can be proved to change nothing — are deleted when
that change lands, and are labelled as such while they live. Several suites
went that way (DOM-text checks of every panel, pointer scripts for every drag
mode, screenshot baselines). The defects they found are in
[`BACKLOG.md`](../BACKLOG.md) under `## Known defects`, each marked where it
lost its pinning test — the write-ups were always the durable artifact.

That is not licence to delete anything inconvenient: scaffolding has a
finish line, and the tests below do not.

## Running it

```sh
npm install                 # once; Vite, Sass, Vitest, jsdom, Playwright, ESLint
npx playwright install chromium

npm test                    # everything (~45s)
npm run test:unit           # Suite A — Vitest + jsdom (~2s)
npm run test:e2e            # Suite B — builds, then Playwright + Chromium (~40s)
npm run test:e2e:update     # re-baseline the blueprint goldens (rebuilds first)
```

`npm run test:e2e` builds first (`npm run build && npm run build:test`) because
both of its targets are build outputs. There is **no flaky test and nothing
tagged `@network`**: a red run means something is wrong. Do not re-run until
green — investigate.

## What the suite covers

### Suite A — `test/unit`, Vitest + jsdom

Pure logic, imported straight out of `src/`. No app boot, no bundler, no
harness; a file evaluates the modules it names and calls them.

- **`units.test.js`** — `parseLen`/`fmtLen` across ft+in, in, cm, mm and m:
  fractions, compound input, all four unicode dashes, and round-trips at each
  unit's own displayed precision. The boundary every number in the app crosses,
  and the cheapest coverage in the repo per line.
- **`migrate.golden.test.js`** — golden snapshots of `migrate()` for four
  fixtures spanning every historical schema, a shape contract that holds for all
  of them, the repair of a state full of dangling references, and
  **idempotence** (`migrate(migrate(x)) === migrate(x)`), which is the check
  that catches a migration rewriting a user's project a little more on every
  load. `migrate()` runs on every load of every returning user's data; a silent
  change here corrupts real projects with no error anywhere.
- **`tx.test.js`** — `transact()`'s rules: one undo step per call on the
  right stack, `history:false`, nesting commits once at the outermost, a throw
  commits nothing, `preview()` (a gesture frame) neither records nor saves, and
  each commit moves the revision signals once (one batch), which is the only
  thing every panel and the canvas repaint on. Every edit in the app goes
  through it, and the e2e suite drives only two
  gestures; a regression here splits or swallows undo steps everywhere else.
- **`io-roundtrip.test.js`** — `exportPayload` → `readImport` → `applyImport`:
  the envelope, a lossless replace-mode round trip asserted down to the
  geometry, all three id-collision rules (keep mine / overwrite mine / add as a
  copy), dropped placements and folder-id identity.
- **`floor-place.test.js`** — `kernel/model/floor-place.js` on two rooms side by
  side: how deep each wall band is drawn (shared, exterior, taken away),
  `depthRuns`' joins, the floor magnet closing to one wall-thickness of gap,
  and `floorRoomAt`. Every wall on a floor is drawn from these numbers and the
  e2e suite never opens Floor mode; a wrong depth only looks a little off.
- **`panels-follow-edits.test.js`** — mounts every pane section and the
  Library page in jsdom, commits one in-place edit per scope each shows, and
  checks the text on screen changed. The model is mutated, not replaced, and
  @preact/signals skips a component that reads signals or holds `useState`
  when its parent re-renders it with the same props, so a panel can go stale
  with nothing thrown (the Library's tiles once did). It also replays an undo
  and a redo (a snapshot, not a commit) and edits from the plan while the
  Library is hidden. The one test that reads panel text; it guards the
  re-render rule, not the panels' contents — `rp/signals-memo` (lint) guards
  the same rule statically.

### `test/build` — the deployment model

Not about the app's behaviour. It runs the real `vite.config.js` over
`test/fixtures/build/` and asserts the three properties the product rests on:
SCSS compiles with **design tokens surviving as CSS custom properties** (which
is what makes dark mode work — turn them into Sass `$variables` and dark mode
dies silently), the output is exactly one file, and its script tag is classic so
it opens from `file://`.

### Suite B — `test/e2e`, Playwright + Chromium (each test × 2 targets)

Everything that needs a real browser: real pixels, real `getImageData`, a real
file input, a real pointer.

- **`smoke.spec.js`** — draw a room → place an item → undo/redo (both stacks,
  independently) → export → re-import → persist across a navigation, every mode
  switch clean, **plus the `file://` deployment contract**: `dist/index.html`
  opened straight off disk boots and paints. That last one is the test that
  guards what the product *is*.
- **`blueprint.spec.js`** — `example blueprints/apartment-1.png` driven through
  the real wizard, asserting **9 rooms and 14 openings** (verified by hand
  against the photo) and snapshotting the **room polygons as JSON** in
  millimetres. The most complex pipeline in the app and the hardest to eyeball;
  a screenshot would go green on a pipeline that had drifted a few millimetres
  everywhere, and a coordinate golden will not. It also proves the photo never
  reaches `S` — see below.
- **`pointer.spec.js`** — two gestures, through real `mouse.down`/`move`/`up` on
  `#cv`: the **drag deadzone** and the **alignment magnet** landing a corner on
  `lineCross` to the millimetre. The app's most intricate interaction, and
  unreachable any other way — driving the same functions through state skips
  `pointerdown`'s hit test and never assigns a guide at all.

**The `save()` leak test earns a paragraph of its own.** `bpState` holds a
full-resolution blueprint photo as a `data:` URI. If it ever reaches `S`, every
`save()` writes megabytes into `localStorage` and a real user's quota blows up —
silently, long after the change that caused it, on a machine you cannot see.
It is four assertions in `blueprint.spec.js`, taken with an image genuinely
loaded. [`AGENTS.md`](../AGENTS.md) calls it out for the same reason. Never
delete it.

## What this suite deliberately does NOT cover

Written down so nobody mistakes the gaps for oversights, and so the next person
knows what they are inheriting.

- **The side panels and the Library UI.** Beyond `panels-follow-edits.test.js`
  checking that each one repaints after an edit, no test reads what the side-pane
  components (the Rooms tree, Items, the Selection, Room, Floor and View
  sections, the Library and Marketplace pages), the dialogs, the header or the
  canvas's controls put on the page; the e2e suite only clicks two of their buttons, by accessible
  name. A break that does not throw turns nothing
  red. This is the largest uncovered surface in the repo, and it is uncovered on
  purpose: 135 tests' worth of DOM-text assertions cost more to maintain than
  they return once the code they guarded has stopped moving. **If you are about
  to restructure that region, write the characterization first, use it, and take
  it out again** (or keep it outside the repo, as scripted clicks and
  screenshots).
- **The canvas's pixels.** No screenshot baselines. Nothing asserts that
  `draw()`, `drawAlignGuides`, `drawOpening` or the dark palette paint what the
  state says. Screenshot baselines are per-platform, per-colour-scheme, and go
  red on every legitimate style change; they were not worth their keep outside
  the refactor. The blueprint golden covers geometry, which is what a refactor
  actually breaks.
- **Most pointer interaction.** `'rot'`, `'wall'`, `'open'`, `'pillar'` and
  `'iwall'` drag modes, edge auto-pan, Escape mid-drag, touch and pen, the
  marquee, and the magnet against a non-rectangular room.
- **The marketplace.** `subscribeMarket` and its refusals, `ensureDefaultMarket`,
  `loadRegistry`, `fetchJSON`'s timeout, both caches. Nothing here reaches the
  network at all.
- **The blueprint wizard's UI.** `blueprint.spec.js` drives the pipeline through
  `__rp.bpState` and `window.bpRebuild`; **no test clicks through the four
  stages** — the stepper, drag-and-drop and paste, the crop handles, the
  calibration overlay, the review list.
- **OCR.** It fetches Tesseract from a CDN, so any test of it fails for reasons
  unrelated to the code. It runs after region derivation and never touches
  `polyPx`, so the geometry golden is unaffected.
- **Narrow layouts.** Everything runs at 1280×800. Under 900px the panes become
  `display:contents` and sections reorder.

## The harness — two things that will bite you

These are about the *machinery*, not about any test, and each cost an
afternoon to learn.

### 1. The epilogue is not linted

[`epilogue.js`](epilogue.js) is appended to an in-memory copy of `index.html`'s
script under `--mode instrumented`, so Suite B can reach `S`, `view`, the room
tool's drag and the undo entry points (`window.__rp`) and call a few functions
as `window.foo()` (`GLOBALS`). It imports every one of those names itself,
straight from the module that defines it. **ESLint lints `index.html` on its
own and never sees the epilogue**, so when one of those modules is renamed or
stops exporting the name, nothing goes red at lint, unit or build time:
the instrumented app fails to load and every Suite B test fails with no
`__rp`. `GLOBALS` assigns inside a `try/catch`, so a name listed there but not
imported fails *silently*, much later, as `window.foo is not a function` in a
spec that looks unrelated.

**So: after moving or renaming anything the epilogue names, fix its import in
the same change.** Never add an export to `index.html` to feed a test.

### 2. `expandIncludes` must stay in step with the Vite plugin

The icon sprite and the dialog's host live in HTML partials under `src/ui-kit/`, behind `<!-- @include src/…/foo.html -->`
directives that a Vite plugin (`rp:html-includes`) substitutes in
`transformIndexHtml`. Suite B is served by Vite and never sees a directive.
**[`unit-setup.js`](unit-setup.js) is not** — it reads `index.html` off disk to
build the jsdom shell — so it carries the same substitution. If it stops
expanding, or expands differently, the shell has no sprite or `#dialog`, and you get a wall of red
unit tests **with a green build and a green browser**.

It strips every `<script>` block one by one (cutting from the first `<script`
to the last `</script>` silently deletes any markup between two scripts), and
then asserts the ids the app needs, naming the file that lost one, instead of
failing as a null dereference three imports deep.

## Determinism

Nothing here may depend on wall-clock time, random ids or animation timing.

| Source of drift | How it is pinned |
|---|---|
| `uid()` → `Math.random` | seeded mulberry32 installed before any app code runs (Suite B) |
| `exportPayload()` → `new Date()` | clock frozen at 2024-01-01T00:00:00Z (Suite B) |
| ids appearing in snapshots | normalised to ordinals by `stableIds()` — identity is still proven, since the same id maps to the same ordinal everywhere |
| `save()`'s 350ms debounce | `flushSave()` **polls** storage until the write lands (pass a predicate when a *particular* write must be seen). A fixed sleep is the one flake this suite has had: a loaded machine ate the margin. |
| rAF-scheduled repaints | `settle()` awaits two frames |
| viewport / DPR | fixed at 1280×800, `deviceScaleFactor: 1` — `fit()` derives the zoom from the canvas box, so the viewport is an input to every projected point |

## Two targets

Suite B runs everything twice, against both halves of the build:

| project | served by | what it proves |
|---|---|---|
| `chromium-light` | `vite --mode instrumented` | the dev server a contributor actually uses |
| `dist-light` | `vite preview --outDir dist-test` | the bundled, minified artifact that ships |

`dist-light` **deliberately shares `chromium-light`'s goldens** (via a
per-project `snapshotPathTemplate`). That is the stronger assertion: bundling and
minification must not move a coordinate, and a build that did would fail against
the pre-build golden instead of quietly growing one of its own.

`dist-test/` is `dist/` plus the capture epilogue, built by `npm run build:test`.
`dist/` itself stays uninstrumented, and it is what the `file://` test opens.

## `index.html` is never modified

No hooks, no export shims, no data attributes. Everything here tests the code
exactly as it ships. Suite B's copy is rewritten by Vite under
`--mode instrumented`; Suite A reads the shell off disk and imports the modules
directly. The file on disk stays byte-for-byte what the build consumes.

## Layout

```
test/
  README.md            this file
  epilogue.js          the capture epilogue (Suite B) — read the audit rule above
  unit-setup.js        Suite A's jsdom shell, fake 2D context and shared helpers
  fixtures/states/     saved-state fixtures, shared by both suites
  fixtures/build/      a miniature app (HTML + module + SCSS) for the build tests
  unit/                Suite A — Vitest + jsdom
    __snapshots__/     migrate() goldens
  build/               the deployment model
  e2e/                 Suite B — Playwright + Chromium
    app-fixture.js     the `app` fixture: determinism, seeding, pointer helpers
    __screenshots__/   the blueprint JSON goldens
```

Tests stay here rather than beside the feature they test. They import
straight out of `src/` (a feature's internals as well as its `index.js`;
test code is outside the boundary rule), and keeping them in one tree is what
keeps the budget above a one-line `find` and the jsdom shell, the lint
globals and Vitest's `include` pointed at one place.

## Re-baselining a golden

```sh
npx vitest run -u            # Suite A's migrate() snapshots
npm run test:e2e:update      # the blueprint goldens (rebuilds first)
```

**Do not re-baseline a red test to get a build green.** Read the diff first. If
the diff is genuinely intended, say so in the commit message that updates the
golden. Blueprint goldens are Chromium- and platform-specific — the pipeline
starts from `drawImage`-scaled pixels — so a browser upgrade may legitimately
move them, and a CI box needs its own generated the first time it runs. That is
not the same thing as re-baselining a regression.
