/* Late-bound entry points. A leaf: this module imports nothing, and nothing it
   holds is evaluated at import time.

   The problem it solves: a feature's menu item needs to call into another
   feature, and the direct import closes a cycle. `plan/floors.js` wanted
   `bpUploadDialog` from `blueprint/step1-upload.js`; blueprint reaches back
   into `plan/` to commit what it imported; and those two edges were enough to
   pull all twenty blueprint modules into the 45-module tangle described in
   `.claude/plans/decoupling.md`.

   So the caller asks for a name instead of importing it, and `boot.js` — which
   sits outside the graph, because nothing imports it — does the wiring. The
   edge still exists at run time; it just no longer exists at module-resolution
   time, which is the only place cycles are decided.

   Use this sparingly. It is for the handful of cross-feature calls that would
   otherwise close a cycle, not a general service locator: every `use()` is a
   dependency the type checker and the import graph can no longer see. If a
   plain import does not create a cycle, write the plain import.

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
