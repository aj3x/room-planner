# Split room: divide one room into two

Branch `feat/blueprint-uploader`. The counterpart to the merge feature
(`mergeGeometry`/`mergeLayouts`, commit `adfe8ba`): pick a room, draw a
dividing line across it with the same snapping as drawing a new wall, choose
solid wall or open pass-through, get two rooms back.

Reuses `mergeSplice`'s corner-insertion logic and detached-`work`-struct
validation pattern, the interior-wall-drawing tool's snap/interaction shape
(`wallDrawState`, `snapWallPoint`, `drawWallDrawOverlay`), and the merge
feature's single-slot undo pattern (`lastMerge`/`mergeUndo` → `lastSplit`/
`splitUndo`). All in `index.html` — no build step, no test suite; verified by
hand in a browser (see below).

---

## Done (uncommitted, on top of `068a025`)

### S0: entry points
- [x] `layoutMenu(id,anchor)`: `Split room…` next to `Duplicate`, calling
      `startSplitRoom(id)`
- [x] `treeBox`'s `contextmenu` listener: when `mergeSel.size!==2` after
      marking, opens a single-item `menuAtPoint` with `Split room…` instead
      of falling through to nothing; the `size===2` merge-pair path is
      untouched — right-clicking one of an already-marked pair still means
      "merge these two"
- [x] New `contextmenu` branch on `cv`, guarded by `roomMode() && !drawState
      && !wallDrawState && !splitDrawState && !measureOn`, opens
      `Split room…` for `S.active`
- [x] `startSplitRoom(id)`: refuses with a flash if `!polySimple(l.room.points)`
      (a self-crossing custom-drawn room); otherwise cancels any other
      transient draw state, activates the room, switches to Room mode,
      `fit()`s (centers on the room), and flashes the instructions

### S1: split-drawing mode
- [x] `let splitDrawState=null;`, mirroring `wallDrawState`
- [x] `boundaryHit(pt)`: accepts a snapped point only if `nearestOnWalls(pt).d
      <= 1` (essentially exactly on the room's own outline) — rejects a
      point that only snapped onto a freestanding interior wall or the grid
- [x] `pointerdown`: same `axisLockFrom`/`snapWallPoint` snap as the wall
      tool, gated through `boundaryHit`; a miss flashes and stays in split
      mode without recording the click
- [x] `mousemove`/`keydown` guards extended for `splitDrawState`;
      `cancelSplitDraw()` on Escape
- [x] `drawSplitOverlay()`, modeled on `drawWallDrawOverlay()`, called from
      `draw()` — dashed line between the anchor and the live boundary-snapped
      cursor point
- [x] `startWallDraw()`/`startCustomDraw()`/`setMeasure(true)` each cancel a
      stray `splitDrawState` too, so switching tools mid-draw can't leave it
      stuck

### S2: split geometry (`trySplitLine`)
- [x] Rejects same-edge hits, a segment that crosses any *other* polygon
      edge (`segHit`, excluding the two edges the endpoints sit on), and a
      segment whose midpoint fails `pointInPoly` — no infinite-line
      crossing-counting anywhere (confirmed unsound for concave rooms, see
      verification below)
- [x] `resolveHit`/`mergeSplice`-based corner insertion, processing the
      higher original edge index first
- [x] **Bug found and fixed during testing**: inserting the *second*
      (lower-index) corner shifts the *already-resolved* higher index (array
      `splice` shifts everything at or past the insertion point) — the first
      real test produced a triangle instead of two rectangles. Fixed by
      tracking each insertion's position and bumping the previously-resolved
      `hiIdx` when the second insertion's position falls at or before it.
- [x] Chain-splits `work.points`/`wallOff` into `chainA`/`chainB` +
      `offA`/`offB`; validates both with `polySimple()`
- [x] Remaps `openings`/measure wall-anchors into each chain's local
      numbering (no edge removed here, only added, so nothing needs
      dropping — simpler than merge)
- [x] Classifies `pillars`/`iwalls`/`placed` to a side by centre-point
      `pointInPoly`
- [x] Detects straddling items/pillars (`worldPoly` vs the cut segment via
      `segHit`) and iwalls (endpoints on different sides) for the
      confirmation step's warning copy

### S3: solid/open choice + commit
- [x] Single `openModal`: primary OK **"Split with a wall"**, secondary
      body button **"Split and leave it open"**, straddling-item count
      folded into the body text
- [x] Room A (survivor) keeps its id/name/`room.wall`/`room.floor`/
      `trimOn`/`trim`; Room B is new, same `folderId`/`floorId`/`floorPlace`
      as A unchanged (no `floorXf`/`floorPt` transform needed — both chains
      stay in A's original local frame)
- [x] `S.layouts.splice(...)` in-place insertion, like `duplicateLayout`
- [x] `syncWallOff`/`clampOpenings`/`pruneMeasures` on both A and B before
      seeding fresh one-entry `roomHist`/`furnHist` baselines
- [x] `if(A.floorId) delete floorHist[A.floorId];`
- [x] Tail: clears `mergeSel`, re-renders, saves, flashes success
- [x] Modal's `onClose` always calls `cancelSplitDraw()`

### S4: undo
- [x] `let lastSplit=null;` single slot, mirroring `lastMerge`
- [x] `splitUndo()`: `askConfirm`-wrapped, restores A, drops B, restores A's
      saved history
- [x] `layoutMenu` shows "Undo this split…" while `lastSplit &&
      lastSplit.aId===id`

### Verification (manual, in a real browser via a local static server)
- [x] No console errors across the whole session
- [x] Row menu, tree right-click, and canvas right-click all open split mode
      correctly; right-clicking a merge-marked pair still offers merge
- [x] Orthogonal split (rectangle, wall-midpoint to wall-midpoint): both
      halves came back as clean 7'×12' rectangles (84.1 + 84.1 = 168.2 sq ft)
      — this is what caught the S2 index-shift bug above
- [x] Diagonal split (corner-ish to corner-ish): triangle + pentagon, shared
      cut edge same length on both sides, "Open" shown correctly in the
      Walls list for the open variant
- [x] Rejections all fire correctly: clicking off the boundary, clicking the
      same wall twice, and — on an L-shaped room — a line that clips through
      the notch ("crosses the room's own wall"); the anchor point survives a
      rejection so the user can retry immediately
- [x] A valid diagonal split of the same L-shaped (concave) room produced a
      correct 6-wall polygon on one side, preserving the notch
- [x] A placed item straddling the cut triggered the warning copy and ended
      up fully in the correct room's `placed` array (not duplicated, not
      left in both)
- [x] "Undo this split…" restored the original single room exactly, each
      time, across three separate splits in the same session
- [x] All test rooms/state created for verification were deleted afterward;
      the room list was confirmed back to its pre-test contents

Not implemented as separate polish (acceptable per the plan, not required by
the request): no live preview of the two resulting polygons while dragging
(the preview is a plain dashed line, like the wall tool's); no repositioning
of a straddling item into the room it lands in (it just moves fully into
whichever side its centre point lands on, exactly as the confirmation copy
says).

---

## Done: follow-up edits (uncommitted, on top of the above)

Requested: easier snapping to straight lines (0°/45°/90°), multi-point
dividers (bend the cut with interior points anywhere inside the room), and
confirmation that only the first/last points must sit on the room's boundary.

- [x] `splitAngleSnap(prev, raw, hard)`: magnet-snaps to the nearest 45°
      multiple off the previous placed point whenever the raw angle is
      within `SPLIT_ANGLE_TOL` (6°) of one — automatic, no modifier needed;
      `hard` (Shift held) forces the snap regardless of how far off the raw
      angle is, mirroring the wall tool's own Shift-axis-lock idiom but
      generalized from 90° to 45° multiples
- [x] `splitDrawState` reshaped from a single `{a}` anchor to `{pts:[...]}`:
      `pts[0]` is always the start boundary hit; every further click either
      **finishes** the line (lands on the boundary via `boundaryHit` — same
      1mm tolerance as before) or **bends** it (lands strictly inside the
      room via `pointInPoly` — pushed as a plain interior point) or is
      **rejected** (lands outside the room entirely)
  - [x] `pointerdown`: rewritten around `pts` — first click on the boundary
        starts the line; a later click on the boundary calls
        `trySplitLine(pts[0], pts.slice(1), hit)`; a later click inside the
        room extends the polyline; a later click outside the room flashes
        "Stay inside the room" and is not recorded
  - [x] `drawSplitOverlay()`/`splitCursorPoint()`: draws the whole confirmed
        polyline plus a live rubber-band segment to the angle-snapped,
        wall/grid-magnetized cursor position, so the preview always matches
        exactly what the next click would place
- [x] `trySplitLine(hitA, mid, hitB)`: generalized from a single segment to
      an arbitrary-length path
  - [x] same-edge rejection (`hitA.i===hitB.i`) unchanged — start and end
        still can't share a wall
  - [x] every segment checked against every *other* room edge (excluding
        only the edge the very first point sits on, for the first segment,
        and the edge the very last point sits on, for the last) — replaces
        the old single-segment exclusion pair
  - [x] **new**: the path is checked against **itself** (non-adjacent
        segment pairs) so a self-crossing divider is rejected before it ever
        reaches the polygon-splitting step
  - [x] every segment's midpoint still checked `pointInPoly`, one check per
        segment instead of one for the whole line
  - [x] chain construction generalized: `chainA = arc(p..q) + reverse(mid)`,
        `chainB = arc(q..p) + mid` — falls back to the exact original
        single-edge behaviour when `mid` is empty (verified: an unbent
        2-click line still produces identical results to before)
  - [x] `wallOff`/`newEdgeCount`: however many segments the drawn path has
        (`mid.length+1`) all get the user's solid/open choice, applied in
        `commitSplit` via `Array(ctx.newEdgeCount).fill(openWall)` instead of
        the old single-element array
  - [x] straddling detection (`crossesCut`) now checks every segment of the
        path, not just the one original segment
- [x] `startSplitRoom`'s flash instructions updated to mention bending the
      line and finishing on another wall

### Verification (manual, same local-server browser setup as before)
- [x] A 2-click straight split (no interior points) still works identically
      to before — confirms the `mid.length===0` fallback path
- [x] A 4-click zigzag (start → two interior points → end) produced two
      valid 6-wall polygons whose shared boundary lengths/angles matched
      exactly across both sides (e.g. `4'2 7/8" · 135°` on one side,
      `4'2 7/8" · 315°` on the other — same edge, opposite direction), areas
      summed back to the original room's total
- [x] One interior point was deliberately clicked ~20° off any 45° multiple
      — it was **not** forced onto an angle, confirming the soft magnet only
      engages within its tolerance rather than always locking
- [x] A separate 2-click test aimed ~1.2° off horizontal **did** snap to
      exactly 0°, with no modifier key held, confirming the automatic magnet
      actually engages within tolerance
- [x] No console errors across the session; all test rooms deleted
      afterward and the room list confirmed back to its pre-test contents

---

## Done: further fixes and polish (uncommitted, on top of the above)

- [x] **Bug fix**: a cut ending (or starting) exactly on an existing room
      corner touches BOTH walls that meet there, not just the one edge index
      `nearestOnWalls` happened to record it against. The crossing-check
      only excluded that one recorded edge, so a segment starting/ending at
      a shared corner could register a false "crosses the room's own wall"
      against the *other* wall meeting at that same corner (a degenerate
      collinear case in `segHit`). Found via a real, complex multi-room
      floor plan (a closet doorway right at a corner) where a clean-looking
      cut was rejected. Fixed with `endEdges(hit)`: excludes `hit.i`, plus
      the neighbouring edge sharing that vertex when the hit resolved to
      (near enough) an existing corner rather than a mid-wall point.
- [x] Verified the fix directly against the real room that surfaced the bug
      (a 2-click cut ending on the closet-corner point, previously rejected,
      now passes)
- [x] Modal layout: "Split with a wall" and "Split and leave it open" are
      now two equal buttons side by side in the body (`.row.actions`),
      instead of one being the modal's own footer OK button and the other a
      separate button above it. `openModal` is called with `okLabel`/`onOk`
      both `null` (hides the built-in OK button entirely, leaving just
      "Close" in the footer); both choice buttons are wired in `onMount` to
      `closeModal()` + `commitSplit(ctx, ...)` directly
- [x] Verified in-browser: both buttons render side by side, "Split with a
      wall" still produces the correct two-room split, footer correctly
      shows "Close" only, no console errors; test room deleted afterward
- [x] Moved again per follow-up request: both choices now live in the modal's
      own footer (`#moFoot`), to the right of Cancel, instead of in the body.
      "Split with a wall" is the standard `okLabel`/`onOk` button (restored);
      "Split and leave it open" is a plain `<button>` created in `onMount`
      and inserted right after `#moOk` via `insertAdjacentElement`, then
      removed again in `onClose` — required because `#moFoot` is the shared
      modal chrome every dialog in the app reuses, so anything appended to
      it must be torn back out or it would linger in every later modal too.
      Not re-verified in-browser per instruction to skip testing this round;
      only checked for JS syntax errors.

---

## Done: corner-alignment magnet + right-angle glyph (uncommitted)

Requested: while placing a split point, snap into an existing room corner
the way dragging a room corner already does (`snapCorner`), lining up on
both axes at once, and show the same right-angle tick glyph the rest of the
app uses when the resulting bend is 90°.

- [x] `splitRefs()`: builds `{p, bias, edge}` refs — every room corner
      (offering both of its own walls' perpendiculars, not just one) plus
      every split point already placed (the most recent one offering the
      segment behind it, or, for the very first point, the wall it started
      on) — same shape `snapCorner`/`alignPoint` already expect, so both are
      reused as-is rather than reimplemented
- [x] `splitResolvePoint(raw0, hard)`: Shift still hard-locks to a 45° off
      the last point; otherwise `alignPoint` against `splitRefs()` gets first
      pick (so a bend can land exactly in a corner, on both axes at once, as
      requested), falling back to the existing soft 45°-ish angle magnet,
      then to the raw point — `alignGuides`/`alignNote` (the same module
      state `drawAlignGuides()`/the readout already use) are set directly
      from its result, so the dashed guide lines and the "Lined up"/"Right
      angle" status text appear for free
- [x] `splitCornerRef(pts, candidatePt)`: the three points a "is this bend
      square?" check reads — the last two placed points, or (before any bend
      exists) a point synthesised back along the start wall, feeding both
      `isSquare()` (for the note) and `drawSquareTick()` (for the glyph)
- [x] **Bug found and fixed during testing**: the synthetic "back along the
      start wall" point used `wallOf(i).dir` directly — a unit vector, so
      only 1mm away. `isSquare()`'s dot-product test doesn't care about
      scale, so the "Right angle" text appeared correctly, but
      `drawSquareTick()`'s own arm-direction check bails out under 1 *screen
      pixel*, silently drawing nothing. Fixed by scaling that synthetic
      point out to 500mm, which is however unrelated to the 45°-lock/corner
      logic above.
- [x] `pointerdown` and `drawSplitOverlay()` both route through
      `splitResolvePoint`/`splitCornerRef` now, so the live preview and the
      actual placed point always agree

### Verification (manual, in-browser)
- [x] Hovering level with a room corner (but off it) showed "Lined up" and a
      dashed guide line through that corner
- [x] Hovering square to the wall the start point sits on showed "Right
      angle" in the readout **and** the square-tick glyph at the start point
      (only after the 500mm fix — before it, the text appeared but the glyph
      silently did not)
- [x] Placing that point, then hovering square to the segment just drawn,
      showed "Right angle" + the glyph again at the *second* point too
      (confirms the `pts.length>=2` branch, not just the first-point one)
- [x] Completed a full multi-point split through both a "Right angle" bend
      and a final unaligned diagonal segment to the far wall; both resulting
      rooms came back as valid polygons with matching shared-edge lengths
      and angles (9' at 337°/157° — same edge, opposite direction), areas
      summing back to the original total
- [x] No console errors; test room and its split-off half deleted afterward
      via "Undo this split…" + delete, room list confirmed back to its
      pre-test contents

---

## Done: both split-choice buttons made primary (uncommitted)

- [x] The injected "Split and leave it open" button (`openSplitChoice`, in
      `#moFoot`) now gets `className='btn primary'` instead of `'btn'`, so
      it renders black/ink like the standard OK button ("Split with a
      wall") sitting next to it, instead of looking like a secondary
      action.
- [x] Verified in-browser: both footer buttons render black; Cancel still
      closes the dialog without mutating the room; no console errors; test
      room deleted afterward.
