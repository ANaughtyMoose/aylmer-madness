// Offline coverage for failure honesty and GL query lifetime, no browser/GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync, execFileSync } from 'node:child_process';
import { percentile, drift, summarizeTiming, rowFailures, claimOutput, atomicJson, takeLock, buildIdentity, PERF_LOCK, workloadFailures, finalizeMemoryReport } from './qa/lib/perf-core.mjs';
import { RESOURCE_SCRIPT, SUSPEND_NATIVE_SCRIPT, timingScript, preserveTrafficScript, PLACE } from './qa/lib/perf-instrument.mjs';
import { reservedPorts, display, DISPLAYS } from './qa/lib/perf-runtime.mjs';
import { QUALITY } from '../src/game/options.js';

let checks = 0;
const check = (label, run) => { run(); checks++; console.log('ok', label); };
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-smoke-perf-'));
try {
  check('ports refuse player servers and shared legacy debugger', () => {
    assert.deepEqual(reservedPorts({}, {}), { srv: 8244, cdp: 9544 });
    assert.throws(() => reservedPorts({ 'server-port': 8141 }, {}), /8240-8299/);
    assert.throws(() => reservedPorts({ 'cdp-port': 9222 }, {}), /9540-9599/);
  });
  check('perf draws at the M4 Air backbuffer by default; legacy is the old 1088x680', () => {
    // gl.js resize: CSS size x min(devicePixelRatio, tier dpr cap) x tier render scale.
    const bb = (d, t) => { const k = Math.min(d.dpr, QUALITY[t].dpr) * QUALITY[t].scale; return [Math.round(d.w * k), Math.round(d.h * k)]; };
    assert.equal(display().name, 'air');
    assert.deepEqual(bb(display(), 'med'), [1874, 1219]);
    assert.deepEqual(bb(display('legacy'), 'med'), [1088, 680]);
    assert.deepEqual(bb(DISPLAYS.air, 'high'), [2940, 1912]);
    assert.throws(() => display('phone'), /--display must be/);
  });
  check('percentiles and drift exclude incomplete windows', () => {
    assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(percentile([], 0.5), null);
    const rows = [10, 10, 10, 11, 11, 11].map((p50) => ({ complete: true, interval: { p50 } }));
    assert.equal(drift(rows).pass, true); assert.equal(drift(rows).percent, 10);
    assert.equal(drift([...rows.slice(0, 3), ...[12, 12, 12].map((p50) => ({ complete: true, interval: { p50 } }))]).pass, false);
    assert.equal(drift([{ complete: true, interval: { p50: 1 } }, { complete: false, interval: { p50: 2 } }]).pass, false);
  });
  const out = path.join(temp, 'run.json');
  check('outputs cannot overwrite an earlier run', () => {
    claimOutput(out); atomicJson(out, { status: 'running', rows: [{ status: 'pending' }] });
    assert.throws(() => claimOutput(out), { code: 'EEXIST' });
    assert.equal(claimOutput(out, true).rows[0].status, 'pending');
    assert.equal(fs.readdirSync(temp).filter((f) => f.endsWith('.tmp')).length, 0);
  });
  const lockPath = path.join(temp, 'test.lock');
  fs.mkdirSync(lockPath);
  const owner = { pid: process.pid, token: 'live-old', since: '2000-01-01T00:00:00Z' };
  fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify(owner));
  await assert.rejects(takeLock({ lock: lockPath, waitMs: 0, onWait: () => {} }), /wait expired/); checks++;
  check('a live old lock is never stolen', () => { assert.deepEqual(JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'))), owner); });
  fs.unlinkSync(path.join(lockPath, 'owner.json')); fs.rmdirSync(lockPath);
  const dead = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  fs.mkdirSync(lockPath); fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: dead.pid, token: 'dead', since: new Date().toISOString() }));
  const lock = await takeLock({ lock: lockPath, waitMs: 0, onWait: () => {} });
  check('a proven dead owner is recoverable without an age guess', () => { assert.equal(JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'))).pid, process.pid); lock.release(); assert.equal(fs.existsSync(lockPath), false); });
  check('default lock is outside the worktree', () => { assert.equal(PERF_LOCK.includes('wt-'), false); });

  const repo = path.join(temp, 'repo'); fs.mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); fs.writeFileSync(path.join(repo, 'code.js'), 'one'); git('add', 'code.js'); git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'fixture');
  const a = buildIdentity(repo); fs.writeFileSync(path.join(repo, 'code.js'), 'two'); const b = buildIdentity(repo);
  check('dirty source changes alter exact build fingerprint', () => { assert.notEqual(a.fingerprint, b.fingerprint); assert.equal(a.dirty, false); assert.equal(b.dirty, true); });
  fs.writeFileSync(path.join(repo, 'pending.js'), 'new'); const c = buildIdentity(repo);
  check('untracked code is included but own output can be excluded', () => {
    assert.notEqual(b.fingerprint, c.fingerprint);
    fs.writeFileSync(path.join(repo, 'own.json'), '{}');
    assert.equal(buildIdentity(repo, [path.join(repo, 'own.json')]).fingerprint, c.fingerprint);
  });
  check('reference symlinks are fingerprinted without reading their targets', () => {
    fs.symlinkSync(path.join(temp, 'missing-private-reference'), path.join(repo, 'references-link'));
    const identity = buildIdentity(repo);
    assert.equal(identity.untracked.find((f) => f.path === 'references-link').kind, 'symlink');
  });

  function fakePage({ available = false, disjoint = false, timer = true, maxPending = 128, native = false, install = true } = {}) {
    let clock = 100, id = 0;
    let active = null, error = 0;
    const live = new Set(), deleted = [], ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
    const gl = { QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4, CURRENT_QUERY: 5, NO_ERROR: 0, INVALID_OPERATION: 1282, available, disjoint,
      getExtension: () => ext, createQuery() { const q = { id: ++id }; live.add(q); return q; },
      beginQuery(target, q) { if (active) { error = this.INVALID_OPERATION; return; } active = q; q.ended = false; },
      endQuery() { if (!active) { error = this.INVALID_OPERATION; return; } active.ended = true; active = null; },
      getQuery() { return active; }, getError() { const value = error; error = 0; return value; }, flush() {},
      deleteQuery(q) { assert.equal(live.has(q), true, 'query deleted exactly once'); live.delete(q); deleted.push(q); },
      getParameter() { return this.disjoint; }, getQueryParameter(q, which) { return which === 3 ? this.available && q.ended : 2e6; }, isContextLost: () => false };
    const r = { gl, gpuBytes: 1000, stats: { tris: 100, draws: 2 }, begin() { clock += 1; }, end() { clock += 1; } };
    if (native) {
      r._timer = ext; r._q = [gl.createQuery(), gl.createQuery(), gl.createQuery(), gl.createQuery()]; r._qHead = 0; r._qCount = 0; r._qActive = false;
      r.begin = function () {
        clock += 1; if (!this._timer) return;
        while (this._qCount && gl.getQueryParameter(this._q[this._qHead], gl.QUERY_RESULT_AVAILABLE)) {
          gl.getQueryParameter(this._q[this._qHead], gl.QUERY_RESULT); this._qHead = (this._qHead + 1) % 4; this._qCount--;
        }
        if (this._qCount < 4) { gl.beginQuery(ext.TIME_ELAPSED_EXT, this._q[(this._qHead + this._qCount) % 4]); this._qActive = true; }
      };
      r.end = function () { clock += 1; if (this._qActive) { gl.endQuery(ext.TIME_ELAPSED_EXT); this._qActive = false; this._qCount++; } };
    }
    const original = { begin: r.begin, end: r.end };
    const context = vm.createContext({ window: { AYLMER: { G: { renderer: r } } }, performance: { now: () => clock }, console, setTimeout });
    const installNow = () => vm.runInContext(timingScript({ timer, maxPending }), context);
    if (install) installNow();
    const frame = () => { clock += 10; r.begin(); r.end(); };
    return { get p() { return context.window.__qa?.perf; }, r, gl, live, deleted, frame, original, context, installNow, advance(ms) { clock += ms; }, ext };
  }
  check('active-target mock rejects nested elapsed queries and unmatched ends', () => {
    const { gl, ext } = fakePage();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, gl.createQuery()); gl.beginQuery(ext.TIME_ELAPSED_EXT, gl.createQuery());
    assert.equal(gl.getError(), gl.INVALID_OPERATION); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.endQuery(ext.TIME_ELAPSED_EXT);
    assert.equal(gl.getError(), gl.INVALID_OPERATION);
  });
  for (const timer of [true, false]) {
    const f = fakePage({ native: true, install: false, available: true, timer });
    f.frame(); assert.equal(f.r._qCount, 1);
    assert.throws(f.installNow, /native timing must be suspended/);
    const state = await vm.runInContext(SUSPEND_NATIVE_SCRIPT, f.context);
    assert.equal(state.drained, 1); assert.equal(f.r._qCount, 0); assert.equal(f.r._timer, null);
    f.installNow(); f.p.reset(3); f.frame(); f.frame(); f.frame(); f.p.stop();
    assert.equal(f.p.query.created, timer ? 3 : 0); assert.equal(f.gl.getError(), 0);
    assert.equal(f.r._qCount, 0); assert.equal(f.live.size, 4, 'only suspended native ring remains');
    f.p.dispose(); assert.equal(f.r._timer, f.ext); f.frame(); assert.equal(f.gl.getError(), 0);
    checks++; console.log('ok native ring drained, suspended and restored with external timer ' + timer);
  }
  {
    const f = fakePage({ native: true, install: false }); f.frame();
    setTimeout(() => { f.gl.available = true; }, 1);
    const state = await vm.runInContext(SUSPEND_NATIVE_SCRIPT, f.context);
    check('native suspension waits for an outstanding result before installing', () => {
      assert.equal(state.drained, 1); assert.equal(f.r._qCount, 0); assert.equal(f.gl.getError(), 0);
    });
    f.installNow(); f.p.dispose();
  }
  {
    const f = fakePage({ native: true, install: false, available: true }); f.r.begin();
    assert.equal(f.r._qActive, true);
    await vm.runInContext(SUSPEND_NATIVE_SCRIPT, f.context);
    check('native active query is ended exactly once before suspension', () => {
      assert.equal(f.r._qActive, false); assert.equal(f.r._qCount, 0); assert.equal(f.gl.getQuery(), null); assert.equal(f.gl.getError(), 0);
    });
    f.installNow(); f.p.dispose();
  }
  check('reset deletes all unavailable timer queries instead of losing handles', () => {
    const { p, live, frame } = fakePage();
    p.reset(3); frame(); frame(); frame();
    assert.equal(p.n, 3); assert.equal(live.size, 3); assert.equal(p.query.pending, 3);
    p.reset(2); assert.equal(live.size, 0); assert.equal(p.query.resetDeleted, 3);
    frame(); frame(); p.dispose(); assert.equal(live.size, 0); assert.equal(p.query.created, p.query.deleted);
  });
  check('collection drains queries after measurement stops and caps frames exactly', () => {
    const { p, gl, live, frame } = fakePage();
    p.reset(3); for (let i = 0; i < 5; i++) frame();
    assert.equal(p.n, 3); assert.equal(p.cpu.length, 3); assert.equal(p.interval.length, 2);
    gl.available = true; assert.equal(p.stop(), 0);
    assert.equal(p.gpu.length, 3); assert.equal(live.size, 0);
    const row = { ...summarizeTiming(p.collect()), pageErrors: [] };
    assert.deepEqual(rowFailures(row, { frames: 3 }), []);
    row.gpuSamples = 2; assert.match(rowFailures(row, { frames: 3 }).join(' '), /incomplete GPU/);
    row.pageErrors.push('error'); assert.match(rowFailures(row, { frames: 3 }).join(' '), /page errors/);
  });
  check('disjoint query samples are discarded and cannot pass budget validation', () => {
    const { p, gl, live, frame } = fakePage(); p.reset(2); frame(); gl.disjoint = true; frame();
    assert.equal(live.size, 0); assert.equal(p.gpu.length, 0); assert.ok(p.query.disjointDeleted > 0);
    assert.match(rowFailures({ ...summarizeTiming(p.collect()), pageErrors: [] }, { frames: 2 }).join(' '), /disjoint/);
  });
  check('slow GPU is bounded and missing samples remain a failure', () => {
    const { p, live, frame } = fakePage({ maxPending: 2 }); p.reset(4); for (let i = 0; i < 4; i++) frame();
    assert.equal(live.size, 2); assert.equal(p.query.capSkipped, 2);
    assert.match(rowFailures({ ...summarizeTiming(p.collect()), pageErrors: [] }, { frames: 4 }).join(' '), /unresolved/); p.dispose();
  });
  check('timer-off control creates no GL queries and disposal restores renderer', () => {
    const { p, live, frame, r, original } = fakePage({ timer: false }); p.reset(2); frame(); frame();
    assert.equal(live.size, 0); assert.equal(p.query.created, 0); assert.equal(p.cpu.length, 2);
    p.dispose(); assert.equal(r.begin, original.begin); assert.equal(r.end, original.end);
  });
  check('continuous rollover preserves boundary interval and late GPU ownership', () => {
    const f = fakePage(); f.p.reset(100); f.frame(); f.frame();
    const first = f.p.rotate(); assert.equal(f.p.on, true); f.advance(50); f.frame();
    assert.equal(f.p.interval.length, 1, 'first interval in new window crosses collection boundary');
    assert.equal(f.p.interval[0], 62, 'collection work is included in interval');
    assert.equal(f.p.takeWindow(first.id).ready, false);
    f.gl.available = true;
    const old = f.p.takeWindow(first.id); assert.equal(old.ready, true); assert.equal(old.timing.n, 2); assert.equal(old.timing.gpu.length, 2);
    assert.equal(f.p.gpu.length, 1, 'new-window GPU result not assigned to old window');
    const last = f.p.rotate(false), end = f.p.takeWindow(last.id);
    assert.equal(end.timing.expectedIntervals, 1); assert.equal(end.timing.interval.length, 1);
    f.p.releaseSamples(); assert.equal(f.p.n, 0); assert.equal(f.p.interval.length, 0); assert.equal(f.p.gpu.length, 0);
    f.p.dispose();
  });
  check('GL errors cannot pass a frame budget', () => {
    const f = fakePage({ available: true }); f.p.reset(2); f.frame(); f.frame(); f.gl.endQuery(); f.p.stop();
    const row = summarizeTiming(f.p.collect()); assert.match(rowFailures(row, { frames: 2 }).join(' '), /GL errors/); f.p.dispose();
  });
  const cars = [{ id: 1 }, { id: 2 }], trafficContext = vm.createContext({ window: { AYLMER: { G: { traffic: { cars } } } } });
  await vm.runInContext(preserveTrafficScript('(async () => { window.AYLMER.G.traffic.cars.length = 0; })()'), trafficContext);
  check('photo clear preserves full traffic population and identities', () => { assert.equal(cars.length, 2); assert.deepEqual(cars.map((c) => c.id), [1, 2]); });
  check('workload changes and late errors cannot receive soak acceptance', () => {
    const s = { mode: 'drive', cinemaActive: false, quality: 'med', traffic: { expected: 35, actual: 35 }, world: { sectors: 'aylmer', resident: 100 }, position: { x: 0, z: 0 } };
    assert.deepEqual(workloadFailures(s, { tier: 'med', reference: s }), []);
    assert.ok(workloadFailures({ ...s, traffic: { expected: 35, actual: 0 } }, { tier: 'med' }).length);
    assert.ok(workloadFailures({ ...s, position: { x: 5, z: 0 } }, { reference: s }).length);
    const r = { params: { mode: 'soak', timer: true, minutes: 30, warmupSeconds: 60, windowSeconds: 60 }, completed: true, buildConsistent: true, pageErrors: [], drift: { pass: true }, windows: [{ pass: true }], workloadFailures: [] };
    finalizeMemoryReport(r); assert.equal(r.acceptancePass, true);
    r.pageErrors.push('late cleanup failure'); finalizeMemoryReport(r); assert.equal(r.acceptancePass, false); assert.equal(r.pass, false);
    r.pageErrors = []; r.params.timer = false; finalizeMemoryReport(r); assert.equal(r.acceptanceEligible, false); assert.equal(r.acceptancePass, false);
  });
  {
    const events = [], G = { world: { sectors: { async update() { events.push('ready'); } } }, veh: {} };
    const Q = { perf: {}, noDraw(on) { events.push(on ? 'suppress' : 'draw'); }, setEnv() {}, camera() {} };
    const A = { G, async teleport() { events.push('teleport'); await Promise.resolve(); events.push('prewarm'); }, step() { events.push('step'); }, render() {} };
    const c = vm.createContext({ window: { AYLMER: A, __qa: Q }, setTimeout });
    await vm.runInContext(PLACE({ id: 'test', kind: 'chase', x: 0, z: 0, yaw: 0 }, {}, 1), c);
    check('teleport readiness and GPU prewarm precede suppressed settling', () => {
      assert.ok(events.indexOf('prewarm') < events.indexOf('suppress')); assert.ok(events.indexOf('ready') < events.indexOf('step'));
      assert.equal(events[0], 'draw'); assert.equal(events.at(-1), 'draw');
    });
  }
  check('resource counters use explicit creation/deletion with no double deletion', () => {
    class GL { createBuffer() { return {}; } deleteBuffer() {} }
    const context = vm.createContext({ window: { WebGLRenderingContext: GL } });
    vm.runInContext(RESOURCE_SCRIPT, context);
    const gl = new GL(), x = gl.createBuffer(), y = gl.createBuffer(); gl.deleteBuffer(x); gl.deleteBuffer(x); gl.deleteBuffer(null);
    assert.equal(context.window.__qaResources.counts.Buffer.unbalanced, 1);
    gl.deleteBuffer(y); assert.equal(context.window.__qaResources.counts.Buffer.unbalanced, 0);
  });
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`${checks}/${checks} performance tooling checks passed`);
