# Contributing a marketplace

A marketplace is just a git repo with a `market.json` at its root — see **[MARKET_SCHEMA.md](MARKET_SCHEMA.md)** for the exact file formats. This page is the shorter, practical guide for publishing one.

## Guidelines

- **Ids are paths.** Use folders to group related items: `ikea/kallax/4x2`, not `kallax_4x2_ikea`. Room Planner treats everything sharing a folder as belonging together, in both your inventory and a marketplace browser.
- **Updates ship as new ids.** If you change an item's dimensions or shape, give it a new id — don't overwrite an existing one with different geometry. The client can't tell an intentional update from a different item entirely, and someone may already have the old one placed in a room.
- **Tags are search facets, not a product record.** Aim for 2–5 tags per item. If you find yourself wanting more than 10, you probably want structured fields (category, material, room) — which don't exist yet. Keeping tags few keeps the index small, since every tag is downloaded by everyone who browses your catalog.
- **Tags are lowercase, no punctuation.** `"living room"`, not `"Living Room"` or `"living-room"`. Consistency is what makes filtering actually work across items.
- **Keep the index lean.** An index entry is only `id`, `name`, `tags` — no dimensions, no color, no shape hints. That file is fetched in full every time someone opens your marketplace.
- **One shard is fine up to ~5,000 items.** Past that, split `index.json` by the first path segment of your ids (`index/ikea.json`, `index/herman-miller.json`, ...) and list every shard in `market.json`'s `index.shards`.

## Adding your marketplace to the default registry

The app ships with a small curated list in `registry.json` at the repo root. Open a PR adding your `{name, url}` entry to its `marketplaces` array. There's no approval process beyond ordinary code review — anyone can also skip the registry entirely and paste your `market.json` URL directly into the app's "Add marketplace" dialog.

## Testing your marketplace before publishing

Serve your repo's root locally (e.g. `python3 -m http.server` from the repo root) and paste `http://localhost:8000/market.json` into "Add marketplace." Check that:

- The manifest fetches and validates (`app`/`version` fields present and correct).
- Every shard listed in `index.shards` fetches.
- An item opens and previews correctly, and "Add to library" copies it into your inventory intact.
