# Frontend architecture: from layered files to feature slices

Goal: several developers can work on different features at once without editing
the same files or breaking each other through hidden shared state.

Baseline (2026-10-02, branch `refactor/modularize` @ e8e6436): lint 0 errors,
unit + 26 e2e green, 5 import cycles (largest 9 modules) across `library/`,
`canvas/`, `plan/`, `ui/` (modal/panels/tag-input) and `blueprint/` (step1–4).

## Problems this plan removes

1. Folders are technical layers (core/model/canvas/plan/bind/html/styles), so one
   feature (e.g. walls) spans ~7 files that every other feature also edits.
2. Hot shared files: `canvas/draw.js` (1047 lines, includes non-drawing logic like
   floor snapping), `plan/room-panel.js`, `boot.js wire()`, order-sensitive
   `document` listeners in `index.html` and `src/bind/*`.
3. Global mutable state with no owner: `S`, 10 selection lets, 6 interaction lets;
   57 files mutate state.
4. The mutation ritual `repaint(...); draw(); save(); commitX();` repeated at
   call sites (38 files call `save()`, 32 call `draw()`); mutators must know
   which panels exist.
5. Invisible dependencies: string-keyed registry, `paint:*` bus topics, global DOM
   ids (40 files use `$('id')`, 19 use `innerHTML`), import-time DOM reads, no types.

## Decisions (made; do not re-litigate)

- **Libraries:** `@preact/signals-core` (Phase 2) and `preact` (Phase 6) become
  runtime `dependencies`. They are bundled into the single `dist/index.html`, so
  the one-file / `file://` deployment contract is unchanged. AGENTS.md's
  "dependencies must stay empty" rule is rewritten to: *runtime deps must be
  small, bundle into the single file, and need a stated reason.* Immer is NOT
  adopted unless a phase proves it necessary.
- Canvas rendering, geometry, model code and gesture logic stay hand-written.
  No Konva/Fabric/XState/React/Redux.
- One-file deploy, `file://` boot, and saved-data compatibility (`migrate()`) are
  hard constraints. No change to the saved JSON shape without a migration.
- Test budget: test code stays **under 20% of app code, ideally ≤10%** (it is ~10%
  now). Measure before adding. Prefer pure-logic unit tests. Characterization
  tests written to make a phase safe are scaffolding: label them and delete them
  by the end of the phase that needed them. Tests that test removed mechanisms
  (e.g. bus/registry wiring) are deleted or rewritten, not kept alive.

## Working rules for every phase

- Work on the current branch. Commit in small logical commits with conventional
  messages (`refactor:`, `feat:`, `test:`, `docs:`, `chore:`) ending with the
  attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Never push. Never stage `.gitignore` (the user has an unrelated pending edit).
- Gate before declaring done: `npm run lint` (0 errors), `npm test` (all green),
  `npm run cycles` (no NEW cycles; phases that promise to remove cycles must),
  `npm run build` produces one file. Run the app (`npm run dev` or the e2e
  fixture) if behaviour is in doubt.
- Behaviour is preserved unless the phase says otherwise. If an e2e test must
  change, say why in the commit message.
- Update AGENTS.md / CONTRIBUTING.md / test/README.md / CODEOWNERS where the phase
  makes them wrong. Keep code comments about *what and why now*, not the history
  of how the code got here; delete history-narration comments in files you
  substantially rewrite.
- Out of scope: new features, UI/visual redesign, changes to saved-data shape.

## Phases (strictly sequential)

### Phase 1 — `transact()`: one place that commits a change
Add a kernel function (e.g. `src/core/tx.js`):
`transact(scope, fn, opts?)` where scope ∈ `room | furn | floor | lib | prefs | project`.
It runs `fn()` against live state, then does what the ritual did: bump rev,
commit the matching history stack (room/furn/floor; none for lib/prefs/project),
`save()`, schedule a canvas draw, and emit one `changed` notification carrying
the scope. Gestures: pointermove updates use a non-committing form
(`opts.history:false` or a `preview()` helper); pointerup commits once.
Convert every mutation site to it. Panel repaints may stay explicit in this phase
(Phase 2 removes them).
**Done when:** direct `save()`, `commitRoom/Furn/Floor()` and `draw()` calls exist
only in the kernel / canvas compositor / documented exceptions; undo granularity
is unchanged (the smoke undo tests pass unmodified).

### Phase 2 — Signals: views subscribe, mutators stop naming panels
Add `@preact/signals-core`. Per-scope revision signals bumped by `transact`;
selection (`core/selection.js`) and interaction state
(`canvas/interaction-state.js`) and view prefs become signals (no more
`let` + setter pairs). Each panel render runs in an `effect` that reads the
signals it depends on; renders must not rebuild an input that has focus (guard
or targeted update). The canvas redraw is an effect too.
Delete: `paint:*` topics and `repaint()`, `boot.js wire()`'s render list, the
`repaint.*` registry entries, explicit render calls at mutation sites.
`core/bus.js` and `core/registry.js` are removed entirely if nothing legitimate
remains; otherwise what remains is justified in a comment.
**Done when:** no mutation site calls a render function or names a panel.

### Phase 3 — Canvas as layers and tools
`canvas/draw.js` becomes a compositor (~100–150 lines) iterating registered
layers `{id, z, draw(ctx, view, state), hitTest?}`. Each drawing concern
(grid, walls, iwalls, pillars, openings, items, measures, walk paths, floor view,
overlays, handles, labels) becomes its own layer module. Non-drawing logic in
draw.js (floor snapping/picking/edge depths) moves to model modules.
Gestures become tools `{id, onDown, onMove, onUp, onKey?, cursor, overlay?}` with
one active tool; `canvas/interaction.js` becomes a dispatcher; gesture state lives
inside its tool.
**Done when:** adding a new layer or tool touches no existing layer/tool file.

### Phase 4 — Feature folders and enforced boundaries
Reorganise into:
```
src/app/        shell, boot, slots, global keyboard routing
src/kernel/     state, store/tx, signals, history, persistence, migrate, geometry, units, ids, color (no DOM)
src/ui-kit/     menu, modal, flash, panels, tag-input, dnd, inline-edit (generic only)
src/features/<name>/   model, commands, layer(s), tool(s), panel(s), html, scss, index.js, tests
  walls, openings, furniture (items/inventory/selection panel), floors, measure,
  walkpaths, layouts (tree), room (room props/shape/split/merge), blueprint,
  library, marketplace, io
```
Each feature's `index.js` is its public API. ESLint `no-restricted-imports`
(or equivalent) enforces: features import only `kernel/`, `ui-kit/`, and other
features' `index.js`; kernel imports nothing outside kernel; ui-kit imports only
kernel. Fix every remaining cycle (see baseline); `npm run cycles` fails
the build/CI on any cycle. SCSS partials move with their feature. Update
CODEOWNERS to per-feature paths, and AGENTS.md's layout section.
**Done when:** lint enforces the boundaries, zero import cycles.

### Phase 5 — Type checking
Add `typescript` (devDependency) and `npm run typecheck` (`tsc --noEmit` with
`checkJs`), wired into CI. JSDoc `@typedef`s for the saved state shape,
`transact` scopes, signals, layer/tool interfaces and each feature's public API.
Start strict on `kernel/` and the feature APIs; it is acceptable to leave inner
feature files at a looser level if justified.
**Done when:** `npm run typecheck` is clean and in CI.

### Phase 6 — Preact components; panels own their DOM
Add `preact` (use `@preact/signals` integration). Configure JSX in Vite (esbuild
`jsx: 'automatic', jsxImportSource: 'preact'`); keep the single-file build.
Convert panels to components mounted into named slots; partial HTML shrinks to
slot containers. No global ids shared across files, no `innerHTML` templates,
no import-time DOM reads, listeners on component roots instead of `document`.
Replace order-dependent `document` keydown listeners with a shortcut registry
with explicit scopes/priorities.
This phase may be split into commits per feature; do the side-pane lists first
(walls, openings, structures, items, layouts tree), then room/selection panels,
floors, library/marketplace, dialogs/modals, header, blueprint wizard.
**Done when:** `$('…')`/`innerHTML` are gone outside ui-kit internals and the
canvas element itself; `src/bind/` and `src/html/` partials are gone or reduced
to the shell.

### Phase 7 — Documentation and final sweep
AGENTS.md, CONTRIBUTING.md, test/README.md, CODEOWNERS describe the new
architecture accurately (how to add a feature, a layer, a tool, a panel; the
boundary rules; the test budget). Remove leftover scaffolding tests, dead code,
history-narration comments. Measure and report the test ratio.

## Orchestration

Sequential. For each phase: a dev agent implements and commits; a review agent
verifies the commit range against this plan and the gates; findings go back to
the dev agent; at most 5 dev↔review loops. If the loop limit is hit, a triage
agent diagnoses and produces a resolution or questions for the user.
Phase log (filled in by the orchestrator):

| Phase | Base SHA | Final SHA | Loops | Notes |
|-------|----------|-----------|-------|-------|
| 1 transact() | e8e6436 | 6bccc41 | 1 | PASS; nits fixed; added opts.canvas, rev bump limited to room/furn/lib/project; Selected-panel X/Y undo gap logged in BACKLOG.md |
| 2 signals | eef7fc8 | adbf951 | 2 | PASS; refused edits snap back, held panel released on change/click, restored field selected; registry kept for blueprint.*, plan.setMode/activateLayout, ui.flash (Phase 4 removes); room drag ~2x pointermove cost at 300 walls |
