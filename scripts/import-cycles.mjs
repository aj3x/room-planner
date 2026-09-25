/* Report the import cycles in src/, largest first.

   `npm run cycles`. Exits non-zero if the largest cycle exceeds the budget
   below, or if any cycle spans more than one directory.

   Why two checks and not one. Size alone is the wrong target: a cycle inside
   one directory is how a wizard's back/next navigation looks, and that is
   fine. A cycle that spans directories is the bad kind — it means those
   directories are not really separate, whatever the folder names say, and it
   is what the decoupling pass spent its time removing
   (.claude/plans/decoupling.md). Ratchet BUDGET down; never up without a
   written reason.
*/
import fs from 'fs';
import path from 'path';

const BUDGET = 9;
const ROOT = 'src';

const files = [];
(function walk(d){
  for(const e of fs.readdirSync(d, {withFileTypes:true})){
    const p = path.join(d, e.name);
    if(e.isDirectory()) walk(p); else if(p.endsWith('.js')) files.push(p);
  }
})(ROOT);

const deps = new Map();
for(const f of files){
  const src = fs.readFileSync(f, 'utf8');
  const out = [];
  for(const m of src.matchAll(/from\s*['"](\.[^'"]+)['"]/g)){
    let t = path.normalize(path.join(path.dirname(f), m[1]));
    if(!t.endsWith('.js')) t += '.js';
    if(fs.existsSync(t)) out.push(t);
  }
  deps.set(f, out);
}

/* Tarjan. A group of size 1 is not a cycle unless it imports itself, which
   nothing here does, so singletons are dropped. */
let counter = 0;
const index = new Map(), low = new Map(), onStack = new Set(), stack = [], groups = [];
function visit(v){
  index.set(v, counter); low.set(v, counter); counter++;
  stack.push(v); onStack.add(v);
  for(const w of deps.get(v) || []){
    if(!index.has(w)){ visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
    else if(onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
  }
  if(low.get(v) === index.get(v)){
    const group = []; let w;
    do { w = stack.pop(); onStack.delete(w); group.push(w); } while(w !== v);
    if(group.length > 1) groups.push(group);
  }
}
for(const f of files) if(!index.has(f)) visit(f);
groups.sort((a, b) => b.length - a.length);

const dirOf = f => path.dirname(f).replace(ROOT + '/', '');
const spanning = groups.filter(g => new Set(g.map(dirOf)).size > 1);
const largest = groups[0] ? groups[0].length : 0;

console.log(`${files.length} modules, ${groups.length} cycles, largest ${largest} (budget ${BUDGET})\n`);
for(const g of groups){
  const dirs = [...new Set(g.map(dirOf))];
  console.log(`  [${g.length}] ${dirs.join(' + ')}${dirs.length > 1 ? '   <-- spans directories' : ''}`);
  console.log(`       ${g.map(f => f.replace(ROOT + '/', '')).sort().join(', ')}`);
}

let bad = false;
if(largest > BUDGET){
  console.error(`\nFAIL: largest cycle is ${largest}, budget is ${BUDGET}.`);
  bad = true;
}
if(spanning.length){
  console.error(`\nFAIL: ${spanning.length} cycle(s) span more than one directory.`);
  console.error('Those directories are not separate components. See .claude/plans/decoupling.md.');
  bad = true;
}
if(!bad) console.log('\nOK');
process.exit(bad ? 1 : 0);
