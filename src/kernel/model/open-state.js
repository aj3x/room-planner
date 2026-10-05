// @ts-check
/* Open state — the extra floor a thing needs when it is in use. What an open
   footprint runs into is openConflicts, in validity.js, because it walks a
   layout's placements. */

import {fmtLen} from '../units.js';
import {S} from '../state.js';
import {shapePoly, bbox} from '../geometry.js';

/* ---- open state ----
   Some things need more floor when they are in use: a dresser's drawers pull
   out, a table gains a leaf, a recliner kicks its feet forward. That extra
   floor lives on the item as how far it reaches past its own footprint on each
   side (`item.open = {top,bottom,left,right}` in mm, in the item's own
   unrotated frame, so it turns with the piece). It is advisory only: it never
   blocks a placement, it only warns. */
/** @typedef {import('../types.js').Item} Item */
/** @typedef {import('../types.js').OpenSpec} OpenSpec */
/** @type {(keyof OpenSpec)[]} */
const OPEN_SIDES=['top','bottom','left','right'];
/** @param {any} o anything a file might hold @returns {OpenSpec|null} */
function normOpen(o){
  if(!o||typeof o!=='object') return null;
  const r=/** @type {OpenSpec} */({}); let any=false;
  for(const k of OPEN_SIDES){
    const v=Math.max(0, parseFloat(o[k])||0);
    r[k]=v; if(v>0) any=true;
  }
  return any ? r : null;
}
/** @param {Item|null|undefined} it @returns {it is Item & {open: OpenSpec}} */
const hasOpen = it => !!(it && it.open);
/* the box an item covers once it is open, in local (unrotated) coordinates */
/** @param {Item|null|undefined} it */
function openLocalBox(it){
  if(!hasOpen(it)) return null;
  const b=bbox(shapePoly(it.shape)), o=it.open;
  return {x0:b.x0-o.left, y0:b.y0-o.top, x1:b.x1+o.right, y1:b.y1+o.bottom};
}
/** @param {{x: number, y: number, rot?: number}} inst @param {Item|null|undefined} it @param {number} [inset] @returns {import('../types.js').Pt[]|null} */
function openPoly(inst,it,inset=0){
  const b0=openLocalBox(it);
  if(!b0) return null;
  const b={x0:b0.x0+inset, y0:b0.y0+inset, x1:b0.x1-inset, y1:b0.y1-inset};
  if(b.x1<=b.x0||b.y1<=b.y0) return null;
  const r=(inst.rot||0)*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  return [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]]
    .map(([x,y])=>[inst.x+x*c-y*s, inst.y+x*s+y*c]);
}
/** @param {Item|null|undefined} it */
function openSizeLabel(it){
  const b=openLocalBox(it);
  return b ? fmtLen(b.x1-b.x0,S.unit)+' × '+fmtLen(b.y1-b.y0,S.unit) : '';
}

export {normOpen, hasOpen, openLocalBox, openPoly, openSizeLabel};
