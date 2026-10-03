/* ===========================================================================
   ESLint: correctness only.

   There is no Prettier here and there are no formatting rules, deliberately.
   The codebase's dense style — `if(cond)`, no space after a keyword, short
   names — is a decision, not an accident, and a linter that argued with it
   would produce ten thousand findings that all mean nothing. Reformatting also
   destroys `git blame`, which is the single thing this refactor is most careful
   to preserve. A rule here that fires on how code looks is a bug in this file.

   What it is for is `no-undef`: a function moved between modules that quietly
   stops being in scope is named, in the file, at the line, before a test
   runs. `index.html` and the partials are linted as module scripts with
   browser globals; `src/**` as ESM.

   The other thing it does is hold src/'s boundaries: what kernel/, ui-kit/,
   each feature and app/ may import (BOUNDARIES, below). That rule is worth
   more than the edits it took to satisfy it, because it keeps them satisfied.
   =========================================================================== */

import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/* Rules from `js.configs.recommended` that are switched off below, each with a
   reason. Nothing is disabled because it was inconvenient. */
const RELAXED = {
  /* Fires on `catch(e){}`. The app swallows storage and clipboard failures on
     purpose — there is nothing useful to do when localStorage is disabled —
     and each site is already written as a deliberate empty block. */
  'no-empty': ['error', { allowEmptyCatch: true }],

  /* `caughtErrors: 'none'`: `catch(e){ ... }` that ignores `e` is this
     codebase's house style for "this can fail and that is fine", and it accounts
     for 26 of the 36 findings on a first run. Flagging all of them would train
     everyone to ignore the output, which is how `no-undef` — the rule that
     actually earns its keep here — ends up ignored too.

     `warn`, not `error`, for what is left: a genuinely unused local is a real
     if minor finding, and Phase 2 is explicitly forbidden from editing
     application code to clear it. So it stays visible and stays non-blocking,
     rather than being switched off or quietly fixed. See BACKLOG.md. */
  'no-unused-vars': ['warn', { caughtErrors: 'none', args: 'after-used', ignoreRestSiblings: true }],

  /* Same reasoning: three genuine dead stores in index.html, none of them
     behaviour-affecting, none of them mine to fix in this phase. */
  'no-useless-assignment': 'warn',

  /* New in ESLint 10, and a modernization rule rather than a correctness one:
     it wants `new Error(msg, { cause: e })` at every rethrow. Complying means
     editing application code, which this phase forbids, and the rule says
     nothing about whether the code is right. Off. */
  'preserve-caught-error': 'off',
};

/* ---- the boundaries ----------------------------------------------------
   src/ has four kinds of place, and each may import only from some of them:

     kernel/            -> kernel/                      (and npm packages)
     ui-kit/            -> kernel/, ui-kit/
     features/<name>/   -> kernel/, ui-kit/, its own files,
                           and another feature's index.js only
     app/               -> kernel/, ui-kit/, app/, a feature's index.js only

   kernel/ is the document and its rules: it would still make sense with no
   screen attached, and it may not touch `document` either. ui-kit/ is the
   generic UI every feature builds with. A feature's index.js is its public
   API; reaching past it into another feature's files is what makes two
   features impossible to change separately. A feature never imports its own
   index.js: that index imports the feature's files, so it would be a cycle.

   When kernel/ needs something to happen on screen, it writes a signal and
   the app subscribes (tryRoomEdit's report() -> notice -> flash, in
   app/boot.js). When a feature needs a feature that needs it back, one of
   them is in the wrong place, or the call wants to be a signal; see how the
   tools are stopped by kind (features/canvas/interaction.js). Feature
   dependencies form a DAG, which `npm run cycles` checks module by module.

   A small rule rather than `no-restricted-imports`, because what is allowed
   depends on where the importing file is and where the import resolves to,
   not on the spelling of the path. */
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
function place(abs){
  const rel = path.relative(SRC, abs);
  if(rel.startsWith('..') || path.isAbsolute(rel)) return {area:'outside'};
  const [top, name, ...rest] = rel.split(path.sep);
  if(top === 'features') return {area:'features', feature:name, file:rest.join('/')};
  return {area:top};
}
function verdict(from, to){
  if(to.area === 'outside') return 'imports from outside src/';
  const any = ['kernel', 'ui-kit', 'app', 'features'];
  if(!any.includes(to.area)) return `src/${to.area}/ is not a place; code lives in app/, kernel/, ui-kit/ or features/<name>/`;
  const index = to.area === 'features' && to.file === 'index.js';
  switch(from.area){
    case 'kernel':
      return to.area === 'kernel' ? null : 'kernel/ imports only kernel/';
    case 'ui-kit':
      return ['kernel', 'ui-kit'].includes(to.area) ? null : 'ui-kit/ imports only kernel/ and ui-kit/';
    case 'features':
      if(to.area === 'kernel' || to.area === 'ui-kit') return null;
      if(to.area === 'app') return 'a feature may not import app/';
      if(to.feature === from.feature)
        return index ? `import the module itself, not features/${from.feature}/index.js: the index imports this file` : null;
      return index ? null : `import features/${to.feature}/ through its index.js, not ${to.file}`;
    case 'app':
      return to.area !== 'features' || index ? null : `import features/${to.feature}/ through its index.js, not ${to.file}`;
    default:
      return `src/${from.area}/ is not a place; code lives in app/, kernel/, ui-kit/ or features/<name>/`;
  }
}
const boundaries = {
  meta: {type: 'problem', schema: []},
  create(context){
    const file = context.physicalFilename || context.filename;
    const from = place(file);
    const check = node => {
      const spec = node.source && node.source.value;
      if(typeof spec !== 'string' || !spec.startsWith('.')) return;   // a package
      const msg = verdict(from, place(path.resolve(path.dirname(file), spec)));
      if(msg) context.report({node: node.source, message: `${msg} (${spec})`});
    };
    return {ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check};
  },
};
const BOUNDARIES = [
  {
    files: ['src/**/*.js'],
    plugins: {rp: {rules: {boundaries}}},
    rules: {'rp/boundaries': 'error'},
  },
  {
    files: ['src/kernel/**/*.js'],
    rules: {'no-restricted-globals': ['error',
      {name: 'document', message: 'kernel/ has no DOM; write a signal and let a view (a feature or app/) render it.'}]},
  },
];

export default [
  {
    ignores: [
      'dist/**',
      'dist-test/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
      /* Published data, not source: marketplace JSON fixtures and the example
         blueprint. Nothing here is executed by the app. */
      'marketplace/**',
    ],
  },

  /* ---- the app ---------------------------------------------------------
     index.html is linted as a **module**. Phase 3 has begun moving code into
     `src/`, so the file now carries `import` declarations and `sourceType:
     'script'` would refuse to parse them.

     `no-undef` still asks the question worth asking of it — "references
     something neither this file nor its imports define" — and now it also
     catches the characteristic extraction failure: a symbol moved out of here
     and never imported back. */
  {
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules, ...RELAXED },
  },

  /* ---- src/ — ready for Phase 3 ---------------------------------------- */
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules, ...RELAXED },
  },

  /* ---- tooling and tests ------------------------------------------------ */
  {
    files: ['*.config.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules, ...RELAXED },
  },

  /* Last, so they layer on top of the general src/ block above. */
  ...BOUNDARIES,
];
