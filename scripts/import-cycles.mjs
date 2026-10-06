/* Report the import cycles in src/, largest first, and fail if there is one.

   `npm run cycles`; `npm run lint` runs it after ESLint, so CI does too.

   There are none, and the budget is zero. A cycle means the modules in it
   cannot be understood, tested or changed one at a time, and in ESM it means
   one of them is evaluated before its imports are ready, which is only safe
   while nothing in the loop is read at load time. ESLint's boundary rule
   (eslint.config.js) keeps features from importing each other's insides; this
   is what keeps the features, and the modules inside each one, a DAG.

   When one appears, break it the way the existing code does: move the shared
   piece down into a leaf both sides can import, or turn the back edge into a
   signal the other side subscribes to.
*/
import fs from 'fs';
import path from 'path';

const ROOT = 'src';

const files = [];
(function walk(d){
  for(const e of fs.readdirSync(d, {withFileTypes:true})){
    const p = path.join(d, e.name);
    if(e.isDirectory()) walk(p); else if(/\.jsx?$/.test(p)) files.push(p);
  }
})(ROOT);

const deps = new Map();
for(const f of files){
  const src = fs.readFileSync(f, 'utf8');
  const out = [];
  /* `... from './x.js'`, a bare `import './x.js'`, and a literal
     `import('./x.js')`; relative, or root-absolute ('/src/...'). */
  for(const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]((?:\.|\/src\/)[^'"]+)['"]/g)){
    let t = m[1].startsWith('/') ? path.normalize(m[1].slice(1)) : path.normalize(path.join(path.dirname(f), m[1]));
    if(!/\.jsx?$/.test(t)) t += '.js';
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

const largest = groups[0] ? groups[0].length : 0;

console.log(`${files.length} modules, ${groups.length} cycles, largest ${largest}\n`);
for(const g of groups){
  console.log(`  [${g.length}] ${g.map(f => f.replace(ROOT + '/', '')).sort().join(', ')}`);
}

if(groups.length){
  console.error(`\nFAIL: ${groups.length} import cycle(s). There must be none.`);
  process.exit(1);
}
console.log('OK');
