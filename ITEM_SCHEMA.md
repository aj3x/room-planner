# ITEM_SCHEMA.md

## What this is

A field-level reference for the JSON shape of an **item** (a library/inventory entry — furniture, fixtures, anything placeable in a room), for people who want to hand-author their own items. Canonical normalization lives in `normItem()` (**[index.html](index.html)**, mirrored by hand in **[items.html](items.html)** per AGENTS.md). All lengths are stored internally in millimetres; `parseLen`/`fmtLen` convert to/from the user's display unit.

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

- **`id`** (`string`): user-editable identifier. Must stay within the `idProblem()` charset — letters, digits, `! - _ . * ' ( )` — and may use `/` as a path separator to group related items (e.g. `ikea/kallax/4x2`), similar to an S3 key.
- **`name`** (`string`): display name; defaults to `'Untitled'` when missing.
- **`shape`** (`Shape`): the item's footprint. See [Shape](#shape) below. `items.html` defaults a missing shape to `{type:'rect', w:900, d:600}`.
- **`color`** (`string`): hex color, normalized via `normHex()`; falls back to `PALETTE[0]` if invalid/missing.
- **`passThrough`** (`boolean`): when `true`, other items/placements are allowed to overlap this one (e.g. rugs, floor mats).
- **`count`** (`number`): how many of this item the user owns; defaults to `1`.
- **`tags`** (`string[]`): defaults to `[]`. On `items.html`, this is a *derived* field — the union of `manualTags` and any tags inherited from the item's library folder.
- **`open`** (`OpenSpec | null`): describes the space this item's open state (a door, a dresser drawer) reaches past its own footprint, in the item's own unrotated frame. `null` when the item doesn't "open out" (all sides zero). See [OpenSpec](#openspec).

### items.html-only fields

These are used by the library UI (`items.html`) for folder/tag management and are not read or written by `index.html`:

- **`folderId`** (`string | null`): the library folder this item is filed under.
- **`manualTags`** (`string[]`): the tags picked by hand for this item; the authoritative source. `tags` is recomputed from `manualTags` plus the tags inherited from the folder's ancestry (`ancestorTags`/`applyTags`/`reconcileTags`).

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

`normItem()` fills in the rest: a generated `id`, `color` from the default palette, `passThrough: false`, `count: 1`, `tags: []`, `open: null`.

## A note on ids

If you're hand-authoring a batch of items to import, give each one an explicit `id` so imports are stable/repeatable. Ids may use letters, digits, `! - _ . * ' ( )`, and `/` as a path separator for grouping related items (e.g. `ikea/kallax/4x2`, similar to an S3 key). On import, an id that collides with an existing item is resolved automatically rather than overwriting it, so reusing the same id across re-imports of the same file is safe.
