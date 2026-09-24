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

### Phase 3.5 — Pointer coverage before the `draw()` move (blocking)
Added after the `canvas/` round, which established two things that together force it:

- **`draw()` is one connected component of ~1,500 lines**, spanning the drawing, measuring,
  split-room, walk-path and interaction regions. It cannot be cut into green intermediate
  commits, so it lands as a single large commit — the one place in this refactor where
  bisection does not help.
- **That component contains the least-tested code in the app.** `test/README.md` says the
  ~730-line alignment magnet is driven through state, not synthetic pointer events, so a
  green suite is weak evidence there. The `canvas/` agent said the same unprompted.

A 1,500-line unbisectable move of the least-covered code, validated by a suite that does not
exercise it, is the highest-risk step in the project. So before it: **drive the real thing
with real pointer events.** Playwright already has a browser; the gap is that nothing uses
`mouse.down`/`move`/`up`.

Target the behaviour the move could break, not line coverage:
- drag a corner, with and without the magnet, and with Shift (`alignRadius`/`Infinity`)
- drag a placed item until it snaps to a wall, an edge, and another item
- the deadzone (`DEADZONE_MODES`/`DEADZONE_PX`, `armed:false` → armed)
- draw a room, draw a freestanding wall, split a room along a divider
- measure between two anchors
- the guide readouts (`alignGuides`/`alignNote`, `floorGuides`/`floorSnapNote`) — these are
  nine of the ten selection lets, and nothing currently asserts them at all

These are characterization tests like the rest: capture what the app **does today**, before
the move, defects included. A test that pins current behaviour is the point.

### Phase 3.6 — Characterize the side panels before the SCC move (blocking)
The `plan/` round established that the Plan side panels and the Library UI are **one
strongly-connected component of 48 names / 1,224 lines**, bound by six function-call edges.
It cannot be split, no setter breaks it (the edges are calls, not shared state), and it must
land in one commit — with most of `library/` + `io/` landing first.

That commit sits on **the least-covered code in the repo**: the suite screenshots only `#cv`,
so every `render*()` function that writes `innerHTML` into a side panel is unverified. A
break that does not throw turns nothing red.

This is the same situation as the `draw()` keystone, and it gets the same answer that worked
there: **characterize first, then move.** Phase 3.5's pointer tests are why the keystone was
safe; these are the equivalent for the panels.

What to cover — the `plan/` round's own unverified list:

| panel | what a silent break looks like |
|---|---|
| left pane layout tree | folders/floors/rooms missing, wrong indent, caret not expanding, "more" menu absent |
| Room pane › Walls | wall rows missing, wrong length/angle, "Open" not shown for a wall that is off |
| Room pane › Structures | pillars/interior walls missing, wrong dimension, "None yet" when there are some |
| Room pane › snap picker | wrong option list for the unit, or current snap silently reset |
| Room pane › Openings | openings missing, wrong kind label, wrong wall number |
| Furniture pane › Inventory | items missing, wrong counts, Place button wrongly enabled/disabled |
| Furniture pane › tag chips | chips missing, Untagged/Clear wrongly shown, wrong pressed state |
| Measure readout bar | `renderMeasureBar` writes a bar nothing reads |
| undo/redo button state | `updateHistButtons` enable/disable is unasserted |

Plus inline rename on a tree row (`renameFolder`/`renameLayout`/`renameFloor`) and tree
drag-drop.

Assert **text and state**, not screenshots: row counts, labels, `disabled`/`aria-pressed`,
the order of entries. A DOM-text assertion says what broke; a panel screenshot only says
something did, and is far more brittle to legitimate change.

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

### Phase 3 progress — the `draw()` round (the keystone)

Done, baseline green (185 Vitest + 158 Playwright) between every one of the
sixteen commits. `index.html`: 9,564 → 8,070 lines. `src/`: 22 → 27 modules.

**The `canvas/` round's central finding did not survive contact, and that is
this round's main result.** It said `draw()` is one connected component of
~1,500 lines that cannot be cut into green intermediate commits and must land
as a single unbisectable commit. That was a true reading of the code *as it
stood*, and it stopped being true the moment the state moved. `draw()` landed
as an ordinary 766-line move, with eleven green commits in front of it, every
one of which bisects.

**What changed the shape of the problem.** The fourteen blocking bindings do
not have to stay in `index.html`. Rule 5 already says mutable shared state
belongs in leaf modules that import nothing — and once it is in one, every
region that reads it can move on its own schedule. So: setters first, then the
state into leaves, then the helpers bottom-up, then `draw()`.

Six **not move-only** setter commits, each stated in its message, each a bare
assignment and nothing else:

| commit | binding(s) | sites |
|---|---|---|
| 1 | `sel`, `selSet` | 8 + 2 |
| 2 | `roomSel` | 32 |
| 3 | `floorSel`, `mergeSel` | 6 + 1 |
| 4 | `alignGuides`, `alignNote`, `floorGuides`, `floorSnapNote` | 12 + 12 + 7 + 7 |
| 5 | `drag`, `drawState`, `drawCursor`, `wallDrawState`, `wallDrawShift`, `splitDrawState` | 21 + 3 + 3 + 3 + 1 + 2 |
| 6 | `W`, `H` | 1 + 1 |
| 7 | the seven measure lets | 22 |

Then ten move-only commits:

| commit | note |
|---|---|
| `core/selection.js` | the nine selection lets + setters; a leaf. `treeOpen` stayed |
| `canvas/interaction-state.js` | six interaction lets + setters, gathered from four regions; a leaf |
| `W`/`H` → `canvas/view.js` | beside `cv`, `ctx`, `view` |
| `plural()` → `ui/panels.js` | one line, beside `esc`; eleven call sites all over |
| `canvas/draw.js` instalment 3 | drawAlignGuides, drawSquareTick, drawCustomOverlay |
| `canvas/snap.js` | the alignment magnet, down to `snapCorner` |
| `canvas/split-room.js` instalment 2 | splitRefs, splitCornerRef, splitResolvePoint, drawSplitOverlay |
| `model/walkpaths.js` | the whole region, 393 lines, in one piece |
| `canvas/measure-state.js` | the seven measure lets + setters; a leaf |
| `canvas/draw.js` instalment 4 | the measuring passes, incl. drawDimension and drawMeasures |
| `canvas/draw.js` instalment 5 | **`draw()` and the whole `drawing` banner, 766 lines** |

**The four `draw*()` blockers each moved separately**, which is what made the
keystone ordinary: `drawCustomOverlay` (instalment 3), `drawSplitOverlay`
(`split-room.js`, once `snap.js` existed), `drawWalkOverlay` (`walkpaths.js`,
which had been listed as blocked since the `model/` round and turned out to
move whole), `drawMeasures` (instalment 4, once the measure lets were in a
leaf).

**How the order was found.** Not by eye. A throwaway probe wrote a candidate
line range into `src/_probe.js` under a preamble importing every existing
`src/` export, ran ESLint, and read back the `no-undef` names — ESLint's scope
analysis, so locals and shadowing are handled properly. That is what showed
`model/walkpaths.js` was movable whole and that the magnet stops cleanly at
`snapCorner`. Recommended for the next round; it costs a few seconds per query.

**Three things worth knowing for the rounds ahead.**

- **`GLOBALS` in `test/epilogue.js` fails silently.** It assigns inside a
  `try/catch`, so a name that leaves `index.html`'s scope simply stops being on
  `window` and surfaces much later as `window.foo is not a function`. It caught
  us once, for real: `swingPoly` left with `drawOpening` and four
  `visual.spec.js` tests went red. The fix is the `CANVAS` pattern — the
  epilogue imports it. **Check `GLOBALS` by name after every move**, not just
  the `__rp` getters.
- **The epilogue now imports six names**: `CANVAS`, `alignGuides`, `alignNote`,
  `floorGuides`, `floorSnapNote`, `drawCursor` and `swingPoly`. Each left
  `index.html`'s scope with its last reader; importing back would have been an
  unused import and a lie about the graph.
- **`canvas/draw.js` closes two import cycles**, with `canvas/split-room.js`
  and `model/walkpaths.js`. Rule 4's case exactly: every name across those
  edges is a function declaration or is only read inside a function body, so
  nothing is touched at module-evaluation time. Do not add a *top-level* read
  across either edge.

**Everything downstream is now blocked on `plan/`, not on `canvas/`.**
Re-checked, not assumed: `canvas/room-draw.js`, `canvas/corners.js`,
`canvas/interaction.js`, the rest of `canvas/split-room.js`, `resize`/`fit`/
`zoomAt` in `canvas/view.js`, `squareCorner`/`pickAt`/`pickRoom` in
`canvas/snap.js`, the UI half of `canvas/merge-rooms.js`, `core/history.js` and
`togglePane` all now want the `render*()` functions, `setMode` and `renderAll`.
That is one gate, and it is the `plan/` round's.

### Phase 3 progress — the `plan/` round

Done, baseline green (185 Vitest + 166 Playwright) between every one of the ten
commits. `index.html`: 8,070 → 7,670 lines. `src/`: 27 → 32 modules. **Every
commit is move-only.** No setter was needed and none was spent.

| commit | note |
|---|---|
| `core/history.js` | the recording half of undo/redo, in three chunks |
| `treeOpen` → `core/selection.js` | the tenth selection let; no setter needed |
| `plan/layout-tree.js` | the tree's HTML builders |
| `plan/room-panel.js` | the Room pane's wall, structure and snap lists |
| `plan/room-panel.js` + the Openings list | `KIND`, `renderOpen` |
| `plan/item-list.js` | the inventory list + `allTags`/`itemMatchesFilter` |
| rename helpers → `plan/layout-tree.js` | `renameFolder`/`renameLayout`/`renameFloor` |
| `canvas/view.js` ← `resize`, `fitBBox`, `fit`, `zoomAt` | **the file is whole** |
| `canvas/snap.js` ← `pickAt`, `bringToFront`, `pickRoom` | |
| `canvas/measure-tool.js` | the Measure tool's canvas half |

**The gate did not open, and the reason is the round's main finding. It is not
`plan/`'s to open.**

The brief for this round said `canvas/room-draw.js`, `canvas/corners.js`,
`canvas/interaction.js`, the rest of `split-room.js`, `core/history.js` and the
rest were blocked "solely on the `render*()` functions, `setMode` and
`renderAll`". That is true. What it did not say — because nobody had measured
it — is what those are blocked on.

**`setMode` and `itemDialog` both call `renderLibAll`, and four library
functions call back into the Plan panels.** Six edges, all plain function
calls:

```
setMode        -> renderLibAll        createLibItem -> itemDialog
itemDialog     -> renderLibAll        libItemMenu   -> itemDialog
                                      bindLibGrid   -> itemDialog
                                      deleteLibItem -> renderSel
```

A Tarjan run over the whole reference graph makes it exact: the Plan side
panels and the Library UI are **one strongly-connected component of 48 names
and 1,224 lines**, spanning `renderRoom`, `renderRoomSel`, `renderSel`,
`renderWallProps`, `renderOpeningProps`, `splitWall`, `deleteCorner`,
`setMode`, `itemDialog`, `openingDialog` on one side and `renderLibAll`,
`renderLibContent`, `renderMarketTop`, `renderListingDetail`, `bindLibGrid`
and the rest of the library on the other.

An SCC cannot be extracted in pieces. Any proper subset references the rest,
which would still be in `index.html`, and `src/` cannot import from
`index.html`. So the whole component must land in **one commit** — and its
non-SCC dependencies (the marketplace caches, the folder helpers, the io
pickers) must land before it, which is most of the `library/` + `io/` round.

**The draw() lesson was applied and does not rescue this one.** The check was
made explicitly: is the knot state rather than code? It is not. All six edges
are function calls, not shared mutable bindings. There is no `setX()` that
breaks this cycle, and none was spent pretending otherwise.

**So the extraction order in "Findings from the pilot, A" needs one
correction.** Leaves-first gives `core/` → `model/` → `ui/` → `canvas/` →
`plan/` → `blueprint/` → `library/`+`io/`. `plan/` cannot come before
`library/`: they are the same component. The next round should be
**`library/` + `io/` + the Plan panels together**, and it should expect one
large commit in the middle of it. That commit is over the *least*-tested code
in the app (see `test/README.md`: side-panel HTML is not characterized), so it
deserves the Phase 3.5 treatment — coverage first, then the move.

**A second, smaller finding: `canvas/view.js`'s top-level DOM read now
constrains the graph.** `togglePane` was expected to come free with `resize()`.
It cannot. `ui/modal.js` and `ui/panels.js` already import each other, and
moving `togglePane` into `panels.js` adds `panels.js -> canvas/view.js`, which
pulls `view.js` into that cycle. `view.js` runs `const cv=$('cv'),
ctx=cv.getContext('2d')` at module-evaluation time, so it then reads `$` before
`modal.js` has finished initialising: **`TypeError: $ is not a function`, and
the whole app fails to boot.** This was not theorised — it was tried, it went
red in 69 unit tests, and it was reverted. Rule 9 in the round brief is real
and it bites in both directions: the rule is not only "do not add a top-level
read across a cycle", it is also **"do not add an import edge that drags an
existing top-level read into one"**. `togglePane` stays until `view.js`'s DOM
read moves, or until the `ui/` cycle is broken.

**What is still blocked, re-checked rather than assumed:**

- `canvas/room-draw.js`, `canvas/corners.js`, `canvas/interaction.js`, the rest
  of `canvas/split-room.js`, `squareCorner` in `canvas/snap.js`, the UI half of
  `canvas/merge-rooms.js`, `setMeasure`, the replaying half of
  `core/history.js` (`applyRoomSnap`/`applyFurnSnap`/`applyFloorSnap` and the
  six undo/redo entry points), and the rest of `plan/` — **all on the 48-name
  SCC**, not on anything smaller.
- `togglePane` — on the `view.js` top-level DOM read, above.
- `dragTree`/`treeDropSpot` and `dlgColor` — each reassigned from listeners
  that stay, so each needs a setter. Deliberately not spent: they buy a dozen
  lines apiece and unblock nothing.
- `retagItem` — filed under `library/`, per the `core/` round's note.

**Two smaller things worth carrying forward.**

- **ESLint cannot check a module specifier.** `import {sizeLabel} from
  '../model/measures.js'` lints clean — `no-undef` sees the name as declared by
  the import either way — but `sizeLabel` is exported by `canvas/draw.js`, and
  only running the suite finds it. Verify the *module*, not just the name.
- **The probe earns its keep, and it has one sharp edge.** It found every range
  in this round. But `index.html`'s regions contain `import` lines of their
  own, and those must be stripped from the probe body or it dies on a
  redeclaration. Worse, twice in this round a moved range *contained* an import
  line that also served code far outside it (`moreBtn`, and `sx/sy/wx/wy`).
  Deleting it is silent in the probe and loud in `no-undef` on the real file.
  Rule 5 exists for this; run `npm run lint` on `index.html` after every cut.


### Phase 3 progress — the `library/` + `io/` + SCC round

Done, baseline green (185 Vitest + 532 Playwright) between every one of the
twenty-two commits. `index.html`: 7,670 → 4,304 lines. `src/`: 32 → 60 modules.
**The SCC landed.** Four commits are declared code changes, each stated in its
own message; every other commit is move-only with a per-module byte-identical
diff in the message.

**The SCC was real, and it was the shape the `plan/` round said.** Re-derived
here independently with **espree + eslint-scope** rather than trusted: 49 names,
1,232 declaration lines, 1,326 lines with their comments — the same component,
off by one name from the earlier count. It went out in **one commit**, cut as
**28 spans into 15 modules** (5 extended, 10 new). Its closure had shrunk to
**ten** non-SCC names by the time it moved, each bound to a single SCC
neighbour, so they rode along.

The order that got there: `isCanvasMode` → `io/pickers.js` → `retagItem` →
`library/item-folders.js` → `core/migrate.js` → `market-subs` → `adhoc-folders`
→ `nav` → `io/export.js` → the five `select*` → `library/tree.js` →
`library/export.js` → the tile builders → **the SCC** → and then, in eight more
commits, everything it unblocked.

**The round's main structural finding: §3's `core/store.js` cannot hold
`migrate()`.** `migrate()` needs `syncWallOff` (`model/walls.js`) and `normHex`
(`canvas/draw.js`), both inside the canvas cycle, and `ui/panels.js` imports
`core/store.js`. So `core/store.js → canvas/draw.js` welds the canvas cycle onto
`modal.js ↔ panels.js`, and the merged cycle contains `canvas/view.js`'s
top-level `const cv=$('cv'), ctx=cv.getContext('2d')` — the exact boot failure
that reverted `togglePane`. A separate **`core/migrate.js`**, which nothing in
`ui/` or `canvas/` imports, adds no cycle at all. The same reasoning put
`savePlanImage` in `io/export.js` rather than `canvas/`, `setMode` in
**`plan/mode.js`** rather than `ui/panels.js`, and — finally — **`togglePane` in
`plan/mode.js`**, which is how that long-standing trap was resolved: by
placement, not by a code change. Nothing in `ui/` imports `plan/`.

**Rule 8 held, and the graph is now one big cycle.** After the SCC the module
graph has exactly two cycles: `modal.js ↔ panels.js ↔ tag-input.js`, and a
39-module one containing nearly everything else. **`ui/modal.js` stays outside
the big one**, which is what keeps `canvas/view.js`'s `$('cv')`,
`library/tree.js`'s `$('tree')`, `plan/item-list.js`'s `invBox` and
`plan/item-dialog.js`'s `let dlgColor=PALETTE[0]` resolving against fully
evaluated modules. This was simulated *before* the cut and re-checked after
every commit since, with a Tarjan run over the module import graph — never by
eye.

**The four declared code changes**, each its own commit, each a bare assignment
and nothing else:

| commit | binding(s) | why |
|---|---|---|
| `setGridDragItem` | `gridDragItem` | written by `bindLibGrid` (moved) *and* the libTreeBox drop listener (stayed); split out of `let dragLib=null, gridDragItem=null;` |
| `setPendingFit` | `pendingFit` | read/written inside `setMode`, written once by boot |
| `setLastMerge` | `lastMerge` | written inside `mergeLayouts`, and by two listeners that stayed |
| `setSpaceDown`, `setLastPX/PY/Mods` | four interaction lets | written by the pointer and Space listeners, which stay under rule 6 |

`setPendingFit` and `setLastMerge` are the two that are **not** in a commit of
their own — the binding cannot exist in `index.html` and in its module at the
same time, and sequencing them separately would have meant discarding a working
tree. Both are isolated by their commit's own move-only diff.

**The epilogue is the thing that bit hardest, twice, and it now has a check.**
`__rp` is **not linted** — ESLint never sees `test/epilogue.js` appended to
`index.html` — so a name that leaves `index.html`'s scope produces a bare
`ReferenceError: X is not defined` at module evaluation, 69 red unit tests, and
a **green build and a green browser**. It happened twice: `idFolder` after the
SCC, `INV_SCOPES` after `io/import.js`. Eleven names went this way in total and
are epilogue imports now: `exportPayload`, `idFolder`, `idLeaf`, `hasOpen`,
`fileSlug`, `applyImport`, `PREF_KEYS`, `INV_SCOPES`, `normItem`, `pickValues`,
`clone`. **There is now a standing audit** (see `test/README.md`) that reads
every name `__rp` and `GLOBALS` reference and checks each resolves in
`index.html`'s scope or in the epilogue's own imports. Run it after every move;
it is cheaper than a red suite and far cheaper than a silent one.

**Two tooling notes for whoever takes `blueprint/`.**

- The probe from the `draw()` round was replaced by a **real reference graph**:
  espree + eslint-scope over the script body, Tarjan for components, and a
  span-cutter that refuses to move a span containing an `import` line, a foreign
  declaration, or a top-level statement. That last check earned its keep twice —
  it caught two `bindLen('wallT', …)` registrations that a naive merge would
  have swallowed out of `plan/room-controls.js`.
- **ESLint still cannot check a module specifier**, and the import resolver
  used here inserts by name, so it can put a real name behind the wrong file.
  Only the suite finds that.

**What is left in `index.html`:** the blueprint region (102 declarations, ~2,120
lines) and eight other declarations — `paramMode`, `floorMenu` (blocked on
`bpUploadDialog`/`bpUndoImport`/`bpLastImport`), and the three drag-state lets
with their drop-spot helpers (`dragTree`/`treeDropSpot`, `dragLib`/`libDropSpot`,
`dragInv`), each reassigned from listeners that stay and so each wanting a
setter that buys a dozen lines. Everything else is listener registrations and
`boot()`. **The next round is `blueprint/`, and it has no gate in front of it.**


### Phase 3 progress — the `blueprint/` round

Done, baseline green (185 Vitest + 532 Playwright) between every one of the
twelve commits. `index.html`: 4,304 -> 1,806 lines. `src/`: 60 -> 81 modules.
**The JS extraction is finished.** What remains in `index.html` is the CSS, the
static HTML, the 91 listener registrations and the two calls that start
`edgePanTick()` and `boot()` — see "What is left in index.html" below, which is
written for the SCSS and HTML-partial rounds that come next.

**§3's file list was right this time, for the first time.** All twenty names it
guessed — `state`, `image`, `poly`, `pixels`, `walls`, `outlines`, `openings`,
`rectify`, `labels`, `regions`, `detect`, `ocr`, `draft`, `wizard`,
`step1-upload`, `step2-crop`, `step3-scale`, `mask-viewer`, `step4-review`,
`commit` — are real modules with those contents. Nothing had to be renamed or
refiled. The reason is that the blueprint region was written last, in one go,
with its own `/* ---- blueprint: x ---- */` banners, and those banners are
honest: every one of them is a clean cut on a blank line between whole
declarations. Finding C does not apply to code that was banner-organised from
the start.

| commit | kind | note |
|---|---|---|
| `setBpState`, `setBpRunSeq`, `setBpPasteFn` | **not move-only** | 4 sites; the step dialogs write all three |
| `state.js` + `image.js` | move-only | two leaves importing nothing |
| `poly.js`, `pixels.js`, `walls.js`, `outlines.js` | move-only | |
| `openings.js`, `rectify.js`, `labels.js`, `regions.js` | move-only | |
| `detect.js` + `ocr.js` | move-only | `bpAnalyse -> bpRunOcr` forces the pair |
| `draft.js`, `wizard.js`, `mask-viewer.js`, `commit.js` | move-only | |
| the four step dialogs | move-only | **the region's SCC, one commit** |
| `paramMode` -> `plan/mode.js`, `floorMenu` -> `plan/floors.js` | move-only | |
| `setDragTree`, `setDragInv`, `setDragLib` | **not move-only** | 10 sites |
| `treeDropSpot`, `dragInv`, `libDropSpot` into their panels | move-only | banners stayed with the listeners |
| un-IIFE `edgePanTick` and `boot` | **not move-only** | two wrappers, four lines |
| `src/boot.js` + `edgePanTick` -> `canvas/interaction.js` | move-only | |

**The region was almost a DAG, which is why it bisected so well.** A reference
graph over the 102 declarations found only four multi-member components, and
three of them are trivial (`bpRunSeq`/`bpPasteFn`; `bpRenderScaleSide`/
`bpBindScaleSide`; `bpRenderReview`/`bpBindOpens`/`bpBindReview`). The fourth is
the real one: **`bpUploadDialog` -> `bpCropDialog` -> `bpScaleDialog` ->
`bpReviewDialog`, each stage's Back handler calling the one before**, spanning
all four step modules. As in the `plan/` round, the check was made explicitly —
is the knot state or code? — and as there, every edge is a plain function call.
No setter breaks it, so the four step modules landed in one commit.

**Three setters were spent and they were the right three.** `bpState`,
`bpRunSeq` and `bpPasteFn` are each written from a step dialog, so each had to
become a setter before `state.js` could move. `setBpRunSeq` returns its
argument, because one of its two sites is `const runId=++bpRunSeq`. Nothing else
in the region is reassigned across a module boundary — `bpTessLoad` and
`bpLastImport` are both written only inside their own module.

**Rule 8's new instance: the step cycle, and then its disappearance.** After the
step commit the module graph had *three* cycles, the new one being exactly the
four step modules. That was safe — every edge is a function declaration, and the
only top-level binding among the four is `BP_STEPS`, an array literal that reads
no import. One commit later `floorMenu` moved into `plan/floors.js`, which
imports `blueprint/step1-upload.js`, and the step cycle merged into the big one.
Two cycles again, 45 modules in the big one, `ui/modal.js` still outside it.
Checked with Tarjan after every commit, never by eye.

**The epilogue audit fired three times in ten commits, and twice on `GLOBALS`.**
Ten names lost their last `index.html` reader this round: `roomHist`,
`furnHist`, `snapRoom`, `normLayout`, `polySimple` (with `bpCommit`/
`bpSeedHistory`), then `bpState`, `bpRebuild`, `fmtArea`, `PAL` (with the step
dialogs), then `bpLastImport` (with `floorMenu`). **`polySimple` and `bpRebuild`
are `GLOBALS` entries**, which assign inside a `try/catch` — both would have
gone missing silently and surfaced much later as `window.bpRebuild is not a
function` in `blueprint.spec.js`. All ten are epilogue imports now. The audit
was run after every commit and cost about a second each time.

**Four tools were built for this round and are worth keeping.** They live
outside the repo, but the shapes are what matter: (1) a reference graph over
`index.html`'s script body — espree + eslint-scope + Tarjan — that answers "what
does this span need" and "who still reads this name"; (2) a **span-integrity
guard** that refuses to cut a span across a declaration, a top-level statement
or an `import` line — it caught a real off-by-one immediately, where the
`labels` and `regions` banners have no blank line between them and a naive
`nextBanner - 2` swallowed the last line of `bpLabelBlocks`; (3) an **import
pruner** that removes from `index.html`'s import lines every name the remaining
monolith no longer references, which is rule 5 mechanised and is what kept the
warning count at 8 through all ten commits; (4) a **specifier check** — for
every `import {a, b} from 'x.js'` anywhere in the tree, assert that `x.js`
really exports `a` and `b`. That last one closes the gap the `plan/` round
flagged and the `library/` round repeated: **ESLint cannot check a module
specifier**, and an import resolver that inserts by name can put a real name
behind the wrong file. 1,385 names checked, all correct.

**`boot()` moved, and §3's shape for it turned out to be the wrong one.** §3
calls `boot.js` "the only module with top-level side effects". It does not need
to be, and should not be. Importing a `boot.js` that calls `boot()` at
module-evaluation time would run boot **before** index.html's 91 listener
registrations, because imports hoist and are evaluated ahead of the importing
module's body. It happens to work — `boot()` suspends on its first `await` and
resumes only after the whole module graph has finished evaluating — but that is
a subtle ordering argument to rest the entire boot path on, and nothing in the
suite would catch it if it stopped being true. So `src/boot.js` **exports**
`boot()` and index.html calls it at the exact line the IIFE occupied. Same for
the `edgePanTick` rAF loop, which went to `canvas/interaction.js`.

The consequence is worth stating plainly: **there are now no top-level side
effects anywhere in `src/`.** Every module defines and exports; nothing runs at
import time. Rule 6's exemption went unused.

Cost: one declared not-move-only commit that splits each IIFE into a
declaration plus a call — four lines, no line inside either body touched.

**What is left in `index.html` (1,806 lines).** Written out because the SCSS
split (A4) and the HTML partials (A5) need to know exactly what they are
working with:

| lines | what | goes to |
|---|---|---|
| 1-7 | doctype, `<html>`, `<head>`, meta, title, favicon | stays |
| **8-526** | **`<style>`** — 519 lines, 24 custom properties | **A4**, 15 SCSS partials |
| 527-528 | `</head>`, `<body>` | stays |
| **529-557** | the 26-`<symbol>` SVG sprite | **A5** `sprite.html` |
| 558-749 | `<div id="app">` — `<header>` 559-580, `<main>` 581-737 (both side panes), `<div id="paneLibrary">` 738-748 | **A5** `header.html`, `pane-left.html`, `pane-library.html` |
| 751 | the `#libFlash` toast div | **A5** |
| **753-764** | `<div id="modal" hidden>` | **A5** `modal.html` |
| 766-1804 | `<script type="module">` — see below | stays |
| 1805-1806 | `</body></html>` | stays |

§3's HTML-partial line guesses are very close (the markup never moved): sprite
529-557 as predicted, header 559-580 exactly, and only the `main`/`paneLibrary`/
`modal` boundaries drift by a line or two.

The 1,037-line script body is now, exhaustively:

- `"use strict";` (line 767), which must stay the first statement;
- **86 `import` lines**, each at the spot its code left;
- **91 listener registrations**, including the two pane-head ones inside a
  `for…of` over `[['headLeft','left'],['headRight','right']]`, the two
  `bindLen('wallT'…)`/`bindLen('trimD'…)` calls (which register input handlers),
  and the short-circuited `darkMQ.addEventListener && darkMQ.addEventListener(…)`;
- **two calls**, `edgePanTick();` and `boot();`, each on the line its IIFE used
  to occupy;
- **one `let`**, `libSearchT` — the `#searchBox` debounce handle, whose only
  reader is the `input` listener that stays. Moving it would separate a timer
  from its sole user and buy a line, so it was deliberately left, the same call
  the `canvas/` round made on the ten selection lets.

There is nothing else left to extract. A6 (per-module unit tests), A4 and A5 are
the remaining work.

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
