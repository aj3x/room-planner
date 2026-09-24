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
and icon inlined and no external requests. Open it straight off disk, email it
to someone, or drop it on any static host — it works the same way.

## Testing

```sh
npm test         # unit tests, then the browser suite
npm run test:unit
npm run test:e2e
npm run lint
```

Unit tests run in Vitest; the browser suite runs in Playwright against both the
dev server and the built single file, so the thing that ships is the thing that
is tested. See [test/README.md](test/README.md).

## How the source is laid out

The app was a single 10,000-line `index.html` and is being taken apart into
modules so several people can work on it without colliding. That migration is
still in progress: `index.html` holds the HTML shell, the styles and the code
that has not moved yet, and `src/` holds what has.

```
src/core/     units, geometry, ids, state, storage, undo/redo
src/model/    walls, openings, validity, walk paths, measurements
src/ui/       modal, menus, panels, inline edit, drag and drop
src/canvas/   the view, the drawing pass, snapping, the interaction state
src/plan/     the side panels — layout tree, room panel, item list
```

Design rules — tokens, components, wording — are in [DESIGN.md](DESIGN.md).
Architecture notes for contributors and coding agents are in
[AGENTS.md](AGENTS.md). Known bugs and unbuilt ideas are in
[BACKLOG.md](BACKLOG.md).

## Licence

GPL-3.0. See [LICENSE](LICENSE).
