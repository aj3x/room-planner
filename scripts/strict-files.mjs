/* Which modules are held to strict type checking, and a check that the ones
   that must be still are.

   `npm run typecheck` runs this after both tsc passes (see tsconfig.json).
   A module is strict when its first line is `// @ts-check`; tsconfig.strict.json
   checks exactly those. These must be:

     src/kernel/**          the document and its rules
     src/ui-kit/**          what every feature builds with
     src/features/<name>/index.js, and every module it re-exports from
                            a feature's public API, as far as its callers see it

   so this fails if one of them is missing the pragma. Everything else is the
   ratchet — a feature's private modules and app/ — and is listed, so the
   number only goes one way. Making one strict: add the pragma, run
   `npm run typecheck`, fix what it reports. */
import fs from 'fs';
import path from 'path';

const files = [];
(function walk(d){
  for(const e of fs.readdirSync(d, {withFileTypes:true})){
    const p = path.join(d, e.name);
    if(e.isDirectory()) walk(p); else if(p.endsWith('.js')) files.push(p);
  }
})('src');

const required = new Set(files.filter(f => /^src\/(kernel|ui-kit)\//.test(f)));
for(const f of files){
  if(!/^src\/features\/[^/]+\/index\.js$/.test(f)) continue;
  required.add(f);
  for(const m of fs.readFileSync(f, 'utf8').matchAll(/\bfrom\s*['"](\.\/[^'"]+)['"]/g))
    required.add(path.join(path.dirname(f), m[1]));
}

const strict = f => fs.readFileSync(f, 'utf8').startsWith('// @ts-check');
const missing = [...required].filter(f => !strict(f)).sort();
const loose = files.filter(f => !strict(f)).sort();

console.log(`${files.length - loose.length} of ${files.length} modules strict; not yet (${loose.length}):`);
for(const f of loose) console.log('  ' + f);
if(missing.length){
  console.error(`\nThese must be strict (first line \`// @ts-check\`), and are not:`);
  for(const f of missing) console.error('  ' + f);
  process.exit(1);
}
