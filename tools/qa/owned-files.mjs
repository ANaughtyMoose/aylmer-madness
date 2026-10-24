#!/usr/bin/env node
// Ownership check: fails if the working tree (or, with --base, the branch) touches
// a path outside the task's `files` globs in docs/visual-wave/tasks.json.
//
//   node tools/qa/owned-files.mjs --task=V0-04 [--base=<ref>] [--json]
//
// Looked at: staged + unstaged changes against HEAD, untracked files (not
// ignored), and, with --base=<ref>, every commit from <ref> to HEAD as well
// (use it as the last check before handing a branch back).
// Globs: `**` crosses folders, `*` stays inside one folder, anything else is an
// exact path. Always allowed on top of the task's own files: its report
// (docs/visual-wave/reports/<id>.md), its status line in docs/visual-wave/tasks.json,
// and generated perf runs (docs/qa/perf/**).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg } from './lib/rig.mjs';

const task = arg('task');
if (!task || task === true) { console.error('usage: node tools/qa/owned-files.mjs --task=<id> [--base=<ref>] [--json]'); process.exit(2); }
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/visual-wave/tasks.json'), 'utf8'));
const def = T.tasks.find((t) => t.id === task);
if (!def) { console.error(`no task "${task}" in docs/visual-wave/tasks.json`); process.exit(2); }

export const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
  .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*') + '$');
const allowed = [...def.files, `docs/visual-wave/reports/${task}.md`, 'docs/visual-wave/tasks.json', 'docs/qa/perf/**'].map((g) => ({ g, re: globToRe(g) }));

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
const changed = new Map();   // path -> why
const add = (list, why) => { for (const p of list) if (!changed.has(p)) changed.set(p, why); };
add(git('diff', '--name-only', 'HEAD'), 'changed vs HEAD');
add(git('ls-files', '--others', '--exclude-standard'), 'untracked');
const base = arg('base', null);
if (base && base !== true) add(git('diff', '--name-only', `${base}...HEAD`), `committed since ${base}`);

const bad = [...changed].filter(([p]) => !allowed.some((a) => a.re.test(p)));
if (arg('json', false)) console.log(JSON.stringify({ task, owns: def.files, changed: [...changed.keys()], outside: bad.map(([p, w]) => ({ path: p, why: w })) }, null, 1));
else {
  console.log(`owned-files ${task}: ${changed.size} changed path(s), ${bad.length} outside the task's files`);
  console.log('  owns: ' + def.files.join(', '));
  for (const [p, w] of bad) console.log(`  OUTSIDE  ${p}  (${w})`);
}
process.exit(bad.length ? 1 : 0);
