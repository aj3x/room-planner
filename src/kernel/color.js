// @ts-check
/* Colour helpers. A leaf: pure string/number maths, no canvas, no DOM.
   In the kernel because migrate() normalises every saved colour on load. */

/* accepts #abc, #aabbcc, or the same without the # — returns canonical '#aabbcc' or null */
/** @param {unknown} v @returns {string|null} */
function normHex(v){
  let h=String(v==null?'':v).trim().replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(h)) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return /^[0-9a-f]{6}$/i.test(h) ? '#'+h.toLowerCase() : null;
}
/** @param {string} hex @param {number} a */
function hexA(hex,a){ const n=parseInt(hex.slice(1),16); return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }
/** @param {string} hex @param {boolean} [light] */
function pickText(hex,light){
  const n=parseInt(hex.slice(1),16);
  const lum=(0.299*((n>>16)&255)+0.587*((n>>8)&255)+0.114*(n&255))/255;
  return (light||lum>.62)?'#1d1d1b':'#ffffff';
}

export {normHex, hexA, pickText};
