/* Drawing: the canvas palette, and in later rounds draw() and the draw*()
   helpers that render the plan.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. (setForceLightCanvas is the exception it names itself: it
   was added to index.html one commit earlier, beside the binding it wraps, and
   moved here with the rest.)

   This is the FIRST instalment of this file and it is only the palette. draw()
   itself could not come: it needs the selection lets (sel, selSet, roomSel,
   floorSel, mergeSel, floorGuides, floorSnapNote, alignGuides, alignNote), the
   interaction lets (drag, drawState, drawCursor, wallDrawState,
   wallDrawShift), W and H, and four draw*() helpers that live in the
   measuring, split-room and walk-path regions. See the canvas/ round's notes
   in .claude/plans/refactor-split.md.

   The palette had to lead, because every canvas module reads PAL().

   Top-level: window.matchMedia() is a BOM read that returns a live query
   object -- no listener, no work scheduled. The `change` listener that used to
   follow PAL() stayed in index.html at its exact spot, per the convention the
   ui/ round set: registering it at import time would move it ahead of every
   other listener in the file. */

/* canvas colours mirror the CSS tokens (DESIGN.md §3.10); saved images always use `light`.
   Only what sits on the stage (background, walls, wall labels) changes in dark mode — selection,
   handles and warnings are drawn over the floor, which is the user's own (usually light) colour. */
const CANVAS={
  light:{stage:'#e6e6e2', stageAccent:'#2a5bd7', wall:'#2b2b29', wallEdge:'rgba(29,29,27,.5)', pillar:'#585853', ink:'#1d1d1b', ink2:'#585853',
         surface:'#fcfcfb', accent:'#2a5bd7', accentSoft:'#e9effc', danger:'#c0392b', dangerRGB:'192,57,43',
         grid:'rgba(29,29,27,.075)', trim:'rgba(29,29,27,.10)', glass:'#cfd8e2', glassLine:'#5c7a99', swing:'rgba(29,29,27,.05)', swingLine:'rgba(29,29,27,.3)',
         scrim:'rgba(20,20,19,.45)', ok:'#1f7a4d', okSoft:'#dcf0e4'},
  dark: {stage:'#141413', stageAccent:'#7aa2f7', wall:'#8a8a84', wallEdge:'rgba(236,236,234,.35)', pillar:'#6f6f69', ink:'#1d1d1b', ink2:'#adada7',
         surface:'#fcfcfb', accent:'#2a5bd7', accentSoft:'#e9effc', danger:'#c0392b', dangerRGB:'192,57,43',
         grid:'rgba(29,29,27,.075)', trim:'rgba(29,29,27,.10)', glass:'#9fb3c8', glassLine:'#5c7a99', swing:'rgba(29,29,27,.06)', swingLine:'rgba(29,29,27,.35)',
         scrim:'rgba(20,20,19,.45)', ok:'#1f7a4d', okSoft:'#dcf0e4'}
};
const darkMQ=window.matchMedia('(prefers-color-scheme: dark)');
let forceLightCanvas=false;
function setForceLightCanvas(v){ forceLightCanvas = v; }
const PAL = () => (!forceLightCanvas && darkMQ.matches) ? CANVAS.dark : CANVAS.light;

export {CANVAS, darkMQ, PAL, setForceLightCanvas};
