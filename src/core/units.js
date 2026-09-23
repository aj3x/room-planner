/* Units. Everything in the app is stored in millimetres; these are the boundary
   the user's numbers cross on the way in and out.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added. `unitWord` stayed behind in index.html — it reads `S.unit`,
   and `core/state.js` does not exist yet. */

/* ------------------------- units ------------------------- */
const MM = {mm:1, cm:10, m:1000, in:25.4, ft:304.8};
const BARE = {ftin:'in', in:'in', cm:'cm', mm:'mm', m:'m'};
const UNIT_RE = /(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(millimet(?:er|re)s?|mm|centimet(?:er|re)s?|cm|met(?:er|re)s?|m|inch(?:es)?|in|feet|foot|ft|"|”|'|’)?/g;
function unitKey(tok){
  if(!tok) return null;
  tok = tok.toLowerCase();
  if(tok==='mm'||tok.startsWith('millim')) return 'mm';
  if(tok==='cm'||tok.startsWith('centim')) return 'cm';
  if(tok==='m'||tok.startsWith('met')) return 'm';
  if(tok==='in'||tok.startsWith('inch')||tok==='"'||tok==='”') return 'in';
  if(tok==='ft'||tok==='feet'||tok==='foot'||tok==="'"||tok==='’') return 'ft';
  return null;
}
function parseLen(str, dispUnit){
  if(str===null||str===undefined) return NaN;
  let s = String(str).trim().toLowerCase().replace(/[−–—]/g,'-');
  if(!s) return NaN;
  UNIT_RE.lastIndex = 0;
  let total=0, found=false, m;
  while((m = UNIT_RE.exec(s))){
    if(m[0].trim()===''){ if(UNIT_RE.lastIndex===m.index) UNIT_RE.lastIndex++; continue; }
    let num=m[1], val;
    if(num.includes('/')){ const [a,b]=num.split('/').map(parseFloat); val = b ? a/b : NaN; }
    else val = parseFloat(num);
    if(!isFinite(val)) continue;
    total += val * MM[unitKey(m[2]) || BARE[dispUnit] || 'mm'];
    found = true;
  }
  return found ? total : NaN;
}
const trimNum = (n,dp) => String(parseFloat(n.toFixed(dp)));
function fmtLen(mm,u){
  if(!isFinite(mm)) return '—';
  switch(u){
    case 'mm': return Math.round(mm)+' mm';
    case 'cm': return trimNum(mm/10,1)+' cm';
    case 'm':  return trimNum(mm/1000,2)+' m';
    case 'in': return trimNum(mm/25.4,2)+'"';
    default:{
      let e=Math.round(mm/25.4*8); const neg=e<0; e=Math.abs(e);
      let ft=Math.floor(e/96); e-=ft*96;
      let inch=Math.floor(e/8), fr=e-inch*8, frS='';
      if(fr){ let n=fr,d=8; while(n%2===0){n/=2;d/=2;} frS=' '+n+'/'+d; }
      let out='';
      if(ft) out+=ft+"' ";
      if(inch||frS||!ft) out+=inch+frS+'"';
      return (neg?'-':'')+out.trim();
    }
  }
}
const fmtArea = (mm2,u) => (u==='ftin'||u==='in') ? trimNum(mm2/92903.04,1)+' sq ft' : trimNum(mm2/1e6,2)+' m²';
const SNAPS = {
  imperial:[['0','No snap'],['12.7','½ inch'],['25.4','1 inch'],['76.2','3 inches'],['152.4','6 inches'],['304.8','1 foot']],
  metric:[['0','No snap'],['10','1 cm'],['50','5 cm'],['100','10 cm'],['250','25 cm'],['500','50 cm']]
};

export {MM, BARE, UNIT_RE, unitKey, parseLen, trimNum, fmtLen, fmtArea, SNAPS};
