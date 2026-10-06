/* The build pipeline, proved end to end by running the real `vite.config.js`
   over a small fixture — a config that is correct on paper and wrong in the
   output is exactly the failure this catches. Three properties matter, and each
   would silently break the deployment model:

     1. SCSS compiles, and design tokens survive as CSS custom properties.
     2. The output is ONE file. No sibling .js, .css or asset.
     3. The script tag is classic, so the file opens from file://.
     4. Several module script blocks merge into ONE bundle, in document order.

   A fixture rather than index.html, so a break reads as "the pipeline is wrong"
   rather than "the app is wrong". */

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

  it('inlines the bundle as a classic script, positioned after <body>', () => {
    /* A `type="module"` script is fetched under CORS rules an opaque file://
       origin can never satisfy, so this is the difference between a working
       artifact and a blank page off disk. And an inline classic script ignores
       `defer`, so position IS the ordering guarantee. */
    expect(html).toMatch(/<script\s*>/);
    expect(html).not.toMatch(/<script[^>]*type=["']module["']/);
    expect(html).toContain('scss pipeline fixture');
    expect(html.search(/<script\s*>/)).toBeGreaterThan(html.indexOf('<body'));
  });
});

describe('several script blocks', () => {
  /* The app puts a <script type="module"> inside each HTML partial, so
     that a pane's wiring sits with its markup. That only works because Vite
     merges every module block in the document into one entry — and because it
     keeps them in document order, which is what AGENTS.md rule 3 depends on:
     a listener registered out of order runs ahead of listeners that were
     meant to precede it, and nothing anywhere else would notice.

     Vite documents neither behaviour. This test is the reason we can rely on
     both anyway: if a Vite upgrade splits the blocks into separate chunks, or
     reorders them, it fails here rather than as a listener that mysteriously
     stops firing. */

  it('merges every block into a single inlined script', () => {
    const tags = html.match(/<script\b/g) || [];
    expect(tags).toHaveLength(1);
    expect(html).toContain('BLOCK_ALPHA');
    expect(html).toContain('BLOCK_OMEGA');
  });

  it('keeps the blocks in document order', () => {
    const alpha = html.indexOf('BLOCK_ALPHA');
    /* A marker inside main.js, NOT the string 'scss pipeline fixture' — that
       is also the fixture's <title> and would match in <head>, which is how
       this test first passed for the wrong reason. */
    const main = html.indexOf('BLOCK_MAIN');
    const omega = html.indexOf('BLOCK_OMEGA');
    expect(alpha).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(alpha);
    expect(omega).toBeGreaterThan(main);
  });
});

describe('Sass', () => {
  it('compiles @use and nesting, and inlines the result', () => {
    expect(html).toMatch(/<style[^>]*>/);
    expect(html).toMatch(/\.card\s+\.title\s*\{/);   // nesting flattened...
    expect(html).toMatch(/\.card\.is-wide\s*\{/);    // ...and `&` resolved
    expect(html).not.toContain('&.is-wide');
  });

  it('leaves design tokens as CSS custom properties', () => {
    /* NON-NEGOTIABLE: dark mode works by re-declaring these at runtime under a
       media query. Turn them into Sass `$variables` and they become
       compile-time constants — dark mode dies silently, the page still
       renders, just never in dark. */
    expect(html).toContain('--rp-accent:');
    expect(html).toMatch(/var\(--rp-accent\)/);
  });
});
