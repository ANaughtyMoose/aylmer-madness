#!/usr/bin/env node
// The review harness must tell the truth about a run where no game loaded
// (red team 19 Oct, tech.md T1/T2): a broken tools/serve.mjs fails the run fast,
// with the server's stderr shown and a non-zero exit, before any Chrome starts;
// --only that selects nothing is an error; --only bz_vieux selects the course.
//
// No browser: the broken server is served through --rev as a git tree that holds
// only a fake tools/serve.mjs (written to the object store, no branch or ref moves).
// The fake checks its --audio-dir the way the real serve.mjs:12 does
// (realpathSync with cwd at the export), then fails like the 19 Oct ENOENT.
//
//   node tools/smoke_harness_gate.mjs            (part of npm test)
//   node tools/smoke_harness_gate.mjs --browser  (also: a server that answers 404,
//        so the boot beat throws in a real Chrome; needs the RAM guard)
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HARNESS = path.join(HERE, 'review', 'harness.mjs');
let bad = 0, n = 0;
const check = (ok, msg) => { n++; if (!ok) { bad++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };

const git = (args, input) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', input }).trim();
// A tree with tools/serve.mjs = src, nothing else: `git archive <tree>` exports it.
function fakeTree(src) {
  const blob = git(['hash-object', '-w', '--stdin'], src);
  const tools = git(['mktree'], `100644 blob ${blob}\tserve.mjs\n`);
  return git(['mktree'], `040000 tree ${tools}\ttools\n`);
}
const freePort = (lo, hi) => new Promise(async (res) => {
  for (let p = lo; p <= hi; p++) {
    const ok = await new Promise((r) => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(p, '127.0.0.1'); });
    if (ok) return res(p);
  }
  res(null);
});
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-gate-'));
const run = (args, opts = {}) => {
  const t = Date.now();
  const r = spawnSync(process.execPath, [HARNESS, ...args], { encoding: 'utf8', timeout: opts.timeout || 60000, cwd: opts.cwd || ROOT, env: { ...process.env, CMP_SRV_PORT: '', CMP_CDP_PORT: '' } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), secs: (Date.now() - t) / 1000 };
};

const port = Number(process.env.CMP_SRV_PORT) || await freePort(8290, 8299);
const cdp = Number(process.env.CMP_CDP_PORT) || await freePort(9590, 9599);
check(port && cdp, `free ports (${port}, ${cdp})`);

// 1. --only selection
{
  const r = run(['--plan', 'quick', '--only', 'no_such_beat', '--list']);
  check(r.code === 2 && /matches no beat/.test(r.out), `--only with no match exits 2 (got ${r.code})`);
  const q = run(['--plan', 'quick', '--only', 'bz_vieux', '--list']);
  check(q.code === 0 && /\tcourse\tbz_vieux/.test(q.out), '--only bz_vieux selects the quick plan\'s course beat');
  for (const plan of ['full', 'ranger-rerun']) {
    const f = run(['--plan', plan, '--only', 'bz_vieux,cp_ruelles', '--list']);
    check(f.code === 0 && /\tbz_vieux/.test(f.out) && /\tcp_ruelles/.test(f.out), `--only bz_vieux,cp_ruelles selects both courses in ${plan}`);
  }
}

// 2. A server that dies at start (the 19 Oct ENOENT), relative --audio-dir as typed then.
{
  const tree = fakeTree(`import fs from 'node:fs';
const i = process.argv.indexOf('--audio-dir');
const dir = i >= 0 ? process.argv[i + 1] : null;
console.error('fake serve: cwd ' + process.cwd() + ' audio-dir ' + dir + ' absolute ' + (dir ? dir.startsWith('/') : 'none'));
if (dir) fs.realpathSync(dir);
fs.realpathSync('/aylmer-gate-selftest/no-such-dir');
`);
  const audioAbs = path.join(scratch, 'radio');
  fs.mkdirSync(audioAbs);
  const out = path.join(scratch, 'pack-dead');
  // Relative to the harness cwd, as the 19 Oct run typed it.
  const r = run(['--plan', 'quick', '--rev', tree, '--port', String(port), '--cdp-port', String(cdp), '--out', out, '--audio-dir', path.relative(scratch, audioAbs)], { cwd: scratch });
  check(r.code === 1, `dead server: exit 1 (got ${r.code})`);
  check(r.secs < 20, `dead server: fails fast (${r.secs.toFixed(1)} s)`);
  check(/\[serve\.mjs\].*ENOENT/.test(r.out), 'dead server: its stderr (ENOENT) is shown');
  check(/absolute true/.test(r.out), 'relative --audio-dir reaches serve.mjs as an absolute path');
  check(fs.existsSync(path.join(out, 'SERVER-FAILED.txt')), 'dead server: SERVER-FAILED.txt in the pack');
  check(!/beat 1\//.test(r.out), 'dead server: no beat was played');
}

// 3. A server that runs and never listens.
{
  const tree = fakeTree(`setInterval(() => {}, 1000);\n`);
  const out = path.join(scratch, 'pack-silent');
  const r = run(['--plan', 'quick', '--rev', tree, '--port', String(port), '--cdp-port', String(cdp), '--out', out]);
  check(r.code === 1 && /did not answer/.test(r.out), `silent server: exit 1, "did not answer" (got ${r.code})`);
}

// 4. Optional, in a real Chrome: a server that answers 404 to everything. The boot
// beat throws (the menu never comes up); the run must exit 1 and stop after it.
if (process.argv.includes('--browser')) {
  const tree = fakeTree(`import http from 'node:http';
http.createServer((q, s) => s.writeHead(404).end('no game here')).listen(Number(process.argv[2]), '127.0.0.1');
`);
  const out = path.join(scratch, 'pack-404');
  const r = run(['--plan', 'quick', '--rev', tree, '--port', String(port), '--cdp-port', String(cdp), '--out', out], { timeout: 600000 });
  check(r.code === 1, `404 server in Chrome: exit 1 (got ${r.code}, ${r.secs.toFixed(0)} s)`);
  check(/plan stops here/.test(r.out) && !/beat 2\//.test(r.out), '404 server: the plan stops after the failed boot');
  const sum = fs.existsSync(path.join(out, 'SUMMARY.md')) ? fs.readFileSync(path.join(out, 'SUMMARY.md'), 'utf8') : '';
  check(/Run FAILED \(exit 1\)/.test(sum), 'SUMMARY.md says the run failed');
  const m = fs.existsSync(path.join(out, 'metrics.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'metrics.json'), 'utf8')) : {};
  check(m.headline && m.headline.rawFrameMaxMs === null && m.headline.fpsMeanWorst === null, 'no headline frame numbers from a page with no game');
}

try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
console.log(`\nharness gate: ${n - bad}/${n} checks passed`);
process.exit(bad ? 1 : 0);
