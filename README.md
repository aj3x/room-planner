# Room Planner

Plan a room, a floor or a whole house in the browser. Draw the walls, put the
doors and windows where they really are, then move furniture around until it
fits — with the awkward parts made visible: what a door needs to swing, what a
drawer needs to open, where you can actually walk.

Everything stays on your machine. There is no account, no server and no
analytics; your plans live in your browser's storage until you export them.

**[Open the planner](https://aj3x.github.io/room-planner/)**

## What it does

- **Rooms** of any shape — drag corners, type exact lengths, split one room in
  two or merge two into one. Lengths are stored in millimetres and shown in
  feet + inches, inches, cm, mm or metres, whichever you prefer.
- **Doors and windows** that know their own geometry: hinged, sliding, bi-fold
  or a plain opening, with the swing drawn so you can see what it blocks.
- **Furniture** from your own library, with stock counts, tags and folders.
  A piece that does not fit will not place, and one that opens outwards warns
  about what it would hit.
- **Floors** — arrange several rooms into a plan of the whole storey.
- **Blueprint import** — trace a photo of a floor plan into real rooms, with
  the room names and dimensions read off the image.
- **Measurements** that stay attached to what they measure.
- **Marketplaces** — subscribe to a catalogue of furniture published as a git
  repo. See [MARKET_SCHEMA.md](MARKET_SCHEMA.md) and
  [CONTRIBUTING.md](CONTRIBUTING.md) to publish one.

## Running it

Requires Node 18+.

```sh
npm install
npm run dev      # http://localhost:5173, reloads as you edit
```

```sh
npm run build    # -> dist/index.html
```

The build produces **one self-contained HTML file** with every script, style
and icon inlined. Open it straight off disk, email it to someone, or drop it
on any static host — it works the same way. (It is not quite request-free: at
boot it tries to fetch the built-in marketplace catalogue. That fetch failing
changes nothing else, which is what the `file://` test asserts.)

## Testing

```sh
npx playwright install chromium   # once
npm test         # unit tests, then the browser suite (~45s)
npm run test:unit
npm run test:e2e
npm run lint
```

109 Vitest tests and 26 Playwright ones. The browser suite runs twice — against
the dev server and against the built single file, sharing one set of goldens —
so the thing that ships is the thing that is tested. The suite is deliberately
small: test code is held under 10% of the codebase, and what it does *not*
cover is written down rather than left to be discovered. See
[test/README.md](test/README.md).

## How the source is laid out

The app was a single 10,893-line `index.html`. It has been taken apart into
modules so several people can work on it without colliding, and that is
finished: `index.html` is now a 1,068-line shell — a `<head>`, a stylesheet
link, seven include directives for the static markup, and one
`<script type="module">` that is imports, listener registrations and the call
to `boot()`. Everything else is **81 JS modules, 14 SCSS partials and 7 HTML
partials** under `src/`.

```
src/core/       units, geometry, ids, state, selection, storage, migrations, undo/redo
src/model/      walls, openings, validity, walk paths, measurements
src/ui/         modal, menus, panels, inline edit, drag and drop, toasts
src/canvas/     the view, the drawing pass, snapping, the interaction state
src/plan/       the side panels — layout tree, floors, room panel, item list, dialogs
src/library/    the Library and Marketplace UI
src/blueprint/  the blueprint import wizard
src/io/         export, import, file pickers
src/styles/     SCSS partials; main.scss is the @use manifest
src/html/       the static markup, included into index.html at build time
```

The build is what puts it back together into one file. Note that the source
`index.html` is a module entry point and so does **not** open over `file://` —
run `npm run dev`, or build and open `dist/index.html`.

Design rules — tokens, components, wording — are in [DESIGN.md](DESIGN.md).
Architecture notes for contributors and coding agents are in
[AGENTS.md](AGENTS.md). Known bugs and unbuilt ideas are in
[BACKLOG.md](BACKLOG.md). How to contribute — setup, the checks CI runs and
the conventions that matter — is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

GPL-3.0. See [LICENSE](LICENSE).
