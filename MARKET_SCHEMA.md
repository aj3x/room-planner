# MARKET_SCHEMA.md

## What this is

A field-level reference for the file formats a **marketplace** publishes: a plain git repo, no server, no database. A marketplace is just a URL to a `market.json` file — everything else is a convention that file declares. See **[ITEM_SCHEMA.md](ITEM_SCHEMA.md)** for the item shape itself; this doc only covers the headers and structure wrapped around it.

## Core principles

1. **Files in a git repo, no database, no server.**
2. **Copy semantics for inventory.** Adding a marketplace item copies it into `S.inventory`. The user's project never depends on the marketplace staying reachable.
3. **Updates ship as new ids.** A publisher who changes an item's geometry publishes it under a new id rather than overwriting the old one — the client cannot tell an update from a replacement, and users may have placed the old one.
4. **Items are flat.** No variants, no bundles, no cross-item references. A "set" is just several items filed under the same folder.
5. **No images.** Browse is text and tags; item color comes from the item file when previewed.
6. **Manual refresh only.** No polling, no ETag dance, no auto-update.
7. **The cache is disposable.** Nothing about it is required for correctness — a client that starts with an empty cache every time still works.

## `market.json` — the manifest

Always fetched first.

```json
{
  "app": "room-planner-marketplace",
  "version": 1,
  "name": "Sam's furniture",
  "index": { "shards": ["index.json"] },
  "itemURL": "items/{id}.json"
}
```

- **`app`** — must be exactly `"room-planner-marketplace"`. Anything else is refused.
- **`version`** — integer schema version. An unrecognized version is refused with a clear message — this is the migration escape hatch. **Never remove this field.**
- **`name`** — human-readable label shown in the UI.
- **`index.shards`** — array of URLs, resolved relative to `market.json`, each pointing at an index shard (below). Always an array, even for a single-shard catalog.
- **`itemURL`** — a template for fetching one item file. The client substitutes `{id}` with the item's id and does no other path-munging.

Deliberately absent: `author`, `license`, `catalogVersion`, `namespace`, `thumbURL`. Ids are already namespaced by their folder path, so `namespace` is redundant; license is a social concern, not a schema one; `catalogVersion` only matters for auto-refresh (not built); `thumbURL` only matters for images (not shipped). Any of these can be added later as an additive top-level key — a v1 reader ignores fields it doesn't know about.

## Index shard (e.g. `index.json`)

```json
{
  "app": "room-planner-marketplace-index",
  "version": 1,
  "items": [
    { "id": "ikea/kallax/4x2", "name": "Kallax 4x2", "tags": ["shelf", "storage"] },
    { "id": "ikea/kallax/2x4", "name": "Kallax 2x4", "tags": ["shelf", "storage"] }
  ]
}
```

Entry fields, complete list — **nothing else belongs here**, since every byte is paid on every catalog load by every user:

- **`id`** — same rules as an inventory id (`idProblem()` in [`src/core/ids.js`](src/core/ids.js)): letters, digits, `! - _ . * ' ( )`, `/` as a folder separator. No leading/trailing/doubled slash, no `..` part, no empty part.
- **`name`** — display name.
- **`tags`** — array of strings, used for filtering.

If a browse UI later needs a dimension preview, add `w`/`d` (integers, mm) — do not add shape geometry to the index.

**Sharding**: one shard is fine up to roughly 5,000 items (~400 KB raw). Past that, split by first path segment of the id (`index/ikea.json`, `index/herman-miller.json`, ...) and list every shard URL in `index.shards`. This is a publishing decision, not a client behavior change — the client always fetches every listed shard up front to build one in-memory index; a future client could fetch shards on demand instead, without any format change, because the shard list is already data.

## Item file

Same shape as an inventory item (`ITEM_SCHEMA.md`), plus two header fields:

```json
{
  "app": "room-planner-item",
  "version": 1,
  "id": "ikea/kallax/4x2",
  "name": "Kallax 4x2",
  "shape": { "type": "rect", "w": 770, "d": 390 },
  "color": "#6e8b7a",
  "tags": ["shelf", "storage"],
  "count": 1,
  "passThrough": false,
  "open": null
}
```

`normItem()` needs no changes to read this — it already ignores unknown fields and defaults missing ones. The item file's `id` should match its index entry's `id`; the client trusts the index entry's id (what the user actually selected) rather than enforcing agreement — a mismatch is the publisher's problem, not the client's.

## Registry

A curated list of marketplaces, same shape philosophy as everything else:

```json
{
  "app": "room-planner-registry",
  "version": 1,
  "marketplaces": [
    { "name": "Sam's furniture", "url": "https://raw.githubusercontent.com/sam/furniture/main/market.json" }
  ]
}
```

The app ships with a default registry file (`registry.json` at the repo root). Users can also paste any `market.json` URL directly — both paths lead to the same "subscribe to this marketplace" flow. Adding an entry to the shipped registry is a PR against `registry.json`; there is no approval server.

## Versioning policy

Two independent version numbers: the **manifest** version and the **item file** version (the index shard also carries one, for the same reason). The client always refuses a version it doesn't recognize — a publisher bumping a version and a client refusing the new format is always better than a client silently misreading it. Adding a field is never a version bump; only removing a field or changing what one means is.

## Explicitly out of scope

Variants, item references/bundles, cross-marketplace resolution, auto-refresh/polling, layouts, images/thumbnails, licensing metadata, curated/approved badges, ratings/reviews, private/authenticated marketplaces. Each can be added later as an additive change — designing for them now is what causes a migration later.
