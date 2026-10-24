#!/usr/bin/env node
// One command for a task's whole verification loop (PLAN section 5).
//
//   node tools/qa/vis-check.mjs --task=V1-01 --tag=before
//   node tools/qa/vis-check.mjs --task=V1-01 --tag=after --full
//
// Reads the task's `verify.poseSets` and `verify.envs` (and `flag`) from
// docs/visual-wave/tasks.json and captures every set at every one of those
// environments into <report root>/<task>/<tag>/ (report root:
// references/places/_feedback/visual-wave in CMP_REF_ROOT, the main checkout).
//   --look=<x>    pass ?look=<x> to the game. With tag "before" and a task flag (not "none")
//                 the default is ?look=-<flag>, i.e. the old look, flag OFF.
//   --poses=, --env=   override the task's sets / environments
//   --full        after the capture also run, in order: look-diff (before vs this tag, when a
//                 "before" run exists), smoke_world, perf (perf8 at noon, night, rain on tier med,
//                 under the perf lock) and owned-files; plus boot with --boot
//   --scope=a,b   poses the task may change (passed to look-diff); --identity passes --identity
//   --skip=perf,smoke_world   leave steps out (e.g. on a machine with no GPU)
// Exit 1 if any step fails. Summary written to <report root>/<task>/<tag>/vis-check.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, arg, done, gitSha } from './lib/rig.mjs';
import { reportRoot } from './lib/poses.mjs';
import { capturePoses } from './lib/capture-run.mjs';

const task = arg('task');
const tag = arg('tag');
if (!task || task === true || !tag || tag === true) { console.error('usage: node tools/qa/vis-check.mjs --task=<id> --tag=<tag> [--full] [--look=] [--poses=] [--env=] [--scope=] [--identity] [--skip=perf,smoke_world,owned-files,look-diff]'); process.exit(2); }
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/visual-wave/tasks.json'), 'utf8'));
const def = T.tasks.find((t) => t.id === task);
if (!def) { console.error(`no task "${task}" in docs/visual-wave/tasks.json`); process.exit(2); }
const full = !!arg('full', false);
const skip = new Set(String(arg('skip', '')).split(',').filter(Boolean));
const rr = reportRoot(task);
const out = path.join(rr, tag);
const posesArg = arg('poses', null) || (def.verify?.poseSets || ['core', 'chase']).join(',');
const envArg = arg('env', null) || (def.verify?.envs || ['noon']).join(',');
let look = arg('look', null);
if (look === null) look = tag === 'before' && def.flag && def.flag !== 'none' ? '-' + def.flag : '';
if (look === true) look = '';

const steps = [];
const note = (name, ok, detail) => { steps.push({ step: name, ok, detail }); console.log(`\n== ${name}: ${ok ? 'ok' : 'FAIL'}${detail ? ' (' + detail + ')' : ''}`); };
const run = (name, args, extra = {}) => {
  console.log(`\n== ${name}: node ${args.join(' ')}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...extra } });
  note(name, r.status === 0, r.status === 0 ? '' : `exit ${r.status}`);
  return r.status === 0;
};

console.log(`vis-check ${task} tag=${tag}${look ? ' look=' + look : ''}${full ? ' --full' : ''}`);
console.log(`  poses ${posesArg}, envs ${envArg}\n  out ${out}`);
const cap = await capturePoses({ posesArg, envArg, look, tag, out, task });
const flagged = cap.results.filter((r) => !r.ok);
note('capture', !cap.failed && !flagged.length && !cap.errors.length, `${cap.results.length - flagged.length}/${cap.results.length} shots clean, ${cap.errors.length} page errors`);

if (full) {
  const hasBefore = fs.existsSync(path.join(rr, 'before')) && tag !== 'before';
  if (!skip.has('look-diff')) {
    if (hasBefore) run('look-diff', ['tools/qa/look-diff.mjs', `--task=${task}`, '--a=before', `--b=${tag}`, ...(arg('scope', null) ? [`--scope=${arg('scope')}`] : []), ...(arg('identity', false) ? ['--identity'] : [])]);
    else note('look-diff', true, 'skipped: no "before" run yet');
  }
  if (!skip.has('smoke_world')) run('smoke_world', ['tools/smoke_world.mjs']);
  if (!skip.has('perf')) run('perf', ['tools/qa/perf.mjs', '--poses=perf8', '--env=noon,night,rain', '--tier=med', `--task=${task}`]);
  if (!skip.has('owned-files')) run('owned-files', ['tools/qa/owned-files.mjs', `--task=${task}`]);
  if (arg('boot', false)) run('boot', ['tools/qa/boot.mjs']);
}
const ok = steps.every((s) => s.ok);
fs.writeFileSync(path.join(out, 'vis-check.json'), JSON.stringify({ schema: 'aylmer-vis-check', task, tag, look: look || null, full, commit: gitSha(ROOT), when: new Date().toISOString(), poses: posesArg, envs: envArg, steps, ok }, null, 1));
console.log(`\nvis-check ${task} ${tag}: ${ok ? 'ALL OK' : 'FAILED: ' + steps.filter((s) => !s.ok).map((s) => s.step).join(', ')}`);
console.log(`shots: ${out}`);
done(ok ? 0 : 1);
