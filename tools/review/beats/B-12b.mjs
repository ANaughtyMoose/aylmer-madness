// B-12b script beat: the B2 call sites in main.js, in the real game.
// A plan runs it as { "do": "script", "id": "B-12b", "vehicle": false } (or --only B-12b).
//
// 1. B-10: AYLMER.start (the real startMission) opens each job's brief card
//    graded to its hour: nuittim night, golfcart rain, alternateur on its own
//    painting. Read from #cinematic dataset.art and dataset.grade.
// 2. B-08: a stage toast pushed while a scene holds the street quiet keeps
//    it quiet until the toast is off the screen (heckle.hushTests gets a
//    'stage:' reason); with no hush up, the same stage end adds none.
// 3. B-06: hud.slotState() is live in the game (the slots tick from setSpeed,
//    no main.js call) and the wrong-vehicle chip is up in the cart.
// Everything is put back: the job abandoned, the hush lifted, the Ranger.
export async function run(page, assert) {
  const ev = async (js) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (async () => { ${js} })()))()`));
  const out = {};
  await ev(`window.__b12b = {
    cur() { const G = window.AYLMER.G; return (G.veh && G.veh.spec && G.veh.spec.id) || G.carId; },
    into(id) { const G = window.AYLMER.G; if (this.cur() === id) return; G.parked[id] = { x: G.veh.x + 3, z: G.veh.z, yaw: G.veh.yaw }; G.swapCar(id); },
    steps(n) { for (let i = 0; i < n; i++) window.AYLMER.step(1 / 60); },
    uncard() { const C = window.AYLMER.cinema; for (let i = 0; i < 4 && C && C.active; i++) C.finish(); },
  }; return 1;`);

  // 1. Card grades through startMission.
  out.cards = [];
  const WANT = { nuittim: { grade: 'night' }, golfcart: { grade: 'rain' }, alternateur: { art: 'alternateur' } };
  for (const id of Object.keys(WANT)) {
    await page.seedFor(id);
    const r = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12b;
      if (G.mission) A.abandon();
      F.into('ranger');
      const started = A.start(${JSON.stringify(id)});
      const root = document.getElementById('cinematic');
      const res = { job: ${JSON.stringify(id)}, started: started !== false, cardUp: !!(A.cinema && A.cinema.active),
        art: root && root.dataset.art, grade: (root && root.dataset.grade) || 'day' };
      F.uncard(); if (G.mission) A.abandon();
      return res;`);
    out.cards.push(r);
    page.say(`  B-12b card: ${JSON.stringify(r)}`);
    const w = WANT[id];
    assert(r.cardUp, `${id}: startMission opened the brief card`);
    if (w.grade) assert.equal(r.grade, w.grade, `${id} card grade`);
    if (w.art) assert.equal(r.art, w.art, `${id} card art`);
  }

  // 2. Stage toast under a hush.
  const stageEnd = (hushed) => ev(`const A = window.AYLMER, G = A.G, F = window.__b12b, H = G.heckle;
    if (G.mission) A.abandon();
    H.unhush();
    F.into('ranger');
    A.start('alternateur'); F.uncard();
    const m = G.mission; if (!m) return { ok: false, why: 'no mission' };
    const st = m.stages[m.idx], idx0 = m.idx;
    if (!st.toast) st.toast = 'B-12b scene toast';
    const was = st.onTick; let once = true;
    st.onTick = (...a) => { if (once) { once = false; return 'done'; } return was ? was(...a) : undefined; };
    ${hushed ? "H.hush('b12b-scene', 30);" : ''}
    for (let i = 0; i < 6 && m.idx === idx0; i++) F.steps(1);
    const keys = [...H.hushTests.keys()].filter((k) => k.startsWith('stage:'));
    const res = { ok: true, advanced: m.idx > idx0, hushed: H.hushed, stageKeys: keys.length };
    H.unhush(); if (G.mission) A.abandon(); F.uncard();
    return res;`);
  out.hush = await stageEnd(true);
  out.noHush = await stageEnd(false);
  page.say(`  B-12b hush: ${JSON.stringify(out.hush)} / no hush: ${JSON.stringify(out.noHush)}`);
  assert(out.hush.ok && out.hush.advanced, 'hushed stage end advanced the stage');
  assert(out.hush.stageKeys >= 1, `stage toast under a hush holds the street (stage keys ${out.hush.stageKeys})`);
  assert(out.noHush.ok && out.noHush.advanced && out.noHush.stageKeys === 0, `no hush, no stage hold (stage keys ${out.noHush.stageKeys})`);

  // 3. B-06 slots tick in the game.
  out.slots = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12b;
    if (G.mission) A.abandon();
    F.into('cart'); F.steps(30);
    await new Promise((r) => setTimeout(r, 250)); F.steps(10);
    const s = A.hud && A.hud.slotState ? A.hud.slotState() : null;
    const chip = document.getElementById('vehchip');
    const res = { slotState: !!s, vehChip: s ? s.vehChip : null, chipText: chip ? chip.textContent : null };
    F.into('ranger'); F.steps(10);
    return res;`);
  page.say(`  B-12b slots: ${JSON.stringify(out.slots).slice(0, 240)}`);
  assert(out.slots.slotState, 'hud.slotState() is live in the game');
  assert(!!out.slots.vehChip, 'wrong-vehicle chip is up in the cart');
  return out;
}
