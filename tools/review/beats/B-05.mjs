// B-05 self-check beat: the canoe crossing, start to finish, without the
// drive to the marina (the full plan's canot run often ends at the marina,
// pulled over by the police, before the paddle starts).
//
// Seeds canot, starts it, puts the truck at the marina with the Bondo already
// done (quality 0.567, the 1-of-3 patch the 13 Oct bot got), enters the paddle
// stage the way main.js applyStage() does, then paddles toward the island by
// the stage's own compass: W held, A or D when the arrow says turn. The pack's
// transcript then carries the crossing for tools/review/gaps.mjs.
//
// Returns the outcome, the seconds on the water and the longest silence
// between toasts the beat saw itself; asserts the In-task bar (no toast gap
// over 60 s while paddling).
const MAX_S = 480;

export async function run(page, assert) {
  const { evaluate, sleep, say } = page;
  const seed = await page.seedFor('canot');
  assert(seed && seed.ok, 'canot seeds');
  await evaluate(`window.AYLMER.start('canot')`);
  await sleep(800);
  for (let i = 0; i < 12; i++) {
    if (!(await evaluate('window.__RV.cardUp()'))) break;
    await page.tap('Enter'); await sleep(700);
  }
  const entered = await evaluate(`(async () => {
    const A = window.AYLMER, G = A.G, m = G.mission;
    if (!m || m.def.id !== 'canot') return { ok: false, why: 'no canot mission' };
    const K = await import('/src/game/missionkit.js');
    const P = await import('/src/game/places.js');
    const mar = P.PLACES.marina;
    await A.teleport(mar.x, mar.z, G.veh.yaw);
    K.stageExit(G, m, m.stages[m.idx]);
    m.repair = { on: true, t: 0, hits: 1, taps: 6, done: true, quality: 0.35 + 0.65 / 3 };
    m.idx = m.stages.findIndex((s) => s.kind === 'paddle');
    const st = m.stages[m.idx];
    G.hud.setObjective(st.text, st.sub || '');
    m.timeLeft = null;
    m.target = K.stageTarget(G, m, st);
    G.routeKey = '';
    K.stageEnter(G, m, st);
    return { ok: !!G.boat, idx: m.idx };
  })()`);
  assert(entered && entered.ok, 'the paddle stage starts with a boat');
  say(`  B-05: paddle stage ${JSON.stringify(entered)}`);

  const t0 = Date.now();
  let last = Date.now(), worst = 0, toasts = 0, lastToast = '', end = null;
  await evaluate(`window.__RV.hold('KeyW', true)`);
  while ((Date.now() - t0) / 1000 < MAX_S) {
    const s = await evaluate(`(() => {
      const G = window.AYLMER.G, b = G.boat, m = G.mission;
      const toast = (document.querySelector('#toast, .toast')?.innerText || '').trim();
      if (!b || !m || m.def.id !== 'canot') return { over: true, toast };
      const I = { x: -1227, z: 612 };
      const want = Math.atan2(I.x - b.x, I.z - b.z);
      const err = ((want - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return { err, d: Math.hypot(b.x - I.x, b.z - I.z), water: b.water, toast };
    })()`);
    if (s.toast && s.toast !== lastToast) {
      const gap = (Date.now() - last) / 1000;
      if (toasts) worst = Math.max(worst, gap);
      last = Date.now(); toasts++; lastToast = s.toast;
    }
    if (s.over) { end = s; break; }
    await evaluate(`(() => { const R = window.__RV; R.hold('KeyA', ${s.err > 0.1}); R.hold('KeyD', ${s.err < -0.1}); })()`);
    await sleep(400);
  }
  await evaluate(`window.__RV.release()`);
  const secs = +((Date.now() - t0) / 1000).toFixed(1);
  const job = await evaluate(`window.AYLMER.job()`);
  const done = await evaluate(`window.AYLMER.G.done.has('canot')`);
  worst = Math.max(worst, end ? 0 : (Date.now() - last) / 1000);
  say(`  B-05: crossing ${done ? 'done' : 'not done'} in ${secs} s, ${toasts} toasts, worst toast gap ${worst.toFixed(1)} s`);
  assert(worst <= 60, `no toast gap over 60 s on the water (worst ${worst.toFixed(1)} s)`);
  if (job) await evaluate('window.AYLMER.abandon()');
  return { outcome: done ? 'done' : 'not-done', secs, toasts, worstToastGap: +worst.toFixed(1) };
}
