#!/usr/bin/env node
// Isolated memory tour, or a real-time Metal soak with frame-time windows.
//   node tools/measure_memory.mjs [owned-local-url] [--drive 3]
//   node tools/measure_memory.mjs --soak-min=30 --window-seconds=60 --tier=med \
//     --pose=chase_fraser --env=noon --out=<new.json>
// Own server/CDP defaults: 8244/9544. The old external :9222 attachment is
// intentionally unsupported: neither player profiles nor live servers are used.
// A stopped soak cannot resume as one continuous run; its output stays intact.
import path from 'node:path';
import { ROOT, stamp, done, sleep } from './qa/lib/rig.mjs';
import { planStorage } from './storage_guard.mjs';
import { loadPoses, resolve } from './qa/lib/poses.mjs';
import { options, numberArg, buildIdentity, machine, claimOutput, atomicJson, takeLock, summarizeTiming, drift, rowFailures, workloadFailures, finalizeMemoryReport } from './qa/lib/perf-core.mjs';
import { reservedPorts, openRig, drainTiming, takeTimingWindow, onCleanup } from './qa/lib/perf-runtime.mjs';
import { SET_TIER, PLACE, snapshotScript } from './qa/lib/perf-instrument.mjs';

const args = options();
if (args.help) {
  console.log('measure_memory.mjs [owned-local-url] [--drive 3] [--soak-min=30 --window-seconds=60 --warmup-seconds=60 --pose=chase_fraser --env=noon --tier=med] [--timer=on|off] [--out=new.json]');
  done(0);
}
const POINTS = [['driveway', 932.9, 143.9], ['galeries', -18.9, -331.2], ['hull', 9510, -3364], ['champlain', 6311, -1107], ['parlement', 10668, -3330]];
let report, out, lock, rig, page, activeWindow;
let finished = false;
const persist = () => { if (report && out) { report.updatedAt = new Date().toISOString(); atomicJson(out, report); } };
onCleanup(() => {
  if (report && !finished) { report.status = 'interrupted'; report.completed = false; report.pass = false; report.acceptancePass = false; if (activeWindow) activeWindow.complete = false; persist(); }
  if (finished) lock?.release();
});
try {
  if (args.resume) throw new Error('a continuous soak cannot resume after a process or page restart; choose a new output file');
  if (args['wipe-origin'] || args['player-storage']) throw new Error('memory measurements require an isolated review namespace; storage override flags are not supported');
  const owned = reservedPorts(args);
  const argUrl = args._[0] || `http://127.0.0.1:${owned.srv}/index.html`;
  const u = new URL(argUrl);
  if (u.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(u.hostname) || Number(u.port) !== owned.srv || !['/index.html', '/prototype.html'].includes(u.pathname)) throw new Error('URL must identify index.html or prototype.html on this run\'s owned local server port');
  const plan = planStorage(argUrl, [], 'measure-memory');
  if (!plan.name) throw new Error('review namespace required');
  const soak = args['soak-min'] !== undefined;
  const minutes = numberArg('soak-min', args['soak-min'] ?? 30, 0.01);
  const windowSeconds = numberArg('window-seconds', args['window-seconds'] ?? 60, 1, 300);
  const warmupSeconds = numberArg('warmup-seconds', args['warmup-seconds'] ?? 60, 0, 300);
  const driveSeconds = numberArg('drive', args.drive ?? 3, 0, 120);
  const timer = (args.timer ?? 'on') === 'on';
  if (!['on', 'off'].includes(args.timer ?? 'on')) throw new Error('--timer must be on or off');
  const { jobs, tiers } = resolve(loadPoses(), args.pose ?? 'chase_fraser', args.env ?? 'noon', args.tier ?? 'med');
  if (jobs.length !== 1 || tiers.length !== 1) throw new Error('soak uses exactly one pose, environment and tier for a comparable start/end workload');
  const job = jobs[0], tier = tiers[0];
  out = path.resolve(args.out || path.join(ROOT, 'docs/qa/perf', `${stamp()}-${process.pid}-${soak ? 'soak' : 'memory'}.json`));
  lock = await takeLock({ task: soak ? 'memory-soak' : 'memory-tour', ports: Object.values(owned), waitMs: numberArg('lock-wait-min', args['lock-wait-min'] ?? 120, 0) * 60e3 });
  const build = buildIdentity(ROOT, [out]); claimOutput(out);
  report = { schema: 'aylmer-memory', version: 2, startedAt: new Date().toISOString(), build, status: 'waiting', completed: false, pass: false,
    params: { mode: soak ? 'soak' : 'tour', url: plan.url, ports: owned, minutes, windowSeconds, warmupSeconds, driveSeconds, timer, pose: job.pose, env: job.env, envId: job.envId, tier },
    machine: machine(), results: [], windows: [], pageErrors: [], fatal: null,
    note: 'Real wall-clock soak on uncapped ANGLE/Metal with normal simulation. Day-clock held; pose, residency, tier and full traffic population checked. Sampling continues across window collection/checkpoints. No forced GC inside measured windows. Both GC endpoints have empty timing arrays. GL counts are explicit create/delete balances, not driver allocations. Interrupted soaks are not resumable evidence.' };
  persist();
  report.lockWaitMs = lock.waitedMs; report.status = 'booting'; persist();
  rig = await openRig({ ...owned, timer });
  page = await rig.page(plan.url, { entry: u.pathname.includes('prototype') ? 'prototype' : 'index' });
  report.renderer = page.renderer; report.browser = rig.browser; report.boot = page.bootResult;
  await page.send('HeapProfiler.enable'); await page.send('Performance.enable');
  await page.eval(SET_TIER(tier), 300000);
  const snapshot = async (withTiming = false) => ({ ...await page.eval(snapshotScript(withTiming), 120000), heap: await page.send('Runtime.getHeapUsage'), performance: (await page.send('Performance.getMetrics')).metrics, machine: machine(), at: new Date().toISOString() });
  const gcHeap = async () => { await page.send('HeapProfiler.collectGarbage'); await sleep(300); await page.send('HeapProfiler.collectGarbage'); return page.send('Runtime.getHeapUsage'); };
  if (!soak) {
    report.status = 'tour'; persist();
    for (const [label, x, z] of POINTS) {
      await page.eval(PLACE({ id: label, kind: 'chase', x, z, yaw: 0, camera: 'chase' }, job.env, Math.round(driveSeconds * 60)), 600000);
      await sleep(500);
      const heap = await gcHeap(), s = await snapshot(true);
      const row = { point: label, heapMB: +(heap.usedSize / 1e6).toFixed(1), heapTotalMB: +(heap.totalSize / 1e6).toFixed(1), gpuMB: +(s.rendererGpuBytes / 1e6).toFixed(1), ...s, timing: undefined,
        glErrors: s.timing.glErrors, fails: [...workloadFailures(s, { tier }), ...(s.timing.glErrors.length ? ['GL errors'] : [])] };
      report.results.push(row); persist(); console.log(`${label}: heap ${row.heapMB} MB, GPU buffers ${row.gpuMB} MB`);
    }
    report.completed = report.results.length === POINTS.length; report.pass = report.completed && !page.errors.length;
  } else {
    await page.eval(PLACE(job.pose, job.env), 600000);
    // Freeze just the environment clock, not simulation time or frame pacing.
    await page.eval(`(() => { const G = window.AYLMER.G, value = G.dayClock; Object.defineProperty(G, 'dayClock', { configurable: true, get: () => value, set: () => {} }); return { dayClock: value, mode: G.mode }; })()`);
    report.status = 'warming'; persist();
    const warmUntil = performance.now() + warmupSeconds * 1000;
    while (performance.now() < warmUntil) await sleep(Math.min(1000, warmUntil - performance.now()));
    await drainTiming(page); await page.eval('window.__qa.perf.releaseSamples()');
    report.startHeapAfterGC = await gcHeap(); report.startSnapshot = await snapshot(true); report.status = 'soaking'; persist();
    report.workloadFailures = workloadFailures(report.startSnapshot, { tier });
    if (report.workloadFailures.length) throw new Error(report.workloadFailures.join('; '));
    const count = Math.ceil(minutes * 60 / windowSeconds);
    await page.eval('window.__qa.perf.reset(250000); true');
    const start = performance.now();
    report.measurementStartedAt = new Date().toISOString();
    for (let index = 0; index < count; index++) {
      const winStart = performance.now(), plannedMs = Math.min(windowSeconds, minutes * 60 - index * windowSeconds) * 1000;
      const row = { index: report.windows.length, startedAt: new Date().toISOString(), elapsedStartSeconds: (winStart - start) / 1000, plannedSeconds: plannedMs / 1000, complete: false };
      report.windows.push(row); activeWindow = row; persist();
      const until = winStart + plannedMs;
      while (performance.now() < until) await sleep(Math.min(1000, until - performance.now()));
      const rotated = await page.eval(`window.__qa.perf.rotate(${index + 1 < count})`);
      const d = await takeTimingWindow(page, rotated.id), s = await snapshot();
      Object.assign(row, summarizeTiming(d), { snapshot: s, elapsedEndSeconds: (performance.now() - start) / 1000, pageErrors: page.errors.slice(), finishedAt: new Date().toISOString(), tier });
      row.complete = d.n >= 2 && !d.capped && !d.contextLost && !d.windowPending && d.interval.length === d.expectedIntervals
        && (!timer || (d.ext && d.gpu.length === d.n && !d.disjoint)) && !d.glErrors.length && !page.errors.length;
      row.fullWindow = d.sampledSeconds >= windowSeconds;
      row.fails = [...rowFailures(row, { frames: d.n, timer }), ...workloadFailures(s, { tier, reference: report.startSnapshot })];
      if (d.sampledSeconds < plannedMs / 1000) row.fails.push('timing window shorter than requested');
      row.pass = row.complete && !row.fails.length;
      activeWindow = null; persist();
      console.log(`soak window ${row.index + 1}: ${(row.elapsedEndSeconds / 60).toFixed(2)} min, ${row.frames} frames, p50/p95 ${row.interval.p50}/${row.interval.p95} ms, heap ${(s.heap.usedSize / 2 ** 20).toFixed(1)} MiB, queries ${row.query.created}/${row.query.deleted}/${row.query.pending}`);
    }
    report.wallElapsedSeconds = (performance.now() - start) / 1000;
    report.elapsedSeconds = report.windows.reduce((sum, w) => sum + w.sampledSeconds, 0);
    await drainTiming(page); await page.eval('window.__qa.perf.releaseSamples()');
    report.endHeapAfterGC = await gcHeap(); report.endSnapshot = await snapshot(true);
    report.workloadFailures.push(...workloadFailures(report.endSnapshot, { tier, reference: report.startSnapshot }));
    report.retainedHeapGrowthBytes = report.endHeapAfterGC.usedSize - report.startHeapAfterGC.usedSize;
    report.drift = drift(report.windows.filter((w) => w.fullWindow));
    report.completed = report.elapsedSeconds >= minutes * 60 && report.windows.length === count && report.windows.every((w) => w.complete);
    console.log(`soak: ${report.elapsedSeconds.toFixed(1)} sampled seconds; p50 drift ${report.drift.percent ?? 'unmeasured'}%; final acceptance pending cleanup`);
  }
  report.pageErrors = rig.errors; if (report.pageErrors.length) report.pass = false;
  report.status = report.completed ? 'complete' : 'incomplete';
} catch (e) {
  console.error('MEMORY ERROR:', e.message);
  if (report) { report.fatal = e.message; report.completed = false; report.pass = false; report.acceptancePass = false; report.status = 'incomplete'; }
} finally {
  if (rig) { await rig.stop(); report.pageErrors = rig.errors; }
  if (report) {
    report.endedAt = new Date().toISOString(); report.machineEnd = machine();
    report.buildEnd = buildIdentity(ROOT, [out]); report.buildConsistent = report.buildEnd.fingerprint === report.build.fingerprint;
    if (!report.buildConsistent) { report.pass = false; report.acceptancePass = false; report.status = 'invalid'; report.fatal = 'source state changed during the run'; }
    finalizeMemoryReport(report);
    persist();
  }
  finished = true; lock?.release();
}
if (report) console.log(`memory: ${report.status}; wrote ${out}`);
done(report?.pass ? 0 : 1);
