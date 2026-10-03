// @ts-check
/* The three helpers every render path uses: look an element up, escape text
   for innerHTML, and an icon from the <symbol> sprite at the top of <body>.
   A leaf: it imports nothing, so anything in ui-kit/ can use it without joining
   a cycle. ui-kit/modal.js re-exports $ and svgI, ui-kit/panels.js re-exports esc. */

/* Typed `any`, deliberately: which element an id names (an <input>, a
   <canvas>, a <select>) is written in the HTML partials, where tsc cannot see
   it, and every caller knows. Typing it HTMLElement would mean a cast at each
   of ~150 call sites that read .value or .checked — in exactly the code Phase 6
   replaces with components that hold their own elements. */
/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
/** @param {unknown} s */
function esc(s){ return String(s).replace(/[&<>"']/g,c=>/** @type {Record<string, string>} */({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
/* icons come from the <symbol> sprite at the top of <body> */
/** @param {string} name */
const svgI = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export {$, esc, svgI};
