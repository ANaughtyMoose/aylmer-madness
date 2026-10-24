#!/usr/bin/env node
// Aylmer Madness development cockpit.
//   node tools/cockpit/server.mjs [port]      (default 8170, loopback only)
// Read-only view of the roadmap, worktrees, tests, look reviews, local servers
// and activity. It runs `npm test` on request (one run at a time, across every
// cockpit instance) and records Tom's answers to decisions. It writes only to
// tools/cockpit/state/ and to the "decisions" array of docs/roadmap.json.
import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, stat, readdir, mkdir, appendFile, realpath, rename, unlink } from 'node:fs/promises';
import { existsSync, createReadStream, unlinkSync } from 'node:fs';
import { join, dirname, resolve, sep, extname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const WT = resolve(HERE, '..', '..');                       // this worktree
const PORT = Number(process.argv[2]) || 8170;
// COCKPIT_STATE and COCKPIT_ROADMAP point a test instance at scratch copies.
const STATE = process.env.COCKPIT_STATE ? resolve(process.env.COCKPIT_STATE) : join(HERE, 'state');
const BASE_REF = process.env.COCKPIT_BASE || 'refs/remotes/codexwork/quality-review';
const PLAY_PORT = 8141;
await mkdir(STATE, { recursive: true });

async function git(cwd, args, timeout = 8000) {
  const { stdout } = await run('git', ['-C', cwd, ...args], { timeout, maxBuffer: 16 << 20 });
  return stdout;
}
// Main checkout = parent of the shared .git directory.
let MAIN;
try { MAIN = dirname((await git(WT, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()); }
catch { MAIN = resolve(WT, '..', 'aylmer-madness'); }
const PLACES = join(MAIN, 'references', 'places');
const FEEDBACK = join(PLACES, '_feedback');

// ---------- cache: stale-while-revalidate, so a slow source never stalls the page ----------
const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttl) return hit.p;
  if (hit && hit.value !== undefined) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      fn().then((v) => cache.set(key, { t: Date.now(), p: Promise.resolve(v), value: v }))
        .catch(() => { hit.refreshing = false; hit.t = Date.now() - ttl + 3000; });
    }
    return Promise.resolve(hit.value);
  }
  const entry = { t: now, p: null, value: undefined };
  entry.p = fn().then((v) => { entry.value = v; return v; }, (e) => { cache.delete(key); throw e; });
  cache.set(key, entry);
  return entry.p;
}
const TTL = 15000;
const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON that another process may be writing right now: retry a parse failure,
// then fall back to the last good copy instead of flashing an error.
const lastGood = new Map();
async function readJsonLive(file) {
  let err;
  for (let k = 0; k < 3; k++) {
    try {
      const text = await readFile(file, 'utf8');
      const v = JSON.parse(text);
      lastGood.set(file, v);
      return { value: v, text };
    } catch (e) {
      if (e.code === 'ENOENT') { lastGood.delete(file); throw e; }
      err = e; await sleep(120);
    }
  }
  if (lastGood.has(file)) return { value: structuredClone(lastGood.get(file)), stale: true, error: err.message };
  throw err;
}
async function writeAtomic(file, text) {
  const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  await writeFile(tmp, text);
  await rename(tmp, file);
}

// ---------- roadmap ----------
async function loopRuns(data) {
  for (const l of (data && Array.isArray(data.loops) ? data.loops : [])) {
    if (l.lastRun || !Array.isArray(l.outputs)) continue;
    let best = 0;
    for (const o of l.outputs.slice(0, 8)) {
      if (typeof o !== 'string' || o.includes('..')) continue;
      for (const base of [WT, MAIN]) {
        if (o.includes('<')) {
          const dir = resolve(base, o.slice(0, o.indexOf('<')).replace(/[^/]*$/, ''));
          for (const f of await safe(readdir(dir), [])) {
            const st = await safe(stat(join(dir, f)), null);
            if (st && st.isFile() && st.mtimeMs > best) best = st.mtimeMs;
          }
          continue;
        }
        const st = await safe(stat(resolve(base, o)), null);
        if (st && st.mtimeMs > best) best = st.mtimeMs;
      }
    }
    if (best) l.lastRun = new Date(best).toISOString();
  }
  return data;
}
// Decisions can point at a folder an agent will fill (a report, screenshots).
const DOC_EXT = new Set(['.md', '.txt', '.json']);
async function watchFiles(data) {
  for (const d of (data && Array.isArray(data.decisions) ? data.decisions : [])) {
    if (!d || !d.watch || typeof d.watch.dir !== 'string') continue;
    const abs = resolve(MAIN, d.watch.dir);
    if (!abs.startsWith(PLACES + sep) && abs !== PLACES) { d.watchFiles = []; continue; }
    const files = [];
    for (const f of await walkAll(abs)) {
      const ext = extname(f).toLowerCase();
      if (!IMG.has(ext) && !DOC_EXT.has(ext)) continue;
      const st = await safe(stat(f), null);
      if (!st) continue;
      files.push({ name: relative(abs, f), kind: IMG.has(ext) ? 'image' : 'doc', url: IMG.has(ext) ? toUrl(f) : '/doc/main/' + relative(MAIN, f).split(sep).map(encodeURIComponent).join('/'), mtime: st.mtime.toISOString() });
    }
    files.sort((a, b) => b.mtime.localeCompare(a.mtime));
    d.watchFiles = files.slice(0, 16);
  }
  return data;
}
function roadmapFile() {
  return (async () => {
    let best = null;
    for (const f of process.env.COCKPIT_ROADMAP ? [resolve(process.env.COCKPIT_ROADMAP)] : [join(WT, 'docs', 'roadmap.json'), join(MAIN, 'docs', 'roadmap.json')]) {
      const st = await safe(stat(f), null);
      if (st && (!best || st.mtimeMs > best.st.mtimeMs)) best = { f, st };
    }
    return best;
  })();
}
async function roadmap() {
  const r = await roadmapRaw();
  await loopRuns(r.data);
  await watchFiles(r.data);
  return r;
}
async function sample() { return JSON.parse(await readFile(join(HERE, 'fixtures', 'roadmap.sample.json'), 'utf8')); }
async function roadmapRaw() {
  const best = await roadmapFile();
  if (!best) return { sample: true, source: 'tools/cockpit/fixtures/roadmap.sample.json', data: await sample() };
  const source = relative(dirname(MAIN), best.f);
  try {
    const r = await readJsonLive(best.f);
    return { sample: false, source, mtime: best.st.mtime.toISOString(), data: r.value, ...(r.stale ? { stale: true, error: `roadmap.json is being rewritten or is broken (${r.error}); showing the last good copy` } : {}) };
  } catch (e) {
    return { sample: true, error: `roadmap.json could not be parsed (${e.message}); showing sample data`, source, data: await sample() };
  }
}

// ---------- decisions: Tom answers in the page, the roadmap records it ----------
const DECISIONS_LOG = join(STATE, 'decisions.json');
let decideChain = Promise.resolve();
const clip = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
async function appendDecisionLog(entry) {
  let log = [];
  const r = await safe(readJsonLive(DECISIONS_LOG), null);
  if (r && Array.isArray(r.value)) log = r.value;
  else if (r && r.value && Array.isArray(r.value.log)) log = r.value.log;
  else if (existsSync(DECISIONS_LOG)) await safe(rename(DECISIONS_LOG, DECISIONS_LOG.replace(/\.json$/, `.unreadable-${Date.now()}.json`)), null);
  log.push(entry);
  await writeAtomic(DECISIONS_LOG, '[\n' + log.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n');
}
async function decide(body) {
  const best = await roadmapFile();
  if (!best) return { status: 409, body: { error: 'There is no docs/roadmap.json to record the answer in.' } };
  let text, data;
  for (let k = 0; k < 4 && !data; k++) {
    try { text = await readFile(best.f, 'utf8'); data = JSON.parse(text); } catch { await sleep(150); }
  }
  if (!data) return { status: 503, body: { error: 'roadmap.json is being rewritten right now. Try again in a moment.' } };
  const list = Array.isArray(data.decisions) ? data.decisions : [];
  const d = list.find((x) => x && x.id === body.id);
  if (!d) return { status: 404, body: { error: `No decision with id ${body.id}.` } };
  const action = body.action;
  const now = new Date().toISOString();
  const before = { status: d.status, answer: d.answer ?? null, answered_by: d.answered_by ?? null, answered_at: d.answered_at ?? null };
  let summary;
  if (action === 'reopen') {
    if (d.status === 'open') return { status: 409, body: { error: `${d.id} is already open.` } };
    d.previous = [...(Array.isArray(d.previous) ? d.previous : []), { ...before, rationale: d.rationale ?? null, reopened_at: now }].slice(-5);
    d.status = 'open'; d.answer = null; d.answered_by = null; d.answered_at = null;
    if (before.status === 'decided-by-claude') d.overruled_at = now;
    if (Array.isArray(d.fields)) for (const f of d.fields) delete f.answer;
    summary = before.status === 'decided-by-claude' ? `Tom overruled Claude on ${d.id}; it is open again` : `${d.id} reopened`;
  } else if (action === 'answer' || action === 'recommend') {
    if (d.status !== 'open') return { status: 409, body: { error: `${d.id} is already ${d.status}. Reopen it first.` } };
    let answer = null, via;
    const note = clip(body.text, 2000);
    const opts = Array.isArray(d.options) ? d.options : [];
    if (action === 'recommend') {
      if (!d.recommendation) return { status: 400, body: { error: `${d.id} has no recommendation to accept.` } };
      answer = String(d.recommendation); via = 'decide-for-me';
    } else if (Number.isInteger(body.option)) {
      const o = opts[body.option];
      if (!o) return { status: 400, body: { error: 'That option does not exist.' } };
      answer = o.label + (note ? `. Note: ${note}` : ''); via = 'option';
    } else if (body.fields && typeof body.fields === 'object' && Array.isArray(d.fields)) {
      let n = 0;
      for (const [k, v] of Object.entries(body.fields)) {
        const f = d.fields.find((x) => x.id === k);
        const val = clip(v, 400);
        if (f && val) { f.answer = val; n++; }
      }
      if (!n && !note) return { status: 400, body: { error: 'Fill in at least one answer.' } };
      if (note) d.note = note;
      via = 'fields';
      const filled = d.fields.filter((f) => f.answer);
      if (filled.length < d.fields.length) {
        d.answered_partial_at = now;
        await saveRoadmap(best.f, text, data);
        await appendDecisionLog({ ts: now, id: d.id, action: 'partial', by: 'Tom', fields: body.fields, note: note || undefined });
        await logActivity(`${d.id}: Tom answered ${n} of ${d.fields.length} questions (${d.fields.length - filled.length} still open)`);
        return { status: 200, body: { ok: true, decision: d, partial: true } };
      }
      answer = filled.map((f) => `${f.label}${/[?:]$/.test(f.label) ? '' : ':'} ${f.answer}`).join('; ') + (note ? `. Note: ${note}` : '');
    } else if (note) {
      answer = note; via = 'other';
    } else return { status: 400, body: { error: 'Pick an option or write an answer.' } };
    d.status = 'answered'; d.answer = answer; d.answered_by = 'Tom'; d.answered_at = now; d.answered_via = via;
    summary = `Tom decided ${d.id}: ${answer}`;
  } else return { status: 400, body: { error: 'Unknown action.' } };
  await saveRoadmap(best.f, text, data);
  await appendDecisionLog({ ts: now, id: d.id, question: d.question, action, by: 'Tom', option: Number.isInteger(body.option) ? body.option : undefined, answer: d.answer, before });
  await logActivity(summary);
  return { status: 200, body: { ok: true, decision: d } };
}
async function saveRoadmap(file, oldText, data) {
  const indent = /^\{\n(\s+)"/.exec(oldText);
  const out = JSON.stringify(data, null, indent ? (indent[1] === '\t' ? '\t' : indent[1].length) : 2) + (oldText.endsWith('\n') ? '\n' : '');
  // Someone else may have written the file since we read it: merge our decisions into theirs.
  const now = await safe(readFile(file, 'utf8'), oldText);
  if (now !== oldText) {
    let theirs; try { theirs = JSON.parse(now); } catch { theirs = null; }
    if (theirs) { theirs.decisions = data.decisions; return writeAtomic(file, JSON.stringify(theirs, null, indent ? indent[1].length : 2) + (now.endsWith('\n') ? '\n' : '')); }
  }
  return writeAtomic(file, out);
}
async function logActivity(text, kind = 'decision', who = 'Tom') {
  await appendFile(join(STATE, 'activity.jsonl'), JSON.stringify({ ts: new Date().toISOString(), who, worktree: basename(WT), kind, text: text.slice(0, 400) }) + '\n');
  cache.delete('activity');
}

// ---------- worktrees ----------
async function worktreeList() {
  const out = await git(MAIN, ['worktree', 'list', '--porcelain']);
  const list = [];
  for (const block of out.trim().split(/\n\n+/)) {
    const w = {};
    for (const line of block.split('\n')) {
      const [k, ...rest] = line.split(' ');
      const v = rest.join(' ');
      if (k === 'worktree') w.path = v;
      else if (k === 'HEAD') w.head = v;
      else if (k === 'branch') w.branch = v.replace(/^refs\/heads\//, '');
      else if (k === 'detached') w.detached = true;
      else if (k === 'prunable') w.prunable = true;
      else if (k === 'locked') w.locked = true;
    }
    if (w.path) list.push(w);
  }
  return list;
}

async function worktreeDetail(w, baseSha) {
  const name = basename(w.path);
  if (w.prunable || !existsSync(w.path)) return { ...w, name, missing: true, modified: 0, untracked: 0, dirtySrc: [], recent: [] };
  const [logLine, counts, status] = await Promise.all([
    safe(git(w.path, ['log', '-1', '--format=%h%x09%cI%x09%s']), ''),
    baseSha ? safe(git(w.path, ['rev-list', '--left-right', '--count', `${baseSha}...HEAD`]), '') : '',
    safe(git(w.path, ['status', '--porcelain'], 15000), null),
  ]);
  const [sha, date, ...subj] = logLine.trim().split('\t');
  const [behind, ahead] = counts.trim().split(/\s+/).map(Number);
  const files = (status || '').split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2), path: l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop() }));
  let modified = 0, untracked = 0, lastChange = 0;
  const changed = [];
  for (const f of files.slice(0, 400)) {
    if (f.code === '??') untracked++; else modified++;
    const st = await safe(stat(join(w.path, f.path)), null);
    const m = st ? st.mtimeMs : 0;
    if (m > lastChange) lastChange = m;
    changed.push({ path: f.path, code: f.code.trim() || f.code, mtime: m });
  }
  changed.sort((a, b) => b.mtime - a.mtime);
  return {
    path: w.path, name, branch: w.branch || null, detached: !!w.detached,
    sha: sha || (w.head || '').slice(0, 7), subject: subj.join('\t'), date: date || null,
    ahead: Number.isFinite(ahead) ? ahead : null, behind: Number.isFinite(behind) ? behind : null,
    isBase: !!(baseSha && w.head && w.head.startsWith(baseSha)),
    statusError: status === null,
    modified, untracked,
    lastChange: lastChange ? new Date(lastChange).toISOString() : null,
    agentsActive: lastChange > Date.now() - 10 * 60 * 1000,
    dirtySrc: changed.filter((c) => c.path.startsWith('src/')).map((c) => c.path).slice(0, 40),
    recent: changed.slice(0, 12).map((c) => ({ path: c.path, code: c.code, mtime: c.mtime ? new Date(c.mtime).toISOString() : null })),
  };
}

async function baseInfo() {
  const out = await safe(git(MAIN, ['log', '-1', '--format=%H%x09%h%x09%cI%x09%s', BASE_REF]), '');
  const [full, sha, date, ...s] = out.trim().split('\t');
  return full ? { ref: BASE_REF.replace('refs/remotes/', ''), full, sha, date, subject: s.join('\t') } : null;
}

const worktrees = () => cached('worktrees', TTL, async () => {
  const [list, base] = await Promise.all([worktreeList(), baseInfo()]);
  const items = await Promise.all(list.map((w) => worktreeDetail(w, base && base.full)));
  return { base, main: MAIN, worktrees: items, at: new Date().toISOString() };
});

// ---------- tests ----------
// One run at a time across every cockpit instance: state/test-run.json is the lock
// and carries live progress, so any instance can show a run another one started.
let testRun = null;   // { worktree, branch, startedAt, lines: [] }
let testChild = null;
const TESTS_FILE = join(STATE, 'tests.json');
const LOCK = join(STATE, 'test-run.json');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const doneCount = (lines) => lines.filter((l) => /^(ok|FAIL)\s/.test(l)).length;
async function foreignRun() {
  const r = await safe(readFile(LOCK, 'utf8').then(JSON.parse), null);
  if (!r || r.pid === process.pid) return null;
  if (!alive(r.pid)) { await safe(unlink(LOCK), null); return null; }
  return r;
}
async function testsState() {
  const saved = await safe(readJsonLive(TESTS_FILE).then((r) => r.value), null);
  let running = testRun && { worktree: testRun.worktree, branch: testRun.branch, startedAt: testRun.startedAt, done: doneCount(testRun.lines), total: testRun.total, tail: testRun.lines.slice(-6), port: PORT };
  if (!running) { const f = await foreignRun(); if (f) running = { worktree: f.worktree, branch: f.branch, startedAt: f.startedAt, done: f.done || 0, total: f.total, tail: f.tail || [], port: f.port, elsewhere: true }; }
  return { latest: saved && saved.latest || null, history: saved && saved.history || [], running: running || null };
}
async function writeLock() {
  if (!testRun) return;
  await safe(writeAtomic(LOCK, JSON.stringify({ pid: process.pid, port: PORT, worktree: testRun.worktree, branch: testRun.branch, startedAt: testRun.startedAt, total: testRun.total, done: doneCount(testRun.lines), tail: testRun.lines.slice(-6) })), null);
}
async function startTests(worktreePath) {
  if (testRun) return { status: 409, body: { error: 'A test run is already going. Wait for it to finish.' } };
  const other = await foreignRun();
  if (other) return { status: 409, body: { error: `A test run is already going (started from the cockpit on port ${other.port}). Wait for it to finish.` } };
  const list = await worktreeList();
  const w = list.find((x) => x.path === worktreePath && !x.prunable && existsSync(x.path));
  if (!w) return { status: 400, body: { error: 'Pick a worktree from the list.' } };
  if (!existsSync(join(w.path, 'package.json'))) return { status: 400, body: { error: 'That worktree has no package.json.' } };
  const total = await safe(readdir(join(w.path, 'tools')).then((fs) => fs.filter((f) => /^smoke.*\.mjs$/.test(f)).length), null);
  const sha = (await safe(git(w.path, ['rev-parse', '--short', 'HEAD']), '')).trim();
  testRun = { worktree: w.path, branch: w.branch || null, sha, startedAt: new Date().toISOString(), lines: [], total };
  await writeLock();
  const lockTimer = setInterval(writeLock, 2000);
  const t0 = Date.now();
  const child = spawn('npm', ['test'], { cwd: w.path, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  testChild = child;
  let buf = '';
  const onData = (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); testRun.lines.push(...parts); if (testRun.lines.length > 2000) testRun.lines.splice(0, 500); };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  const killer = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
  const finish = async (code, signal) => {
    clearTimeout(killer); clearInterval(lockTimer); testChild = null;
    if (!testRun) return;
    if (buf) testRun.lines.push(buf);
    const suites = testRun.lines.map((l) => /^(ok|FAIL)\s+(\S+)\s*(.*)$/.exec(l)).filter(Boolean).map((m) => ({ name: m[2], ok: m[1] === 'ok', last: m[3].trim() }));
    const failing = suites.filter((s) => !s.ok).map((s) => s.name);
    const result = {
      worktree: testRun.worktree, name: basename(testRun.worktree), branch: testRun.branch, sha: testRun.sha,
      startedAt: testRun.startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      exitCode: code, signal: signal || null, total: suites.length, passed: suites.length - failing.length, failed: failing.length, failing, suites,
      ok: code === 0 && failing.length === 0 && suites.length > 0,
      tail: suites.length ? undefined : testRun.lines.slice(-8),
    };
    try {
      const prev = await safe(readJsonLive(TESTS_FILE).then((r) => r.value), {});
      const history = [result, ...(prev.history || [])].map(({ suites: _s, tail: _t, ...r }) => r).slice(0, 12);
      await writeAtomic(TESTS_FILE, JSON.stringify({ latest: result, history }, null, 1));
      await logActivity(`npm test: ${result.passed}/${result.total} suites passed${failing.length ? ', failing ' + failing.slice(0, 4).join(', ') : ''}${!suites.length ? ` (exit ${code}${signal ? ', ' + signal : ''})` : ''}`, result.ok ? 'finish' : 'blocked', 'cockpit');
    } finally {
      testRun = null;
      await safe(unlink(LOCK), null);
    }
  };
  child.on('error', (e) => { testRun && testRun.lines.push(`could not start npm: ${e.message}`); finish(-1, null); });
  child.on('close', finish);
  return { status: 202, body: { started: true, worktree: w.path } };
}
function cleanupAndExit() {
  if (testChild) try { testChild.kill('SIGTERM'); } catch {}
  if (testRun) try { unlinkSync(LOCK); } catch {}
  process.exit(0);
}
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// ---------- look ----------
const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
async function walk(dir, out = [], depth = 0) {
  if (depth > 5) return out;
  for (const e of await safe(readdir(dir, { withFileTypes: true }), [])) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out, depth + 1);
    else if (IMG.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}
async function walkAll(dir, out = [], depth = 0) {
  if (depth > 4) return out;
  for (const e of await safe(readdir(dir, { withFileTypes: true }), [])) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walkAll(p, out, depth + 1); else if (e.isFile()) out.push(p);
  }
  return out;
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['rue', 'the', 'des', 'les', 'avenue', 'chemin', 'house', 'aylmer', 'de', 'du', 'la', 'le']);
function scoreTable(md) {
  const rows = [];
  const m = /##\s*Scores[\s\S]*?\n(\|[\s\S]*?)(\n\n|\n#)/.exec(md);
  if (!m) return rows;
  for (const line of m[1].split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3 || /^-+$/.test(cells[0]) || cells[0] === 'Place') continue;
    rows.push({ place: cells[0], score: cells[1], verdict: cells[2] });
  }
  return rows;
}
function matchPlace(rowName, places) {
  const toks = norm(rowName).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
  let best = null, bestScore = 0;
  for (const p of places) {
    const hay = ' ' + norm(p.slug + ' ' + p.name) + ' ';
    const s = toks.filter((t) => hay.includes(' ' + t + ' ') || hay.includes(' ' + t)).length / Math.max(1, toks.length);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore >= 0.5 ? best : null;
}
function section(md, title) {
  const m = new RegExp(`##\\s*${title}\\s*\\n+([\\s\\S]*?)(\\n##\\s|$)`, 'i').exec(md);
  return m ? m[1].trim() : '';
}
const toUrl = (abs) => '/files/places/' + relative(PLACES, abs).split(sep).map(encodeURIComponent).join('/');
function relToUrl(rel) {
  if (!rel || !rel.startsWith('references/places/')) return null;
  const abs = resolve(MAIN, rel);
  return abs.startsWith(PLACES + sep) && existsSync(abs) ? toUrl(abs) : null;
}

const look = () => cached('look', TTL, async () => {
  const idx = await safe(readJsonLive(join(FEEDBACK, 'compare-index.json')), null);
  const index = idx && idx.value;
  const plan = await safe(readFile(join(FEEDBACK, 'analysis', '00-PLAN.md'), 'utf8'), '');
  const latestMd = await safe(readFile(join(FEEDBACK, 'LATEST.md'), 'utf8'), null);
  const latestSt = latestMd ? await safe(stat(join(FEEDBACK, 'LATEST.md')), null) : null;
  const places = (index && Array.isArray(index.places) ? index.places : []).map((p) => ({ slug: p.slug, name: p.name, notes: p.notes, poseQuality: p.pose_quality, pairs: Array.isArray(p.pairs) ? p.pairs : [] }));
  const rows = scoreTable(plan);
  const scores = new Map();
  for (const r of rows) {
    for (const part of r.place.split(',')) {
      const p = matchPlace(part, places);
      if (p && !scores.has(p.slug)) scores.set(p.slug, r);
    }
  }
  const out = [];
  for (const p of places) {
    const md = await safe(readFile(join(FEEDBACK, 'analysis', `${p.slug}.md`), 'utf8'), '');
    const verdict = section(md, 'Verdict').split('\n\n')[0];
    const sentences = md.split('\n').filter((l) => !l.startsWith('#')).join(' ').replace(/\*\*|`/g, '').split(/(?<=[.;])\s+|\s\|\s/);
    const tomLines = [];
    for (const raw of sentences) {
      const t = raw.replace(/^[-*|\s]+/, '').trim();
      if (t.length < 16 || t.length > 320) continue;
      if (/\b(ask Tom|needs? Tom|needs his word|settle with Tom|confirmed with Tom|once Tom|Tom first)\b/i.test(t)) tomLines.push({ kind: 'ask', text: t });
      else if (/\bTom('s)? (ruling|ruled|confirmed|correction|notes? say|said|says|wants)\b|as Tom confirmed|Tom confirmed/i.test(t)) tomLines.push({ kind: 'ruling', text: t });
    }
    tomLines.sort((a, b) => (a.kind === 'ruling' ? 0 : 1) - (b.kind === 'ruling' ? 0 : 1));
    const r = scores.get(p.slug);
    const num = r ? parseFloat(r.score) : NaN;
    const pairs = p.pairs.map((x) => ({ shows: x.shows, ref: relToUrl(x.reference), game: relToUrl(x.game_shot), quality: x.pose_quality, captured: x.captured })).filter((x) => x.ref || x.game).slice(0, 12);
    out.push({ slug: p.slug, name: p.name, score: r ? r.score : null, scoreNum: Number.isFinite(num) ? num : null, verdictLine: r ? r.verdict : null, verdict, tom: tomLines.slice(0, 3), notes: p.notes, poseQuality: p.poseQuality, pairCount: p.pairs.length, pairs });
  }
  out.sort((a, b) => (b.scoreNum ?? -1) - (a.scoreNum ?? -1));

  // before/after: X__before.png + X__after.png, or before*/X + after*/X.
  // Shots in an after*/ folder with no before are kept as "after only".
  const pairsBA = [];
  const counts = {};
  for (const setName of (await safe(readdir(FEEDBACK), [])).filter((n) => n.startsWith('lookfix'))) {
    const root = join(FEEDBACK, setName);
    const files = await walk(root);
    counts[setName] = files.length;
    const set = new Set(files);
    const used = new Set();
    for (const f of files) {
      const rel = relative(root, f).split(sep);
      const file = rel[rel.length - 1];
      let after = null, label = null;
      const group = rel.length > 1 ? rel[0] : '(top)';
      const m = /^(.*)__before(\.[a-z]+)$/i.exec(file);
      if (m) {
        const cand = join(dirname(f), `${m[1]}__after${m[2]}`);
        if (set.has(cand)) { after = cand; label = m[1]; }
      } else {
        const di = rel.findIndex((s) => /^before(-|$)/.test(s));
        if (di >= 0) {
          const suffix = rel[di].slice('before'.length);
          const a = [...rel]; a[di] = 'after' + suffix;
          const cand = join(root, ...a);
          if (set.has(cand)) { after = cand; label = file.replace(/__game_\d{8}-\d{6}/, '').replace(extname(file), '') + (suffix ? ` (${suffix.slice(1)})` : ''); }
        }
      }
      if (after && !used.has(f)) {
        used.add(f); used.add(after);
        const st = await safe(stat(after), null);
        pairsBA.push({ set: setName, group, label, before: toUrl(f), after: toUrl(after), mtime: st ? st.mtime.toISOString() : null });
      }
    }
    for (const f of files) {
      if (used.has(f)) continue;
      const rel = relative(root, f).split(sep);
      if (!rel.slice(0, -1).some((s) => /^after(-|$)/.test(s)) && !/__after\.[a-z]+$/i.test(rel[rel.length - 1])) continue;
      const st = await safe(stat(f), null);
      pairsBA.push({ set: setName, group: rel.length > 1 ? rel[0] : '(top)', label: rel[rel.length - 1].replace(/__after/, '').replace(extname(f), ''), before: null, after: toUrl(f), single: true, mtime: st ? st.mtime.toISOString() : null });
    }
  }
  pairsBA.sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''));
  return {
    available: !!index, stale: !!(idx && idx.stale), built: index && index.built, commit: index && index.commit && String(index.commit).slice(0, 7),
    places: out, planRows: rows, latest: latestMd ? { text: latestMd.slice(0, 6000), mtime: latestSt && latestSt.mtime.toISOString() } : null,
    beforeAfter: pairsBA, sets: counts,
    galleryUrl: '/gallery',
    staticGalleryUrl: existsSync(join(FEEDBACK, 'lookfix', 'index.html')) ? '/repo/references/places/_feedback/lookfix/index.html' : null,
    compareUrl: compareRoot() ? '/repo/tools/aylmer-compare/index.html' : null,
  };
});

// ---------- servers ----------
async function probe(port) {
  try {
    const r = await fetch(`http://localhost:${port}/`, { method: 'HEAD', signal: AbortSignal.timeout(900), redirect: 'manual' });
    return { ok: true, status: r.status };
  } catch (e) { return { ok: false, error: e.name === 'TimeoutError' ? 'no answer in 0.9 s' : 'connection closed without a reply' }; }
}
const servers = () => cached('servers', 5000, async () => {
  const out = await safe(run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 5000 }).then((r) => r.stdout), '');
  const byPort = new Map();
  for (const line of out.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const m = /:(\d+)$/.exec(cols[8]);
    if (!m) continue;
    const port = Number(m[1]);
    if (port < 8123 || port > 8199) continue;
    const addr = cols[8].replace(/:\d+$/, '');
    if (!byPort.has(port)) byPort.set(port, { port, procs: new Map(), addrs: [] });
    const s = byPort.get(port);
    s.addrs.push(addr);
    const pid = Number(cols[1]);
    if (!s.procs.has(pid)) s.procs.set(pid, { pid, proc: cols[0].replace(/\\x20/g, ' '), addrs: [] });
    s.procs.get(pid).addrs.push(addr);
  }
  const wts = (await safe(worktrees(), { worktrees: [] })).worktrees;
  const res = await Promise.all([...byPort.values()].sort((a, b) => a.port - b.port).map(async (s) => {
    const procs = await Promise.all([...s.procs.values()].map(async (p) => {
      const cwdOut = await safe(run('lsof', ['-a', '-p', String(p.pid), '-d', 'cwd', '-Fn'], { timeout: 3000 }).then((r) => r.stdout), '');
      const cwd = (cwdOut.split('\n').find((l) => l.startsWith('n')) || '').slice(1) || null;
      const cmd = (await safe(run('ps', ['-o', 'command=', '-p', String(p.pid)], { timeout: 3000 }).then((r) => r.stdout), '')).trim();
      return { ...p, cwd, cmd: cmd.slice(0, 160) };
    }));
    const lead = procs.find((p) => p.addrs.some((a) => a === '127.0.0.1' || a === '[::1]')) || procs[0];
    const cwd = lead.cwd;
    const wt = cwd && wts.find((w) => cwd === w.path || cwd.startsWith(w.path + sep));
    const isCockpit = s.port === PORT || procs.some((p) => /tools\/cockpit\/server\.mjs/.test(p.cmd));
    const isGame = !isCockpit && cwd && existsSync(join(cwd, 'index.html')) && existsSync(join(cwd, 'src'));
    const hasCompare = !isCockpit && cwd && existsSync(join(cwd, 'tools', 'aylmer-compare', 'index.html')) && existsSync(join(cwd, 'references', 'places', '_feedback', 'compare-index.json'));
    const hasFeedback = !isCockpit && cwd && existsSync(join(cwd, 'references', 'places', '_feedback', 'lookfix', 'index.html'));
    const pr = s.port === PORT ? { ok: true } : await probe(s.port);
    return {
      port: s.port, pid: lead.pid, proc: lead.proc, cmd: lead.cmd, cwd, worktree: wt ? wt.name : null, branch: wt ? wt.branch : null,
      role: isCockpit ? 'cockpit' : s.port === PLAY_PORT ? 'play' : isGame ? 'game' : 'other',
      self: s.port === PORT,
      exposed: s.addrs.some((a) => a === '*' || a === '0.0.0.0' || a === '[::]'),
      processes: procs.map((p) => ({ pid: p.pid, proc: p.proc, addrs: [...new Set(p.addrs)], cwd: p.cwd, cmd: p.cmd })),
      responding: pr.ok, probeError: pr.ok ? null : pr.error,
      links: isCockpit ? (s.port === PORT ? [] : [{ label: 'Cockpit', url: `http://localhost:${s.port}/` }]) : [
        ...(isGame ? [{ label: 'Game', url: `http://localhost:${s.port}/index.html` }] : [{ label: 'Open', url: `http://localhost:${s.port}/` }]),
        ...(hasCompare ? [{ label: 'Compare', url: `http://localhost:${s.port}/tools/aylmer-compare/index.html` }] : []),
        ...(hasFeedback ? [{ label: 'Lookfix', url: `http://localhost:${s.port}/references/places/_feedback/lookfix/index.html` }] : []),
      ],
    };
  }));
  return { servers: res, playPort: PLAY_PORT, at: new Date().toISOString() };
});

// ---------- activity ----------
const activity = () => cached('activity', TTL, async () => {
  const wt = await worktrees();
  const events = [];
  const seen = new Set();
  const baseName = BASE_REF.replace(/^refs\/remotes\//, '');
  const baseShas = new Set((await safe(git(MAIN, ['log', '--since=7.days', '-n', '200', '--format=%H', BASE_REF]), '')).split('\n').filter(Boolean));
  await Promise.all(wt.worktrees.filter((w) => !w.missing).map(async (w) => {
    const out = await safe(git(w.path, ['log', '--since=7.days', '-n', '60', '--format=%H%x09%h%x09%cI%x09%an%x09%s', 'HEAD']), '');
    for (const line of out.split('\n').filter(Boolean)) {
      const [full, sha, ts, who, ...s] = line.split('\t');
      const onBase = baseShas.has(full);
      events.push({ full, ts, who, worktree: onBase ? 'base' : w.name, branch: onBase ? baseName : w.branch, text: s.join('\t'), sha, kind: 'commit' });
    }
  }));
  const commits = [];
  for (const e of events.sort((a, b) => (a.worktree === 'aylmer-madness') - (b.worktree === 'aylmer-madness'))) {
    if (seen.has(e.full)) continue; seen.add(e.full); delete e.full; commits.push(e);
  }
  const files = [];
  for (const w of wt.worktrees) {
    if (!w.recent || !w.recent.length || !w.lastChange) continue;
    if (Date.parse(w.lastChange) < Date.now() - 48 * 3600 * 1000) continue;
    const fresh = w.recent.filter((r) => r.mtime && Date.parse(r.mtime) > Date.now() - 48 * 3600 * 1000);
    files.push({ ts: w.lastChange, who: null, worktree: w.name, branch: w.branch, kind: 'files', text: `${w.modified + w.untracked} uncommitted file${w.modified + w.untracked === 1 ? '' : 's'}; latest ${fresh.slice(0, 3).map((r) => r.path).join(', ')}` });
  }
  const logRaw = await safe(readFile(join(STATE, 'activity.jsonl'), 'utf8'), '');
  const logged = logRaw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.ts && e.text && Number.isFinite(Date.parse(e.ts))).map((e) => ({ ts: e.ts, who: e.who || null, worktree: e.worktree || null, text: String(e.text).slice(0, 400), kind: ['start', 'finish', 'blocked', 'note', 'decision'].includes(e.kind) ? e.kind : 'note', logged: true }));
  const all = [...commits, ...files, ...logged].filter((e) => Date.parse(e.ts) > Date.now() - 7 * 86400 * 1000).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 200);
  return { events: all, at: new Date().toISOString() };
});

// ---------- http ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
};
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/cockpit.css': 'cockpit.css', '/cockpit.js': 'cockpit.js' };
const HOSTS = [`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`];
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendFile(res, file, root, head, types = TYPES) {
  let actual;
  try { actual = await realpath(file); } catch { res.writeHead(404).end(); return; }
  const realRoot = await safe(realpath(root), root);
  if (!actual.startsWith(realRoot + sep)) { res.writeHead(403).end(); return; }
  const type = types[extname(actual).toLowerCase()];
  if (!type) { res.writeHead(403).end(); return; }
  const st = await safe(stat(actual), null);
  if (!st || !st.isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'cache-control': root === HERE || /html|javascript|json|plain/.test(type) ? 'no-store' : 'max-age=300', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' });
  if (head) res.end(); else createReadStream(actual).on('error', () => res.destroy()).pipe(res);
}

// Thumbnails via macOS sips, cached under state/thumbs. Falls back to the original.
const THUMBS = join(STATE, 'thumbs');
let sipsBusy = 0; const sipsQueue = [];
const sipsSlot = () => new Promise((r) => { if (sipsBusy < 3) { sipsBusy++; r(); } else sipsQueue.push(r); });
const sipsDone = () => { const n = sipsQueue.shift(); if (n) n(); else sipsBusy--; };
const thumbJobs = new Map();
async function thumbFor(file, w) {
  const st = await stat(file);
  const key = createHash('sha1').update(`${file}|${st.mtimeMs}|${w}`).digest('hex').slice(0, 20);
  const out = join(THUMBS, key + '.jpg');
  if (existsSync(out)) return out;
  if (!thumbJobs.has(key)) thumbJobs.set(key, (async () => {
    await mkdir(THUMBS, { recursive: true });
    await sipsSlot();
    const tmp = join(THUMBS, `.${key}.${process.pid}.jpg`);
    try { await run('sips', ['-Z', String(w), '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', file, '--out', tmp], { timeout: 20000 }); await rename(tmp, out); }
    finally { sipsDone(); thumbJobs.delete(key); await safe(unlink(tmp), null); }
    return out;
  })());
  return thumbJobs.get(key);
}

// /repo/... serves the comparison page and the review folders read-only, with the
// same layout as the repo, so the compare page and the old lookfix gallery work
// here even when no other server has the main checkout's references/ folder.
function compareRoot() {
  for (const b of [WT, MAIN]) if (existsSync(join(b, 'tools', 'aylmer-compare', 'index.html'))) return b;
  return null;
}
function repoTarget(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p.startsWith('.') || p === '')) return null;
  if (rel.startsWith('tools/aylmer-compare/')) { const b = compareRoot(); return b && { root: join(b, 'tools', 'aylmer-compare'), file: resolve(b, rel) }; }
  if (rel.startsWith('src/') || rel.startsWith('assets/')) { const b = compareRoot() || WT; return { root: join(b, parts[0]), file: resolve(b, rel), noHtml: true }; }
  if (rel.startsWith('references/places/')) return { root: PLACES, file: resolve(MAIN, rel), htmlOnlyIn: FEEDBACK };
  return null;
}

// /doc/<worktree or "main">/<path>.md renders a doc as a readable page.
function mdToHtml(md) {
  const inline = (s) => escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|[^):\s]+)\)/g, '<a href="$2">$1</a>');
  const out = []; let list = null, table = null, para = [], code = null;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; } if (table) { out.push(`<div class="tw"><table>${table.map((r, i) => `<tr>${r.map((c) => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table></div>`); table = null; } };
  for (const line of md.split('\n')) {
    if (code !== null) { if (/^```/.test(line)) { out.push(`<pre>${escHtml(code.join('\n'))}</pre>`); code = null; } else code.push(line); continue; }
    if (/^```/.test(line)) { flush(); code = []; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*\|/.test(line)) { if (!table) { flush(); table = []; } const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); if (!cells.every((c) => /^:?-+:?$/.test(c))) table.push(cells); continue; }
    const li = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line);
    if (li) { if (para.length || table) flush(); const t = li[1] ? 'ol' : 'ul'; if (!list || list.t !== t) { flush(); list = { t, items: [] }; } list.items.push(li[2]); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^---+$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
    if (list && /^\s+/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    if (table) flush();
    para.push(line.trim());
  }
  if (code !== null) out.push(`<pre>${escHtml(code.join('\n'))}</pre>`);
  flush();
  return out.join('\n');
}
const PAGE_CSS = `:root{--bg:#f2eee5;--ink:#1b1d20;--ink2:#47443e;--line:#dcd4c4;--acc:#94560a;--card:#faf7f1;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111315;--ink:#ede6d8;--ink2:#bcb5a7;--line:#2a2f34;--acc:#f4b453;--card:#171a1d;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#111315;--ink:#ede6d8;--ink2:#bcb5a7;--line:#2a2f34;--acc:#f4b453;--card:#171a1d;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Barlow,system-ui,-apple-system,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:24px 16px 64px}a{color:var(--acc)}code,pre{font:13px/1.5 'JetBrains Mono',ui-monospace,Menlo,monospace}
pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);padding:12px;border-radius:6px}h1,h2,h3,h4{font-family:'Barlow Condensed','Arial Narrow',sans-serif;line-height:1.15}
.tw{overflow-x:auto}table{border-collapse:collapse;font-size:14px;margin:12px 0}td,th{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
.crumb{font:12px/1.4 'JetBrains Mono',ui-monospace,monospace;color:var(--ink2);margin-bottom:16px;word-break:break-all}img{max-width:100%}`;
const pageShell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Crect width=%2216%22 height=%2216%22 rx=%223%22 fill=%22%23f2a93b%22/%3E%3C/svg%3E"><script>try{const t=localStorage.getItem('cockpit-theme');if(t)document.documentElement.dataset.theme=t;}catch{}</script><style>${PAGE_CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;
async function sendDoc(res, rel) {
  const [root, ...rest] = rel.split('/');
  const path = rest.join('/');
  if (!path || rest.some((p) => p === '..' || p.startsWith('.') || p === '') || !DOC_EXT.has(extname(path).toLowerCase())) { res.writeHead(403).end(); return; }
  let base = null;
  if (root === 'main') base = MAIN;
  else { const w = (await safe(worktreeList(), [])).find((x) => basename(x.path) === root && existsSync(x.path)); base = w ? w.path : null; }
  if (!base) { res.writeHead(404).end(); return; }
  if (!(path.startsWith('docs/') || path.startsWith('references/places/_feedback/') || path === 'PROJECT.md' || path === 'README.md')) { res.writeHead(403).end(); return; }
  const file = resolve(base, path);
  const real = await safe(realpath(file), null);
  const realBase = await safe(realpath(base), base);
  if (!real || !real.startsWith(realBase + sep)) { res.writeHead(404).end(); return; }
  const text = await safe(readFile(real, 'utf8'), null);
  if (text == null) { res.writeHead(404).end(); return; }
  const body = extname(path) === '.md' ? mdToHtml(text) : `<pre>${escHtml(text)}</pre>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'" });
  res.end(pageShell(basename(path), `<div class="crumb"><a href="/">Cockpit</a> / ${escHtml(root)} / ${escHtml(path)}</div>${body}`));
}

// /gallery: every before/after pair from the lookfix folders, side by side.
async function sendGallery(res, url) {
  const L = await look();
  const want = url.searchParams.get('set');
  const sets = [...new Set(L.beforeAfter.map((b) => b.set))].sort().reverse();
  const shown = L.beforeAfter.filter((b) => !want || b.set === want);
  const groups = new Map();
  for (const b of shown) { const k = `${b.set} / ${b.group}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
  const th = (u) => u.replace(/^\/files\/places\//, '/thumb/places/') + '?w=960';
  const css = `.g{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 4px}.g.one{grid-template-columns:1fr}.g a{display:block;position:relative;background:var(--card);border-radius:6px;overflow:hidden;aspect-ratio:16/10}
.g img{width:100%;height:100%;object-fit:contain;display:block}.g span{position:absolute;left:6px;top:6px;font:600 11px/1 Barlow,sans-serif;letter-spacing:.08em;text-transform:uppercase;background:rgba(12,13,14,.72);color:#f4efe4;padding:4px 6px;border-radius:3px}
.lb{font:13px/1.4 'JetBrains Mono',monospace;color:var(--ink2);margin:0 0 22px;word-break:break-all}nav a{margin-right:12px}.wrap{max-width:1400px}`;
  const body = `<style>${css}</style><div class="crumb"><a href="/">Cockpit</a> / gallery</div><h1>Look fixes: before and after</h1>
<p>Left is before, right is after. Newest first. Click an image for the full size file.${L.compareUrl ? ` Score and comment in the <a href="${L.compareUrl}">comparison page</a>.` : ''}${L.staticGalleryUrl ? ` The first round also has its <a href="${L.staticGalleryUrl}">own gallery</a>.` : ''}</p>
<nav><a href="/gallery"${!want ? ' aria-current="page"' : ''}>All (${L.beforeAfter.length})</a>${sets.map((s) => `<a href="/gallery?set=${encodeURIComponent(s)}">${escHtml(s)} (${L.beforeAfter.filter((b) => b.set === s).length})</a>`).join('')}</nav>
${shown.length ? '' : '<p>No before and after shots found under references/places/_feedback/lookfix*/.</p>'}
${[...groups].map(([k, bs]) => `<h2>${escHtml(k)}</h2>${bs.map((b) => `<div class="g${b.before ? '' : ' one'}">${b.before ? `<a href="${b.before}" target="_blank" rel="noopener"><img loading="lazy" src="${th(b.before)}" alt="Before: ${escHtml(b.label)}"><span>Before</span></a>` : ''}<a href="${b.after}" target="_blank" rel="noopener"><img loading="lazy" src="${th(b.after)}" alt="After: ${escHtml(b.label)}"><span>${b.before ? 'After' : 'After only'}</span></a></div><p class="lb">${escHtml(b.label)}${b.mtime ? ` · ${escHtml(new Date(b.mtime).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', hour12: false }))}` : ''}</p>`).join('')}`).join('')}`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(pageShell('Lookfix gallery', body));
}

// ---------- visual wave: docs/visual-wave/tasks.json (written by the wave planner) ----------
async function wave() {
  let best = null;
  for (const f of [join(WT, 'docs', 'visual-wave', 'tasks.json'), join(MAIN, 'docs', 'visual-wave', 'tasks.json')]) {
    const st = await safe(stat(f), null);
    if (st && (!best || st.mtimeMs > best.st.mtimeMs)) best = { f, st };
  }
  if (!best) return { available: false };
  const r = await safe(readJsonLive(best.f), null);
  if (!r || !r.value || !Array.isArray(r.value.tasks)) return { available: false, error: 'tasks.json could not be read' };
  const v = r.value;
  const tasks = v.tasks.map((t) => ({ id: t.id, wave: t.wave, title: t.title, status: t.status || 'todo', effort: t.effort, branch: t.branch || null, depends: t.depends || [], tomInput: t.tomInput || null }));
  const waves = (Array.isArray(v.waves) ? v.waves : []).map((w) => ({ wave: w.wave, theme: w.theme, tasks: (w.tasks || []).filter((id) => tasks.some((t) => t.id === id)) }));
  return { available: true, stale: !!r.stale, source: relative(dirname(MAIN), best.f), mtime: best.st.mtime.toISOString(), plan: v.plan || null, written: v.written || null, base: v.base || null, estimatedAgentDays: v.estimatedAgentDays ?? null, waves, tasks };
}

const API = { '/api/wave': wave, '/api/roadmap': roadmap, '/api/worktrees': worktrees, '/api/tests': testsState, '/api/look': look, '/api/servers': servers, '/api/activity': activity };

async function readBody(req, limit) {
  let body = '';
  for await (const c of req) { body += c; if (body.length > limit) return null; }
  return body;
}
const postOk = (req) => req.headers['x-cockpit'] === '1' && (req.headers['content-type'] || '').startsWith('application/json');

const server = createServer(async (req, res) => {
  if (!HOSTS.includes(req.headers.host)) { res.writeHead(403).end(); return; }
  if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { res.writeHead(403).end(); return; }
  let path, url;
  try { url = new URL(req.url, 'http://localhost'); path = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  try {
    if (req.method === 'POST' && (path === '/api/run/tests' || path === '/api/decide')) {
      if (!postOk(req)) { res.writeHead(403).end(); return; }
      const body = await readBody(req, path === '/api/decide' ? 16384 : 4096);
      if (body == null) { res.writeHead(413).end(); return; }
      let j; try { j = JSON.parse(body); } catch { return json(res, 400, { error: 'Bad JSON' }); }
      if (!j || typeof j !== 'object') return json(res, 400, { error: 'Bad JSON' });
      if (path === '/api/run/tests') {
        const r = await startTests(String(j.worktree || ''));
        cache.delete('activity');
        return json(res, r.status, r.body);
      }
      const p = decideChain.then(() => decide({ id: String(j.id || ''), action: String(j.action || ''), option: j.option, text: j.text, fields: j.fields }));
      decideChain = p.catch(() => {});
      const r = await p;
      return json(res, r.status, r.body);
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    if (API[path]) return json(res, 200, await API[path]());
    if (path === '/api/all') {
      const keys = Object.keys(API);
      const t0 = Date.now();
      const vals = await Promise.all(keys.map((k) => API[k]().catch((e) => ({ error: e.message }))));
      return json(res, 200, { ...Object.fromEntries(keys.map((k, i) => [k.slice(5), vals[i]])), meta: { port: PORT, ms: Date.now() - t0, at: new Date().toISOString() } });
    }
    if (STATIC[path]) return sendFile(res, join(HERE, STATIC[path]), HERE, req.method === 'HEAD');
    if (path === '/gallery') return sendGallery(res, url);
    if (path.startsWith('/doc/')) return sendDoc(res, path.slice(5));
    if (path.startsWith('/repo/')) {
      const t = repoTarget(path.slice(6).replace(/\/$/, '/index.html'));
      if (!t) { res.writeHead(403).end(); return; }
      const ext = extname(t.file).toLowerCase();
      if (ext === '.html' && (t.noHtml || (t.htmlOnlyIn && !t.file.startsWith(t.htmlOnlyIn + sep)))) { res.writeHead(403).end(); return; }
      return sendFile(res, t.file, t.root, req.method === 'HEAD');
    }
    if (path.startsWith('/wtimg/')) {
      // Images under docs/ in any worktree (spike screenshots and the like).
      const [name, ...rest] = path.slice(7).split('/');
      if (rest[0] !== 'docs' || rest.some((p) => p === '..' || p.startsWith('.') || p === '') || !IMG.has(extname(path).toLowerCase())) { res.writeHead(403).end(); return; }
      const w = (await safe(worktreeList(), [])).find((x) => basename(x.path) === name && existsSync(x.path));
      if (!w) { res.writeHead(404).end(); return; }
      return sendFile(res, resolve(w.path, rest.join('/')), join(w.path, 'docs'), req.method === 'HEAD');
    }
    if (path.startsWith('/thumb/places/')) {
      const rel = path.slice('/thumb/places/'.length);
      if (rel.split('/').some((p) => p === '..' || p.startsWith('.') || p === '')) { res.writeHead(403).end(); return; }
      const file = resolve(PLACES, rel);
      if (!file.startsWith(PLACES + sep) || !IMG.has(extname(file).toLowerCase())) { res.writeHead(403).end(); return; }
      const realFile = await safe(realpath(file), null);
      const realRoot = await safe(realpath(PLACES), PLACES);
      if (!realFile || !realFile.startsWith(realRoot + sep)) { res.writeHead(404).end(); return; }
      const wq = Number(url.searchParams.get('w'));
      const w = [160, 480, 960].includes(wq) ? wq : 480;
      const t = await safe(thumbFor(realFile, w), null);
      return t ? sendFile(res, t, THUMBS, req.method === 'HEAD') : sendFile(res, realFile, PLACES, req.method === 'HEAD');
    }
    if (path.startsWith('/files/places/')) {
      const rel = path.slice('/files/places/'.length);
      if (rel.split('/').some((p) => p === '..' || p.startsWith('.') || p === '')) { res.writeHead(403).end(); return; }
      const file = resolve(PLACES, rel);
      if (!file.startsWith(PLACES + sep) || !IMG.has(extname(file).toLowerCase())) { res.writeHead(403).end(); return; }
      return sendFile(res, file, PLACES, req.method === 'HEAD');
    }
    res.writeHead(404).end();
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message }); else res.destroy();
  }
});
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use.` : e.message); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => console.log(`Aylmer cockpit -> http://localhost:${PORT}  (worktree ${WT}, main ${MAIN})`));
