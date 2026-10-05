# Contributing

Two different things live under this title, and they have almost nothing to do
with each other:

- **[Contributing to the app](#contributing-to-the-app)** — code, styles,
  markup, docs.
- **[Contributing a marketplace](#contributing-a-marketplace)** — publishing a
  furniture catalogue that anyone can subscribe to. You do not need to touch
  this repository for that, beyond an optional one-line registry entry.

---

# Contributing to the app

## Getting it running

Node 18+.

```sh
npm install
npx playwright install chromium   # once, for the browser suite
npm run dev                       # http://localhost:5173, reloads as you edit
```

What ships is **one self-contained HTML file**. `npm run build` produces
`dist/index.html` with every script, style and icon inlined; it opens straight
off disk over `file://` and needs no server. That deployment model is the
product, not an implementation detail — a change that breaks it is a change
that breaks the app.

The repository's own `index.html` is the *source* entry point: a shell of
`<head>`, a stylesheet link, seven `<!-- @include -->` directives and one
`<script type="module">`. It is not the built file and it is not openable over
`file://` — module scripts are fetched under CORS rules an opaque `file://`
origin cannot satisfy. Use `npm run dev`, or build and open `dist/index.html`.

## Before you open a PR

```sh
npm run lint       # ESLint (correctness + import boundaries), then the cycle check
npm run typecheck  # tsc over the JSDoc types (see tsconfig.json)
npm test           # unit tests, then the browser suite (~45s)
npm run build      # must still produce one file
```

CI runs exactly these on every pull request. There are no flaky tests: a red
run means something is wrong, so investigate it rather than re-running it.

## Where code goes

```
src/kernel/            the document and its rules: state, transact(), signals,
                       undo, storage, migrations, units, geometry; model/ is the
                       shared model (walls, openings, validity, …). No DOM.
src/ui-kit/            generic UI: modal, menus, panels, drag and drop,
                       toasts, tag input, and the pieces components share
                       (parts.jsx: Field, RenameField, …; component.js)
src/features/<name>/   one feature each: canvas, mode, walls, openings, room,
                       furniture, floors, measure, walkpaths, layouts, library,
                       marketplace, io, blueprint. Its index.js is its public API.
src/app/               composition: boot(), the header and canvas controls
                       (chrome.jsx), the canvas's list of layers and tools,
                       every feature's shortcuts (shortcuts.js), the panes'
                       slots features fill (slots.js), main.scss
```

A feature imports `kernel/`, `ui-kit/`, its own files, and other features
**only through their `index.js`**; `kernel/` imports only itself; `ui-kit/`
imports `kernel/`. `npm run lint` enforces that, and fails on any import
cycle. AGENTS.md's *Adding things* says where a new feature, layer, tool,
panel, dialog or shortcut goes.

New code goes in the module or stylesheet where it belongs — **not in
`index.html`**, which is a shell of empty places the components render into.
A keyboard shortcut is an entry in its feature's `shortcuts` list with a
priority, not a listener: the registry (`ui-kit/shortcuts.js`) decides who
gets a key, so nobody has to add listeners in the right order.

[`AGENTS.md`](AGENTS.md) is the architecture guide and is worth reading before
a non-trivial change; it is written for coding agents but it is the same
information a person needs. [`DESIGN.md`](DESIGN.md) is the rule set for
anything with a visible surface — read it *before* adding UI, not after.

## Conventions that are not negotiable

- **Runtime dependencies are small, bundle into the single file, and need a
  stated reason.** Everything the app needs, it ships inside `dist/index.html`
  — a dependency that cannot be inlined there breaks the `file://` contract.
  Today they are `@preact/signals-core` (the reactive core), `preact` (the
  panels' components) and `@preact/signals` (the two joined); AGENTS.md
  gives each one's reason. Tooling is a `devDependency`.
- **`dist/` is never committed.** It is gitignored and CI fails if it is
  tracked. A 322 kB generated file touched by every change puts a merge
  conflict on every PR — the exact problem the module split exists to remove.
- **Design tokens stay CSS custom properties.** Dark mode works by re-declaring
  all 24 of them under `@media (prefers-color-scheme:dark)`. A Sass `$variable`
  is resolved at compile time and cannot cascade, so converting one deletes
  dark mode with every test still green. See `src/app/styles/_tokens.scss`.
- **Moves preserve blame.** Moving code between modules is done as a move and
  nothing else — byte-identical lines, no renames, no reordering, no
  reformatting, no "while I'm here" fixes. `git blame` and `git log --follow`
  keep working through a pure move, and that history is what settles an
  argument six months later. If you spot a bug while moving code, write it in
  [`BACKLOG.md`](BACKLOG.md) and move on. A behaviour change belongs in its own
  commit, stated in its message.
- **The test suite has a budget: under 20% of the codebase, ideally under
  10%.** It is at 11% of the app. A new test needs an argument about what it catches
  that nothing else does — "it covers a function" is not one; "a silent break
  here corrupts a user's saved project" is. Read
  [`test/README.md`](test/README.md) before touching `test/`; it also lists
  what the suite deliberately does *not* cover, so you know what you are
  inheriting.
- **No Prettier and no formatting rules.** The dense style here is a decision.
  Reformatting would destroy `git blame` across the whole repo for no
  functional gain. Match the surrounding code.
- **No import cycles.** `npm run cycles` (part of `npm run lint`) fails on
  one. Break it by moving the shared piece into a leaf, or by turning the back
  edge into a signal the other side subscribes to — not by a late-bound lookup.
- **`function` declarations stay `function` declarations** — never rewritten as
  `const f = () => {}`. It keeps the house style, and it is what made the
  cycles this codebase used to have survivable.
- ES2017-ish, `"use strict"`. JS with JSDoc types checked by `tsc` — no
  `.ts` source files; shared types live in `src/kernel/types.d.ts` and
  `src/features/canvas/types.d.ts`. `kernel/`, `ui-kit/`, every feature's
  public API and every `.jsx` component are strict (first line
  `// @ts-check`), and `npm run typecheck` fails if one stops being.
- **Panels are Preact components** (`.jsx`) that read the signals they show
  while rendering and re-render on their own; a pane section is a slot its
  feature fills (`sections` in the feature's `index.js`, one line in the pane
  in `index.html`). Dialogs are components too (`openDialog`,
  `ui-kit/modal.jsx`). A change commits through `transact()` and never calls a render
  function or names a panel. A box over a model value is a `Field`
  (`ui-kit/parts.jsx`): it keeps what is typed while the plan repaints and
  shows the model's value after a commit, refused or not. AGENTS.md's
  *Adding things* has the recipe.

## What review will look at

Beyond "does it work": whether a change to saved-state shape came with a
migration step (`src/kernel/migrate.js` — it runs on every load of every
returning user's data), whether an edit commits through `transact()` rather
than saving or repainting by hand, whether an import respects the feature
boundaries (lint says if not), whether new UI uses tokens rather than literals, and whether
new copy follows DESIGN.md's wording rules ("item", "Library", never "thing").

---

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
