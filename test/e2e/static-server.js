/* The smallest possible static server over the repo root.
 *
 * Deliberately dependency-free and build-free: the contract this suite is
 * characterizing is "these bytes, served as-is, are the app". Anything that
 * transformed the file on the way out would undermine the baseline. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* `node test/e2e/static-server.js [dir] [port]`. Phase 2 points this at the
   built artifact (`dist-test`) instead of the repo root: index.html is now a
   Vite entry rather than a standalone page, so "these bytes served as-is" moved
   from the source file to the build output. The dev-server side of the same
   contract is covered by the `vite` webServer in playwright.config.js. */
const ROOT = path.resolve(REPO_ROOT, process.argv[2] || '.');
const PORT = Number(process.argv[3] || process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

http
  .createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.join(ROOT, rel);
    // never serve outside the repo, and never serve the dependency tree
    if (!file.startsWith(ROOT + path.sep) || rel.startsWith('/node_modules/')) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
    });
  })
  .listen(PORT, '127.0.0.1');
