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
     app/               -> kernel/, ui-kit/, app/, a feature's index.js,
                           and a feature's host.js (what only the shell needs)

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
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
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
  /* host.js: what only the app shell needs from a feature (features/canvas has one) */
  const host = to.area === 'features' && to.file === 'host.js';
  switch(from.area){
    case 'kernel':
      return to.area === 'kernel' ? null : 'kernel/ imports only kernel/';
    case 'ui-kit':
      return ['kernel', 'ui-kit'].includes(to.area) ? null : 'ui-kit/ imports only kernel/ and ui-kit/';
    case 'features':
      if(to.area === 'kernel' || to.area === 'ui-kit') return null;
      if(to.area === 'app') return 'a feature may not import app/';
      if(to.feature === from.feature)
        return index || host ? `import the module itself, not features/${from.feature}/${to.file}: it imports this file` : null;
      if(host) return `features/${to.feature}/host.js is the app shell's; a feature imports its index.js`;
      return index ? null : `import features/${to.feature}/ through its index.js, not ${to.file}`;
    case 'app':
      return to.area !== 'features' || index || host ? null : `import features/${to.feature}/ through its index.js, not ${to.file}`;
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
      if(typeof spec !== 'string') return;
      /* relative, or root-absolute the way Vite serves it ('/src/...');
         anything else is a package */
      const abs = spec.startsWith('.') ? path.resolve(path.dirname(file), spec)
                : spec.startsWith('/') ? path.join(ROOT, spec) : null;
      if(!abs) return;
      const msg = verdict(from, place(abs));
      if(msg) context.report({node: node.source, message: `${msg} (${spec})`});
    };
    return {ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check};
  },
};
/* ---- signals-memo: a memoised component must hear about in-place edits ----
   @preact/signals memoises two kinds of component: one that reads a signal
   while it renders (`x.value`, `pref(...)`), and one that holds hook state
   (useState/useReducer). Its parent's re-render reaches it only when a prop
   has changed by reference — and the model is edited in place, so the same
   item, opening or folder object handed down again is not unchanged data.
   Such a component with an object prop shows stale data with nothing
   thrown (the Library's tiles did, 1b5e487). It must also read a revision
   signal (`rev.<scope>.value`, `navRev.value`, any `<name>Rev.value`), or
   take a prop that changes whenever its data may have (`epoch`, the
   Library page's render count; or a `rev`/`<name>Rev` prop). See
   ui-kit/component.js.

   What counts as an object prop is read from the component's JSDoc
   (`@param {{it: Item, ...}} p`): anything that is not a primitive, a
   string-literal union, a function, a ref (`*Ref`, `RefObject`,
   `{current: …}`) or children. Two kinds of prop are not data the parent
   re-passes, and do not count:
   - one named `initial…`: a seed, read once to start the component's own
     state (TagField's initialTags);
   - any prop of a component used only as a dialog's body in its own file
     (`openDialog({…, body: <Body …/>})`, ui-kit/modal.jsx): the dialog
     renders that vnode once and never re-renders it with new props.

   A props type may also be a typedef in the same file (`@param {TileProps}
   p`, or `TileProps & {…}`). A component that holds state or reads a signal,
   takes props, and whose props cannot be read that way (no JSDoc, an imported
   type) is reported too: unknown is not compliant.

   What it reads: `useState`/`useReducer`, `x.value`, `pref()`, and the same
   through a function declared in this file (a custom hook like useIndex, or a
   helper like watchRoom). What it cannot see, so review must:
   - a hook or helper imported from another module (other than `pref`) that
     holds state or reads a signal — the component counts as stateless;
   - whether the revision signal read is the right one: reading `rev.prefs`
     satisfies it for a component that shows furniture. */
function jsdocParamType(sourceCode, node){
  const target = node.parent && (node.parent.type === 'ExportNamedDeclaration' || node.parent.type === 'VariableDeclarator') ? (node.parent.type === 'VariableDeclarator' ? node.parent.parent : node.parent) : node;
  const cs = sourceCode.getCommentsBefore(target);
  const c = cs.length ? cs[cs.length - 1] : null;
  if(!c || c.type !== 'Block' || !c.value.startsWith('*')) return null;
  const at = c.value.indexOf('@param');
  if(at < 0) return null;
  const open = c.value.indexOf('{', at);
  let depth = 0;
  for(let i = open; i < c.value.length; i++){
    if(c.value[i] === '{') depth++;
    else if(c.value[i] === '}' && --depth === 0) return c.value.slice(open + 1, i).replace(/\s*\n\s*\*?\s*/g, ' ').trim();
  }
  return null;
}
/** Split a type at top-level `sep`. */
function splitTop(t, sep){
  const out = []; let depth = 0, cur = '', q = null;
  for(const ch of t){
    if(q){ cur += ch; if(ch === q) q = null; continue; }
    if(ch === "'" || ch === '"'){ q = ch; cur += ch; continue; }
    if('({[<'.includes(ch)) depth++;
    else if(')}]>'.includes(ch)) depth--;
    if(depth === 0 && sep.includes(ch)){ out.push(cur.trim()); cur = ''; continue; }
    if(ch === '=' && depth === 0 && sep.includes(',')){ cur += ch; continue; }
    cur += ch;
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}
/** {name: type} of an object type literal `{a: T, b?: U}`, an intersection of
    them, or a typedef in this file naming either; null when a part is neither. */
function propTypes(t, typedefs, seen = new Set()){
  const out = {};
  for(const p of splitTop(t, '&')){
    if(typedefs[p] && !seen.has(p)){
      seen.add(p);
      const sub = propTypes(typedefs[p], typedefs, seen);
      if(!sub) return null;
      Object.assign(out, sub);
      continue;
    }
    if(!(p.startsWith('{') && p.endsWith('}'))) return null;
    for(const m of splitTop(p.slice(1, -1), ',;')){
      const i = m.indexOf(':'); if(i < 0) continue;
      out[m.slice(0, i).replace(/[?'"\s]/g, '')] = m.slice(i + 1).trim();
    }
  }
  return out;
}
const PRIMITIVE = /^(string|number|boolean|null|undefined|void|bigint|symbol|true|false|'[^']*'|"[^"]*"|-?\d+(\.\d+)?)$/;
function isPlainData(type, typedefs, seen = new Set()){
  const t = type.trim();
  if(/=>/.test(t) && /^\(/.test(t)) return true;                         // a function
  if(/(^|\W)(\w*Ref|RefObject)\b|^\{\s*current\s*:/.test(t)) return true;   // a ref
  if(/Children|ComponentChild/.test(t)) return true;
  return splitTop(t, '|').every(m => {
    const u = m.replace(/^\((.*)\)$/, '$1').trim();
    if(PRIMITIVE.test(u)) return true;
    if(/=>/.test(u)) return true;
    if(typedefs[u] && !seen.has(u)){ seen.add(u); return isPlainData(typedefs[u], typedefs, seen); }
    return false;
  });
}
const signalsMemo = {
  meta: {type: 'problem', schema: []},
  create(context){
    const sourceCode = context.sourceCode;
    const comps = [];
    const usages = new Map();   // component name -> JSX usages
    const exported = new Set();
    return {
      'Program > FunctionDeclaration, Program > ExportNamedDeclaration > FunctionDeclaration'(node){
        if(node.id && /^[A-Z]/.test(node.id.name)) comps.push({name: node.id.name, node});
      },
      'Program > VariableDeclaration > VariableDeclarator'(node){
        if(node.id.type === 'Identifier' && /^[A-Z]/.test(node.id.name) && node.init && /Function/.test(node.init.type)) comps.push({name: node.id.name, node: node.init});
      },
      ExportSpecifier(node){ exported.add(node.local.name); },
      JSXOpeningElement(node){
        if(node.name.type !== 'JSXIdentifier') return;
        const a = usages.get(node.name.name) || []; a.push(node); usages.set(node.name.name, a);
      },
      'Program:exit'(program){
        const typedefs = {};
        for(const c of sourceCode.getAllComments()){
          for(const m of c.value.matchAll(/@typedef\s*\{/g)){
            let depth = 0, i = m.index + m[0].length - 1, j = i;
            for(; j < c.value.length; j++){ if(c.value[j] === '{') depth++; else if(c.value[j] === '}' && --depth === 0) break; }
            const name = /^\s*(\w+)/.exec(c.value.slice(j + 1));
            if(name) typedefs[name[1]] = c.value.slice(i + 1, j).replace(/\s*\n\s*\*?\s*/g, ' ');
          }
        }
        const asDialogBody = el => {
          for(let p = el.parent; p; p = p.parent){
            if(p.type === 'Property' && p.key && p.key.name === 'body'){
              const call = p.parent && p.parent.parent;
              return !!call && call.type === 'CallExpression' && call.callee.type === 'Identifier' && call.callee.name === 'openDialog';
            }
            if(/Function|Program/.test(p.type)) return false;
          }
          return false;
        };
        /* what a function reads while it runs, not counting the functions it defines */
        const helpers = new Map();
        const reads = (fn) => {
          const r = {state: false, signal: false, revision: false};
          const walk = n => {
            if(!n || typeof n.type !== 'string') return;
            if(n !== fn && /Function/.test(n.type)) return;   // handlers and effects run later, not while rendering
            if(n.type === 'CallExpression' && n.callee.type === 'Identifier'){
              const c = n.callee.name;
              if(c === 'useState' || c === 'useReducer') r.state = true;
              if(c === 'pref') r.signal = true;
              const h = helpers.get(c);   /* a helper or custom hook in this file, e.g. watchRoom(), useIndex() */
              if(h){ r.state = r.state || h.state; r.signal = r.signal || h.signal; r.revision = r.revision || h.revision; }
            }
            if(n.type === 'MemberExpression' && !n.computed && n.property.name === 'value'){
              r.signal = true;
              const o = n.object;
              if((o.type === 'MemberExpression' && o.object.type === 'Identifier' && o.object.name === 'rev') || (o.type === 'Identifier' && /Rev$/.test(o.name))) r.revision = true;
            }
            for(const k of Object.keys(n)){
              if(k === 'parent') continue;
              const v = n[k];
              if(Array.isArray(v)) v.forEach(walk); else if(v && typeof v.type === 'string') walk(v);
            }
          };
          walk(fn.body);
          return r;
        };
        /* twice, so a helper that calls one declared below it hears about it */
        for(let pass = 0; pass < 2; pass++) for(const st of program.body){
          const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
          if(d && d.type === 'FunctionDeclaration' && d.id && /^[a-z]/.test(d.id.name)) helpers.set(d.id.name, reads(d));
        }
        for(const {name, node} of comps){
          const fn = node;
          const {state, signal, revision} = reads(fn);
          if(!(state || signal) || revision) continue;
          if(!fn.params.length) continue;
          const used = usages.get(name) || [];
          if(!exported.has(name) && used.length && used.every(asDialogBody)) continue;
          const at = fn.id || node.parent.id || fn;
          const t = jsdocParamType(sourceCode, fn);
          const props = t && propTypes(t, typedefs);
          if(!props){
            context.report({node: at, message:
              `${name} ${state ? 'holds hook state' : 'reads a signal'} and takes props this rule cannot read`
              + (t ? ` (\`${t}\`)` : ' (no JSDoc @param)') + ': type them with an object literal or a typedef in this file, so a stale object prop can be seen.'});
            continue;
          }
          if(Object.keys(props).some(k => /^(epoch|rev|\w+Rev)$/.test(k))) continue;
          const objects = Object.entries(props).filter(([k, ty]) => k !== 'children' && !/^initial[A-Z]/.test(k) && !isPlainData(ty, typedefs)).map(([k]) => k);
          if(!objects.length) continue;
          context.report({node: at, message:
            `${name} ${state ? 'holds hook state' : 'reads a signal'} and takes ${objects.map(o => '`' + o + '`').join(', ')} (an object): `
            + '@preact/signals re-renders it with its parent only when a prop changes by reference, and the model is edited in place. '
            + 'Read the revision signal it shows, or take an `epoch` prop (ui-kit/component.js).'});
        }
      },
    };
  },
};
const BOUNDARIES = [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {rp: {rules: {boundaries, 'signals-memo': signalsMemo}}},
    rules: {'rp/boundaries': 'error'},
  },
  {
    files: ['src/**/*.jsx'],
    rules: {'rp/signals-memo': 'error'},
  },
  {
    files: ['src/kernel/**/*.{js,jsx}'],
    rules: {
      'no-restricted-globals': ['error',
        {name: 'document', message: 'kernel/ has no DOM; write a signal and let a view (a feature or app/) render it.'}],
      'no-restricted-properties': ['error',
        ...['window', 'globalThis', 'self'].map(object => ({object, property: 'document',
          message: 'kernel/ has no DOM; write a signal and let a view (a feature or app/) render it.'}))],
    },
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

  /* ---- src/ ---------------------------------------------------------------
     Components are .jsx. ESLint's own parser reads JSX once asked to, and its
     scope analysis tracks JSX references, so `no-undef` names a component that
     was never imported and `no-unused-vars` counts one used only in markup. */
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
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
