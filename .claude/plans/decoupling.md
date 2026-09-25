# Decoupling — where the module split stopped short

Companion to [`refactor-split.md`](refactor-split.md). That plan got the code
out of `index.html` and into 81 modules; it succeeded. This one is about what
the split did **not** buy, measured rather than felt, and what it would cost to
finish.

Every number below is reproducible from the import graph — see
[§6 Measuring](#6-measuring) for the script.

---

## 1. The one finding that matters

**45 of the 81 modules in `src/` form a single strongly connected component.**

```
modules: 81   |  SCCs with >1 module: 2
SCC 1: 45 modules   blueprint/commit, blueprint/draft, blueprint/step1-4,
                    canvas/* (9), core/history, core/ids, core/migrate,
                    io/export, library/* (13), model/* (5), plan/* (8)
SCC 2:  3 modules   ui/modal, ui/panels, ui/tag-input
modules free of any cycle: 33
```

A strongly connected component means: from any module in the set you can reach
every other one by following imports, and get back. Those 45 files are not 45
modules. They are **one module with 45 entry points**. The directories
(`canvas/`, `plan/`, `library/`, `model/`, `core/`) are a naming convention
applied to a single tangle, not boundaries — nothing in the build, the lint
config or the tests would notice if they were renamed to `a/` through `f/`.

The practical consequences, in the order they will actually bite:

- **Nothing in the SCC can be unit-tested in isolation.** Importing
  `model/validity.js` evaluates 44 other modules, `canvas/view.js` among them,
  which is why `test/unit-setup.js` has to fabricate a jsdom shell with a real
  `#cv` before a single assertion runs. The test suite's shape is a symptom.
- **Import order is load-bearing and invisible.** ESM resolves cycles by
  handing out a partially-initialised namespace. It works today because every
  module in the cycle only *calls* its imports later, from inside a function.
  The day someone reads an imported `const` at module top level, the app breaks
  at evaluation with a `TypeError` and no obvious culprit. `AGENTS.md`'s "no
  top-level side effects anywhere in `src/`" rule is what keeps this standing —
  it is not a style preference, it is the load-bearing wall, and it is currently
  enforced by convention alone.
- **Tree-shaking can't help.** Everything reaches everything, so the single-file
  build inlines all of it regardless of what a given screen needs.

This is the honest version of "too many edges." It is worse than it feels from
the inside, because it is invisible at the file level: no single file looks bad.

---

## 2. What causes it — three specific edge classes

The cycle is not diffuse. It is created by three identifiable habits, and they
can be counted.

### 2.1 Layers import upward (`core/` and `model/` reach into UI)

`src/core/` is named as the foundation but is not one:

```
core/history.js  → ui/modal, canvas/draw, plan/floors,
                   plan/item-list, plan/room-panel, plan/selection-panel
core/migrate.js  → canvas/draw (normHex), library/item-folders, model/walls
```

`core/history.js` imports six renderers so that undo can repaint. That is the
single worst edge in the repo: it makes the history stack depend on the shape
of the side panels.

`src/model/` — the closest thing here to domain logic — does the same:

```
model/walls.js      → ui/flash, canvas/view
model/walkpaths.js  → canvas/view, canvas/draw  (it draws, from inside model/)
```

`model/measures.js`, `model/openings.js` and `model/validity.js` are clean:
they import only `core/geometry`, `core/state`, `core/open-state`. Those three
are the proof that the rest could be.

### 2.2 Features call each other's renderers directly

**39 cross-directory imports pull in a `render*`/`draw` function.** This is the
mechanism by which `plan/` ↔ `canvas/` ↔ `library/` fused. A mutation site does
not announce that something changed; it names every view that must now repaint,
which means it must know about every one of them.

### 2.3 Two edges drag the whole blueprint wizard in

```
plan/floors.js → blueprint/commit.js       (bpLastImport, bpUndoImport)
plan/floors.js → blueprint/step1-upload.js (bpUploadDialog)
```

Those are the *only* two inbound edges to `src/blueprint/`. Everything else is
one-way out (17 → `core`, 12 → `ui`, 4 → `canvas`, 3 → `plan`, 2 → `model`).
See §4.

---

## 3. Scoring the original critique

Four claims were put to the codebase. Two hold, two do not.

### "The app is starting to show too many edges" — **correct, and understated**

See §1. Not a feeling; 45/81 in one SCC.

### "The `S` singleton is powerful but risky" — **largely wrong; the real risk is elsewhere**

`core/state.js` is 82 lines and **imports nothing**. It is a genuine leaf: one
named object, a `setS` setter, and fifteen pure accessors (`L()`, `RP()`,
`itemOf`…). For an app whose entire persisted document *is* one JSON object
that gets saved wholesale and replaced wholesale on import, a single named
state object is the right call, and a reducer/action layer over it would add
ceremony without removing a failure mode. Leave it alone.

The diffuse mutable state is the part nobody named:

```
57 distinct setX() shims across src/
≈45 module-level `let`s they exist to write
  setRoomSel ×36   setMode ×26   setAlignNote ×19   setAlignGuides ×19
  setSel ×13   setMeasure ×10   setFloorSnapNote ×9   setFloorGuides ×9 …
```

`drag`, `drawState`, `wallDrawState`, `splitDrawState`, `measureOn`,
`alignGuides`, `treeOpen`, `mergeSel`, `nav`… These are a **second global state
layer** with no schema, no persistence, no migration, no single place to read it
from, and no documentation — spread across `canvas/interaction-state.js`,
`canvas/measure-state.js`, `core/selection.js`, `library/nav.js` and a dozen
others. They exist because the refactor needed a way for a staying listener to
write a binding it no longer owned, and `setX(v)` was the mechanical answer.

That is where the "stronger ownership of writes" instinct should be aimed — not
at `S`, which already has exactly one writer.

### "The shell-level listener pattern is a smell" — **correct, wrong reason**

The problem is not that registrations live in `index.html`. The constraint in
`AGENTS.md` §3 is real and well-argued: a module calling `addEventListener` at
import time is a top-level side effect *and* silently reorders that listener
ahead of every other. Keeping the registration in the shell is right.

The problem is what is *inside* the registrations:

```
index.html <script>   1039 lines
  86 import lines
 ~950 lines inside listener bodies

 165 lines  index.html:160   cv 'pointerdown'
  96 lines  index.html:378   document 'keydown'
  52 lines  index.html:1011  libTreeBox 'drop'
  44 lines  index.html:518   treeBox 'click'
  38 lines  index.html:617   treeBox 'drop'
```

`AGENTS.md:23` describes this script as "about ninety listener registrations."
That is true of the *count* and misleading about the *weight*. The `pointerdown`
handler is a 165-line mode dispatcher: pan check, custom-draw vertex snapping
with a close-the-polygon hit test, wall-draw with axis lock and a minimum-length
rule, split-draw boundary resolution, measure delegation, then floor-mode
rotate-handle hit testing and shift-click merge-set semantics. That is domain
logic, it is unreachable from the unit tests, and it is in the one file the
architecture says is a shell.

The constraint only requires that the **registration** stay put. It says nothing
about the body. `cv.addEventListener('pointerdown', onCanvasPointerDown)` obeys
`AGENTS.md` §3 exactly as written, and moves 165 lines somewhere testable.

### "The blueprint subsystem is too large to be just one feature" — **backwards**

`src/blueprint/` is 20 files and 2,562 lines, and it is **the best-isolated
subsystem in the repo**: two inbound edges (§2.3), everything else one-way out,
its own `state.js`, its own wizard step files. Its one internal cycle is
`step1-upload ↔ step2-crop ↔ step3-scale ↔ step4-review` — the wizard's own
back/next navigation, contained entirely within the feature, and the benign
kind. It is what the rest of the app was supposed to look like.

It appears in SCC 1 only because those two inbound edges close a loop through
`plan/floors.js`. Replace them with a registration — `floors.js` asks a small
registry for "the blueprint import entry points" instead of importing them —
and all 20 files leave the cycle at once. It is the cheapest structural win
available and it is roughly an afternoon.

The instinct to separate "core planner engine / blueprint import / UI layers /
external workflows" is right. Blueprint already did it. The others did not.

---

## 4. What to do, in order

Sequenced by ratio of structural payoff to risk. Each step is independently
shippable and independently revertable.

### Step 1 — Cut blueprint loose  *(small; highest payoff per hour)*

Introduce a tiny registry (`core/registry.js`: a `Map`, a `register(key, fn)`,
a `get(key)`; no imports). `blueprint/` registers `bpUploadDialog`,
`bpLastImport`, `bpUndoImport`; `plan/floors.js` looks them up. Registration
happens from `boot.js`, which already sits outside the graph and already runs
after the shell's listeners are bound.

Result: all 20 blueprint modules leave SCC 1, taking their wizard cycle with
them into a 4-module SCC of their own. Verified by re-running §6.

### Step 2 — Invert history's repaint  *(small)*

`core/history.js` should not know what a side panel is. Give it a
`onAfterRestore` callback list, populated by `boot.js`. The six renderer imports
become one array the boot sequence fills.

Same shape for `core/migrate.js`: `normHex` is a color utility that is in
`canvas/draw.js` for historical reasons and belongs in `core/`; `reconcileTags`
and `syncWallOff` should be passed in, not imported.

Measured effect of Steps 1+2 together: largest SCC **45 → 39**.

### Step 3 — Make `model/` a real domain layer  *(medium)*

Three of the five files are already clean. The other two are not:

- `model/walls.js`: drop `ui/flash` (return a result the caller flashes) and
  `canvas/view` (`snapPt` takes the view as an argument, or moves to `core/`).
- `model/walkpaths.js`: split. The reachability computation is domain logic and
  belongs in `model/`; the `ctx`/`addPoly` drawing belongs in `canvas/`.

Measured effect of Steps 1+2+3: largest SCC **45 → 32**.

Add an ESLint `no-restricted-imports` rule at this point: nothing in `core/` or
`model/` may import from `canvas/`, `plan/`, `library/`, `ui/` or `io/`. That
is what makes the step stick — the rule is the deliverable, not the edits.

### Step 4 — Named handlers out of the shell  *(medium, mechanical, low risk)*

Every listener body longer than ~10 lines becomes a named exported function in
the module that owns the concern; `index.html` keeps a one-line registration at
the exact spot it occupies now. Start with `pointerdown` (→
`canvas/interaction.js`) and `keydown` (→ a new `plan/shortcuts.js`) — those two
alone are 261 of the ~950 lines.

This is the same mechanical recipe as `refactor-split.md` §4 and carries the
same risk profile: it is a move, verified by the existing Playwright pointer
and smoke specs. It does not reduce the SCC, but it makes ~400 lines of
behaviour reachable from unit tests for the first time.

### Step 5 — The render knot  *(large; do not start before 1-4)*

What remains at 32 is `canvas/ ↔ plan/ ↔ library/`, held together by the 39
direct renderer imports (§2.2). The fix is the one real design change here: a
mutation announces *what changed*, and views subscribe to what they care about.

```js
// core/bus.js — a leaf, ~20 lines, no imports
emit('layout:changed'); emit('inventory:changed'); emit('selection:changed');
```

Views subscribe in `boot.js`. `draw()` stays immediate-mode — this is about who
*calls* the repaint, not how the repaint works, and it does not introduce a
framework (`AGENTS.md:86` still holds).

Do this incrementally, one event at a time, keeping the direct calls working
alongside until each is migrated. Estimated to take the largest SCC below 10.

---

## 5. What not to do

- **Do not replace `S` with a reducer.** §3. It is a leaf, it has one writer, and
  the document model genuinely is one object.
- **Do not move listener registrations out of `index.html`.** The reason in
  `AGENTS.md` §3 is correct. Move the bodies, keep the registrations.
- **Do not add a framework or a virtual DOM.** Immediate-mode canvas plus
  `innerHTML` panels is a deliberate, documented choice and is not the source of
  any problem in this document.
- **Do not reorganise directories.** Renaming folders does nothing to an SCC.
  Cut edges first; if the directories still look wrong afterwards, that is a
  separate and much easier conversation.
- **Do not grow the test suite to cover the tangle.** Tests are currently 1,435
  lines against ~12,100 of app — about 12%, comfortably inside the cap. Steps
  1-4 make the *existing* code testable; adding characterisation tests over
  untestable code would buy scaffolding instead.

---

## 6. Measuring

Rerun after each step; the SCC size is the acceptance criterion.

```js
// scripts/scc.mjs
import fs from 'fs'; import path from 'path';
const files = []; (function w(d){ for (const e of fs.readdirSync(d, {withFileTypes:true})) {
  const p = path.join(d, e.name); e.isDirectory() ? w(p) : p.endsWith('.js') && files.push(p); } })('src');
const g = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8'); const d = [];
  for (const m of s.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
    let t = path.normalize(path.join(path.dirname(f), m[1]));
    if (!t.endsWith('.js')) t += '.js';
    if (fs.existsSync(t)) d.push(t);
  }
  g.set(f, d);
}
let idx = 0; const I = new Map(), L = new Map(), on = new Set(), st = [], sccs = [];
function sc(v) {
  I.set(v, idx); L.set(v, idx); idx++; st.push(v); on.add(v);
  for (const w of g.get(v) || []) {
    if (!I.has(w)) { sc(w); L.set(v, Math.min(L.get(v), L.get(w))); }
    else if (on.has(w)) L.set(v, Math.min(L.get(v), I.get(w)));
  }
  if (L.get(v) === I.get(v)) {
    const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v);
    if (c.length > 1) sccs.push(c);
  }
}
for (const f of files) if (!I.has(f)) sc(f);
sccs.sort((a, b) => b.length - a.length);
console.log('modules:', files.length, '| cyclic groups:', sccs.length);
sccs.forEach((c, i) => console.log(`SCC ${i+1}: ${c.length}\n  ${c.map(x => x.replace('src/','')).sort().join(', ')}`));
```

Targets: **45 → 39** after Step 2, **→ 32** after Step 3, **→ <10** after Step 5.
Once it is below 10, the `no-restricted-imports` rule from Step 3 can be widened
into a real layering check and the number stops needing to be watched by hand.

---

## 7. Scorecard

| Claim | Verdict | Evidence |
|---|---|---|
| Too many edges | **Correct, understated** | 45/81 modules in one SCC |
| `S` singleton is the scaling risk | **Wrong** | `state.js` is an 82-line leaf, imports nothing, one writer |
| Real diffuse state | *(not raised)* | 57 `setX()` shims over ~45 module-level `let`s |
| Shell listeners are a smell | **Correct, wrong reason** | ~950 lines of logic in bodies; registration itself is fine |
| Blueprint is an unmanaged second app | **Backwards** | 2 inbound edges, one self-contained wizard cycle — the model to copy |
