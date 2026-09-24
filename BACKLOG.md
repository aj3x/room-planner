# Backlog

QOL and feature ideas not yet scheduled. Not prioritized within sections.

## Walls, pillars, windows, doors

- **Copy and paste** for these elements.
- **Manual node position input** as X/Y coordinates instead of the current
  end A / end B gap setting.
- **Doors and windows on interior walls.**
- **Click-and-drag placement** for doors/windows.
- **Click-and-drag to change interior wall thickness.**
- **Nudge with arrow keys** — works for furniture, not currently for walls.
- **Anchor point priority for manual length input** — typing a wall's length
  can extend/shorten it in the wrong direction and disturb corners already
  set.
  - Consider prioritizing 90° angles on the most recently selected walls, or
    letting the user lock/fix specific corners.
  - Consider whether rooms are conventionally drawn clockwise, and whether
    to enforce or notify about wall drawing direction instead.
- **Undo individual node/path placements** during manual room drawing —
  currently a mistake requires cancelling and redrawing the whole room.

## Multi-room / floor plan mode

Today each room ("layout") is independent; folders are purely organizational
(`S.folders`, nesting only). This section is about optionally connecting
rooms into a real floor plan — a bigger, multi-part feature. Not started;
captured here to scope before building any of it.

### 1. Floor plan folders ("unit" folders)

- A folder can be flagged as a **unit/floor plan folder**. Unlike a plain
  folder, it gets a **floor plan preview + editor**: rooms placed and
  connected spatially, not just listed.
- **Puzzle-piecing rooms together**, using doors as anchor points — align two
  rooms by snapping a door in one to a door in another.
  - Shortcut keys to rotate a room before placing it, when connecting.
  - Open question: alternative/complementary mechanism where an arrow key on
    an existing door **extends outward into a brand-new room file**, seeded
    with that door already placed — i.e. "grow the house" from a doorway
    instead of placing two existing rooms next to each other. Not decided
    whether this replaces or supplements manual puzzle-piecing.
  - Doors currently must be duplicated across two rooms to represent a shared
    opening — the connecting mechanism should remove that duplication.
- **Auto interior wall thickness** — infer/standardize thickness for interior
  walls instead of manual entry (flagged by the user as a priority: "pls I
  beg").
- Edits made inside an individual room's editor should be reflected live in
  the floor plan preview.
- Open question: should rooms be directly editable **from** floor plan mode,
  or only viewable there (edits happen by drilling into the room)? Leaning
  toward view-only in floor plan mode, not decided.
- Double-clicking a room in the floor plan preview should jump straight into
  that room's individual editor.
- Toggleable view options for rooms/furniture in the properties panel while
  in floor plan mode (see section 4 below for the specific list view).

### 2. Inventory counting tied to folder type, not a manual toggle

Today `S.invScope` (`project` / `folder` / `room`) is a global setting the
user picks manually. Proposal: remove that manual toggle (judged to be
unnecessary mental load) and instead derive counting behavior from **folder
type**:

- **Normal folder** — pure organization, doesn't change counting (stays
  count-per-room, the default).
- **Unit/floor plan folder** — count-within-folder. Doubles as the floor plan
  editor/viewer described in section 1. Cannot contain another folder that
  also counts-within-folder (no nested unit folders).
- **"Master" folder** (name a placeholder — needs a real name) —
  count-within-folder, *can* contain unit folders inside it. Does **not**
  itself get floor-plan editing/viewing (unit folders inside it keep theirs).
  Lets you pool inventory across multiple separate floor plans (e.g. several
  buildings on one property) without merging them into a single connected
  floor plan.
- Subfolder behavior is "transparent" to its parent's counting rule:
  - subfolder of a normal folder → stays count-per-room (default);
  - subfolder of a unit folder → counted into the unit's shared pool, and
    does not keep separate stock of its own;
  - subfolder of a master folder → same as above; a unit folder nested under
    a master folder keeps its own floor-plan viewer/editor.
- Net effect: normal folders for general organizing, unit folders for an
  actual connected floor plan, master folders for a controlled cross-unit
  pool while still allowing unrelated rooms/layouts outside it to place
  items without being locked out.

### 3. Alternate room layouts ("snapshots", like Lightroom)

Try different furniture arrangements of the *same* room without losing the
others.

- From a room's `[...]` menu (or a dedicated button): **"Create alternate
  layout"** — duplicates the current layout, and the original room slot in
  the tree becomes a small group containing both, e.g.:
  ```
  MAIN BEDROOM [+]
    A [•]  ...
    B [ ]  ...
  ```
- Variants are lettered (A, B, C, …) for identification.
- Only the variant marked **active** (eye icon / checkbox) is shown in the
  floor plan preview and counted toward inventory, when the room sits inside
  a unit/master folder.
- Variants support: set-active, drag-to-reorder, permanent delete. That's it
  — no other folder-like behavior.
- You don't need an active variant selected in order to edit any of them.
- **Room dimensions (the shape/walls) are shared across all variants of the
  same room** — only furniture placement differs per variant. (Confirmed,
  not an open question.)
- While editing one variant, inventory tracking behaves as if the other
  variants don't exist.

### 4. Floor plan mode — simplified panel view

While in floor plan mode, the properties panel should offer a condensed view
instead of requiring navigation through the folder tree:

- A simplified **room list** with checkboxes per alternate layout, for quick
  preview/testing, e.g.:
  ```
  LIVING ROOM
  KITCHEN
  BEDROOM 1   [A] [B] [C]
  BEDROOM 2   [A] [B]
  BATHROOM
  ```
- A **unit-wide inventory list** — name + color only, no measurements, no
  editing/placing from here — just a quick scan of what's used across the
  whole unit.
  - Default sort: **errors first, then in-use, then not-in-use.**
  - Filter for unused furniture.

### 5. "Impossible duplicate" detection

Because alternate layouts can be toggled active independently, it's possible
to end up with more copies of an item placed across active layouts than you
actually own (e.g. you own 1 of a chair, but it's placed in two rooms whose
layouts are both currently active).

- By default, placing an item you have no stock of should already be
  blocked — this case is specifically about a conflict that only appears
  once alt-layout toggles combine.
- Surface it as: a colored/patterned overlay on the offending item(s) in the
  floor plan preview, plus a warning icon next to that item in the unit
  inventory list (section 4).
- The same overlay should also appear inside an individual room's editor if
  that room holds one of the conflicting placements and its layout is the
  active one.
- Resolving any one of the conflicting placements (deleting/moving it) should
  clear the warning once the count is back within stock (partially, if more
  than one duplicate exists beyond stock).

## Known defects

- **Arriving in Floor mode leaves both floor panels stale.** `setMode('floor')`
  (`index.html` ~1988) seeds `floorSel` with the active room, baselines the
  arrangement and fits the camera, so the plan opens with that room drawn
  selected — but the render list it then runs is `renderRoomSel(); renderWalls();
  renderOpen(); renderSel();`, which does not include `renderFloorSel()`. And
  `renderFloorProps()` has exactly one caller: `renderFloorSel()`. So the
  Properties pane greets you with "Click a room in the plan to move or turn it
  here." for a room that is already picked, its From-left / From-top / Angle /
  Label fields never appear, and the Floor section shows whatever was last
  rendered into it. Clicking the room on the plan, shift-clicking a row in the
  tree, or anything else that calls `renderFloorSel()`/`renderAll()` puts it
  right. The one-word fix is to add `renderFloorSel()` to that list; not done
  here because Phase 3 is move-only. Found while writing the Floor-mode panel
  coverage; pinned by `test/e2e/panel-select.spec.js` ("CHARACTERIZED, NOT
  ENDORSED: arriving in Floor mode leaves both floor sections stale").

- **Filing an item into a folder derives its id prefix from the folder's
  *display name*, case and all.** `rehomeItemId()` builds the new id from
  `folderIdPrefix(folderId)`, which is `itemFolderPath(...).map(f=>idSlug(f.name))`
  (`index.html` ~6378-6402), and `idSlug` only strips characters outside the
  id charset — it does not case-fold. So dragging "sofa" onto a folder named
  **IKEA** files it as `IKEA/sofa`, while an item already sitting in that same
  folder because its id said so (`ikea/kallax`, placed there by
  `ensureItemFolderPath`) keeps its lowercase path. One folder, two id paths:
  the S3-style grouping the whole id convention exists for (`ikea/kallax/4x2`
  and `ikea/kallax/2x4` "sit in the same folder") silently stops holding for
  whichever half was not dropped there, and the divergence is invisible in the
  UI because the grid groups by `folderId`, not by id. Renaming the folder
  afterwards does not re-home anything either, so the prefix is a snapshot of
  whatever the name was on the day of the drop. Found while writing the
  `bindLibGrid` drop coverage; pinned by `test/e2e/panel-libgrid.spec.js`
  ("the drop files the item and renames its id under the folder"). Not fixed:
  Phase 3 is move-only.

- **"Added" never appears on a listing's Add button.** In
  `renderListingDetail` (`index.html` ~7572) the per-item handler is
  `addMarketItemToInventory(it); b.textContent='Added'; b.disabled=true;` —
  but `addMarketItemToInventory` ends in `save(); renderLibAll();`, which
  re-runs `renderListingDetail` and replaces the whole of `#listingBody`. The
  button the handler then marks is already detached, so what the user sees is
  the panel flashing back to "Loading…" and returning with every button still
  reading "Add". An item that was added is indistinguishable from one that was
  not, and clicking twice is the natural response — which lands on the
  "Already in your library" collision dialog. "Add all to library" has the
  same shape and the same outcome. The fix is to mark the buttons before the
  re-render, or to have the re-render derive the state from `S.inventory`.
  Found while writing the Phase 3.6 panel coverage; pinned by
  `test/e2e/panel-library.spec.js` ("renderListingDetail lists the bundle's
  items and adds them one at a time"). Not fixed: Phase 3 is move-only.

- **`renderSnap()` silently rewrites `S.snap` when the value is not in the
  list.** The picker is rebuilt from `SNAPS.imperial` or `SNAPS.metric`
  depending on `S.unit`, and if the saved snap size is not one of the six
  options it is reset to the list's **third** entry
  (`src/plan/room-panel.js`, `if(!list.some(([v])=>v===S.snap)) S.snap=list[2][0]`).
  Changing the display unit therefore changes the user's snap size, with no
  flash, no confirmation and no undo: 10 cm becomes 1 inch on the way to ft+in,
  and 1 inch becomes 5 cm on the way back — a round trip through the unit
  picker does not return the setting it started with. It bites code as well as
  users: anything that sets `S.snap` directly keeps it only until the next
  `renderAll()`, which is why `useCoarseSnap()` in the Playwright fixture has
  to set the unit too, and why `startSplitRoom()` (which calls `renderAll()`)
  drops a snap set just before it. Pre-existing; named by the `plan/` round and
  deliberately not fixed there because extraction commits are move-only.
  Pinned by `test/e2e/panel-room.spec.js` ("CHARACTERIZED, NOT ENDORSED:
  renderSnap silently rewrites S.snap…" and "…a snap set behind the picker
  survives until the next renderAll").

- **A room standing on a floor is invisible in the tree at boot.** `treeOpen`
  (`src/core/selection.js`) starts as an empty `Set` and is never persisted, so
  every floor and folder row renders collapsed on load. When the active room
  sits on a floor — the normal case once floors are used at all — the left pane
  opens with no row for the room the canvas is showing, no `.active` row
  anywhere, and nothing that reveals it short of finding and expanding the
  right floor by hand. `renderTree` has all it needs to auto-expand the
  ancestors of `S.active`; it does not. Pinned by
  `test/e2e/panel-tree.spec.js` ("CHARACTERIZED, NOT ENDORSED: the active room
  is not visible at boot when its floor is collapsed"). Not fixed: Phase 3 is
  move-only, and this is behaviour, not a move.

- **A placement that is already invalid can be dragged *further* out of the
  room.** `drag.loose` is seeded from `isBad(hit)` at pointerdown, and while it
  is true the `move` branch of `applyDragAt` (`index.html` ~3424) skips
  `slideToValid` entirely and accepts any position whose *centre* is still
  inside the room (`centreInside`). The intent is clear and right — a piece
  that does not fit has to be draggable at all, or it would be stuck — but the
  loose path does not distinguish "moving back towards legal" from "moving
  further out", so a bed already poking through a wall can be pushed another
  300mm through it. It goes strict again the instant the placement becomes
  valid (`if(v.ok) drag.loose=false`), so the state is not sticky. Found while
  writing the Phase 3.5 pointer coverage; pinned by `test/e2e/pointer-item.spec.js`
  ("CHARACTERIZED, NOT ENDORSED: a placement that already sticks out drags
  loose"). Not fixed: Phase 3 is move-only.

- **`sel = null` does not clear `selSet`.** Three sites assign `sel = null`
  directly (`index.html` ~1176, ~4205, ~9446) without going through
  `selectClear()`, so the multi-select set can survive a clear of the primary
  selection and leave the two out of sync. Pre-existing on `main` (not
  introduced by the blueprint merge); found during the Phase 0 merge audit.
  Every other path uses the `selectOnly`/`selectAdd`/`selectToggle`/
  `selectSet`/`selectClear` helpers that keep both in step.

- **`isFinite(null)` is `true`, so `null` coordinates survive normalisation.**
  `normLayout()` guards its numeric fields with `isFinite(p.y) ? p.y : 0`
  (`index.html` ~2168 for `floorPlace`, ~2136 for pillar `x`/`y`/`rot`). `null`
  coerces to `0`, so `isFinite(null)` is `true` and a `null` passes straight
  through, while a genuinely bad value like the string `"nope"` is correctly
  repaired to `0`. The result is a `floorPlace.y` or `pillar.rot` of `null`
  sitting in geometry code that expects a number. It mostly behaves as `0`
  downstream because `null` coerces again in arithmetic, which is exactly why
  it has gone unnoticed. `Number.isFinite` would reject it, as would an
  explicit `typeof x === 'number'` test. Found while writing the Phase 1
  characterization baseline; pinned by
  `test/unit/boot.test.js` ("edge: every dangling reference is repaired…" and
  "edge: the same isFinite(null) hole shows up on pillars").

- **A negative ft+in length does not survive a `fmtLen` → `parseLen` round
  trip.** `fmtLen` renders the sign once, on the front of the whole string
  (`-3' 6"`), but `parseLen` sums each term with its own sign, so it reads that
  back as −3ft **plus** 6in = −762mm rather than −1066.8mm. Every other unit
  round-trips correctly; ft+in is the only compound one and so the only one
  affected. A fix would have to either bracket the whole ft+in string or carry
  the sign onto every term. Pinned by `test/unit/units.test.js`
  ("a negative ft+in length does NOT round-trip (known defect)").

- **`migrate()` never validates `S.unit`.** It range-checks `mode`, `planMode`,
  `invScope` and `zoomSpeed`, but a saved state carrying a nonsense `unit`
  keeps it forever. `readImport()` *does* validate the same field
  (`index.html` ~9374), so the import path is stricter than the load path. The
  two halves of the unit system then disagree: `fmtLen` falls through to its
  ft+in `default:` branch while `parseLen`, finding no `BARE` entry, reads bare
  numbers as millimetres — so the app displays feet and inches but silently
  interprets typed numbers as mm. Only reachable through corrupt or hand-edited
  storage, since import filters it. Pinned by
  `test/unit/migrate.golden.test.js` ("migrate() does not validate S.unit").

- **The Library folder tree does not survive export/import.**
  `exportPayload()` writes the *layout* folder tree (`S.folders`) and the floors,
  but never `S.itemFolders` — the Inventory tab's own folder tree — while still
  writing each item's `item.folderId`. `readImport()`/`applyImport()` have no
  notion of it either, and `ITEM_SCHEMA.md` has no slot for it, so the Library
  tab's own Export has the same hole. Two things follow on import:
  (1) `item.folderId` is a dangling reference in the receiving project; and
  (2) `reconcileTags()` cannot explain the folder-inherited half of `item.tags`,
  so it folds those tags into `manualTags`, permanently promoting an inherited
  tag to a hand-picked one — after which re-filing the item no longer removes
  it. Replace-mode import does this immediately; merge-mode defers it to the
  next load, but it is equally permanent. Pinned by
  `test/unit/io-roundtrip.test.js` ("the Library folder tree does not survive
  export/import").

- **The app is not request-free on `file://`.** `ensureDefaultMarket()` runs
  during boot and fetches the built-in marketplace subscription from
  `raw.githubusercontent.com` (one manifest plus one index shard per
  marketplace — 4 requests today), on `file://` as much as over http. The app
  degrades gracefully when they fail, so it still *works* offline with no page
  error, but `.claude/plans/refactor-split.md` §5 states the deployment
  contract as "`dist/index.html` opened via `file://` works with **zero network
  requests**", and that is not true today — it was already untrue before this
  refactor branch. Either the plan's wording or the default subscription needs
  to change; whichever it is, it should be decided deliberately rather than
  discovered as an apparent Phase 2 regression. Pinned by
  `test/e2e/smoke.spec.js` ("dist/index.html boots and paints straight off disk").

- **A marketplace item's folder path does not find a folder that differs only
  in case.** `addMarketItemToInventory()` files an incoming item under its id
  path via `ensureItemFolderPath(parts)` (`index.html` ~6385), which matches an
  existing folder with `x.name===name` — exact, case-sensitive. Marketplace ids
  are lower-case by convention (`ikea/kallax/4x2`), so a user whose Library
  already has a folder called "IKEA" gets a second, separate folder called
  "ikea" beside it, and their IKEA items are split across two folders that look
  the same in the tree. Nothing warns, and the two never merge. Found while
  writing the Phase 3.6 marketplace coverage; pinned by
  `test/e2e/panel-market.spec.js` ("no collision: the item is copied in and
  filed under its id path"). Not fixed: Phase 3 is move-only.

- **Stepping out of a subscription answers the typed search about a different
  collection.** `renderLibContent()` routes to `renderMarketSub()` *before* the
  generic search view (`index.html` ~7625, and the comment there says so
  deliberately), so while a subscription is open the search box searches that
  marketplace's index. Press "Marketplaces" to go back and `nav.searching` is
  still set and the box still holds the query, but the render now falls through
  to `renderLibSearchResults()`'s marketplace branch — which searches the **ad
  hoc listings**. The user sees their own query, unchanged, answered with
  "Nothing matches “kallax” here." under a `Listings /` crumb, about a
  collection they never searched. Either the back-out should clear the search
  (as `goLibFolder` does) or the generic search should cover the subscriptions.
  Pinned by `test/e2e/panel-market.spec.js` ("leaving the subscription with a
  search still typed falls to the generic search view"). Not fixed: Phase 3 is
  move-only.

- **An index entry with a malformed id disappears without a word.**
  `subscribeMarket()` filters shard entries with
  `if(it&&it.id&&!idProblem(it.id))` (`index.html` ~6488) and says nothing
  about the ones it drops — not to the user, not to the console. Every other
  validation failure in that function throws a message the Add dialog shows;
  this one is silent, so a publisher's typo shows up only as a catalogue that
  is quietly short of items, on every client, forever. The same filter is the
  app's only protection against a malicious id, so it should stay — it is the
  silence that is the defect. Pinned by `test/e2e/panel-market.spec.js`
  ("a valid manifest plus its shards becomes one subscription and one index",
  which publishes seven entries and asserts the tile reads six). Not fixed:
  Phase 3 is move-only.

- **Opening a dialog and pressing Save re-rounds its lengths to display
  precision.** Every length field in `itemDialog` and `openingDialog` is filled
  with `fmtLen(mm, S.unit)` and read back with `parseLen`, and `fmtLen` rounds
  to the unit's displayed precision — two decimals for metres. So a field
  nobody touched still round-trips through that rounding on Save. The default
  door width is the clearest case: `openingDialog(null,'door')` seeds 813mm
  (a 32" door), the box reads "0.81 m" on a metric project, and pressing Save
  without touching anything stores **810**. The same applies to any existing
  opening or item re-saved from its dialog — the value drifts to whatever the
  current display unit can express, once per save, silently, and switching
  units between saves drifts it again. Found while writing the Phase 3.6
  dialog coverage; pinned by `test/e2e/panel-dialogs.spec.js` ("a new door
  defaults to 813mm and is added to the wall the menu was opened on"). Not
  fixed: Phase 3 is move-only.

- **Dead code the linter found.** ESLint (added in Phase 2, correctness rules
  only) reports seven unused bindings and dead stores in `index.html`. None is a
  behaviour bug; all are noise that will be carried into a module for no reason
  when Phase 3 extracts the regions they sit in, so they are worth clearing in a
  follow-up — not during extraction, which is move-only.
  - `folderPath` (~1162) and `walkTrace` (~1767): top-level functions with no
    caller anywhere in the file.
  - unused parameters: `len` (~3423), `tPart` (~7449).
  - dead stores: `a` (~7210), `inc` (~9535), `raw` (~10762) — each assigned and
    then overwritten or never read.
  They are reported as ESLint **warnings** rather than errors, deliberately:
  Phase 2 may not edit application code, and a lint that fails the build over
  findings nobody is allowed to fix would just get switched off. `no-undef`,
  the rule that matters for the extraction, is an error and is clean.
