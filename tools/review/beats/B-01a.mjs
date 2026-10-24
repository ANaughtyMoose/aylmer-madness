// B-01a script beat: never stranded after the golf night, and Y in a borrowed
// vehicle brings your own back. Runs in the real game (main.js's swapCar,
// closeMission and the real world), headless, through the harness:
//   { "do": "script", "id": "B-01a" }
// 1. In the Ranger at the Club lot, the golf night's real stages put you on
//    the bike, then (third key) in the cart. The cart is driven 300 m off.
//    AYLMER.abandon() (closeMission('quit'), the same path as every end) must
//    leave you in the Ranger, at the lot, with the cart back on its apron.
// 2. Free roam in the cart, 1 km from the Ranger: tow.returnToOwnVehicle(G)
//    (what B-12a wires to Y) must put you in the Ranger, next to you, and the
//    Ranger must then pull past 55 km/h on its own pedal.
export async function run(page, assert) {
  const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
  assert.equal(await page.vehicle(), 'ranger', 'starts in the Ranger');

  const night = await ev(`
    const A = window.AYLMER, G = A.G;
    const gn = await import('/src/game/setpieces/golfnuit.js');
    const mk = await import('/src/game/missionkit.js');
    const P = (await import('/src/game/places.js')).PLACES;
    await A.teleport(P.golf.x, P.golf.z, P.golf.a || 0);
    for (let i = 0; i < 30; i++) A.step(1 / 60);
    const stages = gn.golfnuit.build({ carId: G.veh.spec.id, carName: G.veh.spec.name, seats: G.veh.spec.seats });
    const m = { def: gn.golfnuit, stages, idx: 0, timeLeft: null, failed: false, elapsed: 0,
      styleStart: { stats: { ...G.stats }, damage: G.veh.damage || 0 } };
    G.mission = m;
    mk.stageEnter(G, m, stages[0]);
    const lot = { x: G.veh.x, z: G.veh.z };
    mk.stageExit(G, m, stages[0]); m.idx = 1; mk.stageEnter(G, m, stages[1]);
    const onBike = G.veh.spec.id;
    const c = G.parked.cart;
    G.veh.reset(c.x + 2, c.z, G.veh.yaw, G.veh.y || 0); G.veh.speedKmh = 0;
    for (let k = 0; k < 3 && G.veh.spec.id !== 'cart'; k++) { G.wantStart = true; stages[1].onTick(G, m, stages[1], 1 / 60); }
    const inCart = G.veh.spec.id;
    G.veh.reset(lot.x + 212, lot.z - 212, 0, G.veh.y || 0);
    const before = Math.hypot(G.veh.x - G.parked.ranger.x, G.veh.z - G.parked.ranger.z);
    const t0 = performance.now();
    A.abandon();
    const ms = performance.now() - t0;
    for (let i = 0; i < 30; i++) A.step(1 / 60);
    const apron = gn.GOLFNUIT && G.parked.cart ? Math.hypot(G.parked.cart.x - P.golf.x, G.parked.cart.z - P.golf.z) : null;
    return { onBike, inCart, before: Math.round(before), after: G.veh.spec.id, ms: Math.round(ms),
      atLot: Math.round(Math.hypot(G.veh.x - lot.x, G.veh.z - lot.z)), mission: !!G.mission, cartFromClub: apron && Math.round(apron) };
  `);
  assert.equal(night.onBike, 'dbike', 'the bikes come out of the truck');
  assert.equal(night.inCart, 'cart', 'third key: in the cart');
  assert(night.before >= 250, `the cart is ${night.before} m from the Ranger at the end`);
  assert.equal(night.after, 'ranger', 'abandon 300 m out: in the Ranger');
  assert(night.atLot <= 25, `at the Club lot (${night.atLot} m from where it was left)`);
  assert(!night.mission, 'the job is closed');
  assert(night.cartFromClub != null && night.cartFromClub < 60, `the cart is back at the clubhouse (${night.cartFromClub} m)`);
  await page.shot('b01a-back-in-ranger');

  const y = await ev(`
    const A = window.AYLMER, G = A.G;
    const tow = await import('/src/game/tow.js');
    const P = (await import('/src/game/places.js')).PLACES;
    const r0 = { ...(G.parked.cart || {}) };
    G.swapCar('cart');
    const inCart = G.veh.spec.id;
    const far = { x: P.golf.x + 700, z: P.golf.z + 700 };
    await A.teleport(far.x, far.z, 0);
    for (let i = 0; i < 30; i++) A.step(1 / 60);
    const st0 = tow.ownVehicleStatus(G);
    const at = { x: G.veh.x, z: G.veh.z };
    const r = tow.returnToOwnVehicle(G, 'tow');
    for (let i = 0; i < 30; i++) A.step(1 / 60);
    const st1 = tow.ownVehicleStatus(G);
    return { inCart, dist0: Math.round(st0.dist), borrowed: st0.borrowed, ok: r.ok, swapped: r.swapped, now: G.veh.spec.id,
      near: Math.round(Math.hypot(G.veh.x - at.x, G.veh.z - at.z)), inOwn: st1.inOwn, line: tow.towLine(r) };
  `);
  assert.equal(y.inCart, 'cart', 'in the Club cart, free roam');
  assert(y.borrowed && y.dist0 > 500, `ownVehicleStatus: borrowed, Ranger ${y.dist0} m away`);
  assert(y.ok && y.swapped, 'Y: the flatbed swaps you');
  assert.equal(y.now, 'ranger', 'Y in the cart: in the Ranger');
  assert(y.near <= 60, `the Ranger came to you (${y.near} m)`);
  assert(y.inOwn, 'ownVehicleStatus agrees');

  await page.runTask({ type: 'floor', seconds: 8, steer: 0 }, 'b01a-ranger-floor', { maxSecs: 25, every: 60 });
  const s = await page.state();
  assert.equal(s.vehicle, 'ranger', 'still the Ranger after the drive');
  await page.shot('b01a-ranger-after-y');
  return { night, y, kmhAfter: s.kmh, vehicle: s.vehicle };
}
