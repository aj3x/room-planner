/* ===========================================================================
   ESLint: correctness only.

   There is no Prettier here and there are no formatting rules, deliberately.
   The codebase's dense style — `if(cond)`, no space after a keyword, short
   names — is a decision, not an accident, and a linter that argued with it
   would produce ten thousand findings that all mean nothing. Reformatting also
   destroys `git blame`, which is the single thing this refactor is most careful
   to preserve. A rule here that fires on how code looks is a bug in this file.

   What it is for is `no-undef`. Today it proves the monolith references nothing
   it does not define. During Phase 3 it becomes the extraction safety net: the
   characteristic failure of moving 10,000 lines into 60 modules is a function
   that quietly stops being in scope, and `no-undef` names it, in the file, at
   the line, before a test ever runs.

   Configured for both worlds on purpose. `index.html` is linted as a script
   (one `<script>`, browser globals, everything in one scope); `src/**` is
   linted as ESM, so the rules are already right when Phase 3 starts putting
   files there.
   =========================================================================== */

import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';

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
];
