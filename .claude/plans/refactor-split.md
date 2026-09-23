# Refactor: split the single file, add a build, add tests

**Goal.** Make `index.html` collaborable — many small files that merge cleanly — without
giving up the "one file, open it, it works" deployment model. Dev-side is many files with a
live-reloading build; the shipped artifact stays a single self-contained HTML file.

**Non-goal.** Improving any code. This refactor changes *where* code lives, not what it does.
Behaviour changes are a separate branch, after this one lands.

---

## 0. Ground truth (measured 2026-09-23)

| | |
|---|---|
| `index.html` | 10,893 lines / 547 KB |
| CSS | lines 8–526 (518 lines), 24 custom properties, 210 `var()` call sites |
| Static HTML | lines 527–765 (239 lines), incl. a 26-`<symbol>` sprite |
| JS | lines 766–10,891 (~10,100 lines), one flat `<script>`, ~680 top-level declarations |
| Inline `on*=` handlers | **none** — ESM conversion is safe |
| `window.*` assignments | **none** |
| Runtime dependencies | zero (stays zero) |
| Largest single region | blueprint import, lines 6,770–9,213 (~2,450 lines) |

`.github/` does not exist. GitHub Pages is serving `index.html` straight off `main`
(*Deploy from a branch*), not through Actions.

---

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Bundler | **Vite** + `vite-plugin-singlefile` | `vite dev` = HMR across many files; `vite build` = one self-contained `dist/index.html`. Build-time only. |
| Modules | **ESM**, `type="module"` | No inline handlers and no `window.*` writes, so nothing depends on the shared global scope from markup. |
| Styles | **SCSS** (`sass`, Vite built-in) | `@use`/`@forward` for deterministic cascade order; nesting keeps component variants contiguous. |
| Design tokens | **stay CSS custom properties** | Dark mode works by re-declaring them under `@media (prefers-color-scheme:dark)`. SCSS `$vars` are compile-time and would break it. **Non-negotiable.** |
| Unit tests | **Vitest** + jsdom | |
| E2E / visual | **Playwright**, against `dist/index.html` | The built artifact is what ships; test that, not just the dev server. |
| Lint | **ESLint**, correctness rules only | `no-undef` also surfaces missed cross-module references during extraction. |
| Format | **no Prettier** | Reformatting 10k lines destroys `git blame`. Revisit later behind `.git-blame-ignore-revs`. |
| `dist/` | **not committed** | A 547 KB generated file touched by every PR conflicts on every merge — the exact problem this refactor exists to solve. |

### Blame is preserved, and that matters

A mechanical split preserves `git blame` — Git tracks content, not filenames, so
`git log --follow` and `blame` keep working through move-only commits. That is worth
protecting: it is what settles a merge conflict six months from now. Hence
**extraction commits must be move-only.** No renames, no reordering, no reformatting,
no "while I'm here" fixes.

---

## 2. Sequence

Phases are strictly ordered. Parallelism only where marked.

### Phase 0 — Land blueprint (blocking)
`feat/blueprint-uploader` is **28 commits ahead of `main`**: blueprint import, split-room,
merge-rooms, OCR, multi-measurement calibration. Merge it to `main` first. Rebasing 2,450
lines of blueprint code across a file split afterwards is not a thing we want to do.

Then branch `refactor/modularize` off `main`.

### Phase 1 — Characterization baseline (blocking, do not skip)
Tests written against the **current** single-file app, before anything moves. This is the
only way to prove the split was faithful rather than hope it was. If this phase is skipped,
every later phase is unverifiable.

### Phase 2 — Build scaffold (blocking)
Vite, Sass, Vitest, Playwright, ESLint. `index.html` still monolithic; it just builds now.
Phase 1 tests must still pass, both in dev and against `dist/index.html`.

### Phase 3 — Extraction (serial)
JS, then SCSS, then HTML partials. One agent at a time. Details in §4.

### Phase 4 — Fan-out (parallel)
Per-module unit tests, CI, Pages switchover, docs, CODEOWNERS.

---

## 3. Target layout

```
index.html                  # shell only: <head>, include directives, <script type=module>
vite.config.js
package.json
src/
  main.js                   # the only module with top-level side effects
  core/
    units.js                # 773-830    parseLen fmtLen MM BARE UNIT_RE
    geometry.js             # 831-873
    open-state.js           # 874-982    openPoly openConflicts
    state.js                # 983-986    S, defaults  (imports nothing)
    ids.js                  # 987-1078   idProblem uniqueId retagItem rehomeItemId
    floor-space.js          # 1079-1183  floor space + stock reach
    store.js                # 2008-2028  Store save migrate
    history.js              # 2029-2250  roomHist furnHist commitRoom commitFurn
  model/
    walls.js                # 1184-1359  incl. pillars & interior walls
    openings.js             # 1360-1448
    validity.js             # 1449-1613  validate insideRoom collides
    walkpaths.js            # 1614-2007
    measures.js             # 3950-4256  measureObjs anchorGeom closestBetween
  ui/
    modal.js                # 2251-2328  openModal closeModal askConfirm
    menu.js                 # 2329-2371  openMenu moreBtn
    inline-edit.js          # 2372-2405  inlineEdit singleClick
    dnd.js                  # 2406-2423  moveBefore
    tag-input.js            # 2424-2531
    panels.js               # 4997-5112  applyPanes + section collapse
    flash.js                # 9544-9552  flash libFlash readTime
  canvas/
    view.js                 # 2532-2582
    room-draw.js            # 2583-2662
    split-room.js           # 2663-3043
    draw.js                 # 3044-3380  draw() + floor plan + arranging
    merge-rooms.js          # 3381-3949
    interaction.js          # 4257-4266
    snap.js                 # 4267-4996  the alignment magnet
    corners.js              # 5973-6316
  plan/
    layout-tree.js          # 5113-5371
    floors.js               # 5372-5972
    item-list.js            # 6317-6450
    room-controls.js        # 6451-6538
    item-dialog.js          # 6539-6707
    opening-dialog.js       # 6708-6769
  blueprint/                # 6770-9213, ~2450 lines, its own directory
    state.js 6782 · image.js 6799 · poly.js 6827 · pixels.js 6998 · walls.js 7163
    outlines.js 7345 · openings.js 7438 · rectify.js 7547 · labels.js 7610
    regions.js 7676 · detect.js 7830 · ocr.js 8086 · draft.js 8278
    wizard.js 8452 · step1-upload.js 8469 · step2-crop.js 8522 · step3-scale.js 8640
    mask-viewer.js 8862 · step4-review.js 8876 · commit.js 9151
  io/
    samples.js              # 9214-9272  incl. tick-box lists
    export.js               # 9273-9350
    import.js               # 9351-9543
  library/
    item-folders.js         # 9553-9637
    adhoc-folders.js        # 9638-9667
    market-subs.js          # 9668-9758
    add-to-inventory.js     # 9759-9789
    nav.js                  # 9790-9801
    shell.js                # 9802-9847
    tree.js                 # 9848-10040
    folder-menus.js         # 10041-10233
    grid.js                 # 10234-10382
    export.js               # 10383-10412
    search.js               # 10413-10440
    marketplace.js          # 10441-10672
    adhoc-listings.js       # 10673-10842
  router.js                 # 10843-10860
  boot.js                   # 10861-10891
  styles/
    main.scss               # @use manifest — the one place cascade order is stated
    _tokens.scss            # 9-47    custom props, dark, reduced-motion
    _base.scss              # 48-61
    _header.scss            # 62-76
    _buttons.scss           # 77-105
    _inputs.scss            # 106-151
    _plan.scss              # 152-272
    _canvas.scss            # 273-301
    _modal.scss             # 302-356
    _blueprint.scss         # 357-401
    _menus.scss             # 402-410
    _dnd.scss               # 411-419
    _library.scss           # 420-487
    _touch.scss             # 488-495
    _narrow.scss            # 496-526
  html/
    sprite.html             # 529-557   26 <symbol>s
    header.html             # 559-580
    pane-left.html          # 582-736
    pane-library.html       # 738-753
    modal.html              # 754-765
```

~60 JS modules, 15 SCSS partials, 5 HTML partials.

### HTML partials
A ~15-line local Vite plugin implementing `<!-- @include src/html/foo.html -->` in
`transformIndexHtml`. Behaviour-preserving: static markup stays static markup.
Do **not** convert the panes into JS template strings — that would turn static markup into
runtime-injected markup, which is a behaviour change.

---

## 4. Extraction rules (binding on every extraction agent)

1. **Move only.** Byte-identical code, comments included. No renames, no reordering, no
   reformatting, no fixes. If you spot a bug, write it in `BACKLOG.md` and move on.
2. **Anchor on banner text, not line numbers.** Line numbers shift as siblings are extracted.
   Locate your region by its `/* ---- name ---- */` banner string.
3. **Descending order.** Agents run one at a time, highest line range first.
4. **`function` declarations stay `function` declarations.** Never convert to
   `const f = () => {}`. ESM tolerates import cycles for hoisted function declarations but
   not for `const` bindings read during module evaluation — and this graph is dense and
   almost certainly cyclic.
5. **Mutable shared state lives in leaf modules that import nothing** — `core/state.js` (`S`),
   `core/history.js` (`roomHist`/`furnHist`), `blueprint/state.js` (`bpState`), the
   marketplace `Map` caches.
6. **Only `main.js`/`boot.js` may have top-level side effects.** Everything else defines and
   exports; nothing runs at import time.
7. **After each extraction: full baseline suite must pass** before the next agent starts.
   One commit per region, so a regression bisects to one file.
8. **`bpState` never touches `S`.** `save()` serialises all of `S` to localStorage; megabytes
   of base64 image there breaks saving permanently and silently. Preserved verbatim.
9. **Verify the tree yourself before touching anything.** Run `git status --short` and check
   that `.git/MERGE_HEAD` is absent. Do not trust a git state handed to you in a prompt or a
   session snapshot — during planning, the session-start snapshot reported the tree clean
   while an unresolved merge with staged conflict resolutions was sitting in it. A stale
   reading is how one agent silently clobbers another's work.
10. **Never run a destructive recovery command** — `git merge --abort`, `git reset --hard`,
   `git checkout -- <file>`, `git stash`. If the tree is not what you expected, STOP and
   report. Uncommitted work is unrecoverable; a stalled phase is not.

### SCSS rules
1. Split is a **rename + cut**. SCSS is a superset of CSS; compiled output must be
   byte-identical to today's CSS on the first commit. Verify with a diff of compiled output.
2. **Tokens stay CSS custom properties.** No `$variable` conversion, ever.
3. Nesting capped at **2 levels + `&` modifiers**.
4. No `@extend` (reorders output unpredictably). No selector string interpolation (makes
   selectors ungreppable, defeating the point).
5. Restructuring into nested form is a **second, separate commit** per partial, after the
   byte-identical split has landed.

---

## 5. Test matrix

### Tier 1 — Characterization (Phase 1, against current `index.html`)
The baseline. Broad and shallow: prove behaviour, don't chase coverage.
- Boot with no saved state; boot with saved state at each historical schema version.
- Golden-file: fixture state → `migrate()` → snapshot.
- Golden-file: `example blueprints/apartment-1.png` → detection pipeline → room polygons.
- Canvas screenshot of 3–4 fixture projects, light and dark.
- Export → re-import round-trip is lossless.

### Tier 2 — Unit (Vitest + jsdom, Phase 4, parallel fan-out)
Pure logic, unusually testable already:
- `core/units` — `parseLen`/`fmtLen` across ft+in, in, cm, mm, m; fractions; unicode minus.
- `core/geometry`, `canvas/corners` — `polySimple`, collinear-vertex drop, winding.
- `model/validity` — `validate`/`insideRoom`/`collides`.
- `model/measures` — `anchorGeom`, `closestBetween`, `pruneMeasures`, `remapMeasures`.
- `core/ids` — `idProblem`, `uniqueId`, `retagItem` (incl. rewriting `furnHist` snapshots).
- `core/store` — `migrate`, `normLayout`, `normItem`.
- `ui/dnd` — `moveBefore`, `folderDescendant` cycle guard.
- `blueprint/poly` — `bpCleanPoly` (sub-50mm edge merge, winding, collinear) then `polySimple`.
- `io/import` — the three collision cases, dropped placements, folder-id identity.
- `core/floor-space` — `usedCount` under each `INV_SCOPES` value.

### Tier 3 — Regression / E2E (Playwright, against `dist/index.html`)
- Visual: canvas screenshot diffs, the Tier 1 fixtures, light + dark.
- Smoke: draw room → place item → undo/redo → export → re-import.
- Blueprint: upload fixture → crop → scale → review → commit → "Undo this import".
- Split a room, merge two rooms, add/remove a corner.
- `dist/index.html` opened via `file://` works with zero network requests (the deployment
  model's actual contract).

---

## 6. Agent roster

Serial unless marked parallel.

| # | Agent | Phase | Deliverable |
|---|---|---|---|
| A0 | **Merge** | 0 | `feat/blueprint-uploader` → `main`; branch `refactor/modularize` |
| A1 | **Baseline** | 1 | Tier 1 characterization suite against current `index.html` |
| A2 | **Scaffold** | 2 | Vite + singlefile + Sass + Vitest + Playwright + ESLint; A1 green in dev *and* against `dist/` |
| A3a | **Extract: library + io + router + boot** | 3 | lines 9214–10891 |
| A3b | **Extract: blueprint** | 3 | lines 6770–9213 (own directory) |
| A3c | **Extract: plan + corners** | 3 | lines 5113–6769 |
| A3d | **Extract: canvas** | 3 | lines 2532–4996 |
| A3e | **Extract: ui + storage + history** | 3 | lines 2008–2531 |
| A3f | **Extract: core + model** | 3 | lines 773–2007 |
| A4 | **SCSS split** | 3 | 15 partials, compiled output byte-identical |
| A5 | **HTML partials** | 3 | include plugin + 5 partials |
| A6 | **Unit tests** ×N | 4 ∥ | one agent per `src/` subdirectory; each touches only its own new test files |
| A7 | **CI + Pages** | 4 | Actions workflow: lint, unit, build, E2E on PR; build-and-deploy Pages on `main` |
| A8 | **Docs** | 4 | `AGENTS.md` rewrite, `CODEOWNERS`, `README`, `CONTRIBUTING` |

### Why extraction is not parallel
Six agents editing one 10,893-line file concurrently would each be rewriting overlapping
line ranges of the same source and would corrupt it. A3a–A3f run **one at a time in the
order listed** (descending line ranges, so untouched regions above keep their positions).
A6 is the parallel-safe phase: by then the files exist, and each agent owns only its own
new test files.

---

## 7. Manual steps (cannot be automated from here)

1. **GitHub → Settings → Pages → Source: "GitHub Actions"** (currently "Deploy from a
   branch"). Until this is flipped, the site keeps serving the stale committed
   `index.html` and the whole switchover looks like a no-op.
2. Delete `index.html` from `main`'s root *only after* the Actions deploy is confirmed live.
3. Branch protection on `main`: require the CI check.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Import cycles break at module-eval time | Rule 4 (function declarations); state in leaf modules; `no-undef` lint |
| A silent behaviour change during extraction | Phase 1 baseline is blocking; suite runs between every extraction commit |
| SCSS tokens converted to `$vars` → dark mode dies | Called out in §1 and §4; compiled-output diff catches it |
| `dist/` committed out of habit → conflicts return | `.gitignore` + CI check that `dist/` is absent from the diff |
| Pages source never flipped → stale site | §7 step 1, done before deleting root `index.html` |
| Blueprint's `bpState`/`S` separation broken | Rule 8; an explicit test that `save()` output contains no image data |
| Extraction commits get "improvements" folded in | Rule 1; reviewer rejects any extraction diff that isn't move-only |
| An agent acts on a stale git state and clobbers uncommitted work | Rules 9 & 10; serial execution; baseline suite green between every commit |
