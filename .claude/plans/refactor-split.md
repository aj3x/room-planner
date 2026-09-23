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

### Phase 2.5 — Port Suite A off jsdom (blocking)
Found during Phase 2, not budgeted for in the original plan. Suite A (180 unit tests) reads
the `<script>` body out of `index.html` and evaluates it as a **classic** script in jsdom.
That works only while the code is one blob: **jsdom does not run ES modules**, so the first
real `import`/`export` in `src/` breaks `test/harness.js` outright.

This must land **before A3a**, not be discovered during it — the whole point of the baseline
is that it stays green across every extraction commit, and a harness that cannot load the
code under test cannot do that.

**Done.** Neither option as written survived contact. Importing `src/*.js` from a Vitest test
(option 2) evaluates module code in **Node's** realm, where `document` and `window` are the
wrong ones or absent — harmless for `core/units.js`, fatal by the time `ui/` and `canvas/`
move. What the harness does instead: it hands `index.html`'s script body plus the epilogue to
**Vite as a virtual entry module**, and evaluates the resulting classic **IIFE** in jsdom. Same
bundler as the shipped artifact, `./src/...` resolves exactly as in `npm run build`,
tree-shaking and minification off, ~60ms per test file, nothing written to disk. The whole app
— monolith and modules — runs in one realm, the jsdom one.

Not one of the 180 tests changed, which was the point: they are the behavioural contract.

The harness did not dissolve, and will not. What dissolved was the *classic-script assumption*
inside it. It keeps earning its keep: it is what supplies jsdom, the seeded PRNG, the frozen
clock and the recording canvas context, none of which Phase 3 removes. What shrinks instead is
`test/epilogue.js` — every binding that moves into `src/` leaves its scope, so `__rp` loses an
entry and tests reach that symbol by importing the module (`MM`/`BARE` went this way with the
pilot). See "How to extract a region" in §4, step 4.

Side effect worth having: inside an IIFE, function declarations are closure-scoped, exactly as
the browser has scoped them since the `type="module"` tag. Suite A now reaches entry points
through `GLOBALS` the same way Suite B does, so the scoping divergence between the suites is
gone and a name that goes missing during extraction fails in **both**.

Also note: `GLOBALS` in `test/epilogue.js` is now a maintained list of 16 entry points that
Suite B drives the app through. Any extraction moving one of those must keep it in scope.

Phase 2.5 also landed the **pilot extraction**, `src/core/units.js`, under Phase 3's rules —
which is where the findings in §4 came from.

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

### How to extract a region (the mechanical recipe)

Proved end-to-end by the `core/units.js` pilot in Phase 2.5. Follow it literally.

1. **Create `src/<dir>/<name>.js`.** Paste the region's lines in, byte-identical,
   comments and banner included. The *only* line you add is a single
   `export {a, b, c};` at the very end. Do **not** write `export const` /
   `export function` on the declarations themselves — that edits the moved lines
   and stops the diff being a pure move.
2. **Import back into `index.html`** at the exact spot the code left, as one
   line: `import {a, b} from './src/<dir>/<name>.js';`. Import only what the
   *remaining* monolith actually references — an unused import is a
   `no-unused-vars` warning and a lie about the dependency graph. `no-undef`
   will name anything you forgot.
3. **`"use strict";` stays the first statement of the script.** Put imports
   after it. (They hoist anyway; this is about not demoting the directive to an
   expression statement.)
4. **Check `test/epilogue.js`.** If the region owned a name the epilogue
   captures, that name is no longer in `index.html`'s scope and the epilogue
   will throw a `ReferenceError` on every boot in both suites. Either the
   monolith still imports it (so it stays in scope, fine) or you delete it from
   `__rp` — tests that want it import the module directly, which is better. The
   `GLOBALS` list is subject to the same rule.
5. **Verify, in this order:** `npm run lint` (0 errors, and no new `no-undef`) →
   `npm run test:unit` → `npm run build` → `npm run test:e2e`. Then
   `git diff index.html` and read it: it must show your region removed and one
   import line added, and nothing else.
6. **Prove the move was a move:** diff the moved lines against the previous
   commit's copy, e.g.
   `git show HEAD:index.html | sed -n 'A,Bp' | diff - <(sed -n 'X,Yp' src/…)`.
   Byte-identical or it is not an extraction.
7. **One commit per region.**

### Findings from the `core/units.js` pilot — read before starting

**A. The extraction order in §6 is backwards, and A3a cannot run first.**
ESM has no way for `src/foo.js` to import from `index.html`'s inline script.
So a region may only move once everything it *calls* has already moved, or
still lives in the monolith and is not needed by it. Extracting bottom-up by
line number (A3a: `library/` + `io/`) moves the code that depends on nearly
everything, while the helpers it calls are still trapped in the monolith —
unresolvable. Extraction must go **leaves first**: `core/` → `model/` → `ui/` →
`canvas/` → `plan/` → `blueprint/` → `library/`+`io/` → `router`/`boot`. That
is A3f → A3a, the reverse of the roster. Line numbers still shift, which is why
rule 2 (anchor on banner text) matters more, not less.

**B. `core/state.js` is the hard one, and it is not move-only.** *(Resolved —
see "Phase 3 progress" below.)* `S` is a `let`
that is *reassigned* from outside its own region — `S=st` at the end of
`migrate()` and `S=done` in the import path. You cannot assign to an imported
binding: both become a TypeError the moment `S` lives in another module. The
capture epilogue has the same problem (`set S(v){ S = v; }`). Extracting `S`
therefore needs a setter (`setS(v)`) or all writers moved in with it — a real
code change, the only one this refactor is likely to need. Budget it, do it in
its own commit, and state it in the commit message. Everything downstream of
`core/state.js` is blocked on it.

**C. Line ranges in §3 are approximations, not boundaries.** The units region
is 773–830, but `unitWord` sits in the middle of it and reads `S.unit`, so it
could not go. Expect this: check every symbol in your range for references to
things that have not moved yet, and leave the stragglers behind with a one-line
comment saying why. A region that splits is normal; a region that drags an
unextracted dependency along with it is a bug.

**D. `MM` and `BARE` turned out to be used only inside the units region** — 2
references each, both internal. Several other "shared" helpers will be the same.
Import back only what is really referenced; let the rest become module-private.

### Phase 3 progress — `core/` and `model/` (the leaves), then `ui/`

Done, one commit each, all move-only unless marked, baseline green between every one:

| module | note |
|---|---|
| `core/units.js` | Phase 2.5 pilot; `unitWord` rejoined it once `state.js` existed |
| `core/geometry.js` | the `open state` sub-block sat inside it and had to follow separately |
| `core/ids.js` | `retagItem`/`rehomeItemId` are not here — they are in `library/` |
| `core/state.js` | **preceded by one non-move-only commit**: every `S = …` became `setS(…)` |
| `core/open-state.js` | needed `state.js` first (`openSizeLabel` reads `S.unit`) |
| `core/floor-space.js` | needed the `S` accessors, which moved into `state.js` |
| `core/store.js` | `KEY`, `Store`, `save` only |
| `model/walls.js` | **splits**: six functions stayed, see below |
| `model/openings.js` | whole region |
| `model/validity.js` | the walk-paths half of its §3 range stayed |
| `model/measures.js` | movable after all; the canvas half of the Measure tool stayed |
| `ui/dnd.js` | whole region |
| `ui/inline-edit.js` | whole region |
| `ui/panels.js` | **two commits**: `esc`/`normSearch` + section collapse first, `applyPanes` once `modal.js` existed |
| `ui/modal.js` + `ui/tag-input.js` | **one commit** — they import each other, see below |
| `ui/menu.js` | picked up `moreBtn` from the layout-tree region, per §3 |
| `ui/flash.js` | `readTime` + `libFlash` only; `flash()` could not come |

**Finding B is settled.** `S` moved, and the three writers (`migrate`,
`applyImport`, boot) plus the epilogue's `set S(v)` now call `setS(v)`, a setter
exported beside the declaration. The binding stays live, which is what
`migrate()` needs when `reconcileTags()` reads `S.itemFolders`. That change
landed in its own commit, *before* the move, so the move itself stayed a move.

**§3's file list needed one addition.** The `S` accessors — `L`, `RP`, `itemOf`,
`instOf`, `openOf`, `roomMode`, `furnMode`, `floorMode`, `folderOf`,
`childFolders`, `childLayouts`, `floorOf`, `childFloors`, `floorLayouts` — have
no file in §3 but had to move, because `core/floor-space.js` cannot resolve
without them. They are in `core/state.js`: pure lookups over `S`, needing
nothing else, so the module is still a leaf that imports nothing.

**Findings from the `ui/` round.**

- **No setter was needed.** None of the ten selection `let`s is touched by any
  region that moved, so the sanctioned `setX()` budget went unspent. The
  reassigned bindings inside `ui/` (`moOkFn`, `moCloseFn`, `moBackFn`, `menuEl`,
  `clickT`, `libFlashT`) are each written only from inside their own region, so
  they moved as ordinary `let`s. `canvas/` will not be so lucky.
- **`ui/modal.js` and `ui/tag-input.js` had to land in one commit.** They import
  each other: `openModal()` calls `tagInputs.clear()`, and `mountTagField()`
  calls `$()`, which is declared at the head of the modal region. There is no
  order in which they split, so rule 9 ("one commit per region") gave way to
  keeping every commit green. Both uses are inside function bodies, so nothing
  is read during module evaluation and the cycle never reaches a TDZ.
- **`esc` is the gate on everything above `ui/`.** It is a pure two-line
  function filed under `ui/panels.js` in §3, and every region that builds HTML
  calls it. It had to move before `ui/modal.js` could, and nothing in `plan/`,
  `library/`, `io/` or `blueprint/` could have moved while it sat in the
  monolith. It is out now.
- **Top-level side effects were left behind, deliberately.** `ui/` is where the
  DOM lives, and the listener registrations that trail the modal, menu, pane and
  section regions — eleven of them — all stayed in `index.html` at the exact
  spot they were. Registering them at import time would break rule 6 *and*
  reorder them ahead of every other listener in the file, which is a real
  behaviour risk, not a stylistic one. They read `mo`, `moOkFn`, `moBackFn`,
  `menuEl`, `closeMenu`, `toggleSection`, `wideLayout` and `applyPanes` as live
  imported bindings, which works.
- **One top-level DOM read did move**: `const mo = $('modal')` in
  `ui/modal.js`. It is a lookup, not a mutation and not a listener; the bundle
  still runs after the document is parsed, so it resolves exactly as it did
  inline. `canvas/view.js` will face the same call with
  `const cv=$('cv'), ctx=cv.getContext('2d')` — that one takes a context, so it
  is a step further from harmless, and the epilogue captures both `cv` and
  `ctx`.

**Left behind for later phases**, each blocked on code that has not moved:

- `core/history.js` — **re-checked after `ui/`, still blocked.** `$()` has moved,
  so `updateHistButtons` is free, but it is the only one of the region's twenty
  symbols that is: `applyRoomSnap`/`applyFurnSnap`/`applyFloorSnap` call `draw()`
  and six `render*()` functions and touch `roomSel`/`selectClear`. Extracting
  `updateHistButtons` alone would give `core/history.js` none of the history
  state §3 names it for, while five functions that stay would import it back.
  Needs `canvas/` and `plan/`.
- `model/walkpaths.js` — half of it draws (`ctx`, `cv`, `PAL`, `view`). Behind
  `canvas/`.
- `migrate`/`normLayout`/`normItem`/`pruneMeasures`/`remapMeasures` — `migrate()`
  calls `reconcileTags()`, in `library/item-folders.js`. So `core/store.js`
  landed as `KEY`/`Store`/`save` only, and the rest of §3's store.js follows
  `library/`.
- Six of `model/walls.js`: `tryRoomEdit` (calls `flash()`), `setWallAngle`,
  `setWallLen`, `setRectSize` (call `tryRoomEdit`), `snapRadius` (reads `view`),
  `snapWallPoint` (calls `snapPt()`). Listed at the top of `src/model/walls.js`.
  **Still blocked after `ui/`, and the reason moved.** `flash()` did not come
  with `ui/flash.js`: its timer handle is declared `let drag=null, flashT=null;`
  at the head of the interaction region, sharing one declarator list with `drag`,
  which is reassigned from all over `canvas/`. Separating `flashT` from `drag`
  would edit a line of `index.html` rather than move it, so `flash()` — and with
  it all four `tryRoomEdit` functions — waits for `canvas/interaction.js`. The
  canvas agent gets all four back for the price of one declarator.
- **The selection lets** — `sel`, `selSet`, `roomSel`, `floorSel`, `mergeSel`,
  `floorGuides`, `floorSnapNote`, `alignGuides`, `alignNote`, `treeOpen`. These
  are finding B all over again, ten times: each is reassigned from dozens of
  sites spread across regions that have not moved, so each needs either a setter
  or all its writers moved in with it. Whoever moves `canvas/` will hit this
  first and should budget for it the way `setS` was budgeted. `ui/` did not need
  a single one of them, so all ten are still untouched.
- **From `ui/` itself**: `flash()` (above); `togglePane` and the two pane-head
  listeners (`togglePane` calls `resize()`, `canvas/view.js`); and the rest of
  the `panels` banner — `renderAll`, `paramMode`, `syncModeParam`,
  `isCanvasMode`, `setMode`, `renderMode` and the `#navSeg`/`#modeSeg`
  listeners, all of which call `draw()` and every `render*()`.

### Phase 3 progress — the `canvas/` round

Done, baseline green between every commit. Three of the eleven are **declared
code changes**, each in its own commit, each stated in its message.

| commit | kind | note |
|---|---|---|
| split `let drag=null, flashT=null;` | **not move-only** | one line; unblocked five functions |
| `ui/flash.js` ← `flash()` | move-only | the file is whole |
| `model/walls.js` ← `tryRoomEdit`, `setWallAngle`, `setWallLen`, `setRectSize` | move-only | paid for by the line above |
| split `let view=…, W=0, H=0;` | **not move-only** | one line; `view` is never reassigned, W/H are |
| `canvas/view.js` | move-only | cv, ctx, view, sx/sy/wx/wy, snapMM, snapPt, axisLockFrom |
| `model/walls.js` ← `snapRadius`, `snapWallPoint` | move-only | the file is whole |
| `setForceLightCanvas()` | **not move-only** | 2 writers, both in `savePlanImage` |
| `canvas/draw.js` instalment 1 | move-only | the palette: CANVAS, darkMQ, PAL |
| `canvas/merge-rooms.js` | move-only | the polygon weld, + PARALLEL_TOL |
| `canvas/split-room.js` instalment 1 | move-only | `boundaryHit`, `splitAngleSnap` |
| `canvas/draw.js` instalment 2 | move-only | addPoly, pathPoly, clip, normHex, hexA, pickText |

`index.html`: 9,797 → 9,564 lines. `src/`: 18 → 22 modules.

**The big one — `draw()` — did not move, and this is the round's main finding.**

**The ten selection setters were budgeted for and deliberately not spent.** The
brief expected `sel`/`selSet`/`roomSel`/`floorSel`/`mergeSel`/`floorGuides`/
`floorSnapNote`/`alignGuides`/`alignNote`/`treeOpen` to be the gate on this
round. They are not. Converting all ten (98 assignment sites, 33 for `roomSel`
alone, many of them inside the least-tested code in the app) would have
unblocked **nothing that could then have landed**, because every region that
reads them *also* calls `draw()` or the `render*()` functions. Rule: only
convert a binding when the move it unblocks can actually land in the same
round. The one setter this round did need was `setForceLightCanvas`, which is
not on the list at all.

**`draw()` is the keystone, and its blockers are these, exhaustively:**

- the nine selection lets above (it reads all of them);
- five interaction lets — `drag`, `drawState`, `drawCursor`, `wallDrawState`,
  `wallDrawShift`;
- `W` and `H`, which are behind `resize()` → `scheduleDraw()` → `draw()` itself;
- four `draw*()` helpers filed in other regions — `drawMeasures` (measuring),
  `drawSplitOverlay` (split-room), `drawDimension`, and `drawWalkOverlay`,
  which is in `model/walkpaths.js` and is itself blocked.

So `draw()` is not one region. It is a single connected component spanning the
drawing, measuring, split-room, walk-path and interaction regions, roughly
1,500 lines, and it cannot be cut into green intermediate commits. **Whoever
takes it should plan to move that whole component in one commit**, after
converting the fourteen lets, rather than trying to land it in pieces. That is
the honest shape of the work and it is why this round stopped where it did.

**Everything downstream is still blocked on `draw()`**, and this was verified,
not assumed: `canvas/room-draw.js`, the rest of `canvas/split-room.js`, the UI
half of `canvas/merge-rooms.js`, `canvas/corners.js` (which is only
`splitWall` + `deleteCorner`; §3's 5973–6316 range is mostly `plan/`),
`canvas/interaction.js`, `canvas/snap.js`, the rest of `canvas/view.js`,
`core/history.js` (re-checked: needs `draw` and seven `render*`), and
`togglePane` (needs `resize`).

**Three further notes.**

- **`cv` and `ctx` moved.** `const cv=$('cv'), ctx=cv.getContext('2d')` is in
  `canvas/view.js`, with the reasoning in a comment above it. Short version:
  `getContext('2d')` is a memoising lazy accessor, not a mutation — no
  listener, no scheduled work, no paint, no app state read — so the only thing
  that changes is that it runs at module-evaluation time. `#cv` exists by then
  in all three targets, and the jsdom harness installs its recording
  `getContext` in a *prelude*, ahead of the bundle. Leaving it behind would
  have pinned all of `canvas/` to the monolith. The `darkMQ` `change` listener
  next to it stayed in `index.html`, per the `ui/` convention.
- **§3's line ranges misfile several things**, as finding C predicted.
  `PAL`/`CANVAS` fall inside §3's `split-room.js` range but belong to
  `draw.js`; `corners.js`'s range is mostly `plan/`; `PARALLEL_TOL` belongs to
  `arranging` (→ `draw.js`) but had to lead `merge-rooms.js` because nothing in
  `src/` can import from `index.html`. Anchor on banners and on what the code
  *is*.
- **The epilogue can `import`.** `CANVAS` left `index.html`'s scope with the
  palette and `index.html` no longer references it, so importing it back would
  have been an unused import. `test/epilogue.js` imports it directly instead —
  the appended text sits inside the app's own module, so a bare `import`
  resolves as index.html's own do and hoists clear of `"use strict"`. Verified
  in Suite A and in all four Suite B projects, built artifact included. This is
  the better tool for every future case where a test needs a moved binding the
  monolith has stopped using.

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
- `dist/index.html` opened via `file://` boots and paints off disk. **Not** "zero network
  requests": `ensureDefaultMarket()` fetches 4 URLs from raw.githubusercontent.com at boot
  today, pre-refactor, and they simply fail harmlessly under `file://`. The contract is that
  the app works regardless. Whether the default marketplace should be bundled or lazily
  fetched is a real question, but a behaviour change — not this branch's business.

---

## 6. Agent roster

Serial unless marked parallel.

| # | Agent | Phase | Deliverable |
|---|---|---|---|
| A0 | **Merge** | 0 | `feat/blueprint-uploader` → `main`; branch `refactor/modularize` |
| A1 | **Baseline** | 1 | Tier 1 characterization suite against current `index.html` |
| A2 | **Scaffold** | 2 | Vite + singlefile + Sass + Vitest + Playwright + ESLint; A1 green in dev *and* against `dist/` |
| A2.5 | **Port Suite A off jsdom** | 2.5 | Suite A loads real ESM; harness reduced or retired |
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
