/* The three helpers every render path uses: look an element up, escape text
   for innerHTML, and an icon from the <symbol> sprite at the top of <body>.
   A leaf: it imports nothing, so anything in ui/ can use it without joining
   a cycle. ui/modal.js re-exports $ and svgI, ui/panels.js re-exports esc. */

const $ = id => document.getElementById(id);
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
/* icons come from the <symbol> sprite at the top of <body> */
const svgI = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export {$, esc, svgI};
