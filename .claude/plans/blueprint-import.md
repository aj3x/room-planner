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
      photo: the long window band running the full width of the north wall produced
      **zero** cuts (every cut `bpAnalyse` found was on the west wall or an interior door)
      — not a width/aspect-ratio miss at the margins, that wall's window detection wasn't
      firing at all. Traced to hairlines too light to ever join `wall`: a window drawn as
      two faint parallel strokes with nothing solid behind them never clears the thick-ink
      threshold, so no band ever forms for `bpWallLines`/`bpCloseGaps` to find a gap in.
      Fixed by promoting the same enclosed-cavity strips `bpAnalyse` already computes for
      the barrier seal (the ones too light to be `wall` but still bounded by ink on both
      sides): merged per sash (a three-line window encloses two strips, not one) and
      filtered to spans at least `tPart*10` long so a stray sliver near a fixture doesn't
      get reported as a window. Verified against the real photo: the north wall's window
      is now detected and lands in `openings` like every other cut.
- [ ] **Door type is often wrong for the image** (closet vs. hinged vs. double-leaf).
      Deepest item, done last on purpose: getting this right needs real per-object-type
      detection (bi-fold vs. single vs. double leaf, and eventually sinks/tubs/ovens/
      counters as fixtures in their own right), not one more threshold on the existing
      classifier. Treat it as the seed of S7's fixture-recognition pass rather than a
      one-off fix here.

### S6: OCR
- [x] Tesseract.js from CDN, **all four artefacts pinned** (js, worker, core, lang):
      `tesseract.js@7.0.0` and `tesseract.js-core@7.0.0` off jsDelivr, `eng.traineddata`
      off `tessdata.projectnaptha.com/4.0.0`.
- [x] Write that version's API rather than feature-sniffing across three majors: v7's
      `createWorker(lang, oem, {workerPath, corePath, langPath})`, one call, no fallback
      chain across majors.
- [x] **Not per-line crops at PSM 7, as planned** — changed after running against the real
      photo. `bpLabelBlocks`'s candidate glyphs are capped at `tPart*6` per component
      (S4's own cap, tuned for divider placement), and bold, closely-kerned room-name
      lettering binarises into one blob per word at this resolution — comfortably over
      that cap. So the name was never in `cand` to begin with, and every block bpAnalyse
      finds is built entirely out of the dimension line and the rule under the name.
      Confirmed against the real photo by rendering the crop a line-level pass would have
      taken: it starts right at that rule, name entirely above it and entirely absent.
      Fixed by cropping the whole **block** instead, padded three glyph heights past its
      own top edge to pull the name in, and reading it with PSM 6 (uniform block) so
      Tesseract's own line-break detection — not `bpLabelBlocks`'s glyph candidates —
      is what separates the name from the dimension line. Verified against the real
      photo: LIVING AREA, BEDROOM and KITCHEN all read cleanly this way.
- [x] `bpSolveScale`: fit each dimension pair in **both** orientations, pool across rooms,
      take the median, report the spread as confidence.
- [x] **Only fit boxy rooms.** A blueprint already runs a little loose against real-world
      scale, and a room that opens straight into its neighbour — Living Area into Foyer,
      here — traces as one merged, irregular outline, so the number printed inside it was
      never describing that outline's own bbox in the first place. Confirmed against the
      real photo: Living Area's printed 15'4"×11'11" fit against its own (22-vertex, very
      not rectangular) bbox before this check produced nonsense. `bpRegionIsBoxy` requires
      the traced polygon to fill at least 90% of its own bbox and have 6 vertices or
      fewer; only simple, self-contained rooms (a bedroom, a closet) ever feed the scale
      fit — everything else still gets its name and its dimension line as a label, just
      not a vote on the scale.
- [x] Bounds-checked every parsed dimension (150mm–15000mm) before it can reach the pool.
      OCR drops the foot-mark often enough on this font — "11'10"" read as "1110"", "5'11""
      as "511"" — that an unchecked reading can be out by a factor of ten, which is worse
      for a median than no reading at all.
- [x] Graceful degradation, four layers, and **skip OCR entirely on `file://`**, where the
      worker and wasm cannot load and trying costs a 15-second hang: no network → skip
      before trying; the library or the worker failing to load → skip OCR for the whole
      photo; one block's crop failing or running long → skip that block, keep going; a
      recognised line that doesn't parse as a name or a dimension pair → left blank.
- [x] Room names and `l.dimLabel` from the labels. `dimLabel` is the OCR text verbatim,
      not reformatted through `fmtLen` — it's meant to show what's printed on the plan,
      including when that disagrees with what got traced, so reformatting it would defeat
      the point.

### S7: fixtures
- [x] `BP_FIXTURES` (six types: toilet, tub, bathroom sink, kitchen sink, range, fridge —
      real-world size range, ink-fill range and expected circle count per type) plus
      `BP_FIXTURE_ITEMS` (their placeable shapes). No fixture items existed in
      `marketplace/` to lean on, so these are inline literals, added to `S.inventory`
      on first use under a stable `bp/fixture/…` id — a second import's toilets reuse the
      first's library item rather than growing a duplicate.
- [x] Score free-standing symbols by size, fill and circle count. **Not in millimetres**
      at detection time as planned — `bpDetectFixtures` runs inside `bpAnalyse`, which
      runs once, before OCR necessarily has a scale to hand it (see below), so the
      geometry pass is scale-free (thresholds in multiples of `tPart`, the partition
      wall's own thickness) and the real-world scoring (`bpScoreFixture`, the mm/fill/
      circle-count table lookup) happens at `bpAttachFixtures` instead, which runs inside
      `bpRebuild` — same place openings are attached, and rerun on every edit.
- [x] Place via `l.placed`, verified with the real `validate()`: `bpPlaceFixtures` runs
      after the imported layouts are already in `S.layouts` (so `S.active`/`L()` can
      resolve them) and before `bpSeedHistory` (so the undo baseline includes the
      fixtures as imported, not as a later edit). A fixture that doesn't validate — drawn
      a few pixels into a wall by the rectify pass, say — is silently dropped rather than
      forced in. "Undo this import" also removes any fixture library item the import
      created and nothing else has since placed, so cancelling doesn't leave orphaned
      catalog entries; one it merely reused stays.
- [x] A **Fixtures** tab alongside Rooms/Openings in Review: one row per detected
      fixture (name, which room it landed in, a type dropdown, leave-out), same shape as
      the Openings list. Reads "Set a scale first" if Scale hasn't resolved yet — normally
      unreachable from the wizard (Scale won't advance without one) but the list is
      rendered by the same code path regardless, so it degrades the same way rather than
      assuming.
- [x] Honest ceiling, confirmed against the real photo, not just asserted: of the
      kitchen's sink, the bathroom's toilet, tub and sink, and the stove's four burners,
      **only the two sinks were found and correctly placed** (kitchen sink standalone;
      bathroom sink in with the toilet/tub). Two separate mechanisms behind the misses,
      both already flagged rather than chased with another threshold:
      - The toilet, tub and stove are all drawn touching a wall or another fixture, so
        their ink fuses into the single `structure` component at the labelling step (S1's
        own largest-connected-component pass) and never becomes a component of its own —
        exactly the documented ceiling, "fixtures touching a wall merge into the
        structure and are unreachable."
      - The stove's burners — the one case that *doesn't* touch a wall — are round and
        small enough that `bpLabelBlocks`' glyph net (built for S6's OCR, tuned to catch
        bold lettering) sweeps them up as candidate letters before fixture detection ever
        sees them, so "circle count" never gets a real burner cluster to count on this
        photo. Traced and understood, deliberately not patched here: loosening the glyph
        net to exclude round marks was tried against this photo and it just started
        eating actual letters (a bold `B`/`D`/`O` at this resolution is itself close to
        round) — the real fix is the same stroke classifier the S5 bifold-detection punt
        and the S5 door-type item both already point at, not a third threshold stacked on
        a filter built for a different job.
      - Verified end to end with a real (not injected) scale, via "Measure a known wall":
        detect → Review's Fixtures tab → Import → both sinks land inside their rooms,
        pass `validate()`, survive a page reload (persisted through `Store`), and
        "Undo this import" removes them and their now-orphaned library item cleanly. No
        console errors through any of it.

### S8: polish
- [x] Accordion grouping in review, one section open at a time. Superseded rather than
      built as originally planned: S5's stepped-wizard rewrite (`842e0e5`) already split
      Review into Rooms/Openings tabs before this stage was reached, and adding Fixtures
      as a third tab (this stage) keeps that shape — one tab's list visible at a time is
      the "one section open" outcome this item was after, so there is nothing left to do
      here on top of it.
- [x] `floorMenu` entry to import onto an existing floor. `bpUploadDialog`/`bpCommit`
      already carried a `targetFloorId` end to end with nothing wired to set one — the
      header's own "Import a blueprint" button always passed none, creating a new floor
      every time. Added "Import a blueprint onto this floor…" to the floor's `⋯` menu,
      calling `bpUploadDialog(false, id)`. Verified: `bpState.targetFloorId` is the
      clicked floor's id through Upload → Crop → Scale → Review, and `bpCommit` reuses
      that floor (`floorOf(st.targetFloorId)`) instead of creating a new one.
- [x] Import report modal with "Undo this import" — built as an `⋯` menu entry instead
      of a modal. `842e0e5` had already replaced the old report-modal-on-commit with a
      plain toast (see that commit's own message), and the Toast component (DESIGN.md
      3.9) auto-dismisses in at most 5s with no button of its own — reopening that
      decision to hang an action off a toast wasn't this stage's call to make. `bpUndoImport`
      already existed and worked (it's `bpLastImport` driven) but had no way to reach it
      from the UI at all. Added "Undo the blueprint import…" to the floor's `⋯` menu,
      shown only while `bpLastImport.floorId` still matches that floor. Verified: appears
      after a real import, removes the rooms/floor/fixture-items it created, and is
      correctly absent otherwise.
- [x] Canvas-to-row linkage, the Fixtures half: hovering a fixture row now highlights its
      source ink component on the Review canvas (`bpState.hoverFid`, drawn in
      `bpDrawReview` the same way a hovered/focused room already was) — pixel-checked, not
      just eyeballed, since a fixture's highlight box is small enough on a full plan photo
      to be easy to miss in a screenshot. **Not done**: the Rooms/dividers half of this
      already existed before S8; a fixture clicked *on the canvas* jumping to and
      scrolling its row (any tab), and the reverse for Openings (which still has no canvas
      presence at all, hover or click), remain open. Left for a future pass rather than
      rushed — it touches `bpMountReviewStage`'s hit-testing and cuts across all three
      Review tabs at once, which is more surface than the rest of this session's changes.

---

### S9: wall vs. fixture accuracy

Reported by the user reviewing S7/S8's output on the real photo: the kitchen and bathroom
boundaries were denting inward around the stove and the toilet — the plan's own "a wall is
either a thick solid shape or a window" rule, broken by ink that was neither.

- [x] **`#bpdebug` mode**, the item this section's own investigation needed first: a Debug
      tab in Review (only rendered when the URL hash contains `bpdebug`), a `<select>` of
      `bpAnalyse`'s intermediate masks (`structure`/`wall`/`skin`/`cavity`/`barrier`)
      rendered as a red tint at native resolution over the photo, the pipeline's own
      `debug` counts printed as a list, and a "Copy report" button. `bpAnalyse` now returns
      `masks:{structure,wall,skin,cavity}` alongside `barrier` for this to read — a byte
      per pixel each, kept only on `bpState.proposal`, never near `S`. Not styled to
      DESIGN.md's usual polish on purpose; it's a tracing tool, not end-user UI.
- [x] **Root cause, found with it rather than guessed at.** A deterministic Python port of
      `bpGray`→`bpThresholds`→`bpLabel8`→`bpRuns`→`bpValley`→`wall` (matched the app's own
      `debug` counts, e.g. `tSplit`/`structureArea`/`bandCount` exactly) confirmed it at the
      pixel level: the stove's burner grid plus its connecting frame lines, once dark
      enough to fuse into `structure`, reads with `min(hR,vR)` just as large as the true
      wall — not because it's *touching* the wall, but because `bpBands` labels it into its
      **own separate band component**, axis='v', bbox 39×31px, extent-to-thickness ratio
      **0.79** — while every genuine wall/corner band on this photo, even its stubbiest
      pilaster, scores **1.5 or higher** (the true south wall itself: ratio 24.8). A blob
      reads exactly as "thick" as a line by this test; only its shape tells them apart.
- [x] **Fix: reject non-elongated bands before they become `lines`, and cut them out of
      `wall` by their own established bbox.** `bandsOk` gains a second filter,
      `wallish = bandsOk.filter(b => (b.a1-b.a0) >= b.t*1.2)` — 1.2 leaves daylight below
      every real band (1.5+) and above the stove's (0.79). Bands that fail it are cleared
      from `wall` directly (their own `a0/a1/c/t`, reconstructed into a bbox), and
      `bpWallLines` now runs on `wallish`, not `bandsOk`. Deliberately **not** a per-pixel
      elongation test on `hR`/`vR` directly — tried that first, and it also stripped the
      true wall pixels wherever they sat close enough to the fixture's own blob to read
      with a similarly inflated run-length, opening a real gap in the barrier right where
      the dent used to be (kitchen area *shrank* further, to 47% of its printed size, not
      grew). Filtering whole **bands** instead of pixels avoids this by construction: the
      true wall is a separate band with its own honest reading, so rejecting the stove's
      band never touches it, and only the blob's own bbox — never the wall's — gets zeroed.
- [x] Verified against the real photo, not just the Python model: kitchen's traced outline
      now runs the full printed rectangle, past the stove, to the true south wall (checked
      visually at native resolution via `#bpdebug`'s Wall mask, before and after); `21`
      bands still found, `20` pass the thickness filter, exactly `1` rejected (the burner
      block); `leakFraction` unchanged at `0.029`; fixture count unchanged at `2` (the
      burners still aren't *found* as a fixture — that's the separate, still-open ceiling
      below — this only stops them being misread as wall); no new console errors.
      Bathroom-area sliver rooms still fail `polySimple` and get left out, same as before
      this fix — that's the pre-existing "toilet-area gap" defect below, not something this
      session touched or worsened.
- [ ] **Countertops still read as plain, unclassified ink** (neither wall nor a fixture) —
      correct rather than wrong now that they no longer corrupt the boundary, but the user
      also asked to be able to identify them as their own thing. Not attempted here: needs
      a new `BP_FIXTURES` entry (long, thin, low-fill, no circles, against a wall) and
      widening `bpDetectFixtures`'s candidate pool to the same rejected/freed-up ink this
      fix now excludes from `wall`, which is a second, separate change from the boundary
      fix above.
- [ ] **Fixtures touching a wall are still never *found*** (toilet, tub, range) — this
      session fixed the boundary corruption they were causing, not the S7 ceiling that
      keeps them out of the Fixtures tab. See the existing item below; unchanged by S9.

---

### S10: spike vertices — normalize them out of every traced room, not just this photo's

Reported by the user from a screenshot: a thin black triangle jutting a few inches into
the kitchen from its east wall, pointing back toward the wall it came from — "there is no
way that it would ever be a wall and is clearly a bug." Not this photo's stove/tub fixture
misread (S9) — a plain tracing artifact, the kind a stray pixel on the border walk can
produce on any photo, so the fix belongs in the general polygon cleanup (`bpCleanPoly`),
not anywhere fixture- or photo-specific.

- [x] **`bpDropSpikes(P, deg)`**, new, next to `bpDropCollinear` (same iterative
      single-vertex-removal shape, same file region, ~line 5940). `bpDropCollinear` already
      drops a vertex whose two edges point in *almost the same* direction (dot ≈ +1 —
      walking straight through, no real corner there). This is its mirror: drop a vertex
      whose two edges point in *almost opposite* directions (dot ≈ −1 — the walk goes out
      to the vertex and doubles back within `deg` of the way it came). No real wall corner
      folds back on itself like that at any angle under ~30°; every legitimate diagonal or
      chamfered corner on the test photo reads 45–90°. Wired into `bpCleanPoly` in two
      places — once before the existing collinear/merge passes (removes the tip outright),
      once after (catches anything the merge pass's edge-collapsing exposes).
- [x] **Verified two ways.** (1) A hand-built polygon with a sharp synthetic spike (interior
      angle ≈ 19°, same shape as the reported screenshot) run through the live page's own
      `bpCleanPoly` via the browser console collapsed cleanly from 7 vertices to the plain
      rectangle's 4 — the tip and both its neighbours gone, winding intact, `polySimple`
      true. (2) The same test with a *wide* synthetic notch (37–67° — a real diagonal jog,
      not a spike) came back **unchanged**, confirming the fix doesn't eat legitimate
      corners; 30° sits well clear of both. (3) Re-ran the full import wizard against the
      real test photo end-to-end and dumped every traced room's vertex-turn angles from
      `S.layouts` in the console — every angle on every room this run either 90° (clean
      rectilinear) or 120° (an existing fixture-cut notch, left untouched, correctly) — no
      near-0°/near-180° vertices anywhere, i.e. nothing left for the new pass to have caught
      on this run, and nothing it wrongly removed either. The console/no-error check passed
      (`node --check` on the extracted `<script>` block, plus a clean load in the browser).
- [x] **Regression, caught by the user immediately: the kitchen stopped being a room at
      all** ("KITCHEN: This outline folds over itself — it'll be left out."). Cause: the
      *second* `bpDropSpikes` pass in `bpCleanPoly` ran **after** the last
      `bpMergeShortEdges`, so a spike whose removal left its two former neighbours under
      50mm apart had nothing to merge that edge afterward — and `polySimple`'s own
      edge-length floor (the same 50mm rule, same function, same rejection message the user
      saw) then failed the whole polygon. Not a hypothetical: this is exactly what happened
      on the real photo once the earlier "not independently reproduced" gap above got
      re-tested. Fixed by running `bpMergeShortEdges(bpDropCollinear(...))` again after the
      second spike pass, not just before it, so nothing the spike-drop leaves behind escapes
      uncleaned. Re-verified against the real photo end-to-end: `bpRebuild()` now reports
      zero `problems`, kitchen included, with area within noise of the pre-spike-fix run.
- [x] **A second, distinct artifact reported alongside it: a jagged notch in the bathroom,
      "due to the top of the tub being dark black."** Traced to the actual region data
      (`bpState.proposal.regions`, console): a two-vertex zigzag cut into what should be a
      plain corner — `(845,861)→(852,873)` between two straight runs, ~60mm and ~83mm off
      dead straight. `bpDropSpikes` doesn't catch it: both turns there are ~60°, nowhere
      near sharp enough to read as a reversal. A different shape of the same underlying
      problem — fixture ink (the tub's rounded rim) reading as wall-thick — needing a
      different test, since this one has no sharp angle to catch and no fixture-band
      elongation to reject (S9's test is at the band-detection stage, before tracing; this
      survived to the traced polygon itself).
- [x] **Fix: `bpDropNoise(P, mm)`**, new, next to `bpDropSpikes`. Tests "effective width" —
      twice the area of the ear a vertex cuts with its two immediate neighbours, over the
      base length between them — which is the same "how far off straight" quantity
      `bpDropCollinear` tests via angle, just able to catch it at *any* angle as long as the
      absolute deviation is small. 150mm clears every real corner on the test photo (each
      hundreds of mm, since a normal corner's effective width scales with its edge lengths)
      and sits above both measured nibbles (60mm, 83mm) with room to spare. Wired into
      `bpCleanPoly` alongside `bpDropSpikes`, same two spots, same reasoning about needing
      the merge pass to run again afterward.
- [x] **Verified the same way as S10's first fix, plus one more check this time — real area,
      not just angles.** (1) The exact reported region (8-vertex bathroom fragment,
      `coanvbwr`) cleaned to a plain 4-point rectangle, area within 0.3% of the raw trace.
      (2) Every one of the photo's 8 regions cleaned with area changes under 3% — point
      counts dropped a lot more than that (one region 24→10 vertices, another 16→4) which is
      expected: most of what a pixel-level border walk produces on a nominally straight wall
      *is* stair-step quantization noise, not detail worth keeping. (3) Synthetic checks: a
      plain rectangle passes through untouched; a 500mm-armed diagonal jog (real
      architecture) passes through untouched; a small L-shaped room (1000–2000mm edges)
      passes through untouched; the S10 sharp spike still collapses correctly — confirming
      this pass and the spike pass are complementary, neither one catching what the other
      is for (a true needle spike can have *large* effective width despite its sharp angle,
      since its arms are long off a tiny base, so `bpDropNoise` alone would have missed it).
      (4) Full re-run of the real photo end-to-end: `bpRebuild()` reports zero `problems`,
      all 8 spaces present (`LIVING AREA`, `BEDROOM`, `KITCHEN`, 5× bathroom fragment), and
      a full angle sweep across every vertex of every room found nothing outside 75–105° —
      clean rectilinear corners everywhere, nothing left for either pass to still be
      catching. Test floors created while verifying this in the browser (three duplicate
      "Ground floor" imports) were deleted from local storage afterward so they don't linger
      in the app's own saved state.
- [ ] **The kitchen/foyer divider still isn't always detected** — this run of the wizard did
      split them into separate rooms and the earlier S10 verification's run did not, on the
      *same* photo and the *same* code, before either of this section's two fixes. Scale
      measured by hand differed slightly between runs (mmPerPx varies with exactly where the
      two calibration clicks land), which is enough to move where `bpProposeSplits` finds —
      or misses — the divider. Not attempted here: a real fix needs the split decision to
      stop being this sensitive to scale-measurement noise, which is a separate, undiagnosed
      problem from anything in S9 or S10. **Update, S11 below:** after S11's crop fix, the
      divider found the foyer consistently and gave it its own OCR name — plausibly the same
      instability (less of the photo standing meant less for `bpProposeSplits` to work with),
      but not confirmed as the same cause, so this item stays open rather than closed.

---

### S11: default crop was trimming real walls off the photo

Reported by the user, connecting it to the S10 sliver-room symptoms: "another reason we
fail to get the bottom of the foyer and bathroom is due to our crop, we cut out the bottom
walls in our crop. can we not crop so hard?" Correct, and a plain cause once looked at
directly — the crop step's default box (`bpMountCropStage`, ~line 7802) was a flat 6% inset
off *each* edge of the photo, regardless of how tightly the actual drawing filled the
frame. On a plan photographed or scanned close to its own edges (this test photo among
them), that inset falls inside the drawing itself and slices real wall off before the
person doing the import ever sees a crop handle to fix it — every downstream symptom this
whole file's S9–S10 sections chased (sliver rooms, a boundary that can't close, a divider
that sometimes isn't found) can start here, upstream of any of those fixes.

- [x] **Fix: `bpAutoCropRect(full)`**, new, guesses the default crop from where the ink
      actually is rather than a blind percentage. Same technique `bpAnalyse` already uses
      for `structure` — threshold the photo (`bpGray`+`bpOtsu`+`bpMaskOf`), take the
      **largest 8-connected component** (`bpLabel8`) rather than the bbox of every dark
      pixel, since a scanner's border or a background shadow would answer to "any dark
      pixel" but not to "the single biggest connected mass of ink," which on a clean photo
      of a plan is reliably the wall/text network itself. Bbox of that component, padded 2%
      of the shorter side so an edge wall's outer stroke doesn't sit exactly on the crop
      line. Falls back to the old fixed-6%-inset guess if nothing large enough turns up (a
      near-blank or very noisy photo) — `bpMountCropStage` now tries the auto guess first
      and only reaches for the fixed inset when it returns null.
- [x] **Verified against the real photo.** The new default crop opened to `x:33,y:23,
      w:933,h:1009` versus the old fixed inset's `x:59,y:63,w:873,h:930` on the same
      991×1056 source — roughly 270–280mm more margin on *every* edge at this photo's
      scale, not just the bottom the user flagged. Re-ran the full wizard end-to-end on the
      looser crop: `bpRebuild()` still reports zero `problems`, and the foyer — which
      hadn't been coming out as its own named space in prior runs — now does, with its
      traced area (59.9 sq ft) close to its printed dimension (8'9"×7'6" = 65.6 sq ft).
      Total room count went from 8 to 9 on the same photo. Confirmed visually too, after
      importing to the plan: every room's south wall now closes, where the foyer and
      bathroom fragments previously stopped short of the photo's own bottom edge.
      Test floor created while verifying this in the browser was deleted from local storage
      afterward, same as S10.

---

### S12: two more closets — one traced as a wedge, one not traced at all

Reported by the user against the S11 crop, pointing at two specific closets in the review
screenshot: "the one closet in the middle right side of the image... only half of it
creates a room. i think you made a door in the middle for no reason. also the other closet
in the center left, is not being it's own room." Their own read on the cause — "it sees a
barrier in the right closet where there is none, and for the left closet it does no
register the closet as a room" — turned out to be exactly right for the second closet and
subtly wrong (in a useful way) for the first.

- [x] **Fix: the "half a room" closet — `bpCleanPoly` was dropping the real corner, not a
      fake one.** The bedroom's closet (a bifold, top-right of the plan) traces cleanly:
      confirmed directly against the source photo, at 3x zoom with a pixel ruler drawn over
      it, that the wall separating it from the narrow hallway pocket beside it is real,
      full-height, 11px solid ink — the same weight as every other wall on this plan. The
      user was seeing something real, but it wasn't a phantom wall: the raw traced boundary
      for the closet came out with a 1-pixel notch at its own top-left corner (the true
      corner point at `x741.25`, then two redundant near-duplicate points 1–8px further
      along the same straight edge, from Moore-neighbour tracing a stair-stepped pixel
      corner). `bpCleanPoly` ran `bpDropNoise` (S10's "effective width" test) **before**
      `bpDropCollinear`, so when it measured the true corner's own "ear" against its
      nearest neighbour — one of those redundant 1–8px noise points, not yet removed — the
      ear came out at 54mm, under the 150mm noise floor, and dropped the real corner
      instead of the noise beside it. The closet's own room lost its actual corner and
      gained the noise point as a fake one, which is exactly a trapezoid: one straight wall
      reads as a diagonal cut, and a diagonal cut in a traced room outline looks exactly
      like a door leaf drawn open — hence "a door in the middle for no reason." Confirmed
      by reading the raw pre-clean polygon (6 points, the redundant ones included) against
      the cleaned one (4 points, missing the real corner) side by side.
      Fix: run `bpDropCollinear` once, first, before `bpDropSpikes`/`bpDropNoise` touch the
      polygon at all — collinear points carry zero angle and zero ear by construction, so
      dropping them first is always safe (never removes a real corner) and it means the
      later ear-based tests never see a redundant point standing next to a real one.
- [x] **Verified against the real photo.** Before the fix, the closet's room (`bpRebuild`
      region `e3p5ovr5`) came out as a 4-point trapezoid — `[981.79,0], [981.79,453.16],
      [0,453.16], [54.13,0]` in its own local mm space, i.e. the top-left corner sitting
      54mm in from where the real wall is. After the fix, the same region comes out as a
      clean rectangle — `[0,0], [981.79,0], [981.79,453.16], [0,453.16]` — and the narrow
      hallway pocket beside it (previously *also* a wedge, same corner, mirrored) is a
      clean rectangle too. Re-imported the whole photo end to end: still 9 rooms, still
      zero `problems`, and the closet + its neighbour now render as two plain rectangles
      sharing a straight wall in the plan, not two mirrored wedges either side of a fake
      diagonal. Test floor deleted from local storage afterward, same as S10/S11.
- [x] **Fix: the "not a room at all" closet — a genuinely wall-less opening.** The foyer's
      coat closet (centre-left of the plan) is real: three solid walls plus a door swinging
      open out of it, confirmed directly against the source photo. But its fourth side —
      the doorway itself — has **no ink at all**, not even a short jamb stub; the closet's
      floor is pixel-for-pixel contiguous with the foyer's. `bpCloseGaps` only closes a gap
      that sits *within* an already-detected wall `line` (two solid runs with a gap between
      them on the same band); with no wall ink on that side to begin with, there is no line
      and nothing for it to close, so the closet's floor flood-filled straight into the
      foyer at the region-derivation step and never became its own component. This matched
      the user's own diagnosis exactly. Confirmed by checking `bpState.proposal.cuts` for
      this photo before the fix — nothing was registered anywhere near this closet at all,
      not even a rejected doorway — and by checking the foyer region's own bbox, which
      fully contained the closet's footprint.
      Fix: two new functions, `bpFreeEnds` and `bpProposeArcCuts`, run alongside
      `bpCloseGaps` rather than inside it. `bpFreeEnds` finds every wall line's own dead
      end — where the drawn wall just stops, with no perpendicular line crossing it there —
      which is normally meaningless (the plan's exterior, or a crop edge) but is also
      exactly what a jamb-less closet leaves behind. `bpProposeArcCuts` pairs two same-axis
      dead ends whose facing coordinate lines up and whose gap reads as door width (capped
      tighter than a real wall gap — 16 partitions, not 40, since this is inventing a wall
      from silence rather than reading one off the page) and proposes the OPPOSITE-axis
      span between them as a candidate cut, without touching `barrier` yet. Those
      candidates ride through the exact same `bpClassifyCuts` swing-arc test a real gap has
      to pass to be called a door rather than a doorway or a window; only a candidate that
      comes back `kind==='door'` gets stamped into `barrier` at all, and every other one —
      a coincidental alignment with nothing drawn between the two dead ends — is dropped,
      left exactly as open as an ordinary wide doorway into a room would be. That's the
      false-positive guard: the arc has to actually be drawn, not just inferred from
      geometry.
- [x] **Verified against the real photo.** Region count went 9 → 10 with every one of the
      original 9 regions' areas byte-identical to before (confirmed by diffing the full
      region list) — the new logic found exactly the one closet and touched nothing else on
      this photo. `bpState.proposal.cuts` shows exactly one `freeArc` candidate, and it
      resolved `kind:'door', arcN:392, arcSpan:100` — a real arc, not a coincidence, and in
      the same numeric range as the plan's other confirmed doors (141–393, `arcSpan` ≥55).
      `bpRebuild()` reports zero `problems`. Imported end to end: the closet lands as a
      plain 4-wall rectangle (1'4¾"×1'7⅞", 2.3 sq ft) with a door on the wall facing the
      foyer, editable in Room mode exactly like every other room, matching the source photo
      corner for corner. Test floor deleted from local storage afterward, same as the rest
      of this session's fixes.

---

### S13: real right-angle corners were coming out as shallow diagonals

Reported by the user straight after S12 landed, against a fresh import of the same photo:
walls in the kitchen, the bottom-left of the living area and the left side of the foyer
were coming out at "weird angles" that weren't right angles. Root cause was S12's own
`bpDropNoise` fix, applied too broadly — protecting the ONE corner S12 was written for
wasn't enough, because the same real photo has several more corners the width-only test
still couldn't tell from a fixture's rounded nibble.

- [x] **Root cause: a real jog can be exactly as narrow as bpDropNoise's noise floor.**
      Confirmed directly against the source photo (pixel ruler over a 4x crop, same method
      as every other fix this session): the apartment's west exterior wall steps a clean,
      deliberate 84mm to one side partway down — not rounded, not traced noise, an
      honest-to-god 90-degree jog, the same kind of feature as S12's bedroom-closet corner
      but smaller than the tub-rim nibbles that motivated `bpDropNoise`'s own 150mm
      threshold. Distance alone can't separate the two: 84mm reads as "noise" under a
      150mm floor whether it turns at a clean right angle or a fixture's shallow curve.
      What's actually different is the turn itself — measured off this same photo, the two
      real jogs (living area's west wall, kitchen's south wall) both turn an exact 90
      degrees, while the tub rim's two nibbles (S10) turn at 113 and 151 degrees. Distance
      was never the wrong test; angle was the missing second one.
- [x] **Fix: `bpDropNoise` now also measures the turn at the vertex it's about to drop,
      and leaves it alone when that turn is within 20 degrees of a true right angle,
      whatever its ear's effective width reads.** Only a vertex that turns at some other
      angle is judged by distance at all — the tub rim's 113/151-degree turns are nowhere
      near 90, so nothing about S10's original fix changes for them.
- [x] **A second, smaller fix the first one's own review turned up.** Even with real
      corners protected, a handful of edges were coming out a few tens of millimetres off
      true — 37mm over one 510mm edge, 17-18mm over two edges either side of the
      living-area/foyer divider seam — too small for any single-vertex test above to catch
      (each one judges a vertex against only its own two immediate neighbours, never a
      whole edge), but still a visible kink once drawn. `bpCleanPoly` now finishes with
      one more pass of `bpOrtho` — the same snapping already used on the raw per-pixel
      trace before any of this file's own cleanup runs — at a 50mm tolerance, matching the
      short-edge floor used throughout the rest of this function. This pipeline doesn't yet
      support a genuinely angled wall (see AGENTS.md), so an edge that's already almost
      exactly horizontal or vertical is meant to be exactly horizontal or vertical.
- [x] **Verified against the real photo.** Every one of the 10 rooms' final edges checked
      programmatically (each edge's dx and dy compared, flagged if neither is within 2mm of
      zero) — zero non-axis-aligned edges left anywhere, down from 3 rooms with visible
      diagonals before the fix. `bpRebuild()` still reports zero `problems`. Re-checked the
      bathroom/closet regions S10-S12 already fixed to confirm neither change regressed
      them — all six still come back as plain rectangles. Confirmed visually too, at 3-4x
      zoom on each of the three rooms the user named. Test floor deleted from local storage
      afterward, same as the rest of this session's fixes.

---

### Post-S8: sliver rooms silently dropped

Reported against the real photo, after S7/S8 landed: the bathroom's floor stopped well
short of its own south wall (visibly, in Review — a chunk of the tub itself was outside
the traced outline), and the bathroom read as several disconnected rooms meeting right at
the toilet rather than one. Investigated from first principles rather than assumed —
the first hypothesis (a flood-fill "outside" leak) turned out to be wrong once checked
directly against the mask data, which is worth recording so it isn't re-suspected next
time this symptom shows up elsewhere:

- [x] **Root cause, confirmed at the pixel level.** Not a leak: `!barrier[i] &&
      !outside[i]` was already true in the gap, meaning the pipeline already knew that
      floor was real, interior space. The real cause is that this real photo draws a
      second thin line close alongside some real walls — a plumbing chase behind the tub,
      a doorway's own threshold — and that second line creates its own tiny connected
      component, walled off on both sides, that fails `bpDeriveRegions`'s width floor
      (`tPart*3`) by a handful of pixels and was silently dropped with nothing ever
      built from it. Confirmed by isolating one such component and rendering only its
      own outline against the photo (not the whole room's), and separately by reading
      `bpLabel8`'s own component ids on both sides of the gap and finding three distinct
      labels, not one — the tub's room, the gap, and (on the far side of a second real
      wall) nothing at all, i.e. the true exterior. Wasted real effort chasing the wrong
      theory first — dilating the barrier mask 1–8px only nudged the reported leak
      fraction, which in hindsight was the tell it wasn't a leak at all.
- [x] **Fix: `bpAbsorbSlivers`, called from `bpDeriveRegions`.** A sliver that fails the
      width/area floor is absorbed into a neighbouring accepted room only when doing so is
      unambiguous: piercing straight out from each of its two long sides finds at most one
      thing, and at most one of those two things is an accepted room. The exterior wall is
      never a target, because "outside" carries no label to match against. Where the two
      sides disagree — the toilet-area case, where the sliver sits between two rooms that
      are each already real and accepted on their own — nothing is merged and the sliver
      is dropped exactly as before; guessing which of two different rooms a connecting
      strip belongs to isn't this fix's call to make, whatever kind of opening separates
      it from each. Merging opens the *whole* shared border, not a few sample points — an early
      version pierced only 5 points per side and left barrier teeth between them, which a
      boundary trace can't simplify back into a non-self-intersecting polygon (`bpRebuild`
      started reporting "This outline folds over itself" on the merged room).
- [x] **A second, smaller fix the first one exposed.** Once the tub room's boundary had to
      run past the tub's own faucet icon (drawn touching the exterior wall) as part of one
      longer trace instead of two short separate ones, that icon's ink — a thin barrier
      peninsula that never mattered while both sides traced apart — started producing the
      same self-intersection. `bpAbsorbSlivers` now shaves off any barrier pixel that ends
      up mostly surrounded by the room it just absorbed, scoped only to the small
      neighbourhood of a merge that actually happened. Same rule the barrier comment in
      `bpAnalyse` already states ("casework or fixtures... must not dent a room"), applied
      after the fact where the merge is what exposed the gap between stated intent and
      actual behaviour.
- [x] Verified against the real photo: the tub room's floor now runs to the true south
      wall (checked by rendering the traced outline directly over the photo, not just
      reading the numbers), `polySimple` passes for all 8 rooms with no `problems`
      reported, dragging a wall on the merged room through `tryRoomEdit` still accepts a
      real edit, fixture placement and `validate()` are unaffected, and a re-run against
      the *original* (narrower) crop — where there's no wall-adjacent sliver to find in
      the first place — produces byte-identical room areas to before this change, so nothing
      regresses when there's nothing to merge.
- [ ] **Not fixed, and not close to it: the default crop clips a tightly-framed photo.**
      The wizard's Crop step pre-draws its selection at a 6% inset (S0, deliberate). This
      photo's floor plan runs close enough to the image's own edge that a 6% inset lands
      *inside* the south wall rather than outside it — accepting the default crop without
      dragging it wider is what created the sliver-generating gap in the first place, on
      top of the width-floor bug above. `bpAbsorbSlivers` fixes the symptom regardless of
      crop, but a user who never touches the crop handles on a tightly-framed photo will
      still lose some of the plan's own margin. Left alone here: the 6% default is right
      for photos with real margin around the plan (most of them), and this is a property
      of one specific test photo, not something to change the default over without more
      photos to check it against.
- [ ] **The toilet-area gap itself is still a gap.** Correctly left unmerged (see above),
      but still reads as "the bathroom in three pieces" to anyone looking at the review
      screen. Folding a threshold sliver into whichever room it more naturally belongs to,
      rather than leaving it unclaimed, needs some real tie-breaker — not attempted here,
      and **not** the wall's own door/window classification: see the next item.
- [ ] **`bpClassifyCuts`'s swing-arc search radius can sweep up a neighbour's ink and
      call it a door — and the wall it's swept from is itself a false read.** Found while
      checking why the sliver above reads as touching a real
      door on one side — it doesn't. The wall between the sliver and the room beside it
      (not the toilet's own room) was classified `kind:'door'` with `arcN:989`, more than
      double every other door found on this same photo (141–393). Traced to the search
      donut `bpClassifyCuts` sweeps from the jamb (radius 0.82–1.18× the opening's own
      width) to look for a swing arc: centred on this particular jamb, at this particular
      opening's width, the donut reaches far enough to cross the toilet bowl's own
      thick, curved, double-line ink and count it as if it were a door swinging open.
      Confirmed by overlaying the actual search band on the photo: no drawn door symbol
      sits inside it, only the toilet icon. The opening itself is real (no wall ink there
      before `bpCloseGaps` seals it) — it's the door-with-a-leaf reading, specifically,
      that's wrong; it's more likely a plain, leafless doorway, the same as two other
      openings nearby that the same pass correctly read as `kind:'doorway'`.
      **Reproduced a second time, later, against a different closet on the same photo** —
      reported by the user as "why is there a barrier in the middle of it" against the
      linen closet next to the toilet, debug mode on. Checked directly against the raw
      `structure` mask (sampled every 3rd row across the whole gap): completely empty but
      for the one row shared with the wall above, confirming again that the opening itself
      is real and only the door-with-a-leaf reading is wrong — the same contamination,
      same toilet, this time read at `arcN:981`.
      **First fix landed only the door-type symptom, not the shape — user correctly called
      this out** ("its still half the room"). A ceiling on `arcN` — 500, sitting between
      every genuine arc measured on this photo (141–467) and both confirmed contaminated
      readings (981, 989) — stops the false `door` reading, falling through to `doorway`
      instead. But `bpCloseGaps` seals a `doorway` into `barrier` exactly the same as a
      `door`, so the closet stayed exactly as narrow as before: fixing the label on a wall
      that shouldn't be there at all was never going to widen the room. Left in (it's still
      correct, as far as it goes — a real door truly isn't drawn there) but it was never
      going to be the whole fix, and shouldn't have been reported as one.
      **Two real fixes were tried against the actual shape, and both were rejected on this
      same photo before either shipped:**
      1. Stop `bpWallLines` bridging the two ink fragments into one "wall" at all (the far
         one is an 11px corner blob, not a wall run). Rejected: the same photo has a
         genuinely working door whose own far jamb is exactly that short (a 12px segment on
         the wall at `v c=689`), so a length filter aimed at the corner blob breaks a door
         that already works.
      2. Make the wall-line profile orientation-aware — require a pixel to actually run the
         way the line does (`vR[i]>=hR[i]*0.8` for a vertical line, reusing the same
         run-length reading `bpAnalyse` already computes for wall thickness) before counting
         it as that line's own ink, on the theory that the corner blob is really a
         *horizontal* wall's own straight run crossing the same columns, not a T-junction.
         This DID remove the false bridge — `v c=736`'s line came back clean, gap-free, with
         no cut generated at all. Rejected anyway: region count on the same photo dropped
         from 10 to 5, with LIVING AREA and the foyer missing entirely, meaning the same
         orientation test rejected real ink on a wall it should never have touched. Not
         chased further to find out which wall or why — a fix that quietly deletes the two
         biggest rooms on the plan is not a fix, and finding out *which* real wall it broke
         doesn't change that the test itself isn't safe to ship.
      Both confirm the same conclusion the original diagnosis already reached: this needs
      the stroke classifier (isolating the arc/corner-blob's ink as its own component,
      separate from whatever it's fused to by the wall's own ragged rind), not a threshold
      on segment length, orientation, or anything else measured off the profile scan as it
      exists today.
      **Root cause pinned down precisely, after the user pushed back a second time** ("why
      can't you just look at the structure overlay") — a fair question that's worth
      answering directly rather than re-asserting the same conclusion. Recomputed `bpBands`
      straight from the stored masks: there is exactly ONE real band at this wall's position
      (`a0:512, a1:578` — the bifold nook's own wall, nothing else). The contamination isn't
      two bands getting matched to each other; it's introduced entirely inside
      `bpLineProfile`'s full-height rescan, which checks raw `wall[y*w+x]` presence with no
      notion of ORIENTATION — so when a totally unrelated wall's corner happens to cross the
      same few columns further down the photo, the scan reads it as ten more pixels of THIS
      line, with nothing in that test able to tell the difference. That's exactly what
      attempt 2 above targeted (requiring the ink to run the line's own direction, not just
      occupy its columns) and exactly why it broke two whole rooms instead: at a genuine
      T-junction — the case `bpLineProfile`'s own comment says it exists to recover, "the
      pilaster beside a door" — the short stub's own pixels sit right where a much LONGER
      perpendicular wall crosses, and that perpendicular wall's run length dominates the
      shared corner pixels. The same orientation test that correctly rejects a false corner
      93px from anything real also rejects a true one sitting at the base of a real wall,
      because from a single pixel's own run-length reading, the two are the same shape.
      Telling them apart needs to know which CONNECTED stroke each pixel belongs to, not
      just which direction it runs — the stroke classifier, precisely, not a nearer threshold.
      **What *did* ship: the debug view stopped being part of the confusion.** `bpState.
      proposal.barrier` was always `wall||skin||cavity` plus every gap `bpCloseGaps` ever
      stamped shut, rendered as one undifferentiated red — so a real wall and an invented
      closure looked identical in the one view built for checking detection against the
      photo, which is exactly how a genuine bug read as the tool "clearly" being wrong about
      something it had actually reasoned about (correctly, per the earlier sliver
      investigation — a real doorway does need a barrier even where nothing is drawn).
      `bpDrawReview`'s "Barrier" mask now tints real ink red and an inferred closure blue,
      so which is which is visible at a glance instead of requiring a console session to
      establish. Doesn't change a single pixel of detection — purely making the existing
      view honest about what it's showing.
      **Still not fixed: the closet is still narrower than it should be.** Only the door
      drawn on its wrong wall is no longer drawn wrong, and the debug view now says so
      itself rather than needing to be debugged from outside it.

---

## Known defects

- [ ] **Living + Foyer.** S4 now proposes a divider between them off their two name labels,
      but this has only been run against synthetic plans. Whether the two names are found
      on the real blueprint, and whether the proposed line lands where it should, is the
      first thing to check. Partial answer from running S6's OCR against the real photo:
      no divider fires here — the traced Living Area region is still one 22-vertex outline
      (`bpRegionIsBoxy` correctly refuses to fit a scale off it), and only ever carries the
      LIVING AREA name; the FOYER block is never attributed to any region at all
      (`region.labels` comes back empty for the area where Foyer sits). So `bpProposeSplits`
      either never sees both labels on the same first-pass region, or the block-to-region
      containment test (a single sample point per block, against the label raster) is
      missing on this photo specifically — still to be traced through `bpLabelBlocks` /
      `bpDeriveRegions`, not fixed here.
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
- [ ] **Fixtures touching a wall, and a stove's burners, aren't found.** (S9 fixed the
      boundary damage this was also causing — see S9 above — but not this ceiling.)
      Confirmed against
      the real photo: the kitchen sink and bathroom sink are found and placed correctly,
      the toilet, tub and range are not. The toilet and tub are drawn touching a wall, so
      their ink fuses into `structure` at the S1 labelling step and is gone before S7 ever
      runs — the ceiling S7 already names. The range's burners are the one case that
      *doesn't* touch a wall, but they're small and round enough that `bpLabelBlocks`'
      glyph net (tuned for S6's bold room lettering) sweeps them up as letter candidates
      first; loosening that net to spare round marks was tried against this photo and
      immediately started eating real letters (a bold O/D/B is itself near-round at this
      resolution). Same fix as the bifold and door-type items below: a real stroke
      classifier, not another threshold on a filter built for a different job.
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
- [x] A `#bpdebug` mode rendering each intermediate mask with a Copy report button — built
      in S9, scoped to `structure`/`wall`/`skin`/`cavity`/`barrier` plus the pipeline's own
      counts (not every stage originally listed here — bands/gaps/regions stay accessible
      through the existing Rooms/Openings/Fixtures tabs, which already visualise those)
- [ ] A `fixtures/` directory of test images with expected output, including the same plan
      at 0.5x and 2x to catch scale-invariance regressions
