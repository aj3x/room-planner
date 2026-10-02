/* Late-bound entry points. A leaf: this module imports nothing, and nothing it
   holds is evaluated at import time.

   The problem it solves: a feature needs to call into another, and the direct
   import closes an import cycle across directories. So the caller asks for a
   name instead, and `boot.js` — which sits outside the graph, because nothing
   imports it — does the wiring. The edge still exists at run time; it just no
   longer exists at module-resolution time, which is the only place cycles are
   decided.

   What is left here, and why each one cannot be a plain import yet (the
   feature-folder reorganisation, Phase 4 of
   .claude/plans/frontend-architecture.md, is what removes them):
     blueprint.uploadDialog/undoImport/lastImport
                         plan/floors.js's floor menu -> blueprint/; blueprint
                         commits back through plan/, so the import would pull
                         all twenty blueprint modules into plan/'s cycle.
     plan.setMode, plan.activateLayout
                         a canvas tool (drawing a room, a wall, a split) ends by
                         switching mode or room; plan/ imports canvas/, so
                         canvas/ -> plan/ would fuse the two into one cycle.
     ui.flash            model/walls.js reports a refused edit; model/ may not
                         import ui/ (eslint.config.js).
   Repainting is not on this list and must not come back to it: views
   subscribe to signals (core/signals.js).

   Use this sparingly. Every `use()` is a dependency the import graph can no
   longer see. If a plain import does not create a cycle, write the plain
   import.

   `use()` returns undefined for a name nobody provided, rather than throwing.
   A unit test that imports `plan/floors.js` without running `boot()` gets a
   floor menu with no blueprint items on it, which is correct — the feature
   genuinely is not wired up — instead of a crash. Call sites that must have
   the name use `expect()`. */

const slots = new Map();

/* Register `value` under `key`. Called from boot.js only. Re-providing a key
   replaces it; nothing in the app does that, but tests re-boot. */
function provide(key, value){ slots.set(key, value); }

/* The registered value, or undefined. Guard the result, or gate the whole
   call site on `has()`. */
function use(key){ return slots.get(key); }

/* Whether anything is registered under `key`. Use it to decide whether a menu
   item, button or section should exist at all. */
function has(key){ return slots.has(key); }

/* The registered value, or a loud failure naming the key. For call sites where
   a missing name is a wiring bug rather than an absent feature. */
function expect(key){
  if(!slots.has(key)) throw new Error(`registry: nothing provided for "${key}"`);
  return slots.get(key);
}

/* Test hook. The app never calls this. */
function resetRegistry(){ slots.clear(); }

export {provide, use, has, expect, resetRegistry};
