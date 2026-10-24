#!/usr/bin/env node
// Append one line to the cockpit activity log.
//   node tools/cockpit/log.mjs "<text>" [--who=Claude] [--kind=start|finish|blocked|note|decision] [--worktree=wt-qr-look]
// Writes {ts, who, worktree, text, kind} to tools/cockpit/state/activity.jsonl.
import { appendFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const KINDS = ['start', 'finish', 'blocked', 'note', 'decision'];
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const text = args.filter((a) => !a.startsWith('--')).join(' ').trim();
if (!text) {
  console.error('usage: node tools/cockpit/log.mjs "<text>" [--who=NAME] [--kind=' + KINDS.join('|') + '] [--worktree=NAME]');
  process.exit(2);
}
const kind = opt('kind') || 'note';
if (!KINDS.includes(kind)) { console.error(`--kind must be one of ${KINDS.join(', ')}`); process.exit(2); }
let worktree = opt('worktree');
if (!worktree) {
  try { worktree = basename(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); }
  catch { worktree = basename(process.cwd()); }
}
const who = opt('who') || process.env.COCKPIT_WHO || process.env.USER || 'unknown';
const state = join(dirname(fileURLToPath(import.meta.url)), 'state');
mkdirSync(state, { recursive: true });
const entry = { ts: new Date().toISOString(), who, worktree, text: text.slice(0, 400), kind };
appendFileSync(join(state, 'activity.jsonl'), JSON.stringify(entry) + '\n');
console.log(`logged: [${kind}] ${who} @ ${worktree}: ${entry.text}`);
