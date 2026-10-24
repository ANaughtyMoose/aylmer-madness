// B-13b self-check beat: the stvincent hitch, measured where it happened.
//
// The full packs put the worst frame of the sauna job (683 ms, 517 ms) within
// half a second of stage 1 starting, then a few 100-300 ms frames during the
// hot drive. This beat replays exactly that moment without the 10 km drive:
// seed the job, put the truck on Sayyad's kerb, hold E for the plank, and time
// every rAF gap from the E press to 6 s into the heat stage. Then it pushes the
// cab heat to the levels that turn the screen effect on (blur, glow, wobble)
// and times plain driving frames and the harness's own screenshots at each.
// Optional vehicle per plan entry ({ "drive": "cart", "vehicle": false } plays it in the
// cart, the vehicle the full pack's played column was in).
//
// Returns per-window { n, maxMs, over33, over250 } and asserts the In-task
// bar: no frame over 250 ms anywhere in the transition or the hot drive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BAR_MS = 250;

export async function run(page, assert) {
  const { evaluate, sleep, shot, say } = page;
  const vehicle = page.beat.drive || 'ranger';
  const out = { vehicle, windows: {} };

  const begin = (label) => evaluate(`window.__rawTiming.begin(${JSON.stringify('b13b:' + label)})`);
  const end = async (id, key) => {
    const r = await evaluate(`window.__rawTiming.end(${JSON.stringify(id)})`);
    const w = { n: r.n, maxMs: +(r.maxMs || 0).toFixed(1), over33: r.over33Count, over250: r.over250Count,
      worst: (r.worst || []).slice(0, 3).map((x) => +x.dtMs.toFixed(1)) };
    out.windows[key] = w;
    say(`  B-13b ${key}: n ${w.n}, max ${w.maxMs} ms, over33 ${w.over33}, over250 ${w.over250}`);
    return w;
  };
  const clearCards = async () => {
    for (let i = 0; i < 12; i++) {
      const up = await evaluate('window.__RV.cardUp()');
      if (!up) return;
      await page.tap('Enter'); await sleep(700);
    }
  };

  // Long-animation-frame attribution: for every frame over 100 ms, how much of it
  // was script (and whose), style and layout, or nothing the page did (the GPU,
  // the compositor, a screenshot, a collector pause).
  await evaluate(`(() => { window.__b13bLoaf = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 100) window.__b13bLoaf.push({
      t: Math.round(e.startTime), ms: Math.round(e.duration), blockingMs: Math.round(e.blockingDuration || 0),
      renderStart: Math.round((e.renderStart || 0) - e.startTime), styleLayoutStart: Math.round((e.styleAndLayoutStart || 0) - e.startTime),
      scripts: (e.scripts || []).map((x) => ({ ms: Math.round(x.duration), fn: x.sourceFunctionName || '', src: (x.sourceURL || '').split('/').slice(-2).join('/'), invoker: x.invoker || '', type: x.invokerType || '' })).sort((a, b) => b.ms - a.ms).slice(0, 4) });
    }).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) { window.__b13bLoaf.push({ error: e.message }); } })()`);
  // 1. The job, seeded as the full plan seeds it, in the asked vehicle.
  const seed = await page.seedFor('stvincent');
  assert(seed && seed.ok, 'stvincent seeds');
  if (vehicle !== 'ranger') {
    const cs = await page.carState();
    await page.setCar({ ...cs, vehicle });
  }
  await sleep(1500);
  out.vehicleGot = await page.vehicle();
  assert.equal(out.vehicleGot, vehicle, 'in the asked vehicle');
  const ok = await evaluate(`window.AYLMER.start('stvincent')`);
  assert(ok !== false, 'stvincent starts');
  await sleep(800); await clearCards();
  // 2. On Sayyad's kerb, stopped.
  const tgt = await evaluate(`(() => { const m = window.AYLMER.G.mission; return m && m.idx === 0 && m.target ? { x: m.target.x, z: m.target.z } : null; })()`);
  assert(tgt, 'stage 0 has a target');
  if (!tgt) return out;
  await evaluate(`window.AYLMER.teleport(${tgt.x}, ${tgt.z}, window.AYLMER.G.veh.yaw)`);
  await sleep(3000); await clearCards();

  // Optional CPU profile of the transition and the hot drive (plan entry { "profile": true }):
  // written to references/review/b13b-profiles/ for offline reading.
  const prof = !!page.beat.profile;
  if (prof) { await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 500 }); await page.send('Profiler.start'); }
  // 3. Hold E for the plank and time everything to 6 s into the heat stage.
  let id = await begin('transition');
  await evaluate(`window.__RV.hold('KeyE', true)`);
  let idx = 0;
  for (let i = 0; i < 60 && idx < 1; i++) { await sleep(150); idx = await evaluate('window.AYLMER.G.mission ? window.AYLMER.G.mission.idx : -1'); }
  await evaluate(`window.__RV.hold('KeyE', false)`);
  assert.equal(idx, 1, 'the plank is on the dash (stage 1)');
  await sleep(6000);
  const tr = await end(id, 'transition');
  assert(tr.maxMs <= BAR_MS, `stage 0 to 1 transition: max frame ${tr.maxMs} ms <= ${BAR_MS}`);

  // 4. The hot drive, at the heat levels where the effect changes: rolling
  // frames, then a harness screenshot (what the full pack does every 30 s).
  const hot = [];
  for (const heat of [0.1, 0.6, 1]) {
    await evaluate(`(() => { const h = window.AYLMER.G.sauna; if (h) { h.s.heat = ${heat}; h.s.over = 0; } })()`);
    await evaluate(`window.__RV.hold('KeyW', true)`);
    id = await begin('roll-' + heat);
    await sleep(2500);
    const roll = await end(id, `roll@${heat}`);
    id = await begin('shot-' + heat);
    await shot(`b13b-heat-${heat}`);
    await sleep(800);
    const sh = await end(id, `shot@${heat}`);
    await evaluate(`window.__RV.hold('KeyW', false)`);
    hot.push(roll.maxMs, sh.maxMs);
    await sleep(1500);
  }
  if (prof) {
    const { profile } = await page.send('Profiler.stop');
    // Private evidence folder, by absolute path (never inside a worktree).
    const dir = path.join(os.homedir(), 'Desktop', 'Coding Projects', 'aylmer-madness', 'references', 'review', 'b13b-profiles');
    fs.mkdirSync(dir, { recursive: true });
    out.profileFile = path.join(dir, `b13b-${vehicle}-${Date.now()}.cpuprofile`);
    fs.writeFileSync(out.profileFile, JSON.stringify(profile));
  }
  const hotMax = Math.max(...hot);
  out.hotMaxMs = hotMax;
  assert(hotMax <= BAR_MS, `hot drive: max frame ${hotMax} ms <= ${BAR_MS}`);
  out.maxMs = Math.max(tr.maxMs, hotMax);
  out.longFrames = await evaluate('window.__b13bLoaf');
  for (const f of out.longFrames || []) say('  B-13b long frame ' + JSON.stringify(f).slice(0, 400));
  await evaluate(`window.__RV.release(); window.AYLMER.G.mission && window.AYLMER.abandon()`);
  await sleep(1500); await clearCards();
  return out;
}
