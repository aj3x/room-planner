/* What an item's footprint is called in a list: its width × depth, or for a
   free-form shape its bounding box. */

import {bbox, shapePoly} from '../core/geometry.js';
import {S} from '../core/state.js';
import {fmtLen} from '../core/units.js';

function sizeLabel(it){
  const s=it.shape;
  if(s.type==='rect'||s.type==='ellipse'||s.type==='lshape') return fmtLen(s.w,S.unit)+' × '+fmtLen(s.d,S.unit);
  const b=bbox(shapePoly(s));
  return fmtLen(b.w,S.unit)+' × '+fmtLen(b.h,S.unit);
}

export {sizeLabel};
