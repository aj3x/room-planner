/* ===========================================================================
   Phase 2 build scaffold.

   The deployment model is non-negotiable: ONE self-contained `index.html` that
   works when you double-click it off disk. Everything here exists to keep that
   true while the source becomes many files in Phase 3.

     vite dev    -> module graph + HMR, index.html as the entry
     vite build  -> dist/index.html, all JS and CSS inlined, no siblings

   Two things are less obvious than they look, and both are about `file://`:

   1. `vite-plugin-singlefile` inlines the bundle but keeps the tag Vite wrote,
      `<script type="module" crossorigin>`. A module script is fetched under
      CORS rules, and `file://` origins are opaque, so the browser refuses it
      and the page is blank off disk. `classicScriptTag()` below rewrites that
      tag before the plugin inlines into it.
   2. A classic tag is only honest if the code inside it is not a module, so the
      bundle is emitted as an IIFE. There are no dynamic imports in this app
      (checked), so there is nothing to lose by giving up code splitting.

   The epilogue plugin is test-only and off unless `--mode instrumented`; see
   the long comment on it.
   =========================================================================== */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { EPILOGUE } from './test/epilogue.js';

const ROOT = dirname(fileURLToPath(import.meta.url));

/* --------------------------------------------------------------------------
   `<!-- @include src/html/foo.html -->` in index.html, substituted for that
   file's contents.

   This is what lets the static markup live in src/html/ without becoming
   anything else. It is a textual splice, deliberately: the panes stay static
   markup that the browser parses before any script runs, which is what every
   render*() function assumes when it looks up #paneRoom or #libContent at
   boot. Building them from JS template strings instead would be a behaviour
   change, not a refactor.

   The directive's own indentation is consumed along with it, since each
   partial already carries the indentation it had inside index.html.

   Runs first in the chain (`enforce: 'pre'`, `order: 'pre'`), so every other
   HTML transform — the test epilogue, Vite's own asset handling, the classic
   script tag, and singlefile's inlining — sees one whole document, exactly the
   one index.html described before A5 split it up.
   -------------------------------------------------------------------------- */
function htmlIncludes() {
  const RE = /^[ \t]*<!--\s*@include\s+(\S+?)\s*-->[ \t]*$/gm;
  return {
    name: 'rp:html-includes',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(RE, (_, rel) =>
          readFileSync(resolve(ROOT, rel), 'utf8').replace(/\n$/, ''));
      },
    },
    /* A partial is not a module in the graph, so nothing would reload when one
       changes. Watch the directory and ask the page to reload itself. */
    configureServer(server) {
      server.watcher.add(resolve(ROOT, 'src/html'));
      server.watcher.on('change', (f) => {
        if (f.startsWith(resolve(ROOT, 'src/html'))) {
          server.ws.send({ type: 'full-reload', path: '*' });
        }
      });
    },
  };
}

/* --------------------------------------------------------------------------
   Test instrumentation.

   Suite B used to append the capture epilogue by rewriting the HTTP response
   with `page.route`. That worked because the app was one inline classic script
   sitting in the HTML, so appending text to the response appended it to the
   script's own top-level scope.

   Neither half of that survives the build:
     - in dev, Vite hoists an inline module script out of the HTML into a
       `/index.html?html-proxy` module, so there is no script body in the
       response to append to;
     - in a build, the bundle is wrapped in an IIFE, so anything appended
       *after* it lands outside the closure and captures nothing.

   So the epilogue moves from "rewrite the response" to "part of the source that
   gets built", injected here with `order: 'pre'` — before Vite's own HTML
   handling, which is what puts it inside the proxied module in dev and inside
   the IIFE in a build. index.html on disk is still never modified; this is the
   same in-memory-copy contract the baseline has always held, moved one stage
   earlier in the pipeline.
   -------------------------------------------------------------------------- */
function testEpilogue() {
  return {
    name: 'rp:test-epilogue',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const close = html.lastIndexOf('</script>');
        if (close < 0) throw new Error('rp:test-epilogue: no </script> in index.html');
        return html.slice(0, close) + EPILOGUE + html.slice(close);
      },
    },
  };
}

/* Turn Vite's `<script type="module" crossorigin src=...>` into a plain
   `<script src=...>` before singlefile inlines the bundle into that same tag.
   Build only: in dev the module tag is correct and required.

   Position matters as much as the attributes. Vite hoists a module script into
   <head>, which is harmless while it is a module — module scripts are deferred,
   so it still runs after the document is parsed. A classic script has no such
   defer, and `defer` on an *inline* script is ignored, so leaving it in <head>
   makes it run before <body> exists and the app dies on the first
   `$('...').addEventListener`. Moving it to just before </body> restores both
   the position it occupies in index.html today and the ordering guarantee the
   module tag was providing. */
function classicScriptTag() {
  const TAG = /<script\s+type="module"\s+crossorigin\s+src="([^"]+)"\s*><\/script>\s*/;
  return {
    name: 'rp:classic-script-tag',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const m = TAG.exec(html);
        if (!m) throw new Error('rp:classic-script-tag: no module script tag found to convert');
        const rest = html.replace(TAG, '');
        const end = rest.lastIndexOf('</body>');
        if (end < 0) throw new Error('rp:classic-script-tag: no </body> to move the script before');
        const tag = `<script src="${m[1]}"></script>\n`;
        return rest.slice(0, end) + tag + rest.slice(end);
      },
    },
  };
}

/* `--mode instrumented` rather than an environment variable, so the same
   command works on every platform and CI shell. It selects exactly one thing:
   whether the capture epilogue is built in. `dist/` is always the real,
   uninstrumented artifact. */
export default defineConfig(({ mode }) => ({
  /* Relative, so dist/index.html resolves nothing against the server root and
     therefore works from file://. */
  base: './',
  plugins: [
    htmlIncludes(),
    ...(mode === 'instrumented' ? [testEpilogue()] : []),
    classicScriptTag(),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    outDir: mode === 'instrumented' ? 'dist-test' : 'dist',
    emptyOutDir: true,
    /* An IIFE, not an ES module — see the file:// note at the top. */
    rollupOptions: { output: { format: 'iife' } },
    /* Belt and braces with singlefile: nothing should ever be emitted beside
       the HTML, so inline every asset regardless of size. */
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    /* Chunked output would defeat the single-file contract; make it loud. */
    chunkSizeWarningLimit: 4096,
  },
  css: {
    /* Sass is installed and Vite resolves .scss natively — no options needed.
       Phase 3 / A4 splits the CSS into src/styles/*.scss behind a single
       `<link rel="stylesheet" href="./src/styles/main.scss">`; the modern API
       is pinned here so that split does not also become a Sass upgrade. */
    preprocessorOptions: { scss: { api: 'modern-compiler' } },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
}));
