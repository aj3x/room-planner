/* The registry trades an import edge for a string, and a string has no
   compiler. A typo in `use('ui.flsh')` is not an error at any point: use()
   returns undefined for a name nobody provided on purpose, because that is
   how an optional feature stays optional in a test that never boots. So the
   failure mode is a call that silently does nothing, and neither ESLint's
   no-undef — the safety net when these were imports — nor the e2e suite
   would say a word.

   This is that safety net, rebuilt for strings. It reads the source rather
   than running the app: booting would need jsdom and would only prove the
   paths boot() happens to walk. Static text covers every call site.

   Pure logic, no harness, no jsdom, no app. */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* Resolved from the working directory, not from import.meta.url: the suite
   runs under jsdom, where import.meta.url is an http:// URL and cannot be
   turned back into a path. Vitest sets cwd to the repo root. */
const SRC = path.resolve(process.cwd(), 'src');

const files = [];
(function walk(dir){
  for(const e of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, e.name);
    if(e.isDirectory()) walk(p); else if(p.endsWith('.js')) files.push(p);
  }
})(SRC);

/* Only the modules that import the registry: elsewhere a `has(` is somebody's
   own helper. registry.js itself is the implementation, not a call site. */
const sources = files.map(f => ({ rel: path.relative(SRC, f), text: fs.readFileSync(f, 'utf8') }))
  .filter(s => s.rel !== 'core/registry.js' && /registry\.js'/.test(s.text));

if(!sources.length) throw new Error(`no sources found under ${SRC} — cwd is ${process.cwd()}`);

/* Every string literal passed as the first argument to `fn` — a bare call,
   not a method of the same name (`set.has(x)`). */
function firstArgs(fn){
  const out = [];
  const re = new RegExp(`(?<![.\\w])${fn}\\(\\s*'([^']*)'`, 'g');
  for(const { rel, text } of sources)
    for(const m of text.matchAll(re)) out.push({ name: m[1], file: rel });
  return out;
}

const provided = new Set(firstArgs('provide').map(x => x.name));

describe('core/registry.js — every lookup has a provide()', () => {
  const lookups = [...firstArgs('use'), ...firstArgs('has'), ...firstArgs('expect')];

  it('finds the call sites at all (guards against this test silently passing)', () => {
    expect(lookups.length).toBeGreaterThan(0);
    expect(provided.size).toBeGreaterThan(0);
  });

  for(const { name, file } of lookups)
    it(`${file}: '${name}'`, () => expect(provided).toContain(name));

  /* The check above can only see string literals. A computed key would pass
     it while being exactly the bug it exists to catch, so computing one is
     banned outright. */
  it('no call site builds a key from a variable', () => {
    const offenders = [];
    for(const { rel, text } of sources)
      for(const m of text.matchAll(/(?<![.\w])(use|has|expect|provide)\(\s*([^'\s),][^,)]*)/g))
        offenders.push(`${rel}: ${m[1]}(${m[2].trim()}`);
    expect(offenders).toEqual([]);
  });
});
