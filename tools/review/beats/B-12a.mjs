// B-12a script beat: the B1 call sites in main.js and hud.js, in the real game.
// A plan runs it as { "do": "script", "id": "B-12a", "vehicle": false }.
//
// 1. Y (a real KeyY through handleKeys) in the club cart, in free roam, puts
//    you in the Ranger (B-01a returnToOwnVehicle).
// 2. stvincent, russellroyal and racecivic started with AYLMER.start (the
//    real startMission) from the cart: none starts in the cart (B-01b
//    ensureOwnVehicle).
// 3. A fail puts the fail card up (retry.js state, shown by hud.js); the next
//    job's brief card takes it down (B-07 clearFailToast).
// 4. A 3-star chase lost through the real Cops.update pays 180 $ (B-07).
// 5. A crash in the Ranger at 70 km/h, aimed off the road as the crash beat
//    does: feel offset over 0.05 m and exactly one crash hitstop (B-09).
// 6. G.camPos is the same across a hitstop with the truck stopped (the shake
//    is on a copy of the eye, never in the chase smoothing).
// Everything is put back: the job is abandoned, the heat zeroed, the Ranger.
export async function run(page, assert) {
  const ev = async (js) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (async () => { ${js} })()))()`));
  const out = {};
  await ev(`window.__b12 = {
    cur() { const G = window.AYLMER.G; return (G.veh && G.veh.spec && G.veh.spec.id) || G.carId; },
    into(id) { const G = window.AYLMER.G; if (this.cur() === id) return; G.parked[id] = { x: G.veh.x + 3, z: G.veh.z, yaw: G.veh.yaw }; G.swapCar(id); },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); },
    steps(n) { for (let i = 0; i < n; i++) window.AYLMER.step(1 / 60); },
    uncard() { const C = window.AYLMER.cinema; for (let i = 0; i < 4 && C && C.active; i++) C.finish(); },
    toasts() { const T = window.AYLMER.hud.toasts; return [...T.active, ...T.pending].map((a) => a.text); },
  }; return 1;`);

  // 1. Y from the cart, free roam, far from the Ranger.
  out.y = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
    if (G.mission) A.abandon();
    const P = (await import('/src/game/places.js')).PLACES;
    await A.teleport(P.principale.x, P.principale.z, 0); F.steps(20);
    F.into('cart'); const from = F.cur();
    G.parked.ranger = { x: P.home.x, z: P.home.z, yaw: 0 };
    const far = Math.round(Math.hypot(P.home.x - G.veh.x, P.home.z - G.veh.z));
    F.key('KeyY', true); F.steps(2); F.key('KeyY', false); F.steps(2);
    return { from, to: F.cur(), farM: far, toast: F.toasts().slice(-1)[0] || null };`);
  page.say(`  B-12a Y: ${JSON.stringify(out.y)}`);
  assert(out.y.from === 'cart' && out.y.to === 'ranger', `Y in the cart brings the Ranger (${out.y.from} -> ${out.y.to}, ${out.y.farM} m)`);

  // 2. Job start from the cart.
  out.start = [];
  const HOUR = { russellroyal: 5 };
  for (const id of ['stvincent', 'russellroyal', 'racecivic']) {
    await page.evaluate(`(() => { const A = window.AYLMER; if (A.G.mission) A.abandon(); window.__b12.into('ranger'); return 1; })()`);
    const seed = await page.seedFor(id, HOUR[id]);
    const r = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
      if (G.mission) A.abandon();
      F.into('ranger'); F.into('cart');
      const from = F.cur();
      const started = A.start(${JSON.stringify(id)});
      const job = A.job();
      const res = { job: ${JSON.stringify(id)}, from, vehicle: F.cur(), started: started !== false, running: job && job.id, toast: F.toasts().slice(-1)[0] || null };
      if (G.mission) A.abandon();
      A.cinema && A.cinema.active && A.cinema.hide && A.cinema.hide();
      return res;`);
    r.seed = { available: seed && seed.available, lock: seed && seed.lock };
    out.start.push(r);
    page.say(`  B-12a start: ${JSON.stringify(r).slice(0, 220)}`);
    assert(r.started && r.vehicle !== 'cart', `${id} started from the cart does not start in the cart (${r.vehicle}, started ${r.started})`);
  }
  await page.sleep(400);
  for (let i = 0; i < 4 && (await page.evaluate('!!(window.__RV && window.__RV.cardUp && window.__RV.cardUp())')); i++) { await page.tap('Enter'); await page.sleep(400); }

  // 3. The fail card: up on a fail, down when the next job's card opens.
  await page.evaluate(`(() => { const A = window.AYLMER; if (A.G.mission) A.abandon(); window.__b12.into('ranger'); return 1; })()`);
  await page.seedFor('dep');
  out.fail = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
    if (G.mission) A.abandon();
    F.into('ranger');
    for (const id of ['dep', 'racecivic', 'stvincent', 'solerrand']) { if (G.mission) break; A.start(id); }
    const first = A.job();
    const card = A.fail('Abandonné.');
    const upText = card && card.text;
    const shown = F.toasts().some((t) => t === upText);
    window.__b12first = first && first.id;
    return { first: first && first.id, up: !!upText, shown, text: upText ? upText.split('\\n')[0] : null };`);
  await page.sleep(300);
  out.fail.next = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
    const pre = F.toasts().filter((t) => /RAT/.test(t)).length;
    for (const id of ['racecivic', 'stvincent', 'solerrand', 'dep']) { if (G.mission) break; if (id !== window.__b12first) A.start(id); }
    return { job: A.job() && A.job().id, cardUp: !!(A.cinema && A.cinema.active), preCount: pre };`);
  await page.sleep(500);   // a few real frames: frame() sees the card and clears
  out.fail.after = await ev(`const A = window.AYLMER, F = window.__b12;
    const left = F.toasts().filter((t) => /RAT/.test(t));
    const r = { failCard: A.failCard(), ratéOnScreen: left.length };
    if (A.G.mission) A.abandon();
    return r;`);
  for (let i = 0; i < 4 && (await page.evaluate('!!(window.__RV && window.__RV.cardUp && window.__RV.cardUp())')); i++) { await page.tap('Enter'); await page.sleep(400); }
  page.say(`  B-12a fail card: ${JSON.stringify(out.fail).slice(0, 300)}`);
  assert(out.fail.up && out.fail.shown, `a fail puts the retry.js card on the HUD (${out.fail.text})`);
  assert(!out.fail.after.failCard && out.fail.after.ratéOnScreen === 0, `no fail line from the previous job after the new card (${out.fail.after.ratéOnScreen} left)`);

  // 4. A 3-star escape through the real Cops.update (stepped in chunks).
  out.escape = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
    if (G.mission) A.abandon();
    F.into('ranger');
    F.uncard();
    const P = (await import('/src/game/places.js')).PLACES;
    await A.teleport(P.principale.x, P.principale.z, 0);
    for (let i = 0; i < 100 && G.seamHold; i++) await new Promise((r) => setTimeout(r, 100));
    F.steps(30);
    const c = G.cops; c.lastEscape = null;
    window.__b12m0 = G.wallet ? G.wallet.value : null;
    const far = () => { for (const u of [...(c.units || []), ...(c.blocks || [])]) { u.x = G.veh.x + 2000; u.z = G.veh.z + 2000; } };
    window.__b12far = far;
    A.heat(3); for (let i = 0; i < 90; i++) { far(); A.step(1 / 60); }
    return { peak: c.peak, chasing: c.chasing, units: (c.units || []).length, heat: c.heat, mode: G.mode, cine: !!(A.cinema && A.cinema.active), seam: !!G.seamHold, car: F.cur() };`);
  page.say(`  B-12a escape: ${JSON.stringify(out.escape)}`);
  // The chase reached 3 stars live above. Losing them for real takes LOSE_T
  // plus about 14 s of decay with no cruiser inside 300 m, which a parked
  // truck in a script cannot get (they box it in: a bust). So the tail of the
  // chase is put where it would be after that wait (heat just above 0, unseen
  // past LOSE_T, the units gone) and the real Cops.update ends it.
  out.escape.loop = await ev(`const A = window.AYLMER, G = A.G, c = G.cops;
    const peak = c.peak;
    c.units.length = 0; c.blocks.length = 0; c.heat = 0.05; c.unseen = 13;
    let t = 0; for (; t < 120 && !c.lastEscape; t++) A.step(1 / 60);
    return { peakBefore: peak, steps: t, done: !!c.lastEscape };`);
  page.say(`  B-12a escape tail: ${JSON.stringify(out.escape.loop)}`);
  out.escape.result = await ev(`const A = window.AYLMER, G = A.G, c = G.cops;
    const r = { lastEscape: c.lastEscape, money: window.__b12m0 != null ? Math.round(G.wallet.value - window.__b12m0) : null };
    A.heat(0); return r;`);
  page.say(`  B-12a escape result: ${JSON.stringify(out.escape.result)}`);
  const le = out.escape.result.lastEscape;
  assert(le && le.stars === 3 && le.pay === 180, `a 3-star escape pays 180 $ (${JSON.stringify(le)})`);

  // 5. The crash in the Ranger at 70 km/h, one try per evaluate.
  out.crash = { tries: [] };
  for (const [place, side] of [['principale', 1], ['principale', -1], ['marina', 1], ['marina', -1]]) {
    const t = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
      if (G.mission) A.abandon();
      F.uncard(); F.into('ranger');
      const PL = (await import('/src/game/places.js')).PLACES;
      const a = PL[${JSON.stringify(place)}], o = PL.marina === a ? PL.principale : PL.marina;
      const r = G.nav && G.nav.route(a.x, a.z, o.x, o.z); if (!r || r.length < 2) return { skipped: true };
      const h = Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]) + Math.PI / 2 * ${side};
      G.slowmo.cool = 0; G.veh.repair && G.veh.repair();
      await A.teleport(r[0][0] - Math.sin(h) * 25, r[0][1] - Math.cos(h) * 25, h); F.steps(30);
      G.feelFx.clear(); G.feelFx.resetTelemetry();
      const v = G.veh, s = 70 / 3.6; v.vLong = s; v.vLat = 0; v.vx = Math.sin(v.yaw) * s; v.vz = Math.cos(v.yaw) * s;
      const before = G.feel.crash; let kmh = 0, hitAt = -1;
      F.key('KeyW', true);
      for (let i = 0; i < 240; i++) {
        A.step(1 / 60); kmh = Math.max(kmh, Math.abs(G.veh.speedKmh || 0));
        if (hitAt < 0 && G.feel.crash > before) hitAt = i;
        if (hitAt >= 0) A.render();
        if (hitAt >= 0 && i - hitAt > 40) break;
      }
      F.key('KeyW', false);
      const tel = G.feelFx.telemetry();
      const crashStops = tel.log.filter((e) => e.kind === 'headOn' || e.kind === 'copRam').length;
      return { place: ${JSON.stringify(place)}, side: ${side}, maxKmh: +kmh.toFixed(1), crashSlowmos: G.feel.crash - before, offset: tel.offset, hitstops: tel.hitstops, crashStops, log: tel.log };`);
    out.crash.tries.push(t);
    page.say(`  B-12a crash try: ${JSON.stringify(t).slice(0, 220)}`);
    if (t.crashSlowmos > 0) break;
  }
  out.crash.last = out.crash.tries[out.crash.tries.length - 1];
  const cr = out.crash.last || {};
  assert((cr.maxKmh || 0) >= 40, `the crash run was at 40 km/h or more (${cr.maxKmh})`);
  assert((cr.offset || 0) > 0.05, `feel max offset over 0.05 m (${cr.offset})`);
  assert(cr.crashSlowmos >= 1 && cr.crashStops === cr.crashSlowmos, `exactly one crash hitstop per crash (${cr.crashStops} for ${cr.crashSlowmos})`);

  // 6. G.camPos across a hitstop with the truck stopped.
  out.campos = await ev(`const A = window.AYLMER, G = A.G, F = window.__b12;
    const v = G.veh; v.vLong = 0; v.vLat = 0; v.vx = 0; v.vz = 0;
    for (let i = 0; i < 120; i++) A.step(1 / 60);
    for (let i = 0; i < 30; i++) A.render();
    for (let i = 0; i < 90; i++) A.render();
    G.feelFx.clear();
    const drift = (shake) => { const p0 = [...G.camPos]; if (shake) G.feelFx.event('headOn'); let d = 0;
      for (let i = 0; i < 20; i++) { A.render(); d = Math.max(d, Math.hypot(G.camPos[0] - p0[0], G.camPos[1] - p0[1], G.camPos[2] - p0[2])); } return d; };
    const still = drift(false), shaken = drift(true);
    return { stillDriftM: +still.toFixed(4), camPosDriftM: +shaken.toFixed(4), extraM: +Math.abs(shaken - still).toFixed(4), trauma: +G.feelFx.trauma().toFixed(3) };`);
  page.say(`  B-12a camPos: ${JSON.stringify(out.campos)}`);
  assert(out.campos.extraM < 0.005, `G.camPos does not take the shake (${out.campos.camPosDriftM} m)`);

  await ev(`const A = window.AYLMER, G = A.G; if (G.mission) A.abandon(); window.__b12.into('ranger'); A.heat(0); G.feelFx.clear(); return 1;`);
  await page.shot('b12a-end');
  return out;
}
