#!/usr/bin/env node
// Every tools/smoke*.mjs, one after another, and a non-zero exit if any of them
// fails. `npm test` runs this. Serial and not parallel on purpose: several of
// them bake the whole world, and four of those at once is a gigabyte.
//
// --timing (npm run test:timing): only the suites with quiet-window budgets
// (they import timing-gate.mjs), with AYLMER_QUIET=1 so those budgets are
// asserted. Run it in the quiet window; plain npm test prints them as SKIP lines.
import { readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TIMING = process.argv.includes('--timing');
const files = readdirSync(here).filter((f) => /^smoke.*\.mjs$/.test(f)).sort()
  .filter((f) => !TIMING || readFileSync(join(here, f), 'utf8').includes('timing-gate.mjs'));
const env = TIMING ? { ...process.env, AYLMER_QUIET: '1' } : process.env;
if (TIMING) console.log(`timing suites, budgets asserted (AYLMER_QUIET=1); load average ${os.loadavg().map((v) => v.toFixed(1)).join(' ')} on ${os.cpus().length} cores${os.loadavg()[0] > os.cpus().length / 2 ? ': NOT a quiet window, a miss here is not evidence' : ''}\n`);

let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8', env });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').filter(Boolean).pop() || '(no output)';
  const bad = r.status !== 0 || /\bFAIL\b/.test(out);
  if (bad) failed.push(f);
  const skips = TIMING ? 0 : (out.match(/^\s*SKIP /gm) || []).length;
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${f.padEnd(24)}  ${last.slice(0, 80)}${skips ? `  (${skips} timing SKIP)` : ''}`);
}

console.log(`\n${files.length - failed.length}/${files.length} suites passed`);
if (!TIMING) console.log('SKIP: wall-clock budgets in smoke_terrain, smoke_react and smoke_feel are quiet-window checks; run npm run test:timing in the quiet window');
if (failed.length) { console.log('failed: ' + failed.join(', ')); process.exit(1); }
