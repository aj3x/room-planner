// @ts-check
/* Looking up one of the shell's own elements by id — the canvas, the panes,
   the Library's toast — for the few ui-kit and canvas modules that work on
   the shell rather than render into it. A leaf: it imports nothing.
   Components hold their own elements and never look anything up. */

/** @type {(id: string) => HTMLElement} */
const $ = id => /** @type {HTMLElement} */(document.getElementById(id));   // the shell's, which is static markup parsed before any script
export {$};
