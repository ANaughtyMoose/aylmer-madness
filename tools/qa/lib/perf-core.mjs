// Pure statistics, durable output and one performance lock shared by worktrees.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const numberArg = (name, value, min, max = Infinity) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${name} must be between ${min} and ${max}`);
  return n;
};
export function options(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const at = a.indexOf('=');
    if (at >= 0) out[a.slice(2, at)] = a.slice(at + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}
export function percentile(a, p) {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return null;
  const k = (s.length - 1) * p, f = Math.floor(k);
  return +(s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (k - f)).toFixed(3);
}
export const stats = (a) => ({ samples: a.length, invalid: a.filter((x) => !Number.isFinite(x)).length, p50: percentile(a, 0.5), p95: percentile(a, 0.95), p99: percentile(a, 0.99), max: a.length ? a.reduce((m, x) => Math.max(m, x), -Infinity) : null });
export function drift(windows, limit = 10) {
  const usable = windows.filter((w) => w.complete && Number.isFinite(w.interval?.p50));
  if (usable.length < 2) return { pass: false, percent: null, reason: 'fewer than two complete windows' };
  const n = Math.min(3, Math.floor(usable.length / 2));
  const first = percentile(usable.slice(0, n).map((w) => w.interval.p50), 0.5);
  const last = percentile(usable.slice(-n).map((w) => w.interval.p50), 0.5);
  const percent = first > 0 ? +((last / first - 1) * 100).toFixed(3) : null;
  return { firstP50Ms: first, lastP50Ms: last, edgeWindows: n, percent, limitPercent: limit, pass: percent !== null && percent <= limit };
}
export function buildIdentity(root, exclude = []) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 ** 2 });
  const status = git('status', '--porcelain=v1', '--untracked-files=no');
  const excluded = new Set(exclude.map((f) => path.resolve(f)));
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter((f) => f && !excluded.has(path.resolve(root, f)));
  const fingerprintFile = (f) => {
    const st = fs.lstatSync(f);
    if (st.isSymbolicLink()) return { kind: 'symlink', sha256: sha256(fs.readlinkSync(f)) };
    if (st.isDirectory()) return { kind: 'directory', sha256: sha256(JSON.stringify(fs.readdirSync(f).sort().map((name) => [name, fingerprintFile(path.join(f, name))]))) };
    if (!st.isFile()) throw new Error(`cannot fingerprint non-file source entry: ${path.relative(root, f)}`);
    return { kind: 'file', sha256: sha256(fs.readFileSync(f)) };
  };
  // Symlinks are identified, never followed into private reference trees.
  const files = untracked.map((name) => ({ path: name, ...fingerprintFile(path.join(root, name)) }));
  const identity = { commit: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(), worktree: path.basename(root), dirty: !!(status || files.length), status, trackedDiffSha256: sha256(git('diff', 'HEAD', '--binary')), untracked: files };
  return { ...identity, fingerprint: sha256(JSON.stringify(identity)) };
}
export function summarizeTiming(d) {
  return { frames: d.n, interval: stats(d.interval), gpuMs: d.gpu.length ? stats(d.gpu) : null, cpuMs: stats(d.cpu), gpuPlusCpu: d.gpuCpu.length ? stats(d.gpuCpu) : null,
    gpuSamples: d.gpu.length, gpuDisjoint: d.disjoint, query: d.query, queryStart: d.queryStart, tris: percentile(d.tris, 0.5), draws: percentile(d.draws, 0.5),
    gpuBytesMB: Number.isFinite(d.gpuBytes) ? +(d.gpuBytes / 2 ** 20).toFixed(3) : null, glResources: d.resources, contextLost: d.contextLost, glErrors: d.glErrors || [], nativeTiming: d.nativeTiming,
    windowPending: d.windowPending ?? d.query.pending, expectedIntervals: d.expectedIntervals ?? Math.max(0, d.n - 1), sampledSeconds: d.sampledSeconds, capped: !!d.capped };
}
export function workloadFailures(snapshot, { tier, reference } = {}) {
  const fails = [];
  if (snapshot?.mode !== 'drive' || snapshot?.cinemaActive) fails.push('simulation is not in active drive mode');
  if (tier && snapshot?.quality !== tier) fails.push(`quality ${snapshot?.quality} differs from ${tier}`);
  const t = snapshot?.traffic;
  if (!t || !(t.expected > 0) || t.actual !== t.expected) fails.push('traffic population differs from the prepared tier');
  if (reference) {
    if (snapshot.world?.sectors !== reference.world?.sectors) fails.push('soak sector residency changed');
    if (snapshot.world?.resident !== reference.world?.resident) fails.push('soak resident geometry changed');
    const a = snapshot.position, b = reference.position;
    if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) > 1) fails.push('soak vehicle moved more than one metre from the prepared pose');
  }
  return fails;
}
export function rowFailures(row, { frames, gpuBar = 12, timer = true } = {}) {
  const fails = [];
  if (row.frames !== frames) fails.push(`incomplete frame count ${row.frames}/${frames}`);
  if (row.interval.samples !== (row.expectedIntervals ?? frames - 1) || row.interval.invalid || !Number.isFinite(row.interval.p95)) fails.push('incomplete or invalid interval samples');
  if (row.interval.p95 > 16.7) fails.push(`p95 interval ${row.interval.p95} > 16.7`);
  if (timer && row.gpuSamples !== frames) fails.push(`incomplete GPU samples ${row.gpuSamples}/${frames}`);
  if (timer && !row.gpuPlusCpu) fails.push('no GPU timer samples');
  if (row.gpuPlusCpu?.p95 > gpuBar) fails.push(`p95 gpu+cpu ${row.gpuPlusCpu.p95} > ${gpuBar}`);
  if (row.cpuMs?.invalid || row.gpuMs?.invalid || row.gpuPlusCpu?.invalid) fails.push('non-finite timing samples');
  if (!Number.isFinite(row.tris) || row.tris > 450000) fails.push(`tris ${row.tris} exceeds or cannot establish 450000 budget`);
  if (!Number.isFinite(row.draws) || row.draws > 400) fails.push(`draws ${row.draws} exceeds or cannot establish 400 budget`);
  if (row.gpuDisjoint) fails.push('GPU disjoint during measurement');
  if ((row.windowPending ?? row.query.pending) > 0) fails.push(`${row.windowPending ?? row.query.pending} unresolved timer queries`);
  if (row.contextLost) fails.push('WebGL context lost');
  if (row.glErrors?.length) fails.push(`${row.glErrors.length} GL errors`);
  if (row.pageErrors?.length) fails.push(`${row.pageErrors.length} page errors`);
  if (row.snapshot) fails.push(...workloadFailures(row.snapshot, { tier: row.tier }));
  return fails;
}
export function finalizeMemoryReport(report) {
  const soak = report.params.mode === 'soak';
  report.acceptanceEligible = soak && report.params.timer && report.params.minutes >= 30 && report.params.warmupSeconds >= 60 && report.params.windowSeconds === 60;
  report.pass = !!(report.completed && report.buildConsistent && !report.fatal && !report.pageErrors.length
    && !(report.workloadFailures || []).length && (soak ? report.drift?.pass && report.windows.every((w) => w.pass) : report.results.every((r) => !r.fails?.length)));
  report.acceptancePass = report.pass && report.acceptanceEligible;
  return report;
}
export function machine() {
  return { model: os.cpus()[0]?.model || '', cores: os.cpus().length, memGB: +(os.totalmem() / 2 ** 30).toFixed(1), loadavg: os.loadavg().map((x) => +x.toFixed(2)), freeMB: +(os.freemem() / 2 ** 20).toFixed(1) };
}
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
export function claimOutput(file, resume = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (resume) return JSON.parse(fs.readFileSync(file, 'utf8'));
  // Never silently replace an earlier run, even after a failed or partial run.
  const fd = fs.openSync(file, 'wx'); fs.writeFileSync(fd, JSON.stringify({ status: 'initializing' })); fs.closeSync(fd);
  return null;
}
export const processAlive = (pid) => {
  if (!Number.isInteger(pid) || pid < 1) return null;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'ESRCH' ? false : true; }
};
// Per-user temp directory is shared by every worktree and both performance tools.
export const PERF_LOCK = path.join(os.tmpdir(), `aylmer-performance-${process.getuid?.() ?? os.userInfo().username}.lock`);
const portMightBeLive = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port }); let settled = false;
  const end = (answer) => { if (settled) return; settled = true; socket.destroy(); resolve(answer); };
  socket.once('connect', () => end(true)); socket.once('error', (e) => end(e.code !== 'ECONNREFUSED'));
  socket.setTimeout(1000, () => end(true));
});
async function abandoned(owner) {
  if (processAlive(owner.pid) !== false) return false;
  // A killed runner can leave its Chrome/server children alive. Do not start
  // another timed run until its recorded endpoints are demonstrably down.
  for (const port of owner.ports || []) if (await portMightBeLive(port)) return false;
  return true;
}
export async function takeLock({ lock = PERF_LOCK, task = null, ports = [], waitMs = 120 * 60e3, pollMs = 1000, onWait = console.log } = {}) {
  const token = crypto.randomUUID(), since = new Date().toISOString(), start = Date.now();
  const ownerFile = path.join(lock, 'owner.json'); let said = false;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, token, task, since, ports }), { flag: 'wx' });
      let released = false;
      return { lock, waitedMs: Date.now() - start, release() {
        if (released) return; released = true;
        try {
          const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
          if (owner.token !== token) return;
          fs.unlinkSync(ownerFile); fs.rmdirSync(lock);
        } catch { /* Never remove an unrecognized holder. */ }
      } };
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let held; try { held = JSON.parse(fs.readFileSync(ownerFile, 'utf8')); } catch { held = null; }
    // Only a proven dead PID permits recovery. A live old lock stays live.
    if (held && await abandoned(held)) {
      const reclaim = path.join(lock, 'reclaim'); let fd;
      try {
        fd = fs.openSync(reclaim, 'wx'); fs.writeSync(fd, token); fs.closeSync(fd); fd = null;
        const latest = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
        if (latest.token === held.token && await abandoned(latest)) {
          const retired = `${lock}.dead-${token}`;
          fs.renameSync(lock, retired);
          fs.unlinkSync(path.join(retired, 'owner.json')); fs.unlinkSync(path.join(retired, 'reclaim')); fs.rmdirSync(retired);
          continue;
        }
        if (fs.readFileSync(reclaim, 'utf8') === token) fs.unlinkSync(reclaim);
      } catch (e) {
        if (fd != null) fs.closeSync(fd);
        if (!['EEXIST', 'ENOENT'].includes(e.code)) throw e;
      }
    }
    if (!said) { onWait(`performance lock held by ${held?.pid ?? 'unknown owner'}, task ${held?.task ?? 'unknown'}, since ${held?.since ?? 'unknown'}; waiting without age-based takeover`); said = true; }
    if (Date.now() - start >= waitMs) throw new Error(`performance lock wait expired; holder ${held?.pid ?? 'unknown'} remains untouched`);
    await sleep(pollMs);
  }
}
