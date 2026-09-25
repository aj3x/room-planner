/* The notification bus. A leaf: this module imports nothing and runs nothing
   at import time.

   Why it exists. A mutation used to name every view that had to repaint:
   canvas/corners.js ended a corner drag with `renderRoom(); renderWalls();
   renderRoomSel(); renderOpen();`, four functions imported out of plan/. Doing
   that from seven canvas/ modules meant canvas/ depended on plan/, plan/
   already depended on canvas/ for draw(), and the two directories fused into a
   single 28-module import cycle (.claude/plans/decoupling.md §1).

   So a mutation now says what changed and stops there. Who listens is boot.js's
   business, which is the only module that legitimately knows the whole app.

   `emit` is synchronous and runs subscribers in subscription order, which is
   what makes this a safe swap for a list of calls: `repaint('walls','roomSel')`
   does exactly what `renderWalls(); renderRoomSel();` did, in that order, on
   the same tick. Nothing here catches: a render that throws should still take
   the stack down at the point of failure, exactly as the direct call did.

   `repaint` is deliberately not one big 'something changed' event. Call sites
   repaint different subsets of the side panels on purpose — a wall drag
   rebuilds the wall list but not the room's colour inputs — and collapsing
   that would rebuild inputs under the user's cursor. The keys are the panels,
   and each call site names the same ones it always named. */

const subs = new Map();

/* Subscribe `fn` to `topic`. Returns an unsubscribe function; the app does not
   use it, but a test that boots twice needs it. */
function on(topic, fn){
  if(!subs.has(topic)) subs.set(topic, []);
  const list = subs.get(topic);
  list.push(fn);
  return () => { const i=list.indexOf(fn); if(i>=0) list.splice(i,1); };
}

/* Notify every subscriber, in order, synchronously. A topic nobody listens to
   is not an error: it means that view is not on screen in this build or this
   test, which is the whole point of not importing it directly. */
function emit(topic, ...args){
  const list = subs.get(topic);
  if(!list) return;
  for(const fn of list.slice()) fn(...args);
}

/* Repaint named panels, in the order given.
   Keys, and what boot.js wires each to:
     room      renderRoom        the room's own properties
     walls     renderWalls       the wall list
     roomSel   renderRoomSel     the room-mode selection panel
     openings  renderOpen        the doors/windows list
     sel       renderSel         the furniture selection panel
     inv       renderInv         the Things pane
     floorSel  renderFloorSel    Floor mode's properties pane
     tree      renderTree        the room/folder tree
     all       renderAll         every Plan-screen panel
     libAll    renderLibAll      the Library/Marketplace screen */
function repaint(...keys){ for(const k of keys) emit('paint:'+k); }

/* Test hook. The app never calls this. */
function resetBus(){ subs.clear(); }

export {on, emit, repaint, resetBus};
