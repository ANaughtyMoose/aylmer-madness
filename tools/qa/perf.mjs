#!/usr/bin/env node
// ANGLE/Metal performance baseline. --fresh creates a new page for EVERY
// pose/environment/tier row. Reused-page mode remains available for diagnosis.
// Output is checkpointed before and after every row; --resume never converts a
// partial run into a pass or reuses measurements from a different build.
//
// CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/qa/perf.mjs \
//   --poses=perf8 --env=noon,night,rain --tier=low,med,high --fresh --out=<new.json>
// --timer=off is a diagnostic control, never a complete GPU budget baseline.
// --display=air (default) draws at the M4 Air's real backbuffer (1470x956 CSS at
// DPR 2; 1874x1219 at med); --display=legacy is the old 1280x800 at DPR 1 (1088x680).
// Every row records the backbuffer it drew and its ms per Mpx.
import path from 'node:path';
import { ROOT, stamp, done, sleep } from './lib/rig.mjs';
import { loadPoses, resolve } from './lib/poses.mjs';
import { options, numberArg, buildIdentity, machine, claimOutput, atomicJson, takeLock, summarizeTiming, rowFailures } from './lib/perf-core.mjs';
import { reservedPorts, openRig, drainTiming, onCleanup, display } from './lib/perf-runtime.mjs';
import { SET_TIER, PLACE, SNAPSHOT } from './lib/perf-instrument.mjs';

const args = options();
if (args.help) {
  console.log('perf.mjs --poses=perf8 --env=noon,night,rain --tier=low,med,high --fresh --out=run.json [--resume] [--frames=600] [--timer=on|off] [--display=air|legacy] [--lock-wait-min=120] [--light=on|off]');
  done(0);
}
let report, out, rig, page, lock, activeRow, activeSession;
let finished = false;
const persist = () => { if (report && out) { report.updatedAt = new Date().toISOString(); atomicJson(out, report); } };
const collectErrors = () => {
  if (!report || !rig || !activeSession) return;
  activeSession.pageErrors = rig.errors;
  report.pageErrors = report.sessions.flatMap((s) => s.pageErrors || []);
};
onCleanup(() => {
  if (report && !finished) {
    report.status = 'interrupted'; report.completed = false; report.pass = false;
    if (activeRow?.status === 'running') { activeRow.status = 'interrupted'; activeRow.error = 'process ended before row completion'; }
    collectErrors(); persist();
  }
  // On abrupt exit the dead-owner recovery waits for both owned endpoints.
  if (finished) lock?.release();
});
try {
  const frames = numberArg('frames', args.frames ?? 600, 2, 100000);
  if (!Number.isInteger(frames)) throw new Error('--frames must be an integer');
  const gpuBar = numberArg('gpu-bar', args['gpu-bar'] ?? 12, 0.01, 12);
  const fresh = !!args.fresh, timer = (args.timer ?? 'on') === 'on';
  if (!['on', 'off'].includes(args.timer ?? 'on')) throw new Error('--timer must be on or off');
  const poseData = loadPoses();
  const { jobs, tiers: setTiers } = resolve(poseData, args.poses ?? 'perf8', args.env ?? null, args.tier ?? null);
  const tiers = setTiers || ['med'];
  if (!jobs.length || !tiers.length) throw new Error('nothing to measure');
  const view = display(args.display ?? 'air');
  // W8-LIGHT: « Éclairage avancé » for every page of the run (?light=on|off); the
  // review namespace never sees the player's own setting, so it is explicit here.
  const light = args.light ?? 'off';
  if (!['on', 'off'].includes(light)) throw new Error('--light must be on or off');
  const params = { poses: args.poses ?? 'perf8', env: args.env ?? null, tiers, frames, gpuBar, fresh, timer, display: view, light,
    jobs: jobs.map((j) => ({ pose: j.pose, envId: j.envId, env: j.env })), ports: reservedPorts(args) };
  out = path.resolve(args.out || path.join(ROOT, 'docs/qa/perf', `${stamp()}-${process.pid}.json`));
  // Serialize before reading or writing resumable output. A waiter must read
  // the final checkpoint, not an active writer's stale in-memory generation.
  lock = await takeLock({ task: args.task || 'perf', ports: Object.values(params.ports), waitMs: numberArg('lock-wait-min', args['lock-wait-min'] ?? 120, 0) * 60e3 });
  const build = buildIdentity(ROOT, [out]);
  const prior = claimOutput(out, !!args.resume);
  if (prior) {
    if (prior.schema !== 'aylmer-perf' || prior.version !== 2 || JSON.stringify(prior.params) !== JSON.stringify(params) || prior.build?.fingerprint !== build.fingerprint) throw new Error('resume rejected: schema, exact build, or parameters differ; use a new output file');
    if (prior.status === 'complete') throw new Error('run already complete; use a new output file for a repeat');
    report = prior;
    report.resumptions = [...(report.resumptions || []), { at: new Date().toISOString(), priorStatus: report.status }];
  } else {
    report = { schema: 'aylmer-perf', version: 2, startedAt: new Date().toISOString(), build, commit: build.commit, task: args.task ?? null, params,
      status: 'pending', completed: false, budgetEligible: timer, renderer: '', machine: machine(), sessions: [],
      budgets: { p95IntervalMs: 16.7, p95GpuPlusCpuMs: gpuBar, trisFrame: 450000, drawsFrame: 400 },
      note: 'Uncapped frame intervals. CPU covers renderer begin through end. GPU is a paired timer query over the same rendering work. Simulation time is included in interval, not CPU draw submission. GL resource counts are explicit create/delete balances, not driver memory.',
      results: tiers.flatMap((tier) => jobs.map((j) => ({ pose: j.pose.id, env: j.envId, tier, status: 'pending', attempts: [] }))), pageErrors: [], fatal: null };
  }
  report.status = 'waiting'; report.fatal = null; report.pass = false; report.completed = false; persist();
  report.status = 'running';
  const session = activeSession = { startedAt: new Date().toISOString(), lockWaitMs: lock.waitedMs, machine: machine(), browser: null, pageCount: 0, pageErrors: [] };
  report.sessions.push(session); persist();
  rig = await openRig({ ...params.ports, timer, view }); session.browser = rig.browser;
  console.log(`perf: ${report.results.length} rows, ${frames} frames, ${fresh ? 'fresh page per row' : 'reused page'}, ${timer ? 'GPU queries enabled' : 'timer-off diagnostic'}, display ${view.name} ${view.w}x${view.h} at DPR ${view.dpr}`);
  for (const row of report.results) {
    if (row.status === 'complete') continue;
    activeRow = row;
    // Keep any previous failed/interrupted attempt instead of hiding it.
    if (row.status !== 'pending') row.attempts.push({ status: row.status, error: row.error ?? null, pageErrors: row.pageErrors || [], startedAt: row.startedAt, finishedAt: row.finishedAt });
    row.status = 'running'; row.startedAt = new Date().toISOString(); delete row.error; row.machineStart = machine(); persist();
    let errorOffset = 0;
    try {
      if (!page) {
        page = await rig.page(`http://127.0.0.1:${params.ports.srv}/index.html?review=perf&light=${params.light}`);
        session.pageCount++; report.renderer = page.renderer;
        page.__number = session.pageCount; page.__tier = null;
      }
      errorOffset = page.__errorOffset || 0;
      row.page = { session: report.sessions.length, generation: page.__number, fresh: page.__number !== session.lastMeasuredPage, renderer: page.renderer, boot: page.bootResult };
      session.lastMeasuredPage = page.__number;
      if (page.__tier !== row.tier) { await page.eval(SET_TIER(row.tier), 300000); page.__tier = row.tier; }
      const job = jobs.find((j) => j.pose.id === row.pose && j.envId === row.env);
      await page.eval(PLACE(job.pose, job.env), 600000);
      await sleep(1500);
      const t0 = Date.now();
      await page.eval(`window.__qa.perf.reset(${frames}); true`);
      while (Number(await page.eval('window.__qa.perf.n', 120000)) < frames) {
        if (Date.now() - t0 > 600000) throw new Error('frame collection exceeded 10 minutes');
        await sleep(200);
      }
      await drainTiming(page);
      const snapshot = await page.eval(SNAPSHOT, 120000);
      const heap = await page.send('Runtime.getHeapUsage');
      // What gl.js really drew (devicePixelRatio cap x render scale x CSS size), and the cost per Mpx.
      const bb = await page.eval(`(() => { const c = window.AYLMER.G.renderer.canvas || document.getElementById('gl'); return { w: c.width, h: c.height, css: [c.clientWidth, c.clientHeight], devicePixelRatio: window.devicePixelRatio }; })()`);
      row.backbuffer = { ...bb, mpx: +(bb.w * bb.h / 1e6).toFixed(3) };
      Object.assign(row, summarizeTiming(snapshot.timing), { snapshot: { ...snapshot, timing: undefined }, jsHeapMB: +(heap.usedSize / 2 ** 20).toFixed(3), heap, seconds: +((Date.now() - t0) / 1000).toFixed(3), pageErrors: page.errors.slice(errorOffset) });
      row.perMpx = { intervalP50Ms: +(row.interval.p50 / row.backbuffer.mpx).toFixed(3), gpuPlusCpuP95Ms: row.gpuPlusCpu?.p95 != null ? +(row.gpuPlusCpu.p95 / row.backbuffer.mpx).toFixed(3) : null };
      row.fails = rowFailures(row, params); row.pass = !row.fails.length;
      row.status = 'complete'; row.finishedAt = new Date().toISOString(); row.machineEnd = machine(); page.__errorOffset = page.errors.length;
      console.log(`${row.pass ? 'ok' : 'MISS'} ${row.pose} ${row.env} ${row.tier}: p50/p95 ${row.interval.p50}/${row.interval.p95} ms, GPU+CPU p95 ${row.gpuPlusCpu?.p95 ?? 'unmeasured'}, pending queries ${row.query.pending}, ${row.backbuffer.w}x${row.backbuffer.h} (${row.backbuffer.mpx} Mpx)`);
    } catch (e) {
      row.status = 'error'; row.pass = false; row.error = e.message; row.finishedAt = new Date().toISOString();
      row.pageErrors = page?.errors.slice(errorOffset) || []; console.error(`ROW ERROR ${row.pose} ${row.env} ${row.tier}: ${e.message}`);
    } finally {
      if (page && (fresh || row.status === 'error')) { await page.close(); page = null; }
      collectErrors(); persist(); activeRow = null;
    }
  }
  report.completed = report.results.every((r) => r.status === 'complete');
  report.status = report.completed ? 'complete' : 'incomplete';
  report.pass = report.completed && timer && report.results.every((r) => r.pass) && !report.pageErrors.length;
} catch (e) {
  console.error('PERF ERROR:', e.message);
  if (report) { report.fatal = e.message; report.status = 'incomplete'; report.completed = false; report.pass = false; }
} finally {
  if (rig) { await rig.stop(); collectErrors(); }
  if (report) {
    report.endedAt = new Date().toISOString(); report.machineEnd = machine();
    report.buildEnd = buildIdentity(ROOT, [out]); report.buildConsistent = report.buildEnd.fingerprint === report.build.fingerprint;
    if (!report.buildConsistent) { report.pass = false; report.status = 'invalid'; report.fatal = 'source state changed during the run'; }
    if (report.pageErrors.length) report.pass = false;
    persist();
  }
  finished = true; lock?.release();
}
if (report) console.log(`perf: ${report.results.filter((r) => r.status === 'complete').length}/${report.results.length} measured; ${report.status}; budget pass ${!!report.pass}; wrote ${out}`);
const diagnosticOk = report && !report.params.timer && report.completed && report.buildConsistent && report.results.every((r) => r.pass) && !report.pageErrors.length;
done(report?.pass || diagnosticOk ? 0 : 1);
