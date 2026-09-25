# Room Planner — Design Principles & Style Guide

This document is the source of truth for how Room Planner looks, reads and
behaves. It has three parts:

1. **Philosophy.** What good design is, where the ideas come from, and the
   priority order this app follows.
2. **Decisions.** What was wrong with the previous interface, and why each
   part of the redesign is the way it is. This is kept so the reasoning can be
   challenged later instead of guessed at.
3. **Rules.** Tokens, components, patterns and a review checklist. New UI
   follows these. If something new really needs a pattern that isn't here, add
   it here first.

---

## Part 1 — Philosophy

### 1.1 What separates good design from bad design

This applies to any designed thing, not only software. A kettle, a road sign,
a tax form and a floor-plan editor all succeed or fail for the same reasons.

| Good design | Bad design |
| --- | --- |
| **Serves a purpose.** Every part exists because someone needs it to get something done. | **Serves the designer.** Parts exist because they looked interesting, were easy to add, or were never taken out. |
| **Explains itself.** The shape of a control tells you what it does and where to act (Norman's *signifiers*). You don't need a manual. | **Needs a label to rescue it.** The classic example is a door with "PUSH" written on a handle that asks to be pulled. |
| **Answers every action.** Something visible happens right away, and it matches what you did (*feedback*). | **Is silent or vague.** You click and aren't sure it worked, or an error appears somewhere you weren't looking. |
| **Matches how people think** (*conceptual model*, *mapping*). Controls sit near what they change. Places look like places and modes look like modes. | **Matches how it was built.** Menus follow the code structure. Unrelated things sit together because they were added at the same time. |
| **Has a clear hierarchy.** At a glance you can tell what matters most, what's next, and what you can ignore. | **Is flat or loud.** Everything is the same weight, or everything competes for attention at once. |
| **Is consistent.** One word for one idea and one look for one behaviour, so what you learn in one place works everywhere. | **Is inconsistent.** Three names for the same thing. Two buttons that look the same but do different kinds of things. |
| **Is honest.** It doesn't pretend to be more than it is, and it never hides state or consequences. | **Manipulates or hides.** Decoration makes it look richer, and destructive actions look harmless. |
| **Is restrained.** As little design as possible: fewer colours, fewer sizes, fewer lines. Each one that's left carries meaning. | **Is decorated.** Gradients, shadows, emoji and colour are used for mood rather than meaning, which drowns out the signals. |
| **Includes everyone.** It's readable at low contrast and works with a keyboard and a touch screen. It doesn't depend on colour vision. | **Assumes an ideal user.** Grey-on-grey text, hover-only controls, and red and green as the only difference between states. |
| **Lasts.** It avoids trends, so it doesn't date. | **Is fashionable.** It looks current for a year, then old. |

### 1.2 Sources, and what we took from each

**Dieter Rams — *Weniger, aber besser* ("less, but better").** Rams asked of
his work at Braun: *is my design good design?* His ten answers are that good
design is innovative, useful, aesthetic, understandable, unobtrusive, honest,
long-lasting, thorough down to the last detail, environmentally friendly, and
as little design as possible.
What we took:
- **Neutral housing, functional colour.** Braun products are off-white,
  grey and black. Colour appears only on the one control that needs to be
  found, like the power switch or the equals key. Because colour appears
  nowhere else, that single accent does all the signalling. Our chrome is
  neutral for the same reason, and colour always means something.
- **Unobtrusive.** A tool is like a butler: it serves and then steps back.
  The user's room and furniture are the content. The interface is the frame.
- **Thorough.** Alignment, spacing and wording are not "polish for later".
  Carelessness in small details reads as disrespect for the user.
- **Long-lasting.** No trend effects: no glassmorphism, no gradients, no
  bouncy animation.

**Don Norman — *The Design of Everyday Things*.** Norman's vocabulary covers
affordances, signifiers, constraints, mapping, feedback and the conceptual
model.
What we took:
- **Signifiers must be honest.** A dashed outline says "drop something here",
  so we use it only for drop zones and never for "this list is empty".
- **The conceptual model must be visible.** Earlier, *places* (Library,
  Marketplace) and *modes* (Room, Furniture) sat in one switch, which told
  users they were the same kind of thing.
- **Constraints over errors.** The app already prevents illegal furniture
  placement instead of complaining afterwards. The UI follows the same idea:
  unavailable actions are disabled, and they don't fail on click.

**Jakob Nielsen — the ten usability heuristics.** In particular: visibility
of system status, recognition rather than recall, consistency and standards,
and aesthetic and minimalist design.
What we took: always show the current mode and selection, show what can be
done instead of relying on memorised shortcuts, and remove information that
doesn't help the current task.

**Josef Müller-Brockmann and Swiss / International Typographic Style.**
Objective visual communication through systematic construction: a grid,
a small type scale, sans-serif text and asymmetric balance.
What we took: a 4px spacing grid, a type scale of five sizes, left alignment,
and hierarchy carried by type and space rather than boxes and colour.

**Kenya Hara / MUJI — emptiness (*ma*).** An empty vessel can be filled in
any way. Space is a material, not something left over.
What we took: whitespace separates groups, so we need fewer borders.
What we deliberately *didn't* take: Hara's emptiness invites the user to
decide what an object is for. A precision tool shouldn't be ambiguous. Our
emptiness is visual, never functional: every control still says plainly what
it does.

**Refactoring UI (Wathan & Schoger).** Practical craft: design in greyscale
first, create hierarchy with weight and colour rather than size alone, use
constrained scales, use fewer borders, and let shadows show elevation.
What we took: the scales themselves, and the habit of solving hierarchy
before reaching for colour.

**Linear (2024 redesign).** They cut 98 theme variables down to three
generated inputs, used perceptually uniform colour, increased contrast,
reduced chromatic noise, and refined alignment until it was "felt rather than
seen".
What we took: a small token set, higher text contrast, colour kept out of
neutral surfaces, and density appropriate for a professional tool.

### 1.3 Laws of UX (Yablonski)

Jon Yablonski's *Laws of UX* collects named findings from cognitive and
perceptual psychology (Gestalt proximity/similarity, Hick's, Fitts's,
Miller's, Jakob's, Postel's, the Doherty threshold, Von Restorff, serial
position, Zeigarnik, Tesler's, and others). Gestalt grouping, restraint and
aesthetic-usability are already covered above and in §3.4 and §3.9. The rest
were audited directly against the code rather than assumed. The citations point
into `src/`; they were re-anchored when the single file was split into modules,
and each was re-verified against the code at that point rather than translated.

| Law | Verdict | Evidence |
| --- | --- | --- |
| **Jakob's Law** — users expect this app to work like others they know | Followed | Undo/redo, drag-to-move, Esc-cancels/Enter-submits modals, click-row-to-select: all standard canvas-app conventions (§2.2, §3.9). |
| **Fitts's Law** — targets should be large enough and close to what they affect | Followed | Controls are 32px default / 28px small, growing to 36–40px under `@media (pointer:coarse)` (`src/styles/_tokens.scss:20` for the defaults, `src/styles/_touch.scss:2-6` for the coarse-pointer overrides); object actions (rotate, delete) live in Properties next to the object, not a distant toolbar (§2.2). |
| **Hick's Law** — more choices, slower decisions | Followed | The header exposes only three places plus a unit picker and Import/Export (`src/html/header.html`); section actions are one `+` each, not a flat list of every possible action. |
| **Miller's Law** — chunk information, don't list it flat | Followed | Left panel is chunked into named sections (Rooms, Items, Walls, Doors…) rather than one long list; each section collapses independently. |
| **Doherty Threshold** — respond within ~400ms and keep users informed | Followed | Toasts read `Math.max(1600, Math.min(5000, len*60))` ms (`readTime`, `src/ui/flash.js:23`), so short and long messages are both legible; no action currently runs long enough to need a spinner. |
| **Postel's Law** — be liberal in what input you accept | Followed | `parseLen()` accepts mixed units, fractions and slop in one string ("3ft 6in", "3 1/2\"", bare numbers) rather than one rigid format (`parseLen`, `src/core/units.js:25`). |
| **Von Restorff Effect** — the one thing that matters should look different | Followed | Danger actions get their own colour (`.menu button.danger`, `.btn.danger`) and destructive buttons are visually distinct from the neutral default (§3.2, §3.9). |
| **Serial Position Effect** — order affects what's remembered/misclicked | Followed | Destructive items are placed last, after a divider, in all nine `openMenu()` call sites — `plan/item-list.js`, `plan/layout-tree.js` (×2), `plan/floors.js`, `library/grid.js`, `library/adhoc-listings.js`, `library/folder-menus.js` (×2) and `library/marketplace.js` — each ending `{sep:true}, {label:'Delete…', danger:true, …}`. `openMenu` renders both (`src/ui/menu.js:32,35`). A reflexive first/last click never lands on Delete. |
| **Zeigarnik Effect** — unfinished tasks stay in mind | Followed | Ordinary actions (add item, place object) complete in one step, so there is nothing to leave unfinished. The one multi-step flow, blueprint import, shows how far along it is: a four-stage stepper (`bpStepperHTML`, `src/blueprint/wizard.js:9`) marks the stage you are on, every stage after the first has a Back handler, and the committed import stays reversible afterwards through “Undo this import”. |
| **Tesler's Law** — complexity can be moved, not removed | Followed | The app absorbs unit conversion, collision/fit checks and snapping instead of asking the user to compute or avoid them (§1.2, Norman "constraints over errors"). |

No violations were found in this pass. The table exists so a future change can
be checked against a specific law instead of a vague "feels off", and so a
new violation gets caught in review rather than rediscovered later.

### 1.4 Our priority order

> **Practical → Intuitive → Simple → Beautiful**

When two goals conflict, the earlier one wins.

1. **Practical.** It does the job quickly and correctly. Placing, measuring and
   adjusting are never slowed down by the interface.
2. **Intuitive.** A first-time user can work it out by looking. Controls look
   like what they do and sit next to what they change.
3. **Simple.** One visual language, one word per idea, and nothing that
   doesn't carry information.
4. **Beautiful.** This follows from the first three, as calm, precise and
   well-proportioned work. It is never a layer added on top.

I questioned this order and kept it, with two clarifications:

- **Simple vs intuitive.** Hiding a control makes a screen simpler but harder
  to understand. Hover-only buttons are the typical case. When the two
  conflict, *intuitive wins*: row actions stay visible, but they're styled
  quietly.
- **Honest is a constraint, not a priority.** No trade-off lets the interface
  misrepresent state. That means no ambiguous "locked" labels, no colour-only
  warnings, and no destructive action styled like a harmless one.

---

## Part 2 — Decisions (the redesign, and why)

### 2.1 Audit of the previous interface

| # | Problem found | Principle broken |
| --- | --- | --- |
| 1 | The header switch mixed **modes** (Room, Furniture) with **places** (Inventory, Marketplace). The Library screen then repeated "My Library / Marketplace" as a second tab row. | Conceptual model; consistency |
| 2 | One concept had **three names**: "Inventory" (header), "My Library" (tab) and "Things" (panel), plus "item" in the library and "thing" in dialogs. | Consistency |
| 3 | The left "Room" panel stayed fully visible in Furniture mode. It told you to "Switch to Room mode". The right "Things" panel in Room mode said "Furniture is locked". About half of all panel space was irrelevant at any moment. | Minimalism; relevance |
| 4 | View settings (snap, show sizes) were buried at the bottom of the Room panel. They affect both modes. | Mapping |
| 5 | The canvas toolbar mixed history, zoom, object actions and export in one strip. The rotate glyphs (⟲ ⟳) rendered at about 6px and couldn't be read. "Remove" was always shown, even with nothing selected. | Hierarchy; signifiers; feedback |
| 6 | A permanent "Room locked" badge used the accent colour to show a *non-state*. | Honest use of colour |
| 7 | Every list row was a card with two to four lines and its own bordered buttons, so the eye had to scan a wall of boxes. | Hierarchy; restraint |
| 8 | Emoji were used as icons (📁 📄 📚 🏪 📦 🔗). They render differently on every OS, and they add colour noise where nothing is being signalled. | Consistent in every detail; functional colour |
| 9 | Empty states used dashed boxes, which is a drop-zone signifier. | Honest signifiers |
| 10 | The accent was green and warnings were red. With red-green colour blindness (about 1 in 12 men), both simulate to near-identical muddy greys: 1.1–1.3:1 luminance difference and no hue difference. | Inclusive; don't rely on colour |
| 11 | Input borders had 1.4:1 contrast. An empty text field was almost invisible. | Practical; WCAG 1.4.11 |
| 12 | Dark mode showed white text on the accent at 2.5:1, and the canvas used hard-coded light colours, so wall labels disappeared against the dark stage. | Contrast; consistency |
| 13 | The item dialog put the advanced *Id* field and a three-line explanation above *Shape* and *Size*, the fields everyone needs. | Progressive disclosure |
| 14 | Toast messages vanished after 1.1s whatever their length, so longer messages couldn't be finished. | Feedback must be readable |
| 15 | Delete confirmations used the *primary* (encouraging) button style. | Honest styling of destructive actions |
| 16 | Long explanatory paragraphs were permanently visible ("Things live in your inventory, so…"). | As little design as possible |

### 2.2 Information architecture

**Places are navigation. Modes are tools.**

- The header holds the three **places**: **Plan · Library · Marketplace**.
  Each is a different screen with different content.
- The **mode** switch (**Room | Furniture**) sits on the canvas, top-left,
  because it only changes what the canvas does. The control sits next to what
  it controls (mapping). Returning to *Plan* restores the last mode used.
- One name per concept: the collection is the **Library**, and what's in it
  are **items**. "Thing" and "Inventory" are gone from the interface. The data
  model keeps its old field names, and that's fine: users never see them.

**The Plan screen follows the layout canvas tools like Figma, Sketch and CAD
software have converged on:**

```
┌ header: Room Planner   Plan  Library  Marketplace          units  Import Export ┐
├──────────────┬────────────────────────────────────────────┬────────────────────┤
│ PLAN (lists) │ [Room|Furniture]                 [↶][↷]    │ PROPERTIES         │
│  Rooms       │                                            │  Selection         │
│  ─ room mode │              canvas                        │  Room  (room mode) │
│    Walls     │                                            │  Stock (furniture) │
│    Doors…    │                                            │  View              │
│    Structure │                                            │                    │
│  ─ furniture │ [− fit +]                   status readout │                    │
│    Items     │                                            │                    │
└──────────────┴────────────────────────────────────────────┴────────────────────┘
```

- **Left = what exists and what you can add.** These are lists: rooms, then
  the items (Furniture mode) or the walls, doors and structure (Room mode).
  Only the lists for the current mode are shown.
- **Right = properties.** The selected object comes first. When nothing is
  selected, a one-line hint says what appears there. Below that sit the
  properties of the room and the plan-wide settings (stock counting, view,
  snap).
- **Canvas chrome is split by role into four corners:** mode (top-left),
  history (top-right), zoom (bottom-left), status (bottom-right). Object
  actions like rotate, duplicate and remove live only in Properties, next to
  the object's other values, plus their keyboard shortcuts. They're no longer
  repeated in the toolbar.
- **Save image** moved into the Export dialog, where output lives.

**List sections put their add action in the section header** (a `+` on the
right). If the list holds more than one kind, `+` opens a menu: Door / Window,
or Pillar / Interior wall. It's one pattern used in every section.

### 2.3 Colour: why blue, why ink buttons

I considered three accent options:

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| Keep the green | Continuity | Indistinguishable from the red warning for red-green colour-blind users. Warnings are central here: "doesn't fit", "can't open" | ✗ |
| Braun signal orange | Distinctive; direct Rams reference | Orange and the danger red collapse into each other for protanopes, and both mean "attention" | ✗ |
| **Signal blue** | Stays blue under every common colour-vision deficiency, so it's always separable from red. A convention for "selected" in canvas tools. Contrasts with the muted furniture palette | Common in software | **✓** |

"Common" is not a flaw when the goal is intuitive and long-lasting.

**Colour has exactly two jobs:**
- **Blue = focus and selection.** The object you're acting on, the focused
  control, a ticked checkbox, a pressed filter chip, a drop target, a link.
- **Red = danger.** Invalid placements, errors, and destructive action labels.

Everything else is neutral, including the primary button. The **primary
button is ink** (near-black in light mode, near-white in dark mode). It's the
highest-contrast object on screen, which is the right hierarchy for the one
action you most likely want. It follows Braun's black-on-white controls and
keeps blue free to mean *selected*. **Navigation state** (current place,
current mode, current room) is shown by a raised or filled neutral surface
and heavier text, not by colour. You are *in* a place; you *select* an object.

### 2.4 Light and dark

The app follows the operating system (`prefers-color-scheme`). There is no
in-app toggle: an extra control for a preference the OS already manages would
be clutter. Dark mode uses the same tokens with new values, never a separate
design. The canvas reads its palette from the same theme. Walls become mid-grey
in dark mode so they stand out from both the dark stage and a light floor.
**Saved images always use the light palette**, because they're printed and
shared.

### 2.5 Type

- **One family, the system UI font.** It's the platform's native material,
  instant to load and readable. It fits Rams' "honest materials" idea.
- **Monospace only for code-like values** (ids, hex colours, JSON). Length
  inputs previously used monospace. I dropped that: `tabular-nums` in the UI
  font aligns digits just as well, looks calmer, and ft/in marks read fine.
- **Five sizes, three weights** (see §3.3). Hierarchy comes from weight and
  colour first, size second.

### 2.6 Icons

Emoji are replaced by a single set of line icons: 16px grid, 1.5px stroke,
round caps, `currentColor`. They're drawn inline as SVG, so there are no
network requests or font files. Icon-only buttons are allowed **only** for
glyphs everyone already knows (undo, redo, zoom in/out, add `+`, more `⋯`,
close `×`, collapse chevrons). Each one has `aria-label` and `title`.
Anything less universal gets a text label.

---

## Part 3 — Rules

### 3.1 Voice and wording

- **One word per concept:** *Plan, room, wall, door, window, pillar,
  interior wall, item, Library, Marketplace, listing, folder, tag.*
- **Sentence case** everywhere, including buttons and headings. No Title Case,
  and no ALL CAPS except the tiny collapsed-panel rail labels.
- **Buttons are verbs** saying what will happen: "Add item", "Delete folder",
  "Use this shape". Never "OK" or "Yes".
- **An ellipsis (…) means more input follows.** "Export…" opens a dialog;
  "Duplicate" acts immediately.
- **Hints are one sentence**, shown only where they prevent a mistake or
  explain something not obvious. If the UI needs a paragraph, fix the UI.
- **Messages say what happened and what to do:** "Nowhere clear to put it —
  drag it where you want", not "Error".

### 3.2 Colour tokens

All colour comes from these tokens. No hex values in component CSS. Canvas
colours come from the matching `CANVAS` palette in JS.

**Where they live:** [`src/styles/_tokens.scss`](src/styles/_tokens.scss), the
first partial loaded by [`src/styles/main.scss`](src/styles/main.scss). They
used to sit at the top of `index.html`'s `<style>` block; Phase 3 split that
block into fourteen partials and nothing else about them changed.

**They are CSS custom properties and they stay CSS custom properties.** Do not
convert one to a Sass `$variable`, however tempting the tooling makes it look.
Dark mode works by re-declaring all 24 of them inside
`@media (prefers-color-scheme:dark)` — the mechanism is the cascade. A Sass
variable is resolved at compile time and cannot cascade, so converting them
would silently delete dark mode while every test stayed green. This is the one
rule in this file that a build tool can break for you.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--surface` | `#fcfcfb` | `#1c1c1b` | Panels, header, cards, inputs, menus, modals |
| `--surface-2` | `#f4f4f2` | `#252524` | Hover fill, section backgrounds, subtle wells |
| `--surface-3` | `#eaeae7` | `#2f2f2d` | Pressed, current nav item, segmented track |
| `--stage` | `#e6e6e2` | `#141413` | Canvas background (the "table" the plan sits on) |
| `--line` | `#e0e0dc` | `#34342f` | Dividers, card and row borders |
| `--line-strong` | `#8f8f89` | `#707069` | Input / select / checkbox borders (≥3:1) |
| `--ink` | `#1d1d1b` | `#ececea` | Primary text, primary button fill |
| `--ink-2` | `#585853` | `#adada7` | Secondary text, labels |
| `--ink-3` | `#6f6f69` | `#8e8e88` | Tertiary text: hints, metadata, placeholders (≥4.5:1 on surface) |
| `--accent` | `#2a5bd7` | `#7aa2f7` | Selection, focus, checked, links |
| `--accent-soft` | `#e9effc` | `#1f2a45` | Selected-row fill, drop-target fill |
| `--on-accent` | `#ffffff` | `#1c1c1b` | Text on solid accent |
| `--danger` | `#c0392b` | `#f2786a` | Errors, invalid placement, destructive labels |
| `--danger-soft` | `#fbeae8` | `#3b2320` | Destructive hover fill, error wells |

Measured contrast (WCAG 2.x): ink on surface 16.5 / 14.4; ink-2 7.0 / 7.6;
ink-3 4.9 / 5.2; accent 5.7 / 6.8; danger 5.3 / 6.2; on-accent on accent
5.9 / 6.8; line-strong 3.2 / 3.4.

**Rules**
- Text only uses `ink`, `ink-2`, `ink-3`, `accent` (links and selected labels)
  or `danger`.
- **Never use colour alone for state.** An invalid placement is red *and*
  hatched. A selected row is tinted *and* bordered. An error message is red
  *and* worded as an error.
- User content colours (furniture, floor) are content. They are never re-tinted
  by the theme.

### 3.3 Typography

System stack: `ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica
Neue", Arial, sans-serif`. Code stack: `ui-monospace, SFMono-Regular, Menlo,
Consolas, monospace`. `font-variant-numeric: tabular-nums` on the body.

| Token | Size / line-height | Use |
| --- | --- | --- |
| `--fs-xs` | 11 / 16 | Badges, collapsed-rail labels, tile metadata |
| `--fs-sm` | 12 / 16 | Hints, secondary metadata, small buttons, chips |
| `--fs-md` | 13 / 20 | Body, controls, list rows, section titles |
| `--fs-lg` | 15 / 20 | Modal titles, detail sub-headings |
| `--fs-xl` | 20 / 28 | Detail page title |

Weights: **400** (body), **500** (controls, row names), **600** (headings,
current or selected emphasis, primary button). No other weights.

### 3.4 Space

A 4px base with a fixed scale: **4, 8, 12, 16, 20, 24, 32, 40**. No other
values.
- **Inside a group:** 4–8. **Between groups:** 16–24. The gap between groups
  must be clearly bigger than the gap within them, so grouping is visible
  without borders (Gestalt proximity).
- Panel padding 16. Section padding 16 vertical and 16 horizontal. Modal
  padding 20.
- **Control heights:** 32 default, 28 small, 24 icon-in-row. On coarse
  pointers (touch), interactive targets grow to at least 40.

### 3.5 Shape

- `--r-sm: 4px` for chips' inner parts, swatches, checkboxes, tooltips.
- `--r-md: 6px` for buttons, inputs, rows, tiles, cards.
- `--r-lg: 10px` for floating canvas controls, menus, modals.
- `--r-full` for pills (chips, badges) only.

A larger element gets a larger radius. Nested radii get smaller as they go
inward.

### 3.6 Elevation

Borders separate things *on* the same surface. Shadows mean *floating above*
it. Never both for the same job.

| Token | Use |
| --- | --- |
| none | Panels, rows, tiles, cards (flat, bordered) |
| `--shadow-1` | Canvas controls, raised segment thumb |
| `--shadow-2` | Menus, suggestion lists, toasts |
| `--shadow-3` | Modals |

Hovering a tile changes its border, not its shadow. Things don't lift for no
reason.

### 3.7 Motion

- `--dur-fast: 120ms` for colour and border changes on hover and press.
- `--dur: 180ms` for menus, modals and toasts appearing. They use opacity plus
  a 4px or 2% scale/translate, with an ease-out curve.
- Motion shows cause and effect only. Nothing loops, bounces, or animates on
  load.
- `prefers-reduced-motion: reduce` turns all transitions off.

### 3.8 Iconography

- 16px viewBox, 1.5px stroke, round caps and joins, no fills (except dots),
  `currentColor`.
- The set: `undo, redo, plus, minus, fit, more, chevron-left/right/down,
  folder, folder-plus, room, floor, plan, library, store, box, link,
  rotate-l, rotate-r, close, search, ruler, photo, check`.
- Icons pair with text unless universal (§2.6). Icon colour follows the text
  colour of its control.

### 3.9 Components

**Buttons.** Four variants, two sizes. States are defined once.

| Variant | Look | When |
| --- | --- | --- |
| `.btn` (default) | surface fill, `line` border, ink text | Most actions |
| `.btn.primary` | ink fill, surface text | The single most likely action in a view or dialog (max one visible per group) |
| `.btn.danger` | default look with danger text; danger-soft fill on hover | Destructive actions (delete, remove) |
| `.btn.quiet` | no fill or border until hover | Row actions, toolbar icons, section-header `+`, tertiary actions |

- Sizes: default (32px) and `.sm` (28px). `.icon` makes a square button.
- States: hover changes the fill, pressed goes one step darker, focus-visible
  shows a 2px accent ring (offset 2px), disabled is 40% opacity with no
  pointer events.
- Confirmation dialogs for destructive actions use a **danger primary** (solid
  danger fill). Delete is never styled as the encouraging primary.

**Inputs, selects, textareas.** Surface fill, 1px `line-strong` border,
`r-md`, 32px tall. Hover darkens the border to ink-3 contrast. Focus shows
an accent border plus a 3px `accent-soft` ring. Invalid shows a danger border
plus a ring. Placeholder text is ink-3. Checkboxes and radios use
`accent-color: var(--accent)`.

**Field row.** Label on the left (96px column, ink-2, `fs-md`) and control on
the right. Stack them vertically inside dialogs narrower than 360px. Labels
are short nouns: "Width", "Offset", "Owned".

**Segmented control.** Mode switch and dialog sub-modes. A `surface-3` track
with a 2px inset. The active segment is a raised `surface` thumb with
`shadow-1` and weight 600. Inactive segments are ink-2. It shows position, not
colour.

**Top navigation.** Text tabs in the header. The current tab is ink, weight
600, with a 2px ink underline on the header's bottom edge. Others are ink-2.

**Wizard stepper.** A multi-step modal flow (blueprint import) shows its steps as a
horizontal row of numbered badges joined by 1px lines, below the modal title. Like
other navigation state (§2.3), the current step is shown by weight and fill, never
colour: upcoming steps are an outlined `line-strong` circle with an `ink-3` label; the
active step is an ink-filled circle with a bold ink label; a completed step shows the
`check` icon on a `surface-3` circle with an `ink-2` label, and the line after it turns
`line-strong`. The step list is a plan, not a stepper you can click ahead on — moving
between steps still goes through the modal's own Back and primary actions.

**Panel.** Surface background with a 1px `line` border on the side facing the
canvas. A sticky head holds the name (ink-3, `fs-xs`, 600, uppercase, +0.04em
tracking) and the collapse chevron. When collapsed it becomes a 36px rail with
vertical text.

**Section** (inside a panel). Separated from the section above by a 1px `line`
divider across the full width. Its header row holds the title (`fs-md`, 600,
ink), then any actions (quiet icon buttons) on the right, then a quiet
chevron. Clicking the title toggles collapse. The body follows 8px below.

**List row.** One line where possible, two at most. 32px minimum height,
`r-md`, no border at rest. Hover uses `surface-2`. Selected uses `accent-soft`
fill with a 2px accent bar on the inside left. Structure: optional
swatch or icon, then name (500, truncates), then metadata (ink-3, `fs-sm`,
right-aligned or on a second line), then trailing quiet actions. The
primary action of a row is clicking the row.

**Tree row.** A list row with 12px indent per level, plus a caret button and
an icon. The current room gets a `surface-3` fill with weight 600 (navigation
state, not selection).

**Chip.** A pill, `fs-sm`, `line` border. Filter chips pressed get a solid
accent fill with on-accent text. Tag chips shown for display are ink-2 text
with no fill. Inherited tags use a dashed border and ink-3 text, because
dashed here means "comes from somewhere else". It's the one sanctioned use of
dashes besides drop zones.

**Badge / count.** A `surface-3` pill with ink-2 text and `fs-xs` weight 600.
Neutral, because a count is information, not an alarm.

**Tile** (Library grid). `r-md`, `line` border, flat. A preview area on top
shows the real outline of the item's shape, drawn on a `surface-2` well. Below
it: name (500) and metadata (ink-3). Hover changes the border to
`line-strong`. Keyboard focus shows a ring. Tile actions are a quiet `⋯` and,
where relevant, a visible "Add" button. Hover overlays are never the only way
to act.

**Text tile** (Marketplace entries and other things without a picture). If
there's no image, the name *is* the content, so the tile is shaped for reading,
not for a thumbnail. Minimum column width 264px (about 36 characters per
line). The name wraps (clamped at 3 lines, full text in `title`), and the
action sits vertically centred on the right. No placeholder icon standing in
for a picture, and no metadata line that repeats where you already are, like
"furniture, ikea" inside the IKEA folder. Grid rows grow only as much as their
longest name needs.

**Menu.** Surface, `r-lg`, `line` border, `shadow-2`, 4px padding, 32px items,
optional title (ink-3, `fs-xs`). Destructive items have danger text and come
last, after a divider.

**Modal.** Surface, `r-lg`, `shadow-3`, 480px max width (a multi-step flow like
blueprint import may widen to 980 or 1120px, since its two-column stages need the
room). Title `fs-lg` 600. The body scrolls. Footer: an error message (danger, left,
grows), then Cancel (default) and the action (primary, or danger for destructive
ones). In a multi-step flow, that left button reads Back instead and returns to the
previous step rather than closing the wizard. Enter submits, Esc cancels, and
clicking the backdrop cancels — both still leave the whole flow, even mid-wizard.
Advanced fields sit inside a closed `details.adv` disclosure at the end.

**Toast.** An ink-filled pill (surface text), `shadow-2`, top-centre of the
area it relates to. Visible for `max(1.6s, 60ms × characters)`, capped at 5s.
Errors in the Library use the danger fill.

**Empty state.** Quiet ink-3 text, centred, 16–24px padding, no border. It
ends with the action that fixes the emptiness when one exists ("Add item",
"Load samples").

**Floating canvas control.** Surface, `line` border, `r-lg`, `shadow-1`, 4px
padding, quiet icon buttons inside.

### 3.10 Canvas drawing

- Palettes: `CANVAS.light` and `CANVAS.dark` in JS mirror the tokens. The
  export image always uses `light`.
- **Only the stage changes with the theme:** the background, walls and wall
  labels. The floor is the user's colour and usually light. Selection,
  handles and warnings are drawn on top of it, so they keep their light-theme
  values in both themes. A dark halo on a light floor would read as a black
  outline, not a selection.
- **Selection:** a 2px accent outline over a 4px surface halo, plus a round
  rotate handle (surface fill, accent stroke).
- **Invalid placement:** a danger outline and 45° danger hatching. Two cues,
  not just colour.
- **Room handles** (Room mode): 10px squares for corners, a 14px circle for
  openings. Surface fill with accent stroke; solid accent when selected.
- **Dimension labels:** ink-2 in the UI font at 11–12px, and accent weight 600
  when their wall is selected.
- **Measurements:** a 1.5px ink dimension line with end ticks over a 4px
  surface halo, and the length on a surface pill. While the Measure tool is
  on, the thing under the pointer shows its anchors (corner squares and a
  centre dot). The anchor a click would take, and both ends of a selected
  measurement, are filled in accent. The line being drawn is a dashed accent
  line.
- **Item labels** show only the name. The selected item's width and depth are
  drawn around it as dimension lines, in the same style as measurements:
  width along the edge opposite the rotate handle, depth along the end
  further right on screen. "Size of the selected item" under View turns them off.
- **Furniture in Room mode** fades to 40% opacity. It's locked, and the fading
  shows that.

### 3.11 Layout and responsiveness

- **Wide (>900px):** a three-column Plan screen and a two-column Library.
  Panels can be collapsed.
- **Narrow (≤900px):** the header nav remains the only navigation (no second
  tab bar). The canvas is sticky at the top (about 50vh). Below it, one
  scrolling column reads in task order: *Selection → Rooms → the mode's lists
  → Room properties / Stock → View*. Controls grow to 40px touch targets.
- The page never scrolls sideways. Long names truncate with an ellipsis and
  the full text is in `title`.
- **Truncation is a last resort, not a layout.** Size a container from the
  real data. If more than about 10% of values would be cut off, the container
  is too narrow: widen it or let the text wrap. The words at the end of a name
  are usually what tell similar items apart ("… Tall (6 Door)" vs "… Tall
  (3 Door)"). For example, marketplace names have a median of 25 characters
  and 90% are under 40, which the old 22-character tile cut off more than
  half the time.

### 3.12 Accessibility (non-negotiable)

- Text contrast ≥4.5:1, and UI component boundaries and icons ≥3:1, in both
  themes.
- Everything is reachable and operable by keyboard, and focus is always
  visible (2px accent ring).
- Every icon-only control has `aria-label` and `title`. Toggles expose
  `aria-pressed`, and collapsibles expose `aria-expanded`.
- State is never shown by colour alone (§3.2).
- Motion respects `prefers-reduced-motion`.

---

## Review checklist

Before adding or changing any UI, answer each question:

1. **Purpose.** Does this need to exist? Does it duplicate something already
   on screen?
2. **Place.** Is it next to what it affects? Is it a place (header), a mode
   (canvas), a list (left) or a property (right)?
3. **Signifier.** Can a first-time user tell what it does and that it can be
   used, without hovering or reading a hint?
4. **Feedback.** Does something visible happen immediately, and is it readable
   long enough?
5. **Hierarchy.** Does its visual weight match its importance? Is there at
   most one primary action?
6. **Tokens.** Does it only use the colour, type, space, radius, shadow and
   motion scales above?
7. **Words.** Does it use the glossary term, sentence case, and a verb on the
   button?
8. **Honesty.** Is colour doing a job? Is a destructive action styled as
   destructive? Is state shown in more than one way?
9. **Everyone.** Does it meet contrast, keyboard and touch-target rules in
   light *and* dark?
10. **Less.** Would the screen be easier to use without it?

---

### Sources

- [Dieter Rams: Ten principles for good design — designmanifestos.org](https://designmanifestos.org/dieter-rams-ten-principles-for-good-design/)
- [Dieter Rams: 10 Timeless Commandments for Good Design — IxDF](https://ixdf.org/literature/article/dieter-rams-10-timeless-commandments-for-good-design)
- [Dieter Rams colour palette & functional colour — Hue Atlas](https://hueatlas.com/color-palettes/dieter-rams-color-palette/)
- [The Braun Style — Aesthetics of Design](https://www.aesdes.org/2023/01/31/aesthetic-exploration-the-braun-style/)
- [Understanding Don Norman's Principles of Interaction — UX Magazine](https://uxmag.com/articles/understanding-don-normans-principles-of-interaction)
- [10 Usability Heuristics for User Interface Design — NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [10 Usability Heuristics Applied to Complex Applications — NN/g](https://www.nngroup.com/articles/usability-heuristics-complex-applications/)
- [Josef Müller-Brockmann: Swiss Style & Grid Systems — TGDS](https://www.thegraphicdesignschool.com/design-history/joseph-mueller-brockmann/)
- [Design Philosophy: Kenya Hara, Emptiness, Not Simplicity](https://blakecrosley.com/blog/design-philosophy-kenya-hara)
- [The art of simple design — MUJI](https://www.muji.eu/pages/muji-stories/the-art-of-simple-design.html)
- [Refactoring UI — key points (Wathan & Schoger)](https://medium.com/design-bootcamp/top-20-key-points-from-refactoring-ui-by-adam-wathan-steve-schoger-d81042ac9802)
- [How we redesigned the Linear UI — Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Laws of UX — Jon Yablonski](https://lawsofux.com/)
