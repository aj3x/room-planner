# ITEM_SCHEMA.md

## What this is

A field-level reference for the JSON shape of an **item** (a library/inventory entry — furniture, fixtures, anything placeable in a room), for people who want to hand-author their own items. Canonical normalization lives in `normItem()` in **[src/core/migrate.js](src/core/migrate.js)**. All lengths are stored internally in millimetres; `parseLen`/`fmtLen` convert to/from the user's display unit.

## Item

```json
{
  "id": "ikea/kallax/4x2",
  "name": "Kallax 4x2 shelf",
  "shape": { "type": "rect", "w": 1470, "d": 390 },
  "color": "#6e8b7a",
  "passThrough": false,
  "count": 2,
  "tags": ["ikea", "storage", "living room"],
  "open": null
}
```

- **`id`** (`string`): user-editable identifier. Must stay within the `idProblem()` charset (**[src/core/ids.js](src/core/ids.js)**) — letters, digits, `! - _ . * ' ( )` — and may use `/` as a path separator to group related items (e.g. `ikea/kallax/4x2`), similar to an S3 key.
- **`name`** (`string`): display name; defaults to `'Untitled'` when missing.
- **`shape`** (`Shape`): the item's footprint. See [Shape](#shape) below. A missing shape defaults to `{type:'rect', w:900, d:600}`.
- **`color`** (`string`): hex color, normalized via `normHex()` (**[src/canvas/draw.js](src/canvas/draw.js)**); falls back to `PALETTE[0]` (**[src/core/state.js](src/core/state.js)**) if invalid/missing.
- **`passThrough`** (`boolean`): when `true`, other items/placements are allowed to overlap this one (e.g. rugs, floor mats).
- **`count`** (`number`): how many of this item the user owns; defaults to `1`.
- **`tags`** (`string[]`): defaults to `[]`. In the Inventory tab, this is a *derived* field — the union of `manualTags` and any tags inherited from the item's library folder.
- **`open`** (`OpenSpec | null`): describes the space this item's open state (a door, a dresser drawer) reaches past its own footprint, in the item's own unrotated frame. `null` when the item doesn't "open out" (all sides zero). See [OpenSpec](#openspec).

### Inventory-tab-only fields

These are used by the Inventory tab for folder/tag management and are not read by Furniture-mode placement logic:

- **`folderId`** (`string | null`): the library folder this item is filed under. **This is a reference into a tree that no export writes** — see the warning below.
- **`manualTags`** (`string[]`): the tags picked by hand for this item; the authoritative source. `tags` is recomputed from `manualTags` plus the tags inherited from the folder's ancestry (`ancestorTags`/`applyTags`/`reconcileTags`, **[src/library/item-folders.js](src/library/item-folders.js)**).

#### The Library folder tree is not part of this schema, and `folderId` does not travel

The Library tab's folder tree lives in `S.itemFolders`, a top-level array of
`{id, name, parentId, tags:[]}`. **No export path writes it** — not
`exportPayload()` (**[src/io/export.js](src/io/export.js)**), which writes the
*layout* folder tree `S.folders`, and not the Library tab's own Export
(**[src/library/export.js](src/library/export.js)**), which writes
`{app, version, exported, inventory}` and nothing else. `readImport()` and
`applyImport()` have no notion of it either.

So if you are hand-authoring items for import, **leave `folderId` out** (or set
it to `null`). An exported item keeps whatever `folderId` it had, and in the
receiving project that id names nothing: the item is filed under a folder that
does not exist, so it appears neither in a folder nor at top level
(`itemsInFolder` matches on `(i.folderId||null)===(fid||null)`).

There is a second consequence worth knowing before you hand-author `tags`.
`reconcileTags()` explains `tags` as `manualTags` plus whatever the item's
folder ancestry contributes. With no folder to attribute them to, every tag
that was inherited gets folded into `manualTags` — permanently promoting an
inherited tag to a hand-picked one, after which re-filing the item no longer
removes it.

This is a **known defect, not a design**; it is written up in
[`BACKLOG.md`](BACKLOG.md) under `## Known defects` and pinned by
`test/unit/io-roundtrip.test.js`. It is documented here rather than fixed
because fixing it changes the file format, which is a decision this reference
does not get to make on its own. If it is fixed, this section and the
`folderId` bullet above both change.

## Shape

Discriminated by `type`. All dimensions are in millimetres.

```json
// rect
{ "type": "rect", "w": 900, "d": 600 }

// ellipse (bounding box)
{ "type": "ellipse", "w": 900, "d": 600 }

// lshape
{ "type": "lshape", "w": 900, "d": 600, "cw": 300, "cd": 300, "corner": "nw" }

// poly (custom outline, recentered around origin)
{ "type": "poly", "points": [[0,0], [900,0], [900,600], [0,600]] }
```

- **`w`, `d`**: overall width/depth in mm.
- **`cw`, `cd`** (lshape only): the cutout width/depth removed from one corner.
- **`corner`** (lshape only): which corner the cutout is removed from — `'ne'`, `'se'`, `'sw'`, or `'nw'` (default).
- **`points`** (poly only): an array of `[x, y]` mm pairs defining a custom outline.

## OpenSpec

```json
{ "top": 0, "bottom": 508, "left": 0, "right": 0 }
```

- **`top`, `bottom`, `left`, `right`** (`number`, mm): how far the item's open state extends past its own footprint on that side, in the item's own unrotated frame. All zero is normalized to `null` on the item (no open state).

Example — a 900×500mm dresser whose drawers pull out 508mm on the bottom edge:

```json
{
  "id": "dresser-1",
  "name": "6-drawer dresser",
  "shape": { "type": "rect", "w": 900, "d": 500 },
  "color": "#8a7256",
  "passThrough": false,
  "count": 1,
  "tags": ["bedroom"],
  "open": { "top": 0, "bottom": 508, "left": 0, "right": 0 }
}
```

## Minimum viable item

Every field has a sane default, so the smallest valid item is just:

```json
{ "name": "My Item", "shape": { "type": "rect", "w": 900, "d": 600 } }
```

`normItem()` fills in the rest: a generated `id`, `color` from the default palette, `passThrough: false`, `count: 1`, `tags: []`, `open: null`. It does not invent a `folderId`; `migrate()` coerces a missing one to `null`.

## A note on ids

If you're hand-authoring a batch of items to import, give each one an explicit `id` so imports are stable/repeatable. Ids may use letters, digits, `! - _ . * ' ( )`, and `/` as a path separator for grouping related items (e.g. `ikea/kallax/4x2`, similar to an S3 key). On import, an id that collides with an existing item is resolved automatically rather than overwriting it, so reusing the same id across re-imports of the same file is safe.

## Marketplace item files

A marketplace publishes items as individual files, each of them exactly this item shape plus two headers — `app: "room-planner-item"` and a `version` integer. See **[MARKET_SCHEMA.md](MARKET_SCHEMA.md)** for the full manifest/index/item-file/registry reference; `normItem()` needs no changes to read a marketplace item, since it already ignores unknown fields and defaults missing ones.
