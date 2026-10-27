#!/usr/bin/env node
// Tom's rule (W7-DASHES, 27 Oct 2026): no em dash (U+2014) and no en dash
// (U+2013) in anything a player reads. This smoke keeps them from coming back.
//
//   node tools/smoke_no_dashes.mjs
//
//   1. every string in assets/text/*.json (values and keys) is dash-free;
//      keys that start with "_" are notes for builders and are skipped
//   2. every string literal and template-literal chunk in src/**/*.js and
//      src/**/*.mjs is dash-free; comments are not text and are skipped
//   3. the scanner itself: it finds a dash in a string, a template, a
//      template after ${}, an escaped dash and an HTML entity, and ignores one in a line comment, a block comment
//      and a regex literal
//
// A minus sign (U+2212) and a plain hyphen are not dashes and pass.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASH = /[\u2013\u2014]/;
// In source text a dash can also hide as an escape or an HTML entity.
const DASH_SRC = /[\u2013\u2014]|\\u201[34]|\\u\{201[34]\}|&[mn]dash;|&#821[12];|&#x201[34];/i;

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};

// A small JS tokenizer: just enough to tell strings, templates and regex
// literals from comments. Returns [{ line, kind, text }] for every string
// literal ('str'), template chunk ('tpl') and regex literal ('re').
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const isWord = (c) => /[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) > 127;
export function literals(src) {
  const out = [];
  const n = src.length;
  const stack = [];
  let i = 0, line = 1, brace = 0, last = '', lastWord = '';
  const regexOk = () => last === '' || last === 'punc' || (last === 'id' && REGEX_AFTER_WORD.has(lastWord));
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (src.startsWith('/*', i)) {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      for (let k = i; k < j; k++) if (src[k] === '\n') line++;
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n') break;
        j++;
      }
      out.push({ line, kind: 'str', text: src.slice(i, j + 1) });
      i = j + 1; last = 'id'; lastWord = ''; continue;
    }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === brace)) {
      if (c === '}') stack.pop();
      const start = line;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') break;
        if (src.startsWith('${', j)) break;
        if (src[j] === '\n') line++;
        j++;
      }
      out.push({ line: start, kind: 'tpl', text: src.slice(i, j + 1) });
      if (j < n && src[j] === '$') { stack.push(brace); i = j + 2; last = 'punc'; continue; }
      i = j + 1; last = 'id'; lastWord = ''; continue;
    }
    if (c === '/' && regexOk()) {
      let j = i + 1, inClass = false;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '\n') break;
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      j++;
      while (j < n && /[A-Za-z]/.test(src[j])) j++;
      out.push({ line, kind: 're', text: src.slice(i, j) });
      i = j; last = 'id'; lastWord = ''; continue;
    }
    if (isWord(c)) {
      let j = i;
      while (j < n && isWord(src[j])) j++;
      lastWord = src.slice(i, j); last = /[0-9]/.test(c) ? 'num' : 'id'; i = j; continue;
    }
    if (c === '{') { brace++; last = 'punc'; }
    else if (c === '}') { brace--; last = ')'; }
    else if (c === ')' || c === ']') last = ')';
    else last = 'punc';
    i++;
  }
  return out;
}
const dashed = (src) => literals(src).filter((t) => t.kind !== 're' && DASH_SRC.test(t.text));

// 3. the scanner, first, so a green run means something.
{
  const D = '\u2014', N = '\u2013';
  const probe = [
    `const a = 'one ${D} two'; // a comment ${D} fine`,
    `/* block ${D} comment */ const b = "x";`,
    'const c = `head ${x ? `in ' + N + 'ner` : 1} tail ' + D + '`;',
    `const r = /[${N}${D}]/; const m = '− 20 $';`,
    `if (x) { y = 1; } const d = \`ok\`;`,
    "const e = 'a \\u2014 b' + '<b>x</b> &mdash; y';",
  ].join('\n');
  const hits = dashed(probe);
  ok(hits.length === 5, 'the scanner finds the string, the nested template, the template tail, an escape and an entity',
    hits.map((h) => `${h.line}:${h.kind}`).join(' '));
  ok(hits.every((h) => h.line !== 2 && h.line !== 4), 'and skips the comments, the regex and a minus sign');
}

// 1. assets/text
{
  const dir = path.join(ROOT, 'assets/text');
  const bad = [];
  let strings = 0;
  const walk = (o, at, file) => {
    if (typeof o === 'string') { strings++; if (DASH.test(o)) bad.push(`${file} ${at}: ${o.slice(0, 90)}`); return; }
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${at}[${i}]`, file)); return; }
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith('_')) continue;
        strings++;
        if (DASH.test(k)) bad.push(`${file} key ${at}.${k}`);
        walk(v, `${at}.${k}`, file);
      }
    }
  };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const f of files) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), '', f);
  ok(files.length > 10 && strings > 1000, `read ${files.length} text files, ${strings} strings`);
  ok(bad.length === 0, 'no em or en dash in assets/text', bad.slice(0, 12).join('\n         '));
}

// 2. src string literals
{
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.m?js$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  const bad = [];
  let n = 0;
  for (const f of files.sort()) {
    const src = fs.readFileSync(f, 'utf8');
    const lits = literals(src);
    n += lits.length;
    for (const h of lits) if (h.kind !== 're' && DASH_SRC.test(h.text)) {
      bad.push(`${path.relative(ROOT, f)}:${h.line} ${h.text.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
  ok(files.length > 50 && n > 10000, `read ${files.length} source files, ${n} literals`);
  ok(bad.length === 0, 'no em or en dash in a src string literal', bad.slice(0, 12).join('\n         '));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
