# Blueprint import: photo to multi-room floor plan

Branch `feat/blueprint-uploader`. Upload a photo of a floor plan, crop it, review what was
found, and commit it as rooms on a floor.

## Where it stands

Working end to end on the test blueprint: **5 rooms, 14 doors and windows, about 250ms**,
every room editable and every one snapping as a shared wall.

| measured | detected | printed on the plan |
|---|---|---|
| Bedroom | 9'11⅞" × 11'11½" | 9'11" × 11'10" |
| Kitchen | 6'0¼" × 7'0" | 5'11" × 7'4" |
| Living-area window | 3'4⅛" | 3'4" |
| Kitchen window | 3'8⅝" | 3'9" |
| Bedroom door | 2'5⅜" | 2'5" |
| Bathroom door | 2'7⅝" | 2'7" |

Walls are measured off the drawing rather than defaulted: 99mm partitions, 174mm shell.

---

## Done

### S0: plumbing (`397f4a8`)
- [x] Four-stage wizard in one modal: choose a photo, crop, find the rooms, review
- [x] `openModal` gains `opts.wide` and `opts.onClose`; the close hook fires on OK, Cancel,
      backdrop and Esc, which is where `bpDispose()` revokes the object URL
- [x] Drop, choose, or paste a screenshot (⌘V)
- [x] Crop stage with 8 handles, pre-drawn at a 6% inset, canvas cloned on every mount so
      listeners don't stack
- [x] `polyArea` is now `Math.abs(signedArea(P))`, one source of truth for winding
- [x] `clampOpenings(l)` takes an optional layout, so a fresh room can be clamped before
      it is ever activated
- [x] Rooms section header collapses New floor and New folder into a `⋯` menu, leaving `+`
      as the one-click case (DESIGN.md 2.6 allows icon-only buttons only for universal
      glyphs, and a camera is not one for "trace a floor plan")
- [x] The photo never touches `S`, because `save()` serialises all of `S` into localStorage
- [x] "Undo this import". The three history stacks cannot express creating a floor plus
      N rooms, so it is not an undo step

### S1: detection and validation (`b87e301`)
- [x] Component labelling FIRST, on raw ink, before any thickness work, so text is removed
      by topology, because bold glyphs carry the same 9-13px strokes as a partition
- [x] Wall threshold by topographic prominence, **not** Otsu (Otsu scores the wrong split
      roughly twice as high and classifies every partition as "not a wall")
- [x] Thickness measured one sample per band, never per pixel
- [x] Shell sealed by the structure component, not the thick-wall mask
- [x] Wall extent read off the mask, not component topology
- [x] Line profiles split at anything wider than an opening can be
- [x] Moore-neighbour border following, bounded by the region's own perimeter
- [x] `bpCleanPoly`: winding → collinear drop → short-edge merge → the real `polySimple`
- [x] `bpUnpinch` cuts the smaller lobe off a self-touching contour rather than losing the room
- [x] Rooms that fail are reported and left out, never committed broken

### S2: floor placement (`2f57e5b`)
- [x] `bpRectify` pulls near-axis edges onto shared lines, then sets facing pairs exactly
      one wall apart
- [x] All five rooms report **"Sharing a wall"** when nudged
- [x] Wall and exterior thickness derived from band percentiles

### S3: doors and windows (`4ca276a`, `1ea8639`)
- [x] Window vs door by whether ink keeps drawing through the gap
- [x] Hinge and swing from the arc, using angular spread within the swing quadrant
- [x] A door between two rooms is emitted into **both**, with mirrored hinge and swing
- [x] Openings handed over as sheet-space segments, re-attached to whichever edge survives
- [x] Attach distance scales with the wall's own thickness
- [x] Review list: kind, width in display units, which rooms it landed on, leave-out
- [x] Openings that land on no wall say so rather than vanishing

### S4: dividers
- [x] A divider is a **seed point and an axis**, not a polygon operation: stamp one pixel
      of barrier out from the seed until it meets the barrier already there, then derive
      the regions with the same code the first pass ran
- [x] Merging is deleting one and re-deriving, so there is still no polygon union
- [x] Proposed where one region holds two or more **name labels** — the glyphs are the
      components the largest-component step already throws away, so finding them is free.
      S6 (OCR) reads them; S4 only needs to know where they are
- [x] Names merge twice: glyphs into words along a baseline, then a name and the
      dimension line under it into one block. Without the second pass every room on the
      plan proposes a split down its own middle
- [x] Glyph height is an **ink-weighted** median. Plain median counts a dimension tick the
      same as a letter and there are more ticks than glyphs, which reads the test plan's
      median glyph as four pixels tall and then filters out every actual letter
- [x] Recursive bisection at the widest gap between names, so three names give two
      dividers; two names nearly touching give none, because that is one name over its
      own dimensions that failed to merge
- [x] Dashed, deletable (merge), draggable (re-zone), addable. Dragging is perpendicular
      only and re-derives on the way up, because a flood fill per pointermove is a
      slideshow
- [x] Region ids survive a divider moving, so a name typed into a room stays in it: each
      previous region claims whichever new region holds most of its sample points, and on
      a split the larger half keeps the name
- [x] Regions are re-derived only when a divider has actually moved — `bpRebuild` runs on
      every keystroke that changes a length
- [x] `wallOff` on **both** facing edges, rooms placed at **zero** separation, so
      `floorSnapCandidates` returns `kind:'open'` and `floorEdgeDepths` returns 0
- [x] The seam is cut out of the edge as an **edge of its own**. Where a stub of real wall
      runs past the opening the two are collinear and `bpOrtho` has already clustered them
      into one edge; switching that whole edge off would delete a wall somebody drew
- [x] A door never attaches to a divider — there is no wall there to punch through
- [x] Acceptance met on a synthetic plan: three named rooms, one continuous floor, every
      nudge snapping back exactly and reading **"Open through"**, every `wallOff` edge
      measuring 0mm of wall, and all three rooms still accepting a corner drag

### Asked for along the way
- [x] Green highlight on the room being named (`83a7116`), where focus beats hover
- [x] Bi-fold closet door (`24f7bed`, `b4975a9`, `67647fb`, `752cf9e`): two panels on a
      rail pivoting at one jamb, drawn three-quarters shut via `BP_BIFOLD_SHUT`
- [x] Fixed a hang that had nothing to do with detection: the pipeline started on a double
      `requestAnimationFrame`, which never fires in a background tab

---

## Left to do

### S5: bug fixes (review-stage accuracy)  ← next
Found reviewing a real blueprint, now checked in at `example blueprints/apartment-1.png`
(1BR/1BA: living area, kitchen, foyer, bedroom, bathroom) — the first real-world case this
pipeline has been run against; everything before this was the synthetic test plan. Ordered
worst-to-least: a correctness bug first, then room shapes getting corrupted, then whole
rooms going missing, then a missing opening, then a misclassification.

- [x] **One door per connection.** Not a second detected door: the mirrored-into-both-rooms
      behaviour (S3, deliberate, so neither
      side renders as a solid wall) was also mirroring the **leaf and swing**, so one
      physical door drew two overlapping hinge/bifold symbols, one per room. Verified
      against the real photo: `bpAttachOpenings` now buffers both rooms' records for an
      opening before committing either, and if more than one came back for a `door`, only
      the copy whose swing reads `'in'` (or the first, if that's ambiguous) keeps its real
      `dtype`; the other is downgraded to `'open'` — still punches its own wall so neither
      room shows solid, but draws jambs only, no leaf. Windows are unaffected (only ever
      attach to one room).
- [x] **Fixture-adjacent room boundary is cut short.** Traced to the window-cavity
      absorption in `bpAnalyse` (the block that reads a small enclosed gap as the inside
      of a window and folds it into `barrier`): it only ever checked the gap's *size*
      (`min(bw,bh) < tPart*4`, "nothing a person walks into is a foot wide"), never its
      *shape*, so a squarish enclosed pocket scored exactly like a window strip. A stove's
      nested burner outlines, a sink's nested rectangle, and the inside of a toilet bowl
      are all small enclosed pockets — and on the real photo, absorbing them (plus the
      hairlines the growth step then eats around them) is what carved the stove and sink
      out of the kitchen's outline and pinched the toilet into its own sliver. Fixed by
      gating absorption on elongation too: `max(bw,bh) >= min(bw,bh)*4`. Measured on the
      real photo, every real window scored at least 7:1 and every fixture pocket at most
      3.4:1, so the cut is clean. Verified against the real photo: the kitchen outline now
      runs to the true wall behind the stove, the toilet's sliver is a plain 5-vertex
      rectangle (no longer fails `polySimple`), and a stray self-touching spike that had
      been showing up in the Living Area / Foyer trace near the kitchen archway is gone
      too — same mechanism, different corner of the plan.
- [x] **Missed closets.** Unrelated to the boundary-cutoff fix above — confirmed the
      closet's own floor component was already clean before and after that fix, same
      bbox both times. The real cause: `bpDeriveRegions`'s area floor (`(tPart*5)²`) is
      stricter than its own width floor (`tPart*3`, "a room is not eleven inches wide"),
      so a room can clear the width check and still be rejected for being short rather
      than narrow. The linen closet beside the bathroom and the entry nook beside it both
      measure a hair over `3*tPart` wide but well under `5*tPart` square, so both were
      dropped outright — not shrunk, not a `polySimple` failure, just never proposed.
      Fixed by matching the area floor to the width floor: `(tPart*3)²`. Checked the rest
      of the real photo for anything else that size range would let through — nothing:
      the closet and the nook are the only two components between the old and new floor,
      and both are real rooms with their own doors. Verified end to end: 8 rooms import
      clean (was 6), both new ones are plain rectangles, no console errors.
- [x] **Large windows on the north wall aren't detected.** Confirmed against the real
      photo: the long window band running the full width of the north wall produces
      **zero** cuts (every cut `bpAnalyse` found was on the west wall or an interior door),
      so this isn't a width/aspect-ratio miss at the margins — that wall's window detection
      isn't firing at all. Needs tracing through `bpBands`/`bpWallLines`/`bpCloseGaps` for
      why a long horizontal run behaves differently from the vertical ones that do work.
- [ ] **Door type is often wrong for the image** (closet vs. hinged vs. double-leaf).
      Deepest item, done last on purpose: getting this right needs real per-object-type
      detection (bi-fold vs. single vs. double leaf, and eventually sinks/tubs/ovens/
      counters as fixtures in their own right), not one more threshold on the existing
      classifier. Treat it as the seed of S7's fixture-recognition pass rather than a
      one-off fix here.

### S6: OCR
- [ ] Tesseract.js from CDN, **all four artefacts pinned** (js, worker, core, lang)
- [ ] Write that version's API rather than feature-sniffing across three majors
- [ ] Per-line crops from the full-resolution original, PSM 7, no character whitelist
- [ ] `bpSolveScale`: fit each dimension pair in **both** orientations, pool across rooms,
      take the median, report the spread as confidence
- [ ] Graceful degradation, four layers, and **skip OCR entirely on `file://`**, where the
      worker and wasm cannot load and trying costs a 15-second hang
- [ ] Room names and `l.dimLabel` from the labels

### S7: fixtures
- [ ] `BP_FIXTURES` table plus `BP_FIXTURE_ITEMS` (there are zero fixture items in
      `marketplace/` today)
- [ ] Score free-standing symbols by size, fill and circle count, in millimetres
- [ ] Place via `l.placed`, verified with the real `validate()`
- [ ] Honest ceiling: 40-60% precision; fixtures touching a wall merge into the structure
      and are unreachable

### S8: polish
- [ ] Accordion grouping in review, one section open at a time
- [ ] Canvas-to-row linkage: hover a row to highlight, click a shape to scroll to its row
- [ ] Import report modal with "Undo this import"
- [ ] `floorMenu` entry to import onto an existing floor

---

## Known defects

- [ ] **Living + Foyer.** S4 now proposes a divider between them off their two name labels,
      but this has only been run against synthetic plans. Whether the two names are found
      on the real blueprint, and whether the proposed line lands where it should, is the
      first thing to check.
- [ ] **A hairline wall spur can appear beside a divider.** `bpRectify` aligns two facing
      faces exactly, and then `bpCleanPoly`'s sub-50mm edge merge moves a vertex by up to
      half a short edge afterwards — so a face pair it had put on one line can end up a
      pixel apart. `floorEdgeDepths` then reads that as a 12mm shared wall and draws a
      sliver of it. Pre-existing (it is the same mechanism as the jagged kitchen edge
      below) but dividers create more adjacent room pairs, so it shows more often. The fix
      is for `bpCleanPoly` not to undo what `bpRectify` decided, which is a change to the
      order of the pipeline rather than a threshold.
- [ ] **A wide cased opening still becomes solid wall.** `bpCloseGaps` classifies a gap over
      about 13 partitions wide as a `divider` cut and stamps it shut, and `bpAnalyse` then
      filters `divider` out of `openings` — so the two rooms arrive sharing an unbroken
      wall with no opening in it at all. Unrelated to S4's dividers despite the name, and
      deliberately left alone here: emitting it as a wide `dtype:'open'` doorway looks
      right but changes behaviour S3 settled on purpose.
- [ ] **2 of 12 openings do not attach** to any wall. Listed as "not on a wall yet" rather
      than dropped, but still a miss.
- [ ] **1 closet fails `polySimple`** and is reported as left out.
- [ ] **The kitchen's bottom-left edge is jagged** where `bpUnpinch` cut the pinched lobe.
- [ ] **Bi-fold is not auto-detected.** Imported closets arrive as Hinged or Doorway and
      are set from the review list. Telling a chevron from an arc beat three tests:
      counting ink at the door's radius (the far jamb scores in the hundreds too), angular
      spread (the wall and neighbouring fixtures fill the band either way), and a radial
      profile (the quadrant beside the bedroom closet holds 1296 ink pixels when the
      chevron itself is about 200). Isolating the stroke as its own component would fix
      the pollution, but the thin mask is a single blob: the ragged 1-2px rind left around
      every thick wall wires every arc, leaf and fixture together. Needs the stroke
      classifier, not another threshold.
- [ ] **`file://` is unverified.** No network dependency exists yet so it should be fine,
      but this becomes a real risk at S6 (OCR).
- [ ] **`save()` swallows quota failures** in a bare try/catch. Out of scope, but this is
      the feature that makes hitting 5MB plausible.

---

## Not planned

- Merging two rooms in Floor mode *after* import, which needs a real polygon union
- Arbitrary-angle walls beyond the 45-degree pass
- Perspective correction for photos of paper
- Multi-page or multi-floor import
- A Web Worker for the CV: the budget is ~250ms, and Blob workers are unreliable on
  `file://`, which is how AGENTS.md says to run this app

---

## Verifying

No test runner, so manual in a browser, per AGENTS.md.

- [ ] Living and Foyer arrive as two named rooms with a dashed divider between them, and
      the floor draws with no wall along it
- [ ] Delete that divider: the two merge back into one room. Add it again, drag it: the
      names stay on the rooms they were typed into
- [ ] Every labelled room within 3 inches of its printed dimension
- [ ] Console clean on load and through the whole wizard
- [ ] After commit, drag a wall on an imported room: `tryRoomEdit` must **not** reject with
      "That would fold the room over itself"
- [ ] Nudge each room 5mm: all report "Sharing a wall"
- [ ] Undo the import: floor and rooms gone, nothing orphaned
- [ ] Switch units (ft+in / m / cm): every dimension reformats
- [ ] Export to JSON, re-import into a fresh profile, floor round-trips
- [ ] Open `index.html` directly over `file://` as well as over a server

### Wanted, not built
- [ ] A `#bpdebug` mode rendering each intermediate mask (raw ink, components, structure,
      thickness, bands, gaps, regions) with a Copy report button
- [ ] A `fixtures/` directory of test images with expected output, including the same plan
      at 0.5x and 2x to catch scale-invariance regressions
