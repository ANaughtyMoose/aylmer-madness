// [w6-races] calendar DIFF.rival reaches story-race rivals (racejobs.js rivalSkill).
import assert from 'node:assert/strict';
const { rivalSkill } = await import('../src/game/racejobs.js');
const { SKILL } = await import('../src/game/race.js');
const base = SKILL.dave;
assert.equal(rivalSkill({}, base), base, 'no difficulty: untouched');
assert.equal(rivalSkill({ difficulty: 'normal' }, base).cruise, base.cruise, 'normal: untouched');
const e = rivalSkill({ difficulty: 'easy' }, base).cruise, h = rivalSkill({ difficulty: 'hard' }, base).cruise;
assert.ok(e < base.cruise && h > base.cruise, `easy ${e} < ${base.cruise} < hard ${h}`);
assert.equal(base.cruise, 18.8, 'SKILL table not mutated');
console.log(`ok w6-races: dave cruise easy ${e.toFixed(2)} normal ${base.cruise} hard ${h.toFixed(2)} m/s`);

// [w6-races step 2] A rival in traffic drives like a player: it follows or
// passes a slower car, never drives through it, never stops dead behind it.
{
  const { Rival, SKILL: SK } = await import('../src/game/race.js');
  const { carById } = await import('../src/game/cars.js');
  const flat = { roadAt: () => true, waterAt: () => false, querySegments: () => [], queryPoles: () => [], snapPole: () => {}, bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 } };
  // A traffic car going east along z = zLane at `speed` m/s, `x0` m up the road.
  const car = (x0, zLane, speed, yaw = Math.PI / 2) => ({ x: x0, z: zLane, yaw, speed, len: 4.4, wid: 1.8 });
  const run = (skill, cars, secs = 6, v0 = 18, step = (c, dt) => { c.x += Math.sin(c.yaw) * c.speed * dt; c.z += Math.cos(c.yaw) * c.speed * dt; }) => {
    const rv = new Rival(carById('civic'), { skill });
    rv.setPath([[0, 0], [2000, 0]]);
    rv.place(0, 0, Math.PI / 2);
    rv.veh.vLong = v0; rv.veh.vx = v0; rv.veh.vz = 0;
    rv.active = true;
    const ctx = { traffic: cars, band: 1, grip: 1 };
    let contacts = 0, minV = Infinity, maxLat = 0, gapMin = Infinity;
    const dt = 1 / 60;
    for (let i = 0; i < secs * 60; i++) {
      for (const c of cars) step(c, dt);
      rv.update(dt, flat, ctx);
      const c = cars[0];
      const dx = c.x - rv.x, dz = c.z - rv.z;
      if (Math.abs(dx) < (4.4 + 4.2) / 2 && Math.abs(dz) < (1.8 + 1.7) / 2) contacts++;
      if (i > 30) minV = Math.min(minV, rv.speed);
      maxLat = Math.max(maxLat, Math.abs(rv.z));
      if (dx > 0 && Math.abs(dz) < 1.75) gapMin = Math.min(gapMin, dx);
    }
    return { rv, contacts, minV, maxLat, gapMin, endGap: cars[0].x - rv.x };
  };
  // 1. A slow car 25 m ahead, open road: no contact, no stop, he goes round it.
  for (const k of ['sayyad', 'dave']) {
    const r = run(SK[k], [car(25, 0, 6)]);
    assert.equal(r.contacts, 0, `${k}: no contact with a slow car 25 m ahead (gap min ${r.gapMin.toFixed(1)} m)`);
    assert.ok(r.minV >= 3, `${k}: never stops under 3 m/s behind it (min ${r.minV.toFixed(2)})`);
    assert.ok(r.rv.passes >= 1 && r.endGap < 0, `${k}: passes it (passes ${r.rv.passes}, ends ${(-r.endGap).toFixed(1)} m ahead, out to ${r.maxLat.toFixed(1)} m)`);
    console.log(`ok w6-races: ${k} passes a 22 km/h car: 0 contacts, min ${(r.minV * 3.6).toFixed(0)} km/h, ends ${(-r.endGap).toFixed(0)} m ahead`);
  }
  // 2. Both other lanes busy with oncoming cars: he follows, does not pass, does not hit.
  {
    const cars = [car(25, 0, 6)];
    for (let x = 30; x < 400; x += 18) { cars.push(car(x, 3.4, 12, -Math.PI / 2)); cars.push(car(x + 9, -3.4, 12, -Math.PI / 2)); }
    const r = run(SK.sayyad, cars);
    assert.equal(r.contacts, 0, `sayyad boxed in: no contact (gap min ${r.gapMin.toFixed(1)})`);
    assert.equal(r.rv.passes, 0, 'sayyad boxed in: no pass into a busy lane');
    assert.ok(r.minV >= 3 && r.gapMin > 2, `sayyad boxed in: follows at its speed (min ${r.minV.toFixed(2)} m/s, gap ${r.gapMin.toFixed(1)} m)`);
    console.log(`ok w6-races: boxed in, sayyad follows: min ${(r.minV * 3.6).toFixed(0)} km/h, closest ${r.gapMin.toFixed(1)} m`);
  }
  // 3. A stopped car in the lane, road closed either side: he stops short of it.
  {
    const narrow = { ...flat, roadAt: (x, z) => Math.abs(z) < 1.8 };
    const rv = new Rival(carById('civic'), { skill: SK.sayyad });
    rv.setPath([[0, 0], [2000, 0]]); rv.place(0, 0, Math.PI / 2);
    rv.veh.vLong = 18; rv.veh.vx = 18; rv.active = true;
    const c = car(60, 0, 0);
    let hit = 0;
    for (let i = 0; i < 360; i++) { rv.update(1 / 60, narrow, { traffic: [c], band: 1, grip: 1 }); if (c.x - rv.x < 4.3) hit++; }
    assert.equal(hit, 0, `stopped car, no room: he stops short (${(c.x - rv.x).toFixed(1)} m)`);
    assert.equal(rv.resets, 0, 'and the stuck watchdog does not hop him through it');
    console.log(`ok w6-races: stopped car, no room: stops ${(c.x - rv.x).toFixed(1)} m short, 0 resets`);
  }
  // 4. skill.avoid stays a multiplier: Kevin (0.45) sits closer than Sayyad.
  {
    const kev = { ...SK.sayyad, avoid: 0.45 };
    const box = () => { const cs = [car(25, 0, 6)]; for (let x = 30; x < 400; x += 18) { cs.push(car(x, 3.4, 12, -Math.PI / 2)); cs.push(car(x + 9, -3.4, 12, -Math.PI / 2)); } return cs; };
    const a = run(SK.sayyad, box()), b = run(kev, box());
    assert.equal(b.contacts, 0, `avoid 0.45 tailgates but does not ram (${b.gapMin.toFixed(1)} m)`);
    assert.ok(b.gapMin < a.gapMin, `avoid 0.45 follows closer (${b.gapMin.toFixed(1)} m vs ${a.gapMin.toFixed(1)} m)`);
    console.log(`ok w6-races: avoid 0.45 follows at ${b.gapMin.toFixed(1)} m vs ${a.gapMin.toFixed(1)} m`);
  }
}

// [w7-polish] racedave's win line carries the real margin, not « douze secondes ».
{
  const RJ = await import('../src/game/racejobs.js');
  const { ALL_MISSIONS } = await import('../src/game/missions.js');
  assert.equal(RJ.arrivesLine('Adam', 3.6), 'Adam arrive quatre secondes plus tard.');
  assert.equal(RJ.arrivesLine('Adam', 12.2), 'Adam arrive douze secondes plus tard, ben tranquille.');
  assert.equal(RJ.arrivesLine('Adam', 0.3), 'Adam arrive collé sur ton pare-chocs.');
  assert.ok(!/\d/.test(RJ.arrivesLine('Adam', null)), 'no number when the gap is unknown');
  // Adam 60 m short of a 2 000 m line after 100 s at 19.4 m/s: about 3 s.
  const G = { rivals: [{ name: 'Adam', progress: 1940 }] };
  const m = { race: { t: 100, track: { total: 2000 } } };
  const secs = RJ.rivalGapSeconds(G, m, 'Adam');
  assert.ok(Math.abs(secs - 60 / 19.4) < 1e-9, `gap ${secs}`);
  const def = ALL_MISSIONS.find((d) => d.id === 'racedave');
  const run = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3 }).find((st) => typeof st.toast === 'string' && /PREMIER/.test(st.toast));
  assert.ok(run && !/douze/.test(run.toast) && !/[–—]/.test(run.toast), 'the default win text has no fixed margin and no dash: ' + (run && run.toast));
  const line = RJ.arrivesLine('Adam', secs);
  assert.ok(/trois secondes plus tard/.test(line), line);
  console.log('ok w7-polish: racedave win line measured: ' + line);
}
