// @ts-check
/* What an item's footprint is called in a list: its width × depth, or for a
   free-form shape its bounding box. */

import {bbox, shapePoly} from '../../kernel/geometry.js';
import {S} from '../../kernel/state.js';
import {fmtLen} from '../../kernel/units.js';

/** @param {{shape: import('../../kernel/types.js').Shape}} it */
function sizeLabel(it){
  const s=it.shape;
  if(s.type==='rect'||s.type==='ellipse'||s.type==='lshape') return fmtLen(s.w,S.unit)+' × '+fmtLen(s.d,S.unit);
  const b=bbox(shapePoly(s));
  return fmtLen(b.w,S.unit)+' × '+fmtLen(b.h,S.unit);
}

export {sizeLabel};
