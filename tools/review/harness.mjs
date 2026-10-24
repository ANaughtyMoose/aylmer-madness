#!/usr/bin/env node
// Aylmer Madness review harness: plays the real game headless and writes an
// evidence pack for the review panel (docs/review-panel/METHOD.md).
//
//   node tools/review/harness.mjs [--plan quick|full|path.json] [--port 8183] [--cdp-port 9480]
//        [--entry index.html|prototype.html] [--only alternateur,tour] [--warp 1]
//        [--columns both|played|fresh] [--out <dir>] [--headed] [--size 1280x800]
//
// Two result columns per job (A-12): as played (damage and money carry from the
// beat before, as a summer would) and fresh car (the same job again at damage 0,
// the game's own fail rate). Each failed job gets a cause (tools/review/verdict.mjs).
//
// What it starts, and closes on exit (also on Ctrl-C):
//   * node tools/serve.mjs on 127.0.0.1:<port> (8180-8299; 8141, 8162, 8170 are never used), with --audio-dir for the private radio
//   * its own Chrome: --remote-debugging-port=<cdp-port> (9480 default), a throwaway profile in the
//     system temp dir, headless, audio muted. Tom's Chrome and profile are never touched.
// It never edits the game. Storage runs in the ?review=panel namespace, so a
// player's saves are never read or written.
//
// The pack goes to ~/Desktop/Coding Projects/aylmer-madness/references/review/<timestamp>/
// (a folder with its own .gitignore of "*"): screenshots, frame sequences,
// metrics.json, console.log, transcript.txt (every overlay text the player saw),
// outcomes.json (per mission) and SUMMARY.md.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planStorage, prepareStorage } from '../storage_guard.mjs';
import { failCause, tally, needsFreshRun } from './verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const REVIEW_ROOT = path.join(os.homedir(), 'Desktop', 'Coding Projects', 'aylmer-madness', 'references', 'review');
// CMP_CHROME: another Chrome or Chromium binary (a Linux cloud VM: /usr/bin/chromium).
// CMP_CHROME_GL=swiftshader: software GL (ANGLE on SwiftShader) for a machine with no GPU;
// its fps are not honest performance numbers. Default: Metal, as on Tom's Mac.
// CMP_CHROME_NO_SANDBOX=1 adds --no-sandbox (a VM user without user namespaces only).
const CHROME = process.env.CMP_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_GL = process.env.CMP_CHROME_GL === 'swiftshader'
  ? ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'];

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes('--' + name);
// CMP_SRV_PORT / CMP_CDP_PORT are the same overrides tools/qa/boot.mjs reads.
const port = Number(arg('port', process.env.CMP_SRV_PORT || '8183'));
if (!(port >= 8180 && port <= 8299)) { console.error('--port must be 8180-8299 (8141, 8162 and 8170 belong to other tools)'); process.exit(2); }
const CDP_PORT = Number(arg('cdp-port', process.env.CMP_CDP_PORT || '9480'));
if (!(CDP_PORT >= 9400 && CDP_PORT <= 9599)) { console.error('--cdp-port must be 9400-9599'); process.exit(2); }
const planArg = arg('plan', 'quick');
const planPath = fs.existsSync(planArg) ? planArg : path.join(HERE, 'plans', planArg + '.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const entry = arg('entry', plan.entry || 'index.html');
const only = arg('only', '') ? new Set(arg('only').split(',')) : null;
const warp = Math.max(1, Number(arg('warp', '1')));
// --stop-after <min>: start no new beat once the run is that old, and write the pack
// with what was played (a cloud VM has a hard deadline). Skipped beats are listed.
const STOP_AFTER_MS = Number(arg('stop-after', '0')) * 60000 || 0;
const COLUMNS = arg('columns', plan.columns || 'both');
if (!['both', 'played', 'fresh'].includes(COLUMNS)) { console.error('--columns must be both, played or fresh'); process.exit(2); }
const [VW, VH] = arg('size', '1280x800').split('x').map(Number);
// Course beats are selected by course id (`"id": "bz_vieux"` in the plan; playCourse
// starts that course). A course beat with no id gets `course-<mode or index>`.
// An --only that selects no beat is an error, never an empty pack that exits 0.
for (const b of plan.beats) if (b.do === 'course' && !b.id) b.id = 'course-' + (b.mode || b.index || 0);
if (only) {
  const keys = new Set(plan.beats.slice(1).flatMap((b) => [b.id || b.do, b.do]));
  const unknown = [...only].filter((k) => !keys.has(k));
  if (unknown.length === only.size) { console.error(`--only ${[...only].join(',')} matches no beat of plan ${plan.name}; beats: ${[...keys].join(', ')}`); process.exit(2); }
  if (unknown.length) console.error(`warning: --only ${unknown.join(',')} matches no beat of plan ${plan.name}`);
}
// --list: print the beats this run would play (after --only) and exit; nothing starts.
if (flag('list')) {
  for (const [i, b] of plan.beats.entries()) if (!only || i === 0 || only.has(b.id || b.do) || only.has(b.do)) console.log(`${i + 1}\t${b.do}${b.id ? '\t' + b.id : ''}`);
  process.exit(0);
}
const stamp = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; })();   // local time
const OUT = arg('out', path.join(REVIEW_ROOT, `${stamp}-${plan.name || 'plan'}`));
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
if (!fs.existsSync(path.join(REVIEW_ROOT, '.gitignore'))) fs.writeFileSync(path.join(REVIEW_ROOT, '.gitignore'), '# Review evidence packs: local only, never committed.\n*\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const secs = () => +((Date.now() - T0) / 1000).toFixed(1);
const say = (...a) => console.log(`[${secs()}s]`, ...a);

// ---------------------------------------------------------------- processes
const kids = [];
const serverErr = [];   // tools/serve.mjs stderr, printed and written to console.log
function startKid(cmd, args, opts = {}, onErr = null) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], ...opts });
  p.stderr.on('data', onErr || (() => {}));
  kids.push(p);
  return p;
}
let closing = false;
async function closeAll(code = 0) {
  if (closing) return; closing = true;
  // A page stuck in a long task never answers; do not let it keep Chrome open.
  try { await Promise.race([send('Browser.close'), sleep(2000)]); } catch {}
  for (const k of kids) { try { k.kill('SIGTERM'); } catch {} }
  await sleep(400);
  for (const k of kids) { try { if (k.exitCode == null) k.kill('SIGKILL'); } catch {} }
  process.exit(code);
}
process.on('SIGINT', () => closeAll(130));
process.on('SIGTERM', () => closeAll(143));

async function portFree(p) {
  try { await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(500) }); return false; } catch { return true; }
}
if (!(await portFree(port))) { console.error(`port ${port} is in use; pick another in 8180-8299 with --port`); process.exit(2); }
if (!(await portFree(CDP_PORT))) { console.error(`Chrome debug port ${CDP_PORT} is in use (another harness run?)`); process.exit(2); }

// --rev <git rev> serves a clean export of that commit instead of the working
// tree (other agents may be mid-edit in src/; a half-saved file is a syntax
// error at boot). The export lives in the temp dir and is removed on exit.
// The server is the game's own tools/serve.mjs (from the export when --rev is
// given, so it serves exactly that tree), never python http.server or serve.sh.
// --audio-dir hands it the private radio recordings (loopback only, never copied);
// --opening-dir the opening's private portraits, when this machine has them.
const rev = arg('rev', '');
let SERVE = ROOT;
const git = (...a) => { try { return execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const build = { head: git('rev-parse', '--short', 'HEAD'), headFull: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), dirtyFiles: git('status', '--porcelain').split('\n').filter(Boolean).length, served: 'working tree' };
if (rev) {
  SERVE = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-review-src-'));
  execFileSync('/bin/sh', ['-c', `git -C "${ROOT}" archive "${rev}" | tar -x -C "${SERVE}"`]);
  build.served = `git archive ${rev} (${git('rev-parse', '--short', rev)})`;
  build.servedSha = git('rev-parse', rev);
  kids.push({ kill() { try { fs.rmSync(SERVE, { recursive: true, force: true }); } catch {} }, exitCode: 0 });
}
// Absolute before the spawn: serve.mjs runs with cwd at the --rev export, where a
// relative path the harness checked from its own cwd does not exist (19 Oct full run).
const AUDIO_DIR = path.resolve(arg('audio-dir', path.join(os.homedir(), 'Desktop', 'Coding Projects', 'aylmer-madness-private', 'radio')));
const OPENING_DIR = path.resolve(arg('opening-dir', path.join(ROOT, 'references', 'story', 'intro', 'opening')));
const srvArgs = [path.join(SERVE, 'tools', 'serve.mjs'), String(port)];
if (AUDIO_DIR && fs.existsSync(AUDIO_DIR)) srvArgs.push('--audio-dir', AUDIO_DIR);
if (OPENING_DIR && fs.existsSync(OPENING_DIR)) srvArgs.push('--opening-dir', OPENING_DIR);
build.audioDir = srvArgs.includes('--audio-dir') ? AUDIO_DIR : null;
build.openingArt = srvArgs.includes('--opening-dir') ? OPENING_DIR : null;
const server = startKid(process.execPath, srvArgs, { cwd: SERVE }, (d) => {
  for (const line of String(d).split('\n').filter(Boolean)) { serverErr.push(line); console.error(`[serve.mjs] ${line}`); }
});
let serverExit = null;
server.on('exit', (code, sig) => { serverExit = { code, sig }; });
// Fail fast when the game's server never answers (up to 15 s), before Chrome starts:
// no pack of beats against Chrome's error page.
for (let i = 0; i < 60 && !serverExit && (await portFree(port)); i++) await sleep(250);
if (serverExit || await portFree(port)) {
  await sleep(200);
  console.error(`HARNESS ERROR: tools/serve.mjs ${serverExit ? `exited (code ${serverExit.code}${serverExit.sig ? ', ' + serverExit.sig : ''})` : 'did not answer'} on port ${port}; no game was loaded.`);
  if (!serverErr.length) console.error('(serve.mjs wrote nothing to stderr)');
  fs.writeFileSync(path.join(OUT, 'SERVER-FAILED.txt'), [`tools/serve.mjs ${serverExit ? 'exited' : 'did not answer'} on port ${port}`, `args: ${srvArgs.join(' ')}`, `cwd: ${SERVE}`, '', ...serverErr, ''].join('\n'));
  await closeAll(1);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-review-chrome-'));
kids.push({ kill() { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, exitCode: 0 });
startKid(CHROME, [
  flag('headed') ? '' : '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  ...CHROME_GL, ...(process.env.CMP_CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), `--window-size=${VW},${VH}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  'about:blank',
].filter(Boolean));
for (let i = 0; i < 60; i++) { if (!(await portFree(port)) && !(await portFree(CDP_PORT))) break; await sleep(250); }

// ---------------------------------------------------------------- CDP
const target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
// Every CDP call answers within CDP_TIMEOUT_S (default 120 s) or fails, so a
// page frozen under load fails the beat instead of hanging the run forever.
const CDP_TIMEOUT = Number(arg('cdp-timeout', '120')) * 1000;
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const n = ++msgId;
    const timer = setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(`CDP ${method} gave no answer in ${CDP_TIMEOUT / 1000} s`)); } }, CDP_TIMEOUT);
    pending.set(n, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
const consoleLog = [];
const counts = { error: 0, warning: 0, exception: 0 };
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    consoleLog.push(`[${secs()}] [${m.params.type}] ${txt}`);
    if (m.params.type === 'error') counts.error++;
    if (m.params.type === 'warning') counts.warning++;
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    consoleLog.push(`[${secs()}] [EXCEPTION] ${d.text} ${d.exception?.description?.split('\n').slice(0, 3).join(' | ') || ''} @${d.url}:${d.lineNumber}`);
    counts.exception++;
  } else if (m.method === 'Log.entryAdded') {
    const en = m.params.entry;
    if (en.level === 'error') { counts.error++; consoleLog.push(`[${secs()}] [log-error] ${en.text} ${en.url || ''}`); }
  }
};
const evaluate = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
  return r.result.value;
};
// Real OS-level key events (CDP Input), for the boot, the first drive and the latency probe.
const KEYMAP = { KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyE: ['e', 69], KeyR: ['r', 82], KeyM: ['m', 77], Enter: ['Enter', 13], Escape: ['Escape', 27], Space: [' ', 32], KeyT: ['t', 84], KeyY: ['y', 89], KeyZ: ['z', 90] };
async function realKey(code, type) {
  const [key, vk] = KEYMAP[code];
  await send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: type === 'keyDown' && key.length === 1 ? key : undefined });
}
async function realTap(code) { await realKey(code, 'keyDown'); await sleep(70); await realKey(code, 'keyUp'); }

// ---------------------------------------------------------------- evidence
const metrics = { build, plan: plan.name, planPath: path.relative(ROOT, planPath), entry, warp, columns: COLUMNS, viewport: [VW, VH], started: new Date().toISOString(), host: `${os.cpus()[0]?.model} / ${os.platform()} ${os.release()}`, gl: process.env.CMP_CHROME_GL === 'swiftshader' ? 'swiftshader (software GL: fps are not honest performance numbers)' : 'metal', beats: [] };
const outcomes = [];
const shots = [];
let shotN = 0;
async function shot(name, { hud = true, quality = 80 } = {}) {
  // AYLMER.hideHud() sets visibility on body's children, which a child styled
  // visibility:visible overrides (the HUD showed through on the first run), so
  // the clean shots use a stylesheet of our own instead.
  const HIDE = `(() => { let s = document.getElementById('__rvhide'); if (!s) { s = document.createElement('style'); s.id = '__rvhide'; document.head.appendChild(s); } s.textContent = 'body > *:not(#gl) { opacity: 0 !important; }'; })()`;
  const SHOW = `(() => { document.getElementById('__rvhide')?.remove(); })()`;
  if (!hud) { await evaluate(HIDE).catch(() => {}); await sleep(60); }
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality });
  if (!hud) await evaluate(SHOW).catch(() => {});
  const file = `${String(++shotN).padStart(3, '0')}-${name.replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 60)}.jpg`;
  fs.writeFileSync(path.join(OUT, 'shots', file), Buffer.from(r.data, 'base64'));
  const st = await state().catch(() => null);
  const camera = await evaluate('window.AYLMER?.camClipStats ? { ...window.AYLMER.camClipStats.last, followYaw: window.AYLMER.G.camYaw, viewProjection: [...window.AYLMER.G.renderer.vp] } : null').catch(() => null);
  shots.push({ file, name, t: secs(), kmh: st?.kmh, x: st?.x, z: st?.z, env: st?.env, mission: st?.mission?.id || null, stage: st?.mission?.idx ?? null, camera });
  return file;
}
async function sequence(name, n, gapMs = 100) {
  const dir = path.join(OUT, 'shots', `${String(++shotN).padStart(3, '0')}-seq-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    const st = await state();
    fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.jpg`), Buffer.from(r.data, 'base64'));
    frames.push({ i, kmh: st.kmh, x: st.x, z: st.z });
    const left = gapMs - (Date.now() - t); if (left > 0) await sleep(left);
  }
  shots.push({ file: path.basename(dir) + '/', name: 'sequence ' + name, frames });
  return frames;
}
const state = () => evaluate('window.__RV ? window.__RV.state() : null');
const frameStats = () => evaluate('window.__RV ? window.__RV.frameStats(true) : null');
const rawBegin = (label) => evaluate(`window.__rawTiming.begin(${JSON.stringify(label)})`);
const rawEnd = (id) => evaluate(`window.__rawTiming.end(${JSON.stringify(id)})`);
const rawMark = (label) => evaluate(`window.__rawTiming.mark(${JSON.stringify(label)})`);
let activeRawBeat = null;
let textCursor = 0;
async function drainTexts() {
  const all = await evaluate('window.__RV ? window.__RV.texts : []');
  const fresh = all.slice(textCursor); textCursor = all.length;
  return fresh;
}
const transcript = [];
const audioLog = [];      // B-02: one row a second, every beat (audio.csv and the transcript)
const wrongVehicle = [];  // B-02: beats that started outside the job's intended vehicle

// Run one page task to its end, screenshotting the beats it reports.
async function runTask(task, label, { maxSecs = 900, every = 30 } = {}) {
  await evaluate(`window.__RV.run(${JSON.stringify(task)})`);
  const t0 = Date.now();
  let lastShot = Date.now(), end = null, lastTrace = 0;
  const provenance = [];
  const trace = ['wallSecs,x,z,kmh,damage,heat,stage,distToTarget,mode,prompt,bot'];
  while (!end) {
    await sleep(250);
    const evs = await evaluate('window.__RV.drain()');
    for (const e of evs) {
      if (e.kind === 'task-end') end = e;
      if (e.shot) await shot(`${label}-${e.kind}${e.idx != null ? '-s' + e.idx : ''}${e.card ? '-' + e.card : ''}`);
      if (e.kind === 'stage' || e.kind === 'assist' || e.kind === 'card') say(`  ${label}: ${e.kind}`, e.idx ?? '', (e.text || e.title || e.card || e.kind || '').toString().slice(0, 80));
      if (task.collisionProvenance && e.kind === 'stage' && e.idx === 1 && !provenance.length) {
        provenance.push(await evaluate(`(async () => { const p = (await import('/src/game/places.js')).PLACES.sayyad;
          return window.__RV.collisionProvenance(p.x, p.z, 35); })()`));
      }
    }
    if (Date.now() - lastTrace > 2000) {
      lastTrace = Date.now();
      const st = await state().catch(() => null);
      if (st) trace.push([secs(), st.x, st.z, st.kmh, st.damage, st.heat ?? '', st.mission ? st.mission.idx : '', st.mission?.target ? Math.round(Math.hypot(st.mission.target.x - st.x, st.mission.target.z - st.z)) : '', st.mode + (st.card ? ':' + st.card : ''), JSON.stringify(st.prompt || '').replace(/,/g, ';'), (await evaluate('window.__RV.D.resets + " " + (window.__RV.D.dbg || "")').catch(() => ''))].join(','));
      const raw = activeRawBeat && await evaluate(`window.__rawTiming.snapshot(${JSON.stringify(activeRawBeat)})`).catch(() => null);
      fs.writeFileSync(path.join(OUT, 'in-progress.json'), JSON.stringify({ label, state: st, rawFrames: raw, provenance, console: counts }, null, 1));
    }
    if (!end && Date.now() - lastShot > every * 1000) { lastShot = Date.now(); await shot(`${label}-t${Math.round((Date.now() - t0) / 1000)}`); }
    if (!end && Date.now() - t0 > maxSecs * 1000) {
      // Keep what the bot got through: the finished stages plus the one it was stuck in.
      const left = await evaluate(`(() => { const T = window.__RV.task || {}; const st = (T.stages || []).slice(); if (T.stage >= 0) st.push({ idx: T.stage, secs: +(T.stageT || 0).toFixed(1), text: T.stageText, unfinished: true });
        const p = (document.querySelector('#prompt, .prompt, #hudprompt')?.innerText || '').trim().slice(0, 140);
        window.__RV.task = null; window.__RV.release(); if (window.AYLMER.G.mission) window.AYLMER.abandon(); return { stages: st, assists: T.assists || [], prompt: p }; })()`).catch(() => ({}));
      end = { outcome: 'harness-timeout', elapsed: maxSecs, stages: left.stages || [], assists: left.assists || [], why: left.stages?.length ? `stuck in stage ${left.stages.at(-1).idx}: ${left.stages.at(-1).text || ''} (prompt: ${left.prompt || '-'})` : '' };
    }
  }
  fs.mkdirSync(path.join(OUT, 'traces'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'traces', `${label}.csv`), trace.join('\n') + '\n');
  return { ...end, provenance };
}

// Warp: extra fixed steps per real frame, for long plans. 1 = honest real time.
async function setWarp(n) {
  await evaluate(`(() => { const A = window.AYLMER; window.__RVwarp = ${n};
    if (window.__RVwarpOn) return; window.__RVwarpOn = true;
    const loop = () => { requestAnimationFrame(loop); for (let i = 1; i < (window.__RVwarp || 1); i++) A.step(1/60); };
    requestAnimationFrame(loop); })()`);
}

// ---------------------------------------------------------------- beats
const B = {};

// A real mouse click on an element by id (CDP Input), or false if it is not clickable.
async function clickEl(id) {
  const r = await evaluate(`(() => { const e = document.getElementById('${id}'); if (!e || e.disabled || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width ? [b.x + b.width / 2, b.y + b.height / 2] : null; })()`);
  if (!r) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
  return true;
}
let storagePlan = null;
// Load the page to the menu (fresh review namespace on every load), inject the bot.
async function loadToMenu(tag) {
  if (!storagePlan) { storagePlan = planStorage(`http://127.0.0.1:${port}/${entry}`, ['--fresh'], 'panel'); await prepareStorage(send, storagePlan, true); }
  let menuMs = null, tries = 0;
  while (menuMs == null && tries++ < 2) {
    const t0 = Date.now();
    await send('Page.navigate', { url: storagePlan.url });
    for (let i = 0; i < 600; i++) {
      await sleep(100);
      const ok = await evaluate(`(() => { const b = document.getElementById('start'); return !!(b && b.getBoundingClientRect().width > 0 && window.AYLMER && window.AYLMER.G); })()`).catch(() => false);
      if (ok) { menuMs = Date.now() - t0; break; }
    }
  }
  if (menuMs == null) { await shot(`${tag}-no-menu`); throw new Error('the menu never came up (see console.log)'); }
  await sleep(600);
  await shot(`${tag}-menu`);
  await evaluate(fs.readFileSync(path.join(HERE, 'page-agent.js'), 'utf8'));
  textCursor = 0;
  return menuMs;
}

// The opening as a player meets it: real click on « Nouvelle partie », then hands
// off for its 2:20 (no skips), a shot at each beat (cold open, title, crawl, each
// 3D shot, each freeze-frame name card, the hand-off), its timeline in seconds.
async function playOpening(b) {
  const tClick = Date.now();
  await clickEl('start');
  const tl = [], cards = [];
  const T = () => +((Date.now() - tClick) / 1000).toFixed(1);
  const did = new Set();
  const once = async (k, name) => { if (did.has(k)) return; did.add(k); tl.push({ t: T(), beat: k }); await shot(name); };
  let lastShot = null, lastCard = '', driveMs = null, worldMs = null, prev = null;
  const maxS = b.openingMaxSecs || 420;
  while (T() < maxS) {
    await sleep(200);
    const o = await evaluate(`(() => { const O = window.AYLMER.opening, G = window.AYLMER.G; if (!O) return null; const r = O.root, $ = O.$ || {};
      const vis = (e) => !!e && getComputedStyle(e).opacity > 0.3 && e.getBoundingClientRect().width > 0;
      return { active: O.active, phase: O.phase, worldOk: O.worldOk, shot: O.shot ? O.shot.id : null, idx: O.shotIdx, frozen: !!O.frozen,
        cls: r ? r.className : '', mode: G.mode, t: O.t0 ? (performance.now() - O.t0) / 1000 : null,
        card: vis($.card) ? [$.kicker?.innerText, $.name?.innerText, $.place?.innerText, $.line?.innerText].filter(Boolean).join(' | ') : '',
        caption: ($.caption?.innerText || '').trim(), cold: vis($.cold) ? ($.cold.innerText || '').trim() : '',
        stats: O.stats || null, art: O.art ? O.art.size : 0 }; })()`).catch(() => null);
    if (!o) break;
    if (o.worldOk && worldMs == null) { worldMs = Date.now() - tClick; tl.push({ t: T(), beat: 'world-ready' }); }
    if (o.phase === 'title') {
      if (o.t != null && o.t >= 2.5) await once('cold-open', 'opening-cold-open');
      if (o.t != null && o.t >= 9) await once('title', 'opening-title');
      if (o.t != null && o.t >= 20) await once('crawl', 'opening-crawl');
      if (o.t != null && o.t >= 34) await once('crawl-late', 'opening-crawl-late');
    }
    if (o.cls.includes('holding') && !o.worldOk) await once('holding', 'opening-holding-for-world');
    if (o.phase === 'shots' && o.shot && o.shot !== lastShot) {
      lastShot = o.shot; tl.push({ t: T(), beat: 'shot ' + o.shot });
      await sleep(o.shot === 'lake' ? 2500 : 900);
      await shot(`opening-shot-${o.shot}`);
    }
    if (o.card && o.card !== lastCard) {
      lastCard = o.card; cards.push({ t: T(), shot: o.shot, text: o.card });
      tl.push({ t: T(), beat: 'card ' + (o.shot || '') });
      await evaluate(`window.__RV.texts.push({ t: +((performance.now() - window.__RV.t0) / 1000).toFixed(2), el: 'opening-card', text: ${JSON.stringify(o.card)} }); 1`).catch(() => {});
      await sleep(500);
      await shot(`opening-card-${o.shot}`);
    }
    if (o.caption && o.caption !== prev?.caption) await evaluate(`window.__RV.texts.push({ t: +((performance.now() - window.__RV.t0) / 1000).toFixed(2), el: 'opening-caption', text: ${JSON.stringify(o.caption)} }); 1`).catch(() => {});
    if (o.cold && o.cold !== prev?.cold) await evaluate(`window.__RV.texts.push({ t: +((performance.now() - window.__RV.t0) / 1000).toFixed(2), el: 'opening-cold', text: ${JSON.stringify(o.cold)} }); 1`).catch(() => {});
    prev = o;
    if (!o.active) { driveMs = Date.now() - tClick; tl.push({ t: T(), beat: 'hand-off (opening closed, mode ' + o.mode + ')' }); break; }
  }
  const film = prev?.stats ? { frames: prev.stats.frames, meanMs: prev.stats.frames ? +(prev.stats.ms / prev.stats.frames).toFixed(1) : null, worstMs: Math.round(prev.stats.worst), longFrames: prev.stats.long, worstByShot: prev.stats.by } : null;
  const crawl = await evaluate(`(document.querySelector('#opening .op-crawl-text')?.innerText || '').trim()`).catch(() => '');
  if (crawl) await evaluate(`window.__RV.texts.push({ t: 0, el: 'opening-crawl', text: ${JSON.stringify(crawl.slice(0, 600))} }); 1`).catch(() => {});
  await sleep(800);
  await shot('opening-handoff');
  // What the game puts up next (the first job starts itself): shoot and close it like a player.
  const after = [];
  for (let i = 0; i < 6; i++) {
    const c = await evaluate('window.__RV.cardUp()');
    if (!c) { await sleep(500); if (i > 2) break; continue; }
    const text = await evaluate(`(document.querySelector('#cinematic:not(.hidden)')?.innerText || document.getElementById('story')?.innerText || '').slice(0, 300)`);
    after.push({ card: c, text });
    await shot(`after-opening-card-${i}`);
    await sleep(1800); await realTap('Enter'); await sleep(600);
  }
  const controlMs = Date.now() - tClick;
  await sleep(400);
  await shot('first-control');
  const st = await state();
  return { worldReadyMs: worldMs, openingMs: driveMs, controlMs, openingCards: cards, cardsAfter: after, timeline: tl, film,
    privateArt: prev?.art || 0, finished: driveMs != null, mission: st.mission?.id || null, mode: st.mode };
}

// Balade libre, the way rig.mjs boots: the door is offered once the opening has been
// seen (the review namespace is emptied on every load, so it is unhidden, then clicked
// for real), first start point, EMBARQUE; then any card closed with a real Enter.
async function freeStart() {
  const tClick = Date.now();
  await evaluate(`(() => { const f = document.getElementById('btnFree'); if (f) f.hidden = false; return !!f; })()`);
  let via = 'btnFree';
  if (!(await clickEl('btnFree'))) { via = 'start'; await clickEl('start'); }
  await sleep(1500);
  await evaluate("document.getElementById('startpoints')?.children[0]?.click(); 'ok'");
  await sleep(400);
  await shot('free-start-picker');
  let picker = false;
  for (let i = 0; i < 30 && !picker; i++) { await sleep(150); picker = await clickEl('startconfirm'); }
  let driveMs = null;
  for (let i = 0; i < 900; i++) {
    await sleep(200);
    if ((await evaluate('window.AYLMER.G.mode + (window.AYLMER.opening && window.AYLMER.opening.active ? "-op" : "")').catch(() => '')) === 'drive') { driveMs = Date.now() - tClick; break; }
  }
  const cards = [];
  for (let i = 0; i < 6; i++) {
    const c = await evaluate('window.__RV.cardUp()');
    if (!c) { await sleep(500); if (i > 2) break; continue; }
    cards.push({ card: c, text: await evaluate(`(document.querySelector('#cinematic:not(.hidden)')?.innerText || document.getElementById('story')?.innerText || '').slice(0, 300)`) });
    await shot(`free-card-${i}`); await sleep(1200); await realTap('Enter'); await sleep(600);
  }
  await shot('free-first-control');
  return { via, picker, driveMs, cards };
}

B.boot = async (b) => {
  const menuMs = await loadToMenu(b.via === 'free' ? 'reload' : 'boot');
  if (b.via === 'free') return { via: 'free', menuMs, ...(await freeStart()) };
  return { via: 'newGame', menuMs, ...(await playOpening(b)) };
};

B.firstDrive = async (b) => {
  // Input latency: real keyDown W, then count the game's frames until the throttle and the truck answer.
  await evaluate(`(() => { const A = window.AYLMER, R = window.__RV; R.lat = { t0: performance.now(), thr: null, move: null };
    const f = () => { const L = R.lat; const t = performance.now() - L.t0;
      if (L.thr == null && A.input.throttle > 0.01) L.thr = +t.toFixed(1);
      if (L.move == null && (A.G.veh.speedKmh || 0) > 1) L.move = +t.toFixed(1);
      if ((L.thr == null || L.move == null) && t < 5000) requestAnimationFrame(f); };
    requestAnimationFrame(f); })()`);
  await realKey('KeyW', 'keyDown');
  await sleep(Math.round((b.seconds || 5) * 1000 / 2));
  await shot('first-drive-rolling');
  await sleep(Math.round((b.seconds || 5) * 1000 / 2));
  await realKey('KeyW', 'keyUp');
  const lat = await evaluate('window.__RV.lat');
  const st = await state();
  await realKey('KeyS', 'keyDown'); await sleep(1500); await realKey('KeyS', 'keyUp');
  // Which way is left? Measured, so the bot never drives mirror-image.
  const y0 = (await state()).yaw;
  await realKey('KeyW', 'keyDown'); await realKey('KeyA', 'keyDown'); await sleep(1200); await realKey('KeyA', 'keyUp'); await realKey('KeyW', 'keyUp');
  const y1 = (await state()).yaw;
  await realKey('KeyS', 'keyDown'); await sleep(1500); await realKey('KeyS', 'keyUp');
  return { latencyMs: lat, kmhAfter: st.kmh, movedTo: [st.x, st.z], aTurnsYaw: +(y1 - y0).toFixed(2), damage: st.damage };
};

async function seedFor(id, hour) {
  return evaluate(`(async () => {
    const A = window.AYLMER, G = A.G;
    const C = await import('/src/game/campaign.js'); const M = await import('/src/game/missions.js'); const P = await import('/src/game/places.js');
    const def = M.ALL_MISSIONS.find((d) => d.id === ${JSON.stringify(id)});
    if (!def) return { ok: false, why: 'no such mission in this build' };
    if (A.G.mission) A.abandon();
    // Everything that comes before it in the story, as if played.
    const ids = C.mainIds((x) => M.ALL_MISSIONS.some((d) => d.id === x));
    const seeded = [];
    const need = C.OPTIONAL[def.id];
    const upto = C.isMain(def.id) ? ids.indexOf(def.id) : def.id === C.FINALE ? ids.length : (need ? ids.indexOf(need) + 1 : 0);
    for (const x of ids.slice(0, upto)) if (!G.done.has(x)) { G.done.add(x); seeded.push(x); }
    A.garage.setProgress?.(G.done);
    // S4-SUMMER: a job waits for its date (campaign.js DATE_GATES); seeding it
    // also brings the calendar to that date, as the summer before it would have.
    const from = C.gateDay ? C.gateDay(G, def.id) : null;
    const dayFrom = Math.floor(G.day || 0);
    if (from != null && Number.isFinite(G.day) && G.day < from) G.day = from;
    ${hour != null ? `A.visualClock(${hour});` : ''}
    const p = P.PLACES[def.giver];
    if (p) await A.teleport(p.x, p.z, A.G.veh.yaw);
    const avail = M.missionAvailable(G, def);
    return { ok: true, seeded, giver: def.giver, title: def.title, available: avail, lock: avail ? null : M.missionLockReason(G, def), day: [dayFrom, Math.floor(G.day || 0)] };
  })()`);
}

// The truck and purse a job inherits (as played), and putting them back after a
// fresh-car rerun so the next beat still carries what this one left.
// B-02: the vehicle is part of what a job inherits. `vehicle` is the car the
// player is in, `parked` where every other car stands, so a fresh rerun can put
// the player in the Ranger and the played column can be put back afterwards.
const carState = () => evaluate(`(() => { const G = window.AYLMER.G; return { damage: +((G.veh && G.veh.damage) || 0).toFixed(3), money: G.wallet ? Math.round(G.wallet.value) : null, done: [...(G.done || [])],
  vehicle: (G.veh && G.veh.spec && G.veh.spec.id) || G.carId, parked: JSON.parse(JSON.stringify(G.parked || {})) }; })()`);
async function setCar(c) {
  return evaluate(`(async () => { const A = window.AYLMER, G = A.G, c = ${JSON.stringify(c)};
    const D = await import('/src/game/damage.js');
    // Into the asked vehicle where the truck stands now (the game's own swap, as the E prompt does),
    // then every other car back where the snapshot had it.
    const cur = () => (G.veh && G.veh.spec && G.veh.spec.id) || G.carId;
    if (c.vehicle && cur() !== c.vehicle && G.swapCar && G.veh) {
      G.parked = G.parked || {}; G.parked[c.vehicle] = { x: G.veh.x, z: G.veh.z, yaw: G.veh.yaw };
      G.swapCar(c.vehicle);
    }
    if (c.parked) { const here = cur(); for (const k of Object.keys(G.parked || {})) delete G.parked[k]; for (const [k, p] of Object.entries(c.parked)) if (k !== here) G.parked[k] = { ...p }; }
    if (G.veh) { D.restoreDamage(G.veh, c.damage || 0); if (G.repair) G.repair.t = 0; G.towed = false; }
    if (G.wallet && c.money != null) G.wallet.set(c.money);
    if (c.done) { G.done.clear(); for (const x of c.done) G.done.add(x); A.garage.setProgress?.(G.done); }
    return true; })()`);
}

// B-02 vehicle truth: the vehicle a beat must start in. A beat's `vehicle` (an id,
// or false for no check) wins over the plan's, else the Ranger.
const wantVehicle = (b) => (b.vehicle === false ? null : b.vehicle || plan.vehicle || 'ranger');
const WRONG_VEHICLE = 'harness: wrong vehicle';
async function checkVehicle(b) {
  const want = wantVehicle(b);
  if (!want) return null;
  const got = await evaluate('window.__RV ? window.__RV.vehicle() : ((window.AYLMER.G.veh && window.AYLMER.G.veh.spec && window.AYLMER.G.veh.spec.id) || window.AYLMER.G.carId)').catch(() => '?');
  const v = { want, got, ok: got === want };
  if (!v.ok) say(`  ${WRONG_VEHICLE}: wanted ${want}, in ${got}`);
  return v;
}

// One play of a job: seed (or drive to the giver), let the bot play it, shoot it.
async function playMission(b, label) {
  const rawId = await rawBegin(`mission:${label}`);
  await rawMark(`seed:${label}`);
  try {
  // seed: false (on the beat or the plan) plays the summer for real: nothing is
  // marked done, and the bot drives to the giver instead of being put there.
  let seed;
  if (b.seed === false || plan.seed === false) {
    const g = await evaluate(`(async () => { const M = await import('/src/game/missions.js'); const P = (await import('/src/game/places.js')).PLACES;
      const d = M.ALL_MISSIONS.find((x) => x.id === ${JSON.stringify(b.id)}); const p = d && P[d.giver];
      return d ? { title: d.title, giver: d.giver, x: p?.x, z: p?.z } : null; })()`);
    if (!g) return { id: b.id, outcome: 'missing', why: 'no such mission in this build', stages: [], assists: [] };
    // S4-SUMMER: the story waits for its date. A player drives home and sleeps (Z) until it opens.
    const waits = await evaluate(`(async () => { const M = await import('/src/game/missions.js'); const C = await import('/src/game/campaign.js'); const G = window.AYLMER.G;
      return !!C.dateLock(G, ${JSON.stringify(b.id)}); })()`);
    if (waits) {
      const h = await evaluate(`import('/src/game/places.js').then((P) => ({ x: P.PLACES.home.x, z: P.PLACES.home.z }))`);
      await runTask({ type: 'drive', to: h, r: 12, maxKmh: 70, timeout: 300 }, `${label}-home-to-sleep`, { maxSecs: 360 });
      for (let i = 0; i < 12 && (await evaluate(`import('/src/game/campaign.js').then((C) => !!C.dateLock(window.AYLMER.G, ${JSON.stringify(b.id)}))`)); i++) {
        await realTap('KeyZ'); await sleep(1500); await shot(`${label}-sleep-${i}`);
        for (let k = 0; k < 3 && (await evaluate('window.__RV.cardUp()')); k++) { await realTap('Enter'); await sleep(600); }
      }
    }
    if (g.x != null) await runTask({ type: 'drive', to: { x: g.x, z: g.z }, r: 10, maxKmh: 70, timeout: 300 }, `${label}-to-giver`, { maxSecs: 360 });
    seed = { ok: true, seeded: [], title: g.title, lock: null };
  } else seed = await seedFor(b.id, b.hour);
  if (!seed.ok) return { id: b.id, outcome: 'missing', why: seed.why, stages: [], assists: [] };
  await sleep(1200);
  const start = await state();
  const vehicle = await checkVehicle(b);
  await frameStats(); // Legacy rolling play-only statistic. Raw timing never resets here.
  await rawMark(`play:${label}`);
  const end = await runTask({ type: 'mission', id: b.id, stageTimeout: b.stageTimeout || 150, assist: b.assist !== false, maxKmh: b.maxKmh, collisionProvenance: b.collisionProvenance,
    tour: b.tour, tourN: b.tourN, tourLegS: b.tourLegS }, label, { maxSecs: b.maxSecs || 900 });   // tour*: S4-SUMMER, the finale's free drive
  const fs_ = await frameStats();
  const st = await state();
  // Clear the end card the bot may have left (read it first).
  await sleep(1500); await shot(`${label}-after`);
  for (let i = 0; i < 4 && (await evaluate('window.__RV.cardUp()')); i++) { await realTap('Enter'); await sleep(500); }
  const o = { id: b.id, title: seed.title, seeded: seed.seeded, lockBefore: seed.lock, outcome: end.outcome, why: end.why || '', minutes: +((end.elapsed || 0) / 60).toFixed(2), stages: end.stages || [], assists: end.assists || [], damageStart: start.damage, moneyStart: start.money, money: st.money, damage: st.damage, bot: end.bot || null, frames: fs_, provenance: end.provenance, rawMissionFrames: await rawEnd(rawId), vehicle };
  o.cause = failCause(o);
  if (vehicle && !vehicle.ok) o.harness = WRONG_VEHICLE;
  return o;
  } finally {
    // An early missing-job return or exception still releases this window.
    await evaluate(`window.__rawTiming.snapshot(${JSON.stringify(rawId)}) && window.__rawTiming.end(${JSON.stringify(rawId)})`);
  }
}

// Both columns for one job. As played runs first (it is what the summer left the
// player with). Fresh car reruns it at damage 0 only when the played start was
// not already a fresh truck; otherwise the played run is the fresh one too.
async function bothColumns(b, playOnce) {
  const before = await carState();
  let played = null, fresh = null;
  if (COLUMNS !== 'fresh') played = await playOnce('played');
  // The fresh column is a fresh Ranger (B-02): rerun when the played start was damaged or in the wrong vehicle.
  const wrongVeh = played && played.vehicle && !played.vehicle.ok;
  if (COLUMNS === 'fresh' || (COLUMNS === 'both' && played && played.outcome !== 'missing' && (needsFreshRun(played.damageStart) || wrongVeh))) {
    const after = await carState();
    await setCar({ damage: 0, money: before.money, done: before.done.filter((x) => x !== b.id), vehicle: wantVehicle(b) || undefined });
    fresh = await playOnce('fresh');
    fresh.freshRun = true;
    if (played) await setCar(after);   // the next beat carries what the played run left
  } else if (played && COLUMNS === 'both') fresh = { ...played, sameAsPlayed: true, frames: undefined };
  const o = played ? { ...played, fresh } : { ...fresh, fresh, columnsNote: 'fresh only' };
  outcomes.push(o);
  return o;
}

B.mission = async (b) => {
  // A job the bot cannot read (a set piece only a player gets through) is not
  // played by the bot at all, and never counted as the game failing.
  if (b.handPlay) {
    const o = { id: b.id, outcome: 'hand-play', why: b.handPlay === true ? 'hand-play only: the bot cannot play this set piece' : String(b.handPlay), minutes: 0, stages: [], assists: [], cause: 'hand-play' };
    o.fresh = { ...o };
    outcomes.push(o);
    return o;
  }
  return bothColumns(b, (col) => playMission(b, col === 'fresh' ? `${b.id}-fresh` : b.id));
};

B.tour = async (b) => {
  const out = [];
  const places = await evaluate(`import('/src/game/places.js').then((P) => Object.fromEntries(${JSON.stringify(b.places)}.filter((k) => P.PLACES[k]).map((k) => [k, { x: P.PLACES[k].x, z: P.PLACES[k].z }])))`);
  for (const [k, p] of Object.entries(places)) {
    for (const w of b.weather || ['clear']) {
      for (const env of b.envs || ['day']) {
        await evaluate(`(async () => { const A = window.AYLMER; await A.teleport(${p.x}, ${p.z}, A.G.veh.yaw); A.weather(${JSON.stringify(w)}); A.env(${JSON.stringify(env)}); })()`);
        await sleep(1400);
        const hud = env === 'day' && w === 'clear';
        const f = await shot(`tour-${k}-${env}-${w}`, { hud });
        out.push({ place: k, env, weather: w, file: f });
      }
    }
    const s = await evaluate('window.AYLMER.stats()').catch(() => null);
    out.push({ place: k, stats: s && { drawCalls: s.drawCalls, tris: s.rendererTris } });
  }
  await evaluate(`(() => { window.AYLMER.weather('clear'); window.AYLMER.env('day'); })()`);
  return { shots: out.length, frames: await frameStats(), samples: out.filter((o) => o.stats) };
};

async function onStraight() {
  // The longest run of nearly straight road on a few GPS routes across town
  // (consecutive route segments within 0.12 rad of each other): put the truck at its start.
  return evaluate(`(async () => { const A = window.AYLMER, P = (await import('/src/game/places.js')).PLACES;
    const pairs = [['home', 'mall'], ['beach', 'ctire'], ['principale', 'deschenes'], ['home', 'marina']];
    let best = null;
    for (const [a, b] of pairs) {
      if (!P[a] || !P[b] || !A.G.nav) continue;
      const r = A.G.nav.route(P[a].x, P[a].z, P[b].x, P[b].z); if (!r) continue;
      let s = 0, len = 0, h0 = null;
      for (let i = 0; i + 1 < r.length; i++) {
        const dx = r[i+1][0]-r[i][0], dz = r[i+1][1]-r[i][1], L = Math.hypot(dx, dz), h = Math.atan2(dx, dz);
        let dh = h0 == null ? 0 : Math.abs(((h - h0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (h0 != null && dh > 0.12) { s = i; len = 0; }
        h0 = h; len += L;
        if (!best || len > best.len) best = { len, p: r[s], h: Math.atan2(r[s+1][0]-r[s][0], r[s+1][1]-r[s][1]) };
      }
    }
    if (!best) return 0;
    await A.teleport(best.p[0], best.p[1], best.h); return Math.round(best.len); })()`);
}

B.speedRun = async (b) => {
  const straight = await onStraight();
  await sleep(800);
  await evaluate(`window.__RV.run({ type: 'floor', seconds: ${(b.seconds || 10) + 4}, steer: 0 })`);
  // Start the sequence late, near top speed, so it shows speed rather than the launch.
  await sleep(Math.max(0, Math.round((b.seconds || 10) * 1000) - (b.frames || 10) * 160));
  const frames = await sequence('speed', b.frames || 10, 100);
  let end = null;
  for (let i = 0; i < 80 && !end; i++) { await sleep(250); end = (await evaluate('window.__RV.drain()')).find((e) => e.kind === 'task-end'); }
  await shot('speed-end');
  const st = await state();
  return { straightM: straight, maxKmh: end?.maxKmh, kmhInSequence: frames.map((f) => f.kmh), damage: st.damage, frames: await frameStats() };
};

B.crash = async (b) => {
  // S3-CRASH (feel.md finding 2): a crash the panel can see. The old beat aimed
  // square off the road from rest and floored it, and never got above 17 km/h
  // (impacts at 0.1 to 1.1 km/h). Now: from a road point on the route out of
  // the place, look square off the road for the first building, wall or pole
  // 16 to 50 m out (modes.js blockedAhead, the start-line probe), put the
  // truck on the road facing it at `kmh` (70), floor it, and keep a ring of
  // frames so the sequence runs through the impact: 3 before, 7 after.
  const kmh = b.kmh || 70;
  const tries = [[b.place || 'principale', b.side || 1], [b.place || 'principale', -(b.side || 1)], ['marina', 1], ['marina', -1], ['home', 1], ['home', -1]];
  let aimed = null;
  const misses = [];
  for (const [place, side] of tries) {
    aimed = await evaluate(`(async () => { const A = window.AYLMER, G = A.G, P = (await import('/src/game/places.js')).PLACES, M = await import('/src/game/modes.js');
      const a = P[${JSON.stringify(place)}] || P.principale, o = a === P.marina ? P.principale : P.marina;
      const r = G.nav && G.nav.route(a.x, a.z, o.x, o.z);
      if (!r || r.length < 2) return { miss: 'no route' };
      const seen = [];
      // Three rays off the nose (the centreline and 0.8 m either side) must all
      // meet a wall or a building within 2.5 m of each other, 16 to 50 m out,
      // so the truck takes it square instead of clipping the end of a fence;
      // and the run-up before it must be clear (no water, no house).
      const W = G.world, wall = (x, z) => W.querySegments(x, z, 0.3).length > 0 || !!(W.buildingAt && W.buildingAt(x, z, 0));
      const ray = (ox, oz, fx, fz) => { for (let d = 0; d <= 52; d += 0.5) if (wall(ox + fx * d, oz + fz * d)) return d; return Infinity; };
      for (let k = 0; k < Math.min(r.length - 1, 24); k++) {
        const h = Math.atan2(r[k + 1][0] - r[k][0], r[k + 1][1] - r[k][1]) + Math.PI / 2 * (${side});
        await A.teleport(r[k][0], r[k][1], h);
        const p = { x: G.veh.x, z: G.veh.z, yaw: h };
        const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h), nose = G.veh.spec.len / 2;
        const ds = [-0.8, 0, 0.8].map((o) => ray(p.x + fx * nose + lx * o, p.z + fz * nose + lz * o, fx, fz));
        const lo = Math.min(...ds), hi = Math.max(...ds);
        if (!(lo >= 16 && hi <= 50 && hi - lo <= 2.5)) { seen.push('rays ' + ds.join('/')); continue; }
        const why = M.blockedAhead(W, p, G.veh.spec, Math.floor(lo) - 1);
        if (why) { seen.push('run-up ' + why); continue; }
        return { place: ${JSON.stringify(place)}, side: ${side}, k, rays: ds, wallM: lo, x: +p.x.toFixed(1), z: +p.z.toFixed(1), yaw: +h.toFixed(3) };
      }
      return { miss: seen.join('; ') }; })()`);
    if (aimed && !aimed.miss) break;
    misses.push({ place, side, why: aimed && aimed.miss });
    aimed = null;
  }
  await sleep(900);
  const before = await state();
  const crash0 = await evaluate('window.AYLMER.G.feel.crash || 0');
  // One evaluate: no frame runs between the speed and the throttle.
  await evaluate(`(() => { const G = window.AYLMER.G, v = G.veh, s = ${kmh} / 3.6;
    if (${JSON.stringify(!!aimed)}) { v.vLong = s; v.vLat = 0; v.vx = Math.sin(v.yaw) * s; v.vz = Math.cos(v.yaw) * s; }
    G.slowmo.cool = 0;
    return window.__RV.run({ type: 'floor', seconds: ${b.seconds || 7}, steer: ${b.steer || 0} }); })()`);
  const ring = [];
  const N = b.frames || 10, PRE = 3;
  let hitAt = -1, maxKmh = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < ((b.seconds || 7) + 2) * 1000) {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    const st = await evaluate(`(() => { const G = window.AYLMER.G, v = G.veh; return { kmh: +(Math.abs(v.speedKmh || 0)).toFixed(1), damage: +(v.damage || 0).toFixed(1), x: +v.x.toFixed(1), z: +v.z.toFixed(1), crash: G.feel.crash || 0, slowmo: G.slowmo.kind, scale: +(G.slowmo.left > 0 ? G.slowmo.scale : 1).toFixed(2), crashCam: G.crashCam ? (G.crashCam.side || 'pending') : null }; })()`);
    maxKmh = Math.max(maxKmh, st.kmh);
    ring.push({ data: r.data, t: secs(), ...st });
    if (hitAt < 0 && st.crash > crash0) hitAt = ring.length - 1;
    if (hitAt < 0 && ring.length > PRE + 1) ring.shift();
    if (hitAt >= 0 && ring.length - hitAt >= N - PRE + 1) break;
  }
  // Keep PRE frames before the first slow-mo frame and the rest after it (or the last N when nothing fired).
  const from = hitAt >= 0 ? Math.max(0, hitAt - PRE) : Math.max(0, ring.length - N);
  const keep = ring.slice(from, from + N);
  const dir = path.join(OUT, 'shots', `${String(++shotN).padStart(3, '0')}-seq-crash`);
  fs.mkdirSync(dir, { recursive: true });
  keep.forEach((f, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.jpg`), Buffer.from(f.data, 'base64')));
  const frames = keep.map(({ data, ...f }, i) => ({ i, ...f }));
  shots.push({ file: path.basename(dir) + '/', name: 'sequence crash', frames });
  await evaluate('window.__RV.release && window.__RV.release()').catch(() => {});
  let end = null;
  for (let i = 0; i < 40 && !end; i++) { await sleep(200); end = (await evaluate('window.__RV.drain()')).find((e) => e.kind === 'task-end'); }
  await sleep(800);
  await shot('crash-after');
  const after = await state();
  const feel = await evaluate(`(() => { const G = window.AYLMER.G; return { crash: G.feel.crash, crashKmh: G.feel.crashKmh, crashCam: G.feel.crashCam || 0, crashCamLast: G.feel.crashCamLast || null, show: G.reactive && G.reactive.show ? { ...G.reactive.show } : null }; })()`);
  const impacts = hitAt >= 0 ? [{ t: ring[hitAt].t, kmh: (ring[Math.max(0, hitAt - 1)] || ring[hitAt]).kmh, damage: ring[hitAt].damage }] : [];
  return { aimedOffRoad: !!aimed, aimed, misses, startKmh: kmh, damageBefore: before.damage, damageAfter: after.damage, impacts, slowmo: feel.crash > crash0, feel, maxKmh: Math.max(maxKmh, end?.maxKmh || 0), sequence: frames, towed: Math.hypot(after.x - before.x, after.z - before.z) > 400 };
};

// T is the free reset to the road (src/game/tow.js freeReset), Y the paid flatbed.
// A real key press; the toast it raises and the move are the evidence.
async function pressReset(code = 'KeyT', label = 'reset') {
  const before = await state();
  await realTap(code);
  await sleep(1500);
  const after = await state();
  const toast = await evaluate(`(() => { const T = window.AYLMER.hud && window.AYLMER.hud.toasts; const q = T ? [...(T.active || []), ...(T.pending || [])].map((a) => String(a.text || a)) : []; return q.slice(-2).join(' / ') || [...document.querySelectorAll('[class*="toast"]')].map((e) => e.innerText).filter(Boolean).join(' / '); })()`).catch(() => '');
  await shot(`${label}-after-${code === 'KeyT' ? 'T' : 'Y'}`);
  return { key: code, moved: +Math.hypot(after.x - before.x, after.z - before.z).toFixed(1), from: [before.x, before.z], to: [after.x, after.z], kmhAfter: after.kmh, damageBefore: before.damage, damageAfter: after.damage, moneyBefore: before.money, moneyAfter: after.money, toast };
}
// tow/reset: wedge the truck off the road (as the crash beat does), then T (free), then Y (paid).
B.reset = async (b) => {
  const crash = await B.crash({ seconds: b.seconds || 6, place: b.place || 'principale', side: b.side || 1 });
  const t = await pressReset('KeyT', 'reset');
  const out = { crash: { damageAfter: crash.damageAfter, impacts: crash.impacts.length }, T: t };
  if (b.tow !== false) out.Y = await pressReset('KeyY', 'tow');
  return out;
};

B.cops = async (b) => {
  // Free reset to the road first (a real T), so the chase never starts wedged in a yard from the beat before.
  const reset = await pressReset('KeyT', 'cops-prereset');
  await sleep(500);
  await evaluate(`window.AYLMER.heat(${b.heat || 3})`);
  const cops0 = await evaluate(`(() => { const c = window.AYLMER.cops(); return c ? { heat: c.heat, units: (c.units || c.cars || []).length } : null; })()`);
  await shot('cops-start');
  // A drive long enough for a chase: from wherever the truck is to the far one of Principale and the marina.
  const dest = await evaluate(`import('/src/game/places.js').then((P) => { const v = window.AYLMER.G.veh, a = P.PLACES.principale, b = P.PLACES.mall;
    return Math.hypot(a.x - v.x, a.z - v.z) > Math.hypot(b.x - v.x, b.z - v.z) ? { x: a.x, z: a.z } : { x: b.x, z: b.z }; })`);
  // S3-COPS: `inFrame`, game seconds a driving cruiser (not the roadblock) was inside the
  // camera's frustum within 120 m (centre, nose, tail or light bar projected through the
  // renderer's own view-projection; houses in the way are not tested). `chaseSecs` is the
  // time at least one unit was on the road, `near40` the in-frame time inside 40 m.
  const dmg0 = (await state())?.damage ?? null;
  await evaluate(`(() => { const G = window.AYLMER.G, S = window.__copsFrame = { inFrame: 0, near40: 0, chaseSecs: 0, secs: 0, minD: Infinity, last: G.time };
    const P = (M, x, y, z) => { const w = M[3] * x + M[7] * y + M[11] * z + M[15]; if (!(w > 0.1)) return false;
      const cx = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w, cy = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w; return Math.abs(cx) < 0.97 && Math.abs(cy) < 0.97; };
    const tick = () => { if (window.__copsFrame !== S) return; requestAnimationFrame(tick);
      const dt = G.time - S.last; S.last = G.time; if (!(dt > 0 && dt < 0.5)) return; S.secs += dt;
      const C = G.cops, M = G.renderer && G.renderer.vp, v = G.veh; if (!C || !M || !v || !C.units.length) return; S.chaseSecs += dt;
      let seen = false, seenNear = false;
      for (const u of C.units) { const c = u.veh, d = Math.hypot(c.x - v.x, c.z - v.z); S.minD = Math.min(S.minD, d); if (d > 120) continue;
        const fx = Math.sin(c.yaw) * 2.5, fz = Math.cos(c.yaw) * 2.5, y = (c.y || 0);
        if (P(M, c.x, y + 0.8, c.z) || P(M, c.x + fx, y + 0.7, c.z + fz) || P(M, c.x - fx, y + 0.7, c.z - fz) || P(M, c.x, y + 1.55, c.z)) { seen = true; if (d < 40) seenNear = true; } }
      if (seen) S.inFrame += dt; if (seenNear) S.near40 += dt; };
    requestAnimationFrame(tick); return 1; })()`);
  const end = await runTask({ type: 'drive', to: dest, maxKmh: 90, timeout: b.seconds || 25 }, 'cops', { maxSecs: (b.seconds || 25) + 20, every: 8 });
  const cops1 = await evaluate(`(() => { const c = window.AYLMER.cops(); if (!c) return null; const o = {}; for (const [k, v] of Object.entries(c)) if (typeof v !== 'object' && typeof v !== 'function') o[k] = v; o.units = (c.units || c.cars || []).length; o.bumps = Array.isArray(c.bumpLog) ? c.bumpLog.slice() : null; return o; })()`);
  const seen = await evaluate(`(() => { const S = window.__copsFrame; window.__copsFrame = null; if (!S) return null; const r = (x) => +x.toFixed(1);
    return { inFrame: r(S.inFrame), near40: r(S.near40), chaseSecs: r(S.chaseSecs), secs: r(S.secs), inFramePct: S.chaseSecs > 0 ? Math.round(100 * S.inFrame / S.chaseSecs) : 0, minD: Number.isFinite(S.minD) ? r(S.minD) : null }; })()`);
  const dmg1 = (await state())?.damage ?? null;
  await evaluate('window.AYLMER.heat(0)');
  return { reset, before: cops0, after: cops1, drive: end.outcome, inFrame: seen ? seen.inFrame : null, seen, damage: { before: dmg0, after: dmg1 }, frames: await frameStats() };
};

B.radio = async (b) => {
  const read = () => evaluate(`(() => { const r = window.AYLMER.radio; const o = {}; for (const k of Object.keys(r || {})) { const v = r[k]; if (['string','number','boolean'].includes(typeof v)) o[k] = v; } return o; })()`);
  const seen = [await read()];
  // R turns it on (a real key); Shift+R is the next station (sent as the game's own key pair).
  await realTap('KeyR'); await sleep(2500); seen.push(await read()); await shot('radio-on');
  for (let i = 0; i < (b.taps || 3); i++) {
    await evaluate(`(() => { const k = (type, code, shiftKey) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'KeyR' ? 'R' : 'Shift', shiftKey, bubbles: true }));
      k('keydown', 'ShiftLeft', true); k('keydown', 'KeyR', true); setTimeout(() => { k('keyup', 'KeyR', true); k('keyup', 'ShiftLeft', false); }, 80); })()`);
    await sleep(2500); seen.push(await read()); await shot(`radio-next-${i}`);
  }
  return { states: seen };
};

B.modes = async () => {
  await evaluate('window.AYLMER.openModes(true)');
  await sleep(700);
  await shot('modes-picker');
  const list = await evaluate('window.AYLMER.courses.map((c) => ({ id: c.id, kind: c.kind, name: c.name }))');
  await evaluate('window.AYLMER.openModes(false)');
  await sleep(300);
  return { courses: list.length, kinds: [...new Set(list.map((c) => c.kind))], sample: list.slice(0, 8) };
};

async function playCourse(b, label) {
  const pick = await evaluate(`(() => { const L = window.AYLMER.courses; const byId = L.find((x) => x.id === ${JSON.stringify(b.id || '')}); const c = byId || (${b.mode ? `L.find((x) => x.kind === ${JSON.stringify(b.mode)})` : `L[${b.index || 0}]`}); if (!c) return null; const ok = window.AYLMER.course(c.id); return { id: c.id, kind: c.kind, name: c.name, ok }; })()`);
  if (!pick || !pick.ok) return { outcome: 'unavailable', pick, stages: [], assists: [] };
  const start = await state();
  const vehicle = await checkVehicle(b);
  await sleep(1000);
  const end = await runTask({ type: 'mission', attach: true, maxKmh: b.maxKmh || 95, stageTimeout: b.stageTimeout || 150 }, label + '-' + pick.kind, { maxSecs: b.maxSecs || 600 });
  const st = await state();
  const o = { id: pick.id, title: pick.name, kind: pick.kind, outcome: end.outcome, why: end.why || '', minutes: +((end.elapsed || 0) / 60).toFixed(2), stages: end.stages || [], assists: end.assists || [], damageStart: start.damage, moneyStart: start.money, damage: st.damage, bot: end.bot || null, vehicle };
  o.cause = failCause(o);
  if (vehicle && !vehicle.ok) o.harness = WRONG_VEHICLE;
  for (let i = 0; i < 4 && (await evaluate('window.__RV.cardUp()')); i++) { await realTap('Enter'); await sleep(500); }
  return o;
}
B.course = async (b) => bothColumns({ ...b, id: '__course' }, (col) => playCourse(b, col === 'fresh' ? 'course-fresh' : 'course'));

// The ramps (src/game/jumps.js JUMPS), each from its run-up point on a fresh
// truck at full throttle: take-off speed, air time against the table's
// prediction, damage on landing. The bot steers at the run-up, the lip, then 40 m past it.
B.jumps = async (b) => {
  const list = await evaluate(`import('/src/game/jumps.js').then((J) => J.JUMPS.filter((j) => ${JSON.stringify(b.ids || null)} == null || ${JSON.stringify(b.ids || [])}.includes(j.id)).map((j) => ({ id: j.id, name: J.jumpName ? J.jumpName(j) : j.name, x: j.x, z: j.z, from: j.from, entry: j.entry, path: j.path || null, kmh: j.kmh, predicted: +J.jumpAir(j).toFixed(2) })))`);
  const out = [];
  const carried = await carState();
  // S3-JUMPS: the ramps are measured on an empty town. A traffic car or a cruiser
  // (heat left by the last ramp's landing) on the run-up turned three of the 20 Oct
  // runs into 64 to 80 damage head-ons; that is a traffic number, not a ramp number.
  // Traffic is parked for the beat and handed back after it.
  await evaluate(`(() => { const G = window.AYLMER.G; if (G.traffic && !window.__jumpsTraffic) { window.__jumpsTraffic = G.traffic.cars; G.traffic.cars = []; } return true; })()`);
  for (const j of list) {
    if (!j.from) { out.push({ id: j.id, outcome: 'no run-up point' }); continue; }
    await setCar({ damage: 0, vehicle: wantVehicle(b) || undefined });
    await evaluate(`(() => { const G = window.AYLMER.G; if (G.cops && G.cops.clear) G.cops.clear(); else window.AYLMER.heat(0); return true; })()`);
    // S3-JUMPS: `path` (when a ramp has one) is the whole run-up after `from`, ending on the
    // ramp's own line; it replaces `entry` for the bot when the straight line to it is blocked.
    const run = j.path && j.path.length ? j.path : [j.entry || j.from];
    const via = run[run.length - 1];
    const lx = j.x - via[0], lz = j.z - via[1], L = Math.hypot(lx, lz) || 1;
    const land = [j.x + lx / L * 40, j.z + lz / L * 40];
    const aim0 = run[0];
    await evaluate(`window.AYLMER.teleport(${j.from[0]}, ${j.from[1]}, ${Math.atan2(aim0[0] - j.from[0], aim0[1] - j.from[1])})`);
    await sleep(900);
    const end = await runTask({ type: 'aim', points: [...run, [j.x, j.z], land], lip: [j.x, j.z], seconds: b.seconds || 45 }, 'jump-' + j.id, { maxSecs: (b.seconds || 45) + 10, every: 60 });
    const st = await state();
    // air: the flight off the lip itself, to the ground (S3-JUMPS); maxAir is the old reading, kept for comparison.
    out.push({ id: j.id, name: j.name, builtKmh: j.kmh, lipKmh: end.takeoffKmh ?? end.lipKmh, air: end.lipAir ?? 0, dist: end.lipDist ?? null, maxAir: end.maxAir, predictedAir: j.predicted, damage: st.damage, outcome: end.outcome });
  }
  await evaluate(`(() => { const G = window.AYLMER.G; if (window.__jumpsTraffic) { G.traffic.cars = window.__jumpsTraffic; window.__jumpsTraffic = null; } return true; })()`);
  await setCar({ damage: carried.damage, money: carried.money, vehicle: carried.vehicle, parked: carried.parked });
  return { jumps: out, flown: out.filter((x) => x.air > 0.3).length, of: out.length, frames: await frameStats() };
};

B.freeRoam = async (b) => {
  const legs = [];
  const P = await evaluate(`import('/src/game/places.js').then((P) => Object.fromEntries(${JSON.stringify(b.places)}.filter((k) => P.PLACES[k]).map((k) => [k, { x: P.PLACES[k].x, z: P.PLACES[k].z }])))`);
  for (const [k, p] of Object.entries(P)) {
    const end = await runTask({ type: 'drive', to: p, maxKmh: b.maxKmh || 75, timeout: 240 }, 'roam-' + k, { maxSecs: 300, every: 20 });
    legs.push({ to: k, outcome: end.outcome, secs: end.elapsed });
  }
  return { legs, frames: await frameStats() };
};

// A script beat (B-02): { do: 'script', id, file? } runs tools/review/beats/<file or id>.mjs,
// whose `run(page, assert)` drives the page through the helpers below. Later tasks
// add beats as new files without editing this one. A failed assert does not stop
// the beat (the evidence is kept); it marks the result and fails the run.
B.script = async (b) => {
  const name = String(b.file || b.id || '').replace(/\.mjs$/, '');
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`script beat needs an id or file of letters, digits, - and _ (got "${name}")`);
  const file = path.join(HERE, 'beats', name + '.mjs');
  if (!fs.existsSync(file)) throw new Error(`no script beat ${path.relative(ROOT, file)}`);
  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.run !== 'function') throw new Error(`${path.relative(ROOT, file)} exports no run(page, assert)`);
  const asserts = [];
  const assert = (cond, msg = 'assert') => { asserts.push({ ok: !!cond, msg: String(msg) }); return !!cond; };
  assert.ok = assert;
  assert.equal = (a, e, msg = 'equal') => assert(Object.is(a, e) || a === e, `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(e)}`);
  assert.near = (a, e, tol, msg = 'near') => assert(Number.isFinite(a) && Math.abs(a - e) <= tol, `${msg}: got ${a}, want ${e} +- ${tol}`);
  const page = { beat: b, plan: plan.name, evaluate, send, state, shot, sequence, sleep, say, tap: realTap, key: realKey, click: clickEl,
    runTask, carState, setCar, seedFor, frameStats, vehicle: () => evaluate('window.__RV.vehicle()') };
  const out = (await mod.run(page, assert)) || {};
  const failed = asserts.filter((a) => !a.ok);
  if (failed.length) { exitCode = 1; for (const f of failed) say(`  script ${name}: FAIL ${f.msg}`); }
  return { script: name, ...out, asserts, ok: !failed.length };
};

// ---------------------------------------------------------------- run
let exitCode = 0;
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(HERE, 'raw-timing.js'), 'utf8') });
  await send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  say(`plan ${plan.name} (${plan.beats.length} beats) on ${entry}, port ${port}, pack ${OUT}`);
  for (const [i, b] of plan.beats.entries()) {
    const key = b.id || b.do;
    if (only && i > 0 && !only.has(key) && !only.has(b.do)) continue;
    if (!B[b.do]) { say(`unknown beat ${b.do}`); continue; }
    if (STOP_AFTER_MS && i > 0 && Date.now() - T0 > STOP_AFTER_MS) { (metrics.skipped ||= []).push(key); say(`beat ${i + 1}/${plan.beats.length}: ${key} skipped (--stop-after)`); continue; }
    if (i === 1 && warp > 1) await setWarp(warp);
    const t = Date.now();
    say(`beat ${i + 1}/${plan.beats.length}: ${b.do}${b.id ? ' ' + b.id : ''}`);
    const cameraBeat = ['crash', 'freeRoam', 'cops'].includes(b.do);
    if (cameraBeat) await evaluate('window.__RV.cameraReset()');
    activeRawBeat = b.do === 'boot' ? null : await rawBegin(`beat:${key}`);
    // Every beat but a boot asserts its vehicle at the start (missions and courses do it per column, after the seed).
    const startVehicle = b.do === 'boot' || b.do === 'mission' || b.do === 'course' ? null : await checkVehicle(b).catch(() => null);
    await evaluate('window.__RV && window.__RV.audioDrain ? (window.__RV.audioDrain(), 1) : 0').catch(() => {});
    let result;
    try { result = await B[b.do](b); }
    catch (e) { exitCode = 1; result = { error: e.message }; say(`  beat failed: ${e.message}`); await shot(`${key}-error`).catch(() => {}); }
    const rawId = activeRawBeat || await evaluate('window.__rawTiming.documentId');
    result.rawFrames = await rawEnd(rawId);
    result.loading = await evaluate('window.AYLMER?.G.world?.sectors?.loading?.() || null');
    activeRawBeat = null;
    if (b.rawMaxMs != null) {
      const eligible = !result.error && !['missing', 'hand-play', 'harness-timeout'].includes(result.outcome) && (result.stages?.length || 0) > 0;
      result.rawGate = { limitMs: b.rawMaxMs, eligible, ok: !!(eligible && result.rawFrames?.n && result.rawFrames.maxMs <= b.rawMaxMs), scope: 'whole beat including setup, both columns and first draw' };
      if (!result.rawGate.ok && !flag('timing-observe')) exitCode = 1;
    }
    if (cameraBeat) {
      const evidence = await evaluate('window.__RV.cameraReport()');
      for (const [kind, frame] of Object.entries(evidence.snapshots || {})) {
        if (frame.image?.startsWith('data:image/jpeg;base64,')) {
          const file = `${String(++shotN).padStart(3, '0')}-${b.do}-camera-${kind}.jpg`;
          fs.writeFileSync(path.join(OUT, 'shots', file), Buffer.from(frame.image.slice(frame.image.indexOf(',') + 1), 'base64'));
          delete frame.image; frame.file = file;
          shots.push({ file, name: `${b.do} camera ${kind}`, ...frame });
        }
      }
      const S = evidence.stats;
      evidence.ok = !!(S && S.frames > 0 && S.unknown === 0 && S.clearPct >= 99 && S.eyeBlocked === 0 && S.unframed / S.frames <= 0.01);
      result.camera = evidence;
      if (plan.cameraGate && !evidence.ok) exitCode = 1;
    }
    if (startVehicle) { result.vehicle = startVehicle; if (!startVehicle.ok) result.harness = WRONG_VEHICLE; }
    const vcols = [result.vehicle, result.fresh && !result.fresh.sameAsPlayed ? result.fresh.vehicle : null].filter(Boolean);
    if (vcols.some((v) => !v.ok)) { wrongVehicle.push({ beat: key, played: result.vehicle || null, fresh: result.fresh?.vehicle || null }); if (!flag('vehicle-observe')) exitCode = 1; }
    const texts = await drainTexts().catch(() => []);
    const audioRows = await evaluate('window.__RV && window.__RV.audioDrain ? window.__RV.audioDrain() : []').catch(() => []);
    for (const r of audioRows) audioLog.push({ beat: key, ...r });
    transcript.push({ beat: `${b.do}${b.id ? ' ' + b.id : ''}`, texts, audio: audioRows });
    metrics.beats.push({ beat: b.do, id: b.id || null, wallSecs: +((Date.now() - t) / 1000).toFixed(1), result });
    say(`  -> ${JSON.stringify(result).slice(0, 220)}`);
    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ ...metrics, console: counts }, null, 1));
    if (i === 0 && result.error) { metrics.aborted = `boot failed: ${result.error}`; say('  boot failed: no game to play, the plan stops here'); break; }
  }
} catch (e) { exitCode = 1; say('HARNESS ERROR', e.stack || e.message); }

// ---------------------------------------------------------------- write the pack
const csvCell = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
function audioLine(r) {
  return `[${r.t}s audio] ${r.car} ${r.kmh} km/h · engine ${r.rpm} rpm ${r.pitchHz} Hz load ${r.load} · radio ${r.radio}${r.radio !== 'off' && r.radio !== 'blocked' ? ' ' + r.music : ''}${r.siren ? ' · siren' : ''}${r.cabin ? ' · cab' : ''}${r.ctx !== 'running' ? ' · ctx ' + r.ctx : ''} · cues ${(r.cues || []).join(', ') || '-'}`;
}
metrics.finished = new Date().toISOString();
metrics.wallMinutes = +((Date.now() - T0) / 60000).toFixed(1);
metrics.console = counts;
const boot = metrics.beats.find((x) => x.beat === 'boot' && x.result?.via !== 'free')?.result || {};
const fd = metrics.beats.find((x) => x.beat === 'firstDrive')?.result || {};
const ms = outcomes.filter((o) => o.outcome !== 'missing' && o.outcome !== 'hand-play');
const colPlayed = tally(outcomes.filter((o) => o.columnsNote !== 'fresh only'));
const colFresh = tally(outcomes.map((o) => o.fresh).filter(Boolean));
metrics.headline = {
  menuSecs: boot.menuMs != null ? +(boot.menuMs / 1000).toFixed(1) : null,
  newGameToControlSecs: boot.controlMs != null ? +(boot.controlMs / 1000).toFixed(1) : null,
  openingCards: boot.openingCards?.length ?? null,
  openingSecs: boot.openingMs != null ? +(boot.openingMs / 1000).toFixed(1) : null, openingWorldReadySecs: boot.worldReadyMs != null ? +(boot.worldReadyMs / 1000).toFixed(1) : null,
  openingFilm: boot.film || null,
  throttleLatencyMs: fd.latencyMs?.thr ?? null, moveLatencyMs: fd.latencyMs?.move ?? null,
  missionsPlayed: ms.length,
  missionsDoneUnassisted: ms.filter((o) => o.outcome === 'done' && !o.assists.length).length,
  missionsDoneAssisted: ms.filter((o) => o.outcome === 'done' && o.assists.length).length,
  missionsFailed: ms.filter((o) => o.outcome !== 'done').length,
  meanMissionMinutes: ms.length ? +(ms.reduce((a, o) => a + o.minutes, 0) / ms.length).toFixed(2) : null,
  // A failed boot means no game was measured (Chrome's error page draws 60 fps too): no headline frame numbers.
  fpsMeanWorst: metrics.aborted ? null : (() => { const v = metrics.beats.map((x) => x.result?.frames?.fpsMean).filter(Number.isFinite); return v.length ? Math.min(...v) : null; })(),
  rawFrameMaxMs: metrics.aborted ? null : Math.max(0, ...metrics.beats.map((x) => x.result?.rawFrames?.maxMs || 0)),
  rawTimingVersion: 1,
  consoleErrors: counts.error, exceptions: counts.exception,
  columns: COLUMNS, asPlayed: colPlayed, freshCar: colFresh,
  handPlay: outcomes.filter((o) => o.outcome === 'hand-play').map((o) => o.id),
  freshReruns: outcomes.filter((o) => o.fresh?.freshRun).length,
  wrongVehicleBeats: wrongVehicle.filter((w) => w.played && !w.played.ok).length,
  wrongVehicleFresh: wrongVehicle.filter((w) => w.fresh && !w.fresh.ok).length,
  wrongVehicle,
  audioRows: audioLog.length,
  botHandbrakes: outcomes.reduce((a, o) => a + (o.bot?.handbrakes || 0) + (o.fresh?.freshRun ? o.fresh.bot?.handbrakes || 0 : 0), 0),
};
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1));
fs.writeFileSync(path.join(OUT, 'outcomes.json'), JSON.stringify(outcomes, null, 1));
fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots, null, 1));
fs.writeFileSync(path.join(OUT, 'console.log'), consoleLog.join('\n') + '\n' + (serverErr.length ? '\n## tools/serve.mjs stderr\n' + serverErr.join('\n') + '\n' : ''));
fs.writeFileSync(path.join(OUT, 'transcript.txt'), transcript.map((b) => `## ${b.beat}\n` + b.texts.map((x) => `[${x.t}s ${x.el}] ${x.text.replace(/\n+/g, ' / ')}`).join('\n')
  + (b.audio?.length ? `\n\n### audio ${b.beat} (one row a second: vehicle, km/h, engine rpm, firing pitch, load, radio, cues)\n` + b.audio.map(audioLine).join('\n') : '')).join('\n\n') + '\n');
fs.writeFileSync(path.join(OUT, 'audio.csv'), ['beat,t,car,kmh,rpm,pitchHz,load,ctx,cabin,siren,radio,music,cues,engDb,sirenDb,copM', ...audioLog.map((r) => [r.beat, r.t, r.car, r.kmh, r.rpm, r.pitchHz, r.load, r.ctx, r.cabin ? 1 : 0, r.siren ? 1 : 0, csvCell(r.radio), r.music, csvCell((r.cues || []).join('; ')), r.engDb ?? '', r.sirenDb ?? '', r.copM ?? ''].join(','))].join('\n') + '\n');
const h = metrics.headline;
const vcell = (o) => (o?.bot?.vehicle || o?.vehicle?.got || '-') + (o?.vehicle && !o.vehicle.ok ? ' (WRONG)' : '');
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), [
  `# Evidence pack ${path.basename(OUT)}`, '',
  ...(exitCode ? [`**Run FAILED (exit ${exitCode})**${metrics.aborted ? ': ' + metrics.aborted : ''}. Beat errors: ${metrics.beats.filter((x) => x.result?.error).map((x) => (x.id || x.beat) + ' (' + x.result.error.slice(0, 80) + ')').join(', ') || 'none'}.`, ''] : []),
  `Plan **${plan.name}** on \`${entry}\`, warp ${warp}, ${VW}x${VH}, ${metrics.wallMinutes} min wall time. Host: ${metrics.host}.`, '',
  ...(metrics.skipped?.length ? [`Not played (--stop-after): ${metrics.skipped.join(', ')}.`, ''] : []),
  '## Headline', '',
  `- Menu in ${h.menuSecs} s; new game to first control ${h.newGameToControlSecs} s through ${h.openingCards} card(s).`,
  `- Input: throttle answers a real W in ${h.throttleLatencyMs} ms, the truck moves in ${h.moveLatencyMs} ms.`,
  `- Missions: ${h.missionsPlayed} played, ${h.missionsDoneUnassisted} done by the bot alone, ${h.missionsDoneAssisted} done with help, ${h.missionsFailed} not done. Mean ${h.meanMissionMinutes} min each.`,
  `- Worst mean fps over a beat: ${h.fpsMeanWorst}${metrics.gl === 'metal' ? '' : ' (' + metrics.gl + ')'}. Console errors ${h.consoleErrors}, exceptions ${h.exceptions}.`, '',
  `- Raw full-beat maximum frame gap: ${h.rawFrameMaxMs} ms. Includes setup, seed, loading, first draw and gaps >=5 s; no positive gap filtering. Per-beat thresholds are in metrics.json.`, '',
  '## Vehicle truth', '',
  h.wrongVehicleBeats || h.wrongVehicleFresh
    ? `- FAIL ${WRONG_VEHICLE}: ${h.wrongVehicleBeats} beat(s) started outside the intended vehicle as played, ${h.wrongVehicleFresh} on a fresh run. ` + h.wrongVehicle.map((w) => `${w.beat} (in ${w.played && !w.played.ok ? w.played.got : w.fresh?.got}, wanted ${(w.played || w.fresh).want})`).join(', ') + '.'
    : '- Every beat started in its intended vehicle.', `- Audio log: ${h.audioRows} rows (one a second) in transcript.txt and audio.csv.`, '',
  '## Two columns', '',
  'As played: damage and money carry from the beat before. Fresh car: the same job at damage 0, rerun only when the played start was not already a fresh truck (else the played run counts for both). Fresh car is the game\'s own fail rate; the gap between the two is what the summer carried in.', '',
  '| column | done | unassisted | failed | fail rate | causes |', '|---|---|---|---|---|---|',
  ...[['as played', h.asPlayed], ['fresh car', h.freshCar]].map(([n, t]) => `| ${n} | ${t.done}/${t.played} | ${t.doneUnassisted} | ${t.fail} | ${t.failRate == null ? '-' : Math.round(t.failRate * 100) + ' %'} | ${Object.entries(t.causes).map(([c, k]) => c + ' ' + k).join(', ') || '-'} |`),
  '', h.handPlay.length ? `Hand-play only (not played by the bot, not counted): ${h.handPlay.join(', ')}.` : '', `Fresh reruns: ${h.freshReruns}. Bot handbrake pulls on corners over 60 degrees: ${h.botHandbrakes}.`, '',
  '## Missions', '', '| id | title | as played | vehicle | start dmg | fresh car | fresh vehicle | min | stages | assists | why |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...outcomes.map((o) => `| ${o.id} | ${o.title || ''} | ${o.harness ? o.harness + ', ' : ''}${o.cause || failCause(o)} | ${vcell(o)} | ${o.damageStart != null ? Math.round(o.damageStart) : ''} | ${o.fresh ? (o.fresh.sameAsPlayed ? 'same' : o.fresh.cause || failCause(o.fresh)) : '-'} | ${o.fresh && !o.fresh.sameAsPlayed ? vcell(o.fresh) : '-'} | ${o.minutes} | ${o.stages.length} | ${o.assists.map((a) => a.kind + '@' + a.idx).join(' ') || '-'} | ${(o.why || o.fresh?.why || '').replace(/\n/g, ' ').slice(0, 80)} |`),
  '', '## Files', '', '- `shots/` screenshots in play order (`shots.json` says what each is); `shots/*-seq-*/` frame sequences', '- `metrics.json` every beat\'s numbers; `outcomes.json` per mission', '- `transcript.txt` every overlay text the player saw, by beat, then that beat\'s audio log', '- `audio.csv` the audio log as one table (no sound files: the pack carries none)', '- `console.log` console errors and exceptions', '',
  'An assist means the bot, not the game, needed help (teleported near a target it could not drive to, or handed cash). Reviewers judge the stage from the screenshots and transcript either way; METHOD.md says how to weigh it.', '',
].join('\n'));
say(`pack written: ${OUT}`);
await closeAll(exitCode);
