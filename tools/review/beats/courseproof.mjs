// [w8-courseproof] Part A of the course proof (plan courseproof): medals, R rerun and
// the ghost on bz_vieux, Crash Night tries (result toast, record, calibration numbers),
// the church shortcut found and saved. Part B (courseproof-reload.mjs) reloads the page
// and checks what survived. Needs AYLMER.qa, so the page must be under ?review= (the
// harness always is). Waits count GAME seconds (G.time): SwiftShader runs at ~0.1x.
export const gameT = (evaluate) => evaluate('window.AYLMER.G.time');
export async function closeCards(page, n = 4) {
  for (let i = 0; i < n && (await page.evaluate('window.__RV.cardUp()')); i++) { await page.tap('Enter'); await page.sleep(700); }
}
// Poll `expr` (page JS returning truthy when done) until true, or `gameS` game seconds, or `wallS` wall seconds.
export async function until(page, expr, { gameS = 600, wallS = 3600, every = 400 } = {}) {
  const g0 = await gameT(page.evaluate), w0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr).catch(() => null);
    if (v) return v;
    if ((await gameT(page.evaluate)) - g0 > gameS || Date.now() - w0 > wallS * 1000) return null;
    await page.sleep(every);
  }
}
const J = (o) => JSON.parse(JSON.stringify(o ?? null));

// E on the grid until the race stage starts (count-in), then wait for GO.
async function go(page, label) {
  const { evaluate, tap, sleep, shot } = page;
  await until(page, 'window.AYLMER.qa.gate() && window.AYLMER.qa.gate().kind === "grid"', { gameS: 30, wallS: 300 });
  await shot(`${label}-grid`);
  for (let i = 0; i < 12; i++) {
    const g = await evaluate('window.AYLMER.qa.gate()');
    if (g && g.kind === 'race') break;
    await tap('KeyE');
    await until(page, 'window.AYLMER.qa.gate() && window.AYLMER.qa.gate().kind === "race"', { gameS: 4, wallS: 60 });
  }
  return until(page, 'window.AYLMER.qa.gate() && window.AYLMER.qa.gate().going', { gameS: 10, wallS: 300 });
}

export async function run(page, assert) {
  const { evaluate, shot, sleep, say, tap } = page;
  const b = page.beat;
  const id = b.course || 'bz_vieux';
  const out = { course: id };
  assert(await evaluate('!!(window.AYLMER.qa && window.AYLMER.qa.completeNextGate)'), 'AYLMER.qa is there under ?review=');
  out.storage = await evaluate('(() => { const S = window.AYLMER_STORAGE || {}; return { review: S.review, prefix: S.prefix }; })()');

  if (b.only === 'shortcut') return shortcutAndSave(page, assert, out);
  // ---------------------------------------------------------------- run 1
  if (await evaluate('!!window.AYLMER.job()')) { await evaluate('window.AYLMER.abandon()'); await sleep(1200); await closeCards(page); }
  const mark1 = await evaluate('window.__RV.texts.length');
  assert(await evaluate(`window.AYLMER.course(${JSON.stringify(id)})`), `course ${id} starts`);
  await sleep(1500);
  out.briefCard = await evaluate(`(document.querySelector('#cinematic:not(.hidden)')?.innerText || '').slice(0, 500)`);
  await shot('cp-run1-brief');
  await closeCards(page);
  const line = await evaluate(`(() => { const v = window.AYLMER.G.veh; return { x: +v.x.toFixed(1), z: +v.z.toFixed(1) }; })()`);
  assert(await go(page, 'cp-run1'), 'run 1: GO after E on the grid');
  await evaluate(`window.AYLMER.qa.follow({ kmh: ${b.kmh1 || 300} })`);
  const w1 = Date.now();
  const fin1 = await until(page, '!window.AYLMER.job()', { gameS: 300, wallS: 2400, every: 300 });
  await until(page, 'false', { gameS: 1.5, wallS: 30, every: 300 });   // the FINI toast lands after the line
  out.run1 = { finished: !!fin1, wallS: Math.round((Date.now() - w1) / 1000), follow: J(await evaluate('window.AYLMER.qa.followState()')), medal: J(await evaluate('window.AYLMER.medal()')) };
  await shot('cp-run1-finish');
  out.rerunOpen = J(await evaluate('window.AYLMER.G.rerun'));
  const texts1 = await evaluate(`window.__RV.texts.slice(${mark1}).map((x) => x.text)`);
  out.run1.lines = texts1.filter((t) => /\b(Or|Argent|Bronze)\b|record|fantôme|FINI|MEILLEUR/i.test(t)).slice(0, 12);
  say('  courseproof run1 ' + JSON.stringify(out.run1).slice(0, 400));
  assert(fin1, 'run 1 finishes the course');
  assert(out.run1.medal != null, 'AYLMER.medal() is not null after the finish');
  assert(out.run1.lines.some((t) => /\b(Or|Argent|Bronze)\b/.test(t)), 'the finish shows a medal line');
  assert(out.rerunOpen && out.rerunOpen.id === id, 'R window open after the finish');

  // ---------------------------------------------------------------- R within 10 s
  await tap('KeyR');
  const back = await until(page, `(() => { const j = window.AYLMER.job(); return j && j.id === ${JSON.stringify(id)} ? 1 : 0; })()`, { gameS: 8, wallS: 120, every: 200 });
  await sleep(400);
  out.afterR = J(await evaluate(`(() => { const A = window.AYLMER, v = A.G.veh; return { job: A.job(), x: +v.x.toFixed(1), z: +v.z.toFixed(1), card: window.__RV.cardUp(), gate: A.qa.gate(), ghost: A.ghost() }; })()`));
  out.afterR.fromLineM = +Math.hypot(out.afterR.x - line.x, out.afterR.z - line.z).toFixed(1);
  await shot('cp-after-R');
  assert(back, 'R restarts the course');
  assert(out.afterR.fromLineM < 15, `R puts the truck on the line (${out.afterR.fromLineM} m)`);
  assert(!out.afterR.card, 'no card after R');

  // ---------------------------------------------------------------- run 2 against the ghost
  const mark2 = await evaluate('window.__RV.texts.length');
  assert(await go(page, 'cp-run2'), 'run 2: GO');
  await evaluate(`window.AYLMER.qa.follow({ kmh: ${b.kmh2 || 200} })`);
  const ghosts = [];
  for (const at of [1.2, 2.5, 4]) {
    await until(page, `(window.AYLMER.qa.gate() || {}).raceT >= ${at} || !window.AYLMER.job()`, { gameS: 30, wallS: 600, every: 200 });
    ghosts.push({ at, ...J(await evaluate('window.AYLMER.ghost()')) });
    await shot(`cp-run2-ghost-${at}s`);
  }
  out.run2 = { ghosts };
  const fin2 = await until(page, '!window.AYLMER.job()', { gameS: 300, wallS: 2400, every: 300 });
  await until(page, 'false', { gameS: 4, wallS: 90, every: 300 });   // the FINI toast (medal + ghost line) lands ~2.4 s after the line
  out.run2.finished = !!fin2;
  out.run2.medal = J(await evaluate('window.AYLMER.medal()'));
  out.run2.lines = (await evaluate(`window.__RV.texts.slice(${mark2}).map((x) => x.text)`)).filter((t) => /\b(Or|Argent|Bronze)\b|record|fantôme|FINI/i.test(t)).slice(0, 12);
  await shot('cp-run2-finish');
  await evaluate('window.AYLMER.qa.follow(null)');
  say('  courseproof run2 ' + JSON.stringify(out.run2).slice(0, 500));
  assert(ghosts.some((g) => g.loaded && g.id === id), 'run 2: the ghost is loaded and playing');
  assert(fin2, 'run 2 finishes');
  assert(out.run2.lines.some((t) => /fantôme/i.test(t)), 'run 2: the finish names the ghost (« ... fantôme »)');
  await closeCards(page);

  // ---------------------------------------------------------------- Crash Night (calibration runs)
  out.crash = await crashNights(page, assert, b.nights || 2);

  return shortcutAndSave(page, assert, out);
}

async function shortcutAndSave(page, assert, out) {
  const { evaluate, sleep } = page;
  // ---------------------------------------------------------------- church shortcut, then save
  out.shortcut = await shortcut(page, assert);
  const snap = await evaluate('(() => { const s = window.AYLMER.quickSave(); return s ? window.AYLMER.G.slot : null; })()');
  out.savedSlot = snap;
  await sleep(1500);
  assert(!!snap, `saved to a slot (${snap})`);
  return out;
}

// One Crash Night per entry; each try waits `d` game seconds after GO, then aims full
// throttle at the junction offset `o` m sideways (+ right of the run-up line).
// `floor: true` is RESULTS.md pass 4's try: full throttle, no steering, from the line.
const PLANS = [
  [{ floor: true }, { d: 0, o: -3 }, { d: 1, o: 3 }],
  [{ d: 0, o: -5 }, { d: 0, o: 5 }, { d: 2, o: 3 }],
  [{ d: 4, o: 0 }, { d: 0.8, o: -3 }, { d: 2.5, o: -6 }],
  [{ d: 6, o: 2 }, { d: 1, o: 7 }, { d: 0.3, o: -1.5 }],
  [{ d: 0, o: 0 }, { d: 1.5, o: 0 }, { d: 3, o: 0 }],
];
async function crashNights(page, assert, nights) {
  const { evaluate, shot, sleep, say } = page;
  const res = [];
  for (let n = 0; n < Math.min(nights, PLANS.length); n++) {
    if (await evaluate('!!window.AYLMER.job()')) { await evaluate('window.AYLMER.abandon()'); await sleep(1200); await closeCards(page); }
    const mark = await evaluate('window.__RV.texts.length');
    const started = await evaluate('window.AYLMER.crashNight.start()');
    assert(started, `crash night ${n + 1} starts`);
    if (!started) break;
    await sleep(1200);
    const night = { plan: PLANS[n], tries: [], timeline: [] };
    let last = '', tryN = 0, runAt = null, aimed = false;
    const w0 = Date.now();
    while (Date.now() - w0 < 2400 * 1000) {
      const s = await evaluate('JSON.parse(JSON.stringify(window.AYLMER.crashNight.state()))');
      const job = await evaluate('window.AYLMER.job()');
      if (await evaluate('window.__RV.cardUp()')) { await page.tap('Enter'); await sleep(600); continue; }
      if (s.phase !== last) {
        night.timeline.push({ wall: Math.round((Date.now() - w0) / 1000), phase: s.phase, tries: s.tries });
        if (s.phase === 'run') { tryN++; runAt = await gameT(evaluate); aimed = false; if (n === 0) await shot(`cn${n + 1}-try${tryN}-go`); }
        if (s.phase !== 'run' && s.phase !== 'window') await evaluate('window.__RV.task ? (window.__RV.task = null, window.__RV.release(), 1) : 0');
        if (s.phase === 'card' && n === 0) await shot(`cn${n + 1}-try${tryN}-card`).catch(() => {});
        last = s.phase;
      }
      if (s.phase === 'run' && !aimed) {
        const p = PLANS[n][Math.min(tryN - 1, 2)];
        if (p.floor) { aimed = true; await evaluate(`window.__RV.run({ type: 'floor', seconds: 30, steer: 0 })`); }
        else if ((await gameT(evaluate)) - runAt >= p.d) {
          aimed = true;
          await evaluate(`(() => { const G = window.AYLMER.G, v = G.veh, Jx = -209.7, Jz = -150.5;
            const h = Math.atan2(Jx - v.x, Jz - v.z), rx = Math.cos(h), rz = -Math.sin(h), o = ${p.o};
            const P = [Jx + rx * o, Jz + rz * o], Q = [P[0] + Math.sin(h) * 60, P[1] + Math.cos(h) * 60];
            return window.__RV.run({ type: 'aim', points: [P, Q], seconds: 30 }); })()`);
        }
      }
      if (!job && !s.phase && tryN) break;
      await sleep(350);
    }
    await sleep(1500);
    await shot(`cn${n + 1}-result`);
    const texts = await evaluate(`window.__RV.texts.slice(${mark}).map((x) => x.text)`);
    night.result = texts.filter((t) => /TÔLE FROISSÉE :/.test(t)).slice(0, 2);
    night.tryCards = texts.filter((t) => /^ESSAI \d/.test(t)).slice(0, 6);
    night.tries = (await evaluate('JSON.parse(JSON.stringify(window.AYLMER.crashNight.state()))')).tries;
    const st = await evaluate('(() => { const L = window.AYLMER.G.lastCrashNight; return L ? L.tries.map((x) => ({ total: x.total, cars: x.cars, losses: x.losses, mult: x.mult })) : null; })()');
    night.tries = st || night.tries;
    night.record = J(await evaluate('window.AYLMER.crashNight.records()'));
    say(`  crash night ${n + 1}: tries ${JSON.stringify(night.tries)} result ${JSON.stringify(night.result)} record ${JSON.stringify(night.record)}`);
    res.push(night);
  }
  assert(res.length && res[0].result.length > 0, 'Crash Night result toast « TÔLE FROISSÉE : ... » shown');
  assert(res.length && res[res.length - 1].record && res[res.length - 1].record.t != null, 'Crash Night record saved');
  return res;
}

async function shortcut(page, assert) {
  const { evaluate, shot, sleep } = page;
  if (await evaluate('!!window.AYLMER.job()')) { await evaluate('window.AYLMER.abandon()'); await sleep(1200); await closeCards(page); }
  const S = await evaluate(`import('/src/game/shortcuts.js').then((m) => { const s = m.SHORTCUTS.find((x) => x.id === 'sc_eglise'); return { from: s.from, pts: s.pts }; })`);
  await evaluate(`(async () => { const G = window.AYLMER.G; if (G.traffic && !window.__qaTraffic) { window.__qaTraffic = G.traffic.cars; G.traffic.cars = []; } await window.AYLMER.teleport(${S.from.x}, ${S.from.z}, ${S.from.a}); return 1; })()`);
  await sleep(900);
  // [w8-courseproof] The truck is carried along the cut's own points at 40 km/h (qa.follow with
  // a path): the bot at full throttle overshot the church corner into a wall on SwiftShader
  // (cp2). Finding the cut by driving it was PASS in wave 7; this step is about the save.
  await evaluate(`(window.__RV.task = null, window.__RV.release(), window.AYLMER.qa.follow({ kmh: 40, path: ${JSON.stringify(S.pts)} }), 1)`);
  const w0 = Date.now();
  const r = { outcome: (await until(page, 'window.AYLMER.qa.followState().done', { gameS: 60, wallS: 900, every: 400 })) ? 'done' : 'timeout' };
  r.wallSecs = Math.round((Date.now() - w0) / 1000);
  await until(page, 'false', { gameS: 1, wallS: 30 });
  await evaluate(`(() => { window.AYLMER.qa.follow(null); const G = window.AYLMER.G; if (window.__qaTraffic) { G.traffic.cars = window.__qaTraffic; window.__qaTraffic = null; } return 1; })()`);
  await sleep(1500);
  const sc = J(await evaluate('window.AYLMER.shortcuts()'));
  await shot('cp-sc-eglise-found');
  assert(sc.found.includes('sc_eglise'), 'sc_eglise found');
  return { outcome: r.outcome, wallSecs: r.wallSecs, found: sc.found, n: sc.n, total: sc.total };
}
