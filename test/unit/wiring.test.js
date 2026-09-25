/* The bus and the registry trade an import edge for a string, and a string
   has no compiler. A typo in `repaint('roomSell')` or `use('ui.flsh')` is not
   an error at any point: emit() skips a topic nobody listens to on purpose,
   because that is how a view that is not on screen stays optional, and use()
   returns undefined for the same reason. So the failure mode this whole pass
   introduced is a call that silently does nothing, and neither ESLint's
   no-undef — which was the safety net when these were imports — nor the e2e
   suite would say a word.

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

const sources = files.map(f => ({ rel: path.relative(SRC, f), text: fs.readFileSync(f, 'utf8') }));

if(!sources.length) throw new Error(`no sources found under ${SRC} — cwd is ${process.cwd()}`);

/* Collect every string literal passed as the first argument to `fn`. Only
   literals: a computed topic would defeat the check, so the test below also
   asserts none exist. */
function firstArgs(fn){
  const out = [];
  const re = new RegExp(`\\b${fn}\\(\\s*'([^']*)'`, 'g');
  for(const { rel, text } of sources)
    for(const m of text.matchAll(re)) out.push({ name: m[1], file: rel });
  return out;
}

/* repaint('a','b','c') takes a list, so every argument counts, not just the
   first. core/bus.js's own `emit('paint:'+k)` is the implementation and is
   excluded by the literal-only match above. */
function repaintKeys(){
  const out = [];
  for(const { rel, text } of sources)
    for(const m of text.matchAll(/\brepaint\(([^)]*)\)/g))
      for(const q of m[1].matchAll(/'([^']*)'/g)) out.push({ name: q[1], file: rel });
  return out;
}

const provided = new Set(firstArgs('provide').map(x => x.name));
const subscribed = new Set(firstArgs('on').map(x => x.name));

describe('core/registry.js — every use() has a provide()', () => {
  const uses = firstArgs('use');

  it('finds the call sites at all (guards against this test silently passing)', () => {
    expect(uses.length).toBeGreaterThan(0);
    expect(provided.size).toBeGreaterThan(0);
  });

  for(const { name, file } of uses)
    it(`${file}: use('${name}')`, () => expect(provided).toContain(name));
});

describe('core/bus.js — every emitted topic has a subscriber', () => {
  /* emit() in core/bus.js itself is the implementation, not a call site. */
  const emits = firstArgs('emit').filter(x => x.file !== 'core/bus.js');

  it('finds the call sites at all', () => {
    expect(emits.length).toBeGreaterThan(0);
    expect(subscribed.size).toBeGreaterThan(0);
  });

  for(const { name, file } of emits)
    it(`${file}: emit('${name}')`, () => expect(subscribed).toContain(name));
});

describe('core/bus.js — every repaint key has a subscriber', () => {
  const keys = repaintKeys();

  it('finds the call sites at all', () => expect(keys.length).toBeGreaterThan(0));

  for(const { name, file } of keys)
    it(`${file}: repaint('${name}')`, () => expect(subscribed).toContain('paint:' + name));
});

describe('the topics stay checkable', () => {
  /* The check above can only see string literals. A computed topic would pass
     it while being exactly the bug it exists to catch, so computing one is
     banned outright rather than silently tolerated. */
  it('no call site builds a topic from a variable', () => {
    const offenders = [];
    for(const { rel, text } of sources){
      /* The two mechanisms themselves: bus.js's emit('paint:'+k) and
         registry.js's own provide(key,…)/use(key) are the implementations,
         not call sites. */
      if(rel === 'core/bus.js' || rel === 'core/registry.js') continue;
      for(const m of text.matchAll(/\b(emit|use|provide|on)\(\s*([^'\s),][^,)]*)/g))
        offenders.push(`${rel}: ${m[1]}(${m[2].trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});
