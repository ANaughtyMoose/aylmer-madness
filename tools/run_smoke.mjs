#!/usr/bin/env node
// Every tools/smoke*.mjs, one after another, and a non-zero exit if any of them
// fails. `npm test` runs this. Serial and not parallel on purpose: several of
// them bake the whole world, and four of those at once is a gigabyte.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => /^smoke.*\.mjs$/.test(f)).sort();

let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').filter(Boolean).pop() || '(no output)';
  const bad = r.status !== 0 || /\bFAIL\b/.test(out);
  if (bad) failed.push(f);
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${f.padEnd(24)}  ${last.slice(0, 80)}`);
}

console.log(`\n${files.length - failed.length}/${files.length} suites passed`);
if (failed.length) { console.log('failed: ' + failed.join(', ')); process.exit(1); }
