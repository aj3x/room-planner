/* Ids. A thing's id is user-editable, so it is held to a URL/S3-safe character
   set; a slash groups ids into folders the way an S3 key does.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. `retagItem`/`rehomeItemId`, which §3 also files here, are
   still in the monolith — they reach into layouts, furnHist and the library
   tree, none of which have moved. */

/* ---- ids ----
   A thing's id is visible and editable (Advanced, in the edit dialog), so it is held to a
   character set that survives a URL and an S3-style key: letters, digits and - _ .
   A forward slash groups ids into folders the way an S3 key does — "ikea/kallax/4x2" and
   "ikea/kallax/2x4" sit in the same folder — which is what a future marketplace browses by.
   Slashes can't lead, trail, or double up, so every part of the path is a real name. */
const ID_SAFE = /^[A-Za-z0-9\-_.]+$/;
const idParts  = s => String(s).split('/');
const idFolder = s => idParts(s).slice(0,-1).join('/');
const idLeaf   = s => idParts(s).slice(-1)[0];
function idProblem(raw){
  const v=String(raw==null?'':raw).trim();
  if(!v) return 'Give it an id';
  if(v.length>200) return 'That id is too long';
  if(v[0]==='/'||v[v.length-1]==='/') return "An id can't start or end with /";
  const parts=idParts(v);
  if(parts.some(x=>!x)) return "An id can't have an empty part between two slashes";
  if(parts.some(x=>x==='..')) return "An id can't have .. as a part";
  if(parts.some(x=>!ID_SAFE.test(x))) return "Ids can use a–z A–Z 0–9 and - _ . with / between folders";
  return null;
}
/* keep an id unique against ids already spoken for, by adding -2, -3 … */
function uniqueId(base, taken){
  if(!taken.has(base)) return base;
  let n=2;
  while(taken.has(base+'-'+n)) n++;
  return base+'-'+n;
}

export {ID_SAFE, idParts, idFolder, idLeaf, idProblem, uniqueId};
