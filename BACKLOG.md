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

- **`sel = null` does not clear `selSet`.** Three sites assign `sel = null`
  directly (`index.html` ~1176, ~4205, ~9446) without going through
  `selectClear()`, so the multi-select set can survive a clear of the primary
  selection and leave the two out of sync. Pre-existing on `main` (not
  introduced by the blueprint merge); found during the Phase 0 merge audit.
  Every other path uses the `selectOnly`/`selectAdd`/`selectToggle`/
  `selectSet`/`selectClear` helpers that keep both in step.
