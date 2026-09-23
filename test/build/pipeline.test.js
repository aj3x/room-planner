/* ===========================================================================
   The build pipeline, proved end to end.

   These are not characterization tests — they assert nothing about the app's
   behaviour. They assert that the *scaffold* does what Phase 3 is about to
   depend on, and they do it by running the real `vite.config.js` over a small
   fixture rather than by inspecting the config object. A config that is correct
   on paper and wrong in the output is exactly the failure this catches.

   Why a fixture and not index.html: Phase 2 is forbidden from splitting the
   app's CSS or its JS, so the real file cannot yet demonstrate SCSS compilation
   or multi-module bundling. The fixture is shaped like what index.html becomes
   in Phase 3 — an HTML shell, one module entry, one linked SCSS entry — so the
   pipeline is proved before the code that needs it arrives, not after.

   Three properties matter, and they are the three that would silently break the
   deployment model:
     1. SCSS compiles, and design tokens survive as CSS custom properties.
     2. The output is ONE file. No sibling .js, .css or asset.
     3. The script tag is classic, so the file opens from file://.
   =========================================================================== */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const FIXTURE = path.join(REPO_ROOT, 'test/fixtures/build');

let outDir;
let html;
let emitted;

beforeAll(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-build-'));
  await build({
    /* The repo's real config, not a reimplementation of it. */
    configFile: path.join(REPO_ROOT, 'vite.config.js'),
    root: FIXTURE,
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
  emitted = fs.readdirSync(outDir, { recursive: true }).map(String);
  html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
}, 60_000);

describe('the Vite build', () => {
  it('emits one self-contained file and nothing beside it', () => {
    expect(emitted).toEqual(['index.html']);
    /* No subresource of any kind survives — that is what "self-contained"
       means, and a leftover <link> or src= is how it stops being true. */
    expect(html).not.toMatch(/<link\b[^>]*rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(html).not.toMatch(/\.scss|\.css"|assets\//);
  });

  it('inlines the bundle as a classic script, so the file opens from file://', () => {
    /* A `type="module"` script is fetched under CORS rules that an opaque
       file:// origin can never satisfy, so this attribute is the difference
       between a working artifact and a blank page off disk. */
    expect(html).toMatch(/<script\s*>/);
    expect(html).not.toMatch(/<script[^>]*type=["']module["']/);
    expect(html).toContain('scss pipeline fixture');
  });

  it('runs the script after the document is parsed', () => {
    /* An inline classic script ignores `defer`, so position IS the ordering
       guarantee: in <head> it would run before <body> exists. */
    const script = html.search(/<script\s*>/);
    const body = html.indexOf('<body');
    expect(script).toBeGreaterThan(body);
  });
});

describe('Sass', () => {
  it('compiles SCSS through @use and nesting, and inlines the result', () => {
    expect(html).toMatch(/<style[^>]*>/);
    /* Nesting flattened to real selectors... */
    expect(html).toMatch(/\.card\s+\.title\s*\{/);
    /* ...and `&` modifiers resolved rather than emitted literally. */
    expect(html).toMatch(/\.card\.is-wide\s*\{/);
    expect(html).not.toContain('&.is-wide');
  });

  it('leaves design tokens as CSS custom properties', () => {
    /* NON-NEGOTIABLE, per the refactor plan: dark mode works by re-declaring
       these at runtime under a media query. If the split ever turns them into
       Sass `$variables` they become compile-time constants and dark mode dies
       silently — the page still renders, just never in dark. */
    expect(html).toContain('--rp-accent:');
    expect(html).toMatch(/var\(--rp-accent\)/);
  });
});
