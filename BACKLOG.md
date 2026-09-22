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

### 1. Floor plan folders ("Floor" folders)

- A folder can be flagged as a **Floor** (floor plan folder). Unlike a plain
  folder, it gets a **floor plan preview + editor**: rooms placed and
  connected spatially, not just listed.
- **Rooms connect through doors ("doorway room-growing")** — this is the
  mechanism, not manual puzzle-piecing of independently-placed rooms. An
  arrow key on an existing door extends outward into a **brand-new room
  file**, seeded with that same door already placed at the matching spot —
  i.e. you grow the house outward from a doorway, rather than placing two
  existing rooms next to each other and aligning them by hand.
  - Shortcut keys to rotate the new room before it's placed, if needed.
  - Doors currently must be duplicated across two rooms to represent a shared
    opening — this mechanism removes that duplication (one door, shared by
    construction).
- **Auto interior wall thickness** — infer/standardize thickness for interior
  walls instead of manual entry (flagged by the user as a priority: "pls I
  beg").
- Edits made inside an individual room's editor should be reflected live in
  the floor plan preview.
- Whether rooms are directly editable from floor plan mode itself, vs.
  view-only there (edits happen by drilling into the room): leaving this
  unresolved for now — only worth deciding once the rest of floor plan mode
  is built and it's clear whether it's actually needed.
- Double-clicking a room in the floor plan preview should jump straight into
  that room's individual editor.
- Toggleable view options for rooms/furniture in the properties panel while
  in floor plan mode (see section 4 below for the specific list view).

### 2. Inventory counting tied to folder type, not a manual toggle

Today `S.invScope` (`project` / `folder` / `room`) is a global setting the
user picks manually. Proposal: remove that manual toggle (judged to be
unnecessary mental load) and instead derive counting behavior from where a
room sits in the tree, using a fixed hierarchy:

```
Home                    (top-level, plain organizational folder)
  Floor                 (= a floor plan / unit folder, e.g. "1A", "1B" for
                          two floor plan options of the same building level)
    Room                (a room; can have alternate layouts, see §3)
```

- **Home** — pure organization, doesn't change counting (stays
  count-per-room, the default). Can hold multiple Floors (e.g. separate
  buildings, or separate levels).
- **Floor** — a floor-plan/unit folder: count-within-folder, and this is the
  level that gets the floor plan preview/editor from section 1. Two floors
  can represent alternate plans of the same physical level (e.g. "1A"/"1B")
  the same way rooms get alternate layouts in section 3.
- **Room** — sits inside a Floor; its alternate layouts (§3) are what gets
  swapped/toggled at the Floor level above it.
- This replaces the earlier "master folder" idea — no longer needed now that
  Home is just a plain organizational top level and Floors are the only
  count-within-folder unit.

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
  a Floor.
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
- A **floor-wide inventory list** — name + color only, no measurements, no
  editing/placing from here — just a quick scan of what's used across the
  whole floor.
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
  floor plan preview, plus a warning icon next to that item in the floor
  inventory list (section 4).
- The same overlay should also appear inside an individual room's editor if
  that room holds one of the conflicting placements and its layout is the
  active one.
- Resolving any one of the conflicting placements (deleting/moving it) should
  clear the warning once the count is back within stock (partially, if more
  than one duplicate exists beyond stock).
