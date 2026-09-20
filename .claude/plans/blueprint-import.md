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

### Asked for along the way
- [x] Green highlight on the room being named (`83a7116`), where focus beats hover
- [x] Bi-fold closet door (`24f7bed`, `b4975a9`, `67647fb`, `752cf9e`): two panels on a
      rail pivoting at one jamb, drawn three-quarters shut via `BP_BIFOLD_SHUT`
- [x] Fixed a hang that had nothing to do with detection: the pipeline started on a double
      `requestAnimationFrame`, which never fires in a background tab

---

## Left to do

### S4: dividers  ← next, and the answer to the original open-plan question
- [ ] Propose a split line where one region holds two or more name labels
- [ ] Draw split lines dashed, deletable (merge), draggable (re-zone), addable
- [ ] Emit `wallOff = true` on **both** facing edges and place the rooms with **zero**
      separation, so `floorSnapCandidates` resolves them to `kind:'open'` / "Open through"
- [ ] Merging is deleting a split line and re-deriving the region, so no polygon union
- [ ] Acceptance: Living + Kitchen + Foyer read as one continuous floor, each named,
      and the readout says "Open through"

### S5: OCR
- [ ] Tesseract.js from CDN, **all four artefacts pinned** (js, worker, core, lang)
- [ ] Write that version's API rather than feature-sniffing across three majors
- [ ] Per-line crops from the full-resolution original, PSM 7, no character whitelist
- [ ] `bpSolveScale`: fit each dimension pair in **both** orientations, pool across rooms,
      take the median, report the spread as confidence
- [ ] Graceful degradation, four layers, and **skip OCR entirely on `file://`**, where the
      worker and wasm cannot load and trying costs a 15-second hang
- [ ] Room names and `l.dimLabel` from the labels

### S6: fixtures
- [ ] `BP_FIXTURES` table plus `BP_FIXTURE_ITEMS` (there are zero fixture items in
      `marketplace/` today)
- [ ] Score free-standing symbols by size, fill and circle count, in millimetres
- [ ] Place via `l.placed`, verified with the real `validate()`
- [ ] Honest ceiling: 40-60% precision; fixtures touching a wall merge into the structure
      and are unreachable

### S7: polish
- [ ] Accordion grouping in review, one section open at a time
- [ ] Canvas-to-row linkage: hover a row to highlight, click a shape to scroll to its row
- [ ] Import report modal with "Undo this import"
- [ ] `floorMenu` entry to import onto an existing floor

---

## Known defects

- [ ] **Living + Foyer come in merged.** Correct today, since they are one open space, but S4
      is what splits them.
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
      but this becomes a real risk at S5.
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
