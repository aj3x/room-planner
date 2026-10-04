/* `npm run typecheck`: the two tsc passes, and the check that the modules
   which must be strict still are. See tsconfig.json for the why.

   1. tsconfig.json — every module, at the default level. Its findings in a
      strict module are dropped: pass 2 checks that module more strictly,
      and the default level only adds noise there (without strictNullChecks,
      tsc cannot narrow a union on a missing field or a boolean flag, so it
      reports code that strict mode proves correct). How many are dropped is
      printed, and more than DROPPED_CEILING fails the run.
   2. tsconfig.strict.json — strict: true, for the modules whose first line
      is `// @ts-check`.
   3. These must be strict, and the run fails if one is not:
        src/kernel/**          the document and its rules
        src/ui-kit/**          what every feature builds with
        src/features/<name>/index.js (and host.js), and every module they re-export from
                               a feature's public API, as far as callers see it
        src/**.jsx             every component: they start strict, so there
                               is no ratchet to climb for them
      Everything else — a feature's private modules, app/ — is the ratchet,
      listed so the number only goes one way. Making a module strict: add the
      pragma, run this, fix what it reports. */
import {spawnSync} from 'child_process';
import fs from 'fs';
import path from 'path';

const files = [];
(function walk(d){
  for(const e of fs.readdirSync(d, {withFileTypes:true})){
    const p = path.join(d, e.name);
    if(e.isDirectory()) walk(p); else if(/\.jsx?$/.test(p)) files.push(p);
  }
})('src');
const strict = new Set(files.filter(f => fs.readFileSync(f, 'utf8').startsWith('// @ts-check')));

function tsc(project){
  const r = spawnSync(path.join('node_modules', '.bin', 'tsc'), ['-p', project, '--pretty', 'false'], {encoding: 'utf8'});
  if(r.error) throw r.error;
  /* one diagnostic per unindented line; indented lines continue the one above */
  const diags = [];
  for(const line of (r.stdout + r.stderr).split('\n')){
    if(!line) continue;
    if(/^\s/.test(line) && diags.length) diags[diags.length-1] += '\n' + line;
    else diags.push(line);
  }
  return diags;
}
const fileOf = d => path.normalize(d.replace(/\(\d+,\d+\).*$/s, ''));

/* The default pass's findings in strict modules are dropped, but counted:
   each is a place the code leans on narrowing only strict mode can do. The
   ceiling keeps that number from creeping; raise it only with a reason. */
const DROPPED_CEILING = 6;

let failed = false;
const all = tsc('tsconfig.json');
const loose = all.filter(d => !strict.has(fileOf(d)));
const dropped = all.length - loose.length;
const tight = tsc('tsconfig.strict.json');
for(const d of [...loose, ...tight]) console.log(d);
console.log(`${dropped} default-pass finding(s) in strict modules dropped (ceiling ${DROPPED_CEILING}).`);
if(dropped > DROPPED_CEILING){
  console.error(`That is more than ${DROPPED_CEILING}: run \`npx tsc -p tsconfig.json\` to see them.`);
  failed = true;
}
if(loose.length || tight.length){
  console.error(`\n${loose.length + tight.length} type error(s).`);
  failed = true;
}

const required = new Set(files.filter(f => /^src\/(kernel|ui-kit)\//.test(f) || f.endsWith('.jsx')));
for(const f of files){
  if(!/^src\/features\/[^/]+\/(index|host)\.js$/.test(f)) continue;
  required.add(f);
  for(const m of fs.readFileSync(f, 'utf8').matchAll(/\bfrom\s*['"](\.\/[^'"]+)['"]/g))
    required.add(path.join(path.dirname(f), m[1]));
}
const missing = [...required].filter(f => !strict.has(f)).sort();
const notYet = files.filter(f => !strict.has(f)).sort();

console.log(`${strict.size} of ${files.length} modules strict. Not yet (${notYet.length}):`);
for(const f of notYet) console.log('  ' + f);
if(missing.length){
  console.error('\nThese must be strict (first line `// @ts-check`), and are not:');
  for(const f of missing) console.error('  ' + f);
  failed = true;
}
process.exit(failed ? 1 : 0);
