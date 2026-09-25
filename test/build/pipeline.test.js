/* The build pipeline, proved end to end by running the real `vite.config.js`
   over a small fixture — a config that is correct on paper and wrong in the
   output is exactly the failure this catches. Three properties matter, and each
   would silently break the deployment model:

     1. SCSS compiles, and design tokens survive as CSS custom properties.
     2. The output is ONE file. No sibling .js, .css or asset.
     3. The script tag is classic, so the file opens from file://.

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
