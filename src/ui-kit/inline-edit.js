// @ts-check
/* The single-click delay that lets a double-click land. (Renaming in place
   is ui-kit/parts.jsx's RenameField.) */

/* A plain click and the first click of a double-click look identical, so hold
   the single-click action back long enough to see whether a second one lands.
   Rows that re-render themselves on click need this or the second click would
   arrive at a fresh element and never become a dblclick. */
/** @type {number|undefined} */
let clickT;
/** @param {() => void} fn */
function singleClick(fn){ clearTimeout(clickT); clickT=setTimeout(()=>{ clickT=undefined; fn(); }, 190); }
function cancelSingleClick(){ clearTimeout(clickT); clickT=undefined; }

export {singleClick, cancelSingleClick};
