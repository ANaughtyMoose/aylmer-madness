// B-09 script beat: trauma shake and hitstop.
// A plan runs it as { "do": "script", "id": "B-09" } (or --only B-09).
//
// Part 1 (In-task, always): src/game/feel.js loads in the real page and does
// what smoke_feel says it does there too: a head-on gives a shake over 0.05 m
// and a hitstop, a second hit 0.2 s later gives none, a third 0.51 s after
// the first fires.
//
// Part 2 (After integration, B-12a): once main.js writes the telemetry
// (AYLMER.feel().offset and .hitstops, from createFeel({ sink: G.feel })), the
// truck is aimed square off the road at Principale, as the crash beat does,
// and floored; the result says the top speed, the largest offset, the
// hitstops fired and the crash slow-mos, and asserts the B-09 numbers. Before
// wiring, part 2 reports wired: false and asserts nothing.
export async function run(page, assert) {
  const mod = JSON.parse(await page.evaluate(`(async () => {
    const F = await import('/src/game/feel.js');
    const f = F.createFeel();
    const first = f.event('headOn');
    let max = 0;
    for (let i = 0; i < 12; i++) { f.update(1 / 60); max = Math.max(max, f.cameraOffset(1).len); }
    const second = f.event('copRam');   // 0.2 s after the first: inside the 0.5 s gap
    f.update(0.31); const third = f.event('copRam');   // 0.51 s after: fires
    const t = f.telemetry();
    return JSON.stringify({ first, second, third, maxOffset: +max.toFixed(4), hitstops: t.hitstops, angleDeg: t.angleDeg }); })()`));
  assert(mod.first >= 0.04 && mod.first <= 0.1, `in page: a head-on starts a 40 to 100 ms hitstop (${mod.first})`);
  assert(mod.second === 0, `in page: a second hit 0.2 s later gives no hitstop (${mod.second})`);
  assert(mod.third > 0 && mod.hitstops === 2, `in page: a third hit 0.51 s after the first fires, two in all (${mod.hitstops})`);
  assert(mod.maxOffset > 0.05 && mod.maxOffset <= 0.35, `in page: shake over 0.05 m and under 0.35 m (${mod.maxOffset})`);

  const wired = await page.evaluate(`(() => { const f = window.AYLMER && window.AYLMER.feel && window.AYLMER.feel(); return !!f && typeof f.hitstops === 'number' && typeof f.offset === 'number'; })()`);
  if (!wired) return { module: mod, wired: false };

  const before = JSON.parse(await page.evaluate(`JSON.stringify(window.AYLMER.feel())`));
  const aimed = await page.evaluate(`(async () => { const A = window.AYLMER, P = (await import('/src/game/places.js')).PLACES;
    const a = P[${JSON.stringify(page.beat.place || 'principale')}] || P.principale, o = P.marina;
    const r = A.G.nav && A.G.nav.route(a.x, a.z, o.x, o.z);
    if (!r || r.length < 2) return false;
    const h = Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]) + Math.PI / 2 * (${page.beat.side || 1});
    A.G.slowmo && (A.G.slowmo.cool = 0);
    await A.teleport(r[0][0] - Math.sin(h) * 25, r[0][1] - Math.cos(h) * 25, h); return true; })()`);
  await page.sleep(900);
  const end = await page.runTask({ type: 'floor', seconds: page.beat.seconds || 7, steer: 0 }, 'b09-crash', { maxSecs: 20, every: 60 });
  await page.sleep(800);
  await page.shot('b09-crash-after');
  const after = JSON.parse(await page.evaluate(`JSON.stringify(window.AYLMER.feel())`));
  const res = {
    module: mod, wired: true, aimedOffRoad: aimed, maxKmh: end && end.maxKmh,
    offset: after.offset, hitstops: after.hitstops - (before.hitstops || 0), crashSlowmos: after.crash - (before.crash || 0),
  };
  assert(aimed, 'the truck was aimed off the road');
  assert((res.maxKmh || 0) >= 40, `the crash run reached 40 km/h (${res.maxKmh})`);
  assert(res.offset > 0.05, `feel max offset over 0.05 m (${res.offset})`);
  assert(res.hitstops >= 1 && res.hitstops <= Math.max(1, res.crashSlowmos), `one hitstop per crash (${res.hitstops} hitstops, ${res.crashSlowmos} crash slow-mos)`);
  return res;
}
