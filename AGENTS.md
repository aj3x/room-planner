# AGENTS.md

## What this is
Room Planner is a single-file, client-only web app: **all HTML, CSS, and JS live in [index.html](index.html)** (~2200 lines). There is no build step, no package.json, no bundler, no dependencies, and no test suite. Open the file directly in a browser (or serve it statically) to run/test changes — there is no `npm install` or `npm run` step.

To preview: `open index.html` or serve the folder with any static server, e.g. `python3 -m http.server`.

## Verifying changes
There is no automated test suite or linter. After editing, manually verify in a browser:
- Reload `index.html` and check the browser console for errors.
- Exercise the area you changed (e.g. draw/resize a room, place furniture, undo/redo, switch units) since there's no test coverage to catch regressions.
- Watch for `get_errors` diagnostics on `index.html` (it's plain JS inside `<script>`, so real syntax errors will surface there).

## Architecture (all inside index.html)
- **Units/geometry helpers** (top of `<script>`): everything is stored internally in **millimetres**; `parseLen`/`fmtLen` convert to/from the user's display unit (ft+in, in, cm, mm, m). Don't introduce a second unit system — always store mm and format at render time.
- **State**: a single global `S` object holds `layouts` (rooms), `inventory` (furniture items), `folders`, and UI prefs (unit, snap, mode). Each layout's room is a closed polygon: `room.points = [[x,y], ...]` (clockwise, mm).
- **Persistence**: `Store` wraps `window.storage` (if present) or falls back to `localStorage`. `save()` debounces writes. `migrate(st)` upgrades older saved-state shapes on load — **when changing the shape of `S`, add a migration step here** rather than assuming fresh state.
- **Undo/redo**: room edits and furniture edits have **separate** history stacks (`roomHist`/`furnHist`), keyed per-layout. Use `commitRoom()`/`commitFurn()` after any change that should be undoable — don't mutate state without a corresponding commit.
- **Rendering**: `draw()` redraws everything to `<canvas id="cv">` every time state changes (immediate-mode, no diffing/virtual DOM). Side-panel HTML is rebuilt via `render*()` functions (`renderRoom`, `renderWalls`, `renderInv`, `renderSel`, etc.) that re-set `innerHTML` and re-bind listeners — follow this same pattern for new UI rather than introducing a framework.
- **Side panels**: each `.pane` is a `.pane-head` rail (collapse button + vertical label) plus a `.pane-body`. `applyPanes()` drives `S.leftOpen`/`S.rightOpen` and the `lc`/`rc` classes on `<main>` that shrink the grid column to a rail; collapsing is desktop-only (narrow screens already swap panes via `#tabs`). Every `section` inside a `.pane-body` carries `data-sec` and folds shut via `S.secClosed` — new sections need a `data-sec` key or they can't be collapsed.
- **Row menus**: the `⋯` buttons open an anchored `openMenu(anchor, actions, title)` popup, not the modal. Actions that need more than one click (rename with a box, pick a folder, confirm a delete) open the modal *from* the menu. Renaming in place is `inlineEdit(el, value, done)`; because a row re-renders on a single click, click handlers on those rows go through `singleClick()`/`cancelSingleClick()` so a second click can become a double-click instead.
- **Reordering**: the layout tree and the inventory list use HTML5 drag-and-drop. `moveBefore(arr, movedId, targetId, after)` does the splice — folders and rooms live in separate arrays (`S.folders`, `S.layouts`), so a drop only reorders against its own kind and otherwise just reparents. `folderDescendant()` is the cycle guard.
- **Inventory scope**: `S.invScope` (`project` | `folder` | `room`, see `INV_SCOPES`) decides which rooms `usedCount()` counts, via `scopeLayouts()`. `folder` means the rooms sitting *directly* in the active room's folder — a subfolder is its own pool and never draws on the folder above it.
- **Modal dialogs**: implemented as a plain `<div>` (`#modal`), never `<dialog>` or `<form>` — the code comment explains both are blocked in sandboxed iframes this app may run in. Keep using `openModal()`/`closeModal()`.
- **Validation**: `validate(inst, poly)` / `insideRoom()` / `collides()` are the single source of truth for whether a piece of furniture placement is legal; reuse them rather than re-deriving overlap/bounds logic.
- **Open state**: an inventory item may carry `item.open = {top,bottom,left,right}` (mm out past its own footprint, in the item's unrotated frame). `openPoly(inst,item)` is that footprint in world space and `openConflicts()` reports, per placed id, what it runs into. This is deliberately kept **out** of `validate()` — an open footprint never makes a placement illegal, it only warns — so don't fold it into the validity path.

## Conventions
- No semicolon-free style, no modules/imports — everything is plain script-tag JS (`"use strict"`), ES2017-ish, no build tooling. Keep new code consistent with this (no TypeScript, no ESM imports).
- Keep everything in `index.html` unless the user explicitly asks to split files — splitting changes the "open the file and it works" deployment model.
- Angles: 0° points right, 90° points up (screen-plan convention), see `wallAngle`/`setWallAngle`.
