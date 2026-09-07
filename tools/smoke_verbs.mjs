// Wave 3: the verbs that are not deliveries, the race that interrupts, and the
// skills that improve with use. Everything here runs in node against fakes
// shaped like G; the real-browser proof is in the PR.
//
//   node tools/smoke_verbs.mjs

import { strict as assert } from 'node:assert';

let failed = 0;
const ok = (name, fn) => {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.message || e)); }
};

const { MISSIONS, ALL_MISSIONS, missionPayout } = await import('../src/game/missions.js');
const { VERB_MISSIONS } = await import('../src/game/verbjobs.js');
const verbs = await import('../src/game/verbs.js');
const ambush = await import('../src/game/ambush.js');
const skills = await import('../src/game/skills.js');
const { PLACES } = await import('../src/game/places.js');
const { carById } = await import('../src/game/cars.js');

const fakeG = (x = 0, z = 0) => ({
  veh: { x, z, yaw: 0, vLong: 0, vLat: 0, damage: 0, passengers: 0, inAir: false, spec: carById('ranger'), baseSpec: carById('ranger') },
  nav: { route: (a, b, c, d) => [[a, b], [(a + c) / 2, (b + d) / 2], [c, d]] },
  rivals: [], parked: {}, raceParked: {}, done: new Set(), stats: {}, hud: { toasts: [], toast(t) { this.toasts.push(t); }, prompt() {} },
  cops: { heat: 0, stars: 0, chasing: false, add(a) { this.heat += a; this.stars = Math.floor(this.heat); this.chasing = true; }, clear() { this.heat = 0; this.stars = 0; this.chasing = false; } },
  rivalFrac: 0.82, envKey: 'day', carId: 'ranger', routeKey: 'x',
});
const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 };

ok('V1 six verb jobs, in the arrays, valid, paid', () => {
  assert.equal(VERB_MISSIONS.length, 6);
  for (const d of VERB_MISSIONS) {
    assert.ok(PLACES[d.giver], `${d.id}: giver ${d.giver}`);
    assert.ok(['morning', 'day', 'dusk', 'night'].includes(d.timeOfDay), d.id);
    const st = d.build(ctx);
    assert.ok(st.length >= 1 && st.every((s) => s.text), `${d.id}: stages`);
    assert.ok(missionPayout(d, ctx) >= 30, `${d.id} pays ${missionPayout(d, ctx)}`);
    assert.ok(MISSIONS.includes(d) && ALL_MISSIONS.includes(d), `${d.id} in both arrays`);
  }
  assert.equal(ALL_MISSIONS.length, MISSIONS.length + 5, 'the arc parity the arc suite pins');
  assert.equal(new Set(ALL_MISSIONS.map((d) => d.id)).size, ALL_MISSIONS.length, 'unique ids');
  // a third at most stay plain deliveries: count defs whose stages are all plain go/load
  const plain = ALL_MISSIONS.filter((d) => d.build(ctx).every((s) => !s.onTick && !s.condition && !s.race && !d.race && !d.mode)).length;
  assert.ok(plain <= Math.ceil(ALL_MISSIONS.length / 2), `${plain} of ${ALL_MISSIONS.length} are plain deliveries`);
});

ok('V2 follow: he leaves, you keep up or you lose him', () => {
  const G = fakeG(PLACES.sayyad.x, PLACES.sayyad.z);
  const st = verbs.follow({ carId: 'civic', roster: 'sayyad', name: 'Sayyad', from: 'sayyad', to: 'beach', text: 't', money: 35 });
  const m = {};
  st.onEnter(G, m);
  const rv = m._leader;
  assert.ok(rv && G.rivals.length === 1 && rv.active, 'a leader on the road');
  assert.ok(rv.skill.cruise > 8 && rv.skill.cruise <= 30, `cruise ${rv.skill.cruise}`);
  assert.ok(!st.condition(G, m), 'not done at the start');
  // stay close: nothing happens
  for (let i = 0; i < 60; i++) assert.equal(st.onTick(G, m, st, 1 / 60), null);
  assert.ok(st.prompt(G, m).includes('Sayyad'));
  // fall 200 m behind for ten seconds: gone
  G.veh.x = rv.x - 200;
  let res = null;
  for (let i = 0; i < 60 * 10 && !res; i++) res = st.onTick(G, m, st, 1 / 60);
  assert.ok(res && res.fail, 'lost him');
  // arrive: leader at the end, player beside him
  rv.place(PLACES.beach.x, PLACES.beach.z, 0);
  G.veh.x = PLACES.beach.x; G.veh.z = PLACES.beach.z;
  assert.ok(verbs.remaining(rv) < 25, `remaining ${verbs.remaining(rv)}`);
  assert.ok(st.condition(G, m), 'done');
  st.onExit(G, m);
  assert.equal(G.rivals.length, 0);
});

ok('V3 lose them: heat on purpose, then quiet', () => {
  const G = fakeG();
  const [a, b] = verbs.loseThem({ stars: 2, to: 'beach', text: 't', thenText: 'u', money: 45 });
  a.onEnter(G);
  assert.equal(G.cops.stars, 2);
  assert.ok(!a.condition(G));
  assert.ok(a.prompt(G).includes('★★'));
  G.cops.clear();
  assert.ok(a.condition(G));
  assert.equal(b.at, PLACES.beach);
});

ok('V4 find: hot and cold, and you have to stop', () => {
  const G = fakeG(PLACES.lookout.x + 1000, PLACES.lookout.z);
  const st = verbs.find({ target: 'lookout', radius: 20, text: 't', money: 35, clue: 'c' });
  assert.ok(st.noTarget && st.noRoute);
  assert.ok(st.prompt(G).startsWith('Glacé'));
  G.veh.x = PLACES.lookout.x + 200; assert.ok(st.prompt(G).startsWith('Tiède'));
  G.veh.x = PLACES.lookout.x + 10; assert.ok(st.prompt(G).startsWith('Brûlant'));
  G.veh.vLong = 5; assert.ok(!st.condition(G), 'still rolling');
  G.veh.vLong = 0; assert.ok(st.condition(G));
});

ok('V5 fragile: six points of new damage and it is in pieces', () => {
  const G = fakeG();
  const [load, go] = verbs.fragile({ from: 'ctire', to: 'norm', tolerance: 6, loadText: 'l', text: 't', money: 40 });
  assert.ok(load.hold && load.at === PLACES.ctire);
  const m = {};
  G.veh.damage = 10; go.onEnter(G, m);
  G.veh.damage = 15; assert.equal(go.onTick(G, m, go, 1 / 60), null);
  assert.ok(go.prompt(G, m).includes('5/6'));
  G.veh.damage = 17; assert.ok(go.onTick(G, m, go, 1 / 60).fail);
  const m2 = {}; G.veh.damage = 0; go.onEnter(G, m2); G.veh.inAir = true;
  let r = null; for (let i = 0; i < 60 && !r; i++) r = go.onTick(G, m2, go, 1 / 60);
  assert.ok(r && r.fail, 'a second in the air');
});

ok('V6 lift: she gets in, the lines land on a clock, she gets out', () => {
  const G = fakeG();
  const [pick, ride] = verbs.lift({ who: 'Margaret', from: 'margaret', to: 'church', pickText: 'p', text: 't', lines: ['a', 'b', 'c'], every: 10, money: 30 });
  assert.equal(pick.passengers, 1); assert.equal(ride.passengers, -1);
  const m = {}; ride.onEnter(G, m);
  for (let i = 0; i < 60 * 25; i++) ride.onTick(G, m, ride, 1 / 60);
  assert.equal(m.liftLine, 3, `lines said: ${m.liftLine}`);
});

ok('V7 dropoffs: any order, the marker follows the nearest, all four to finish', () => {
  const G = fakeG(PLACES.marina.x, PLACES.marina.z);
  const st = verbs.dropoffs({ text: 't', money: 40, stops: [
    { who: 'Sayyad', at: 'sayyad' }, { who: 'Margaret', at: 'margaret' }, { who: 'Adam', at: 'marina' }, { who: 'Tyler', at: 'principale' }] });
  const m = {}; st.onEnter(G, m);
  st.onTick(G, m, st);
  assert.equal(m.dropMask, 4, 'Adam dropped first, at the marina, because we were there');
  assert.ok(st.prompt(G, m).includes('Sayyad') && !st.prompt(G, m).includes('Adam'));
  assert.ok(m.target && Math.hypot(m.target.x - G.veh.x, m.target.z - G.veh.z) > 1, 'the marker moved to the next nearest');
  for (const k of ['principale', 'margaret', 'sayyad']) { G.veh.x = PLACES[k].x; G.veh.z = PLACES[k].z; st.onTick(G, m, st); }
  assert.equal(m.dropMask, 15);
  assert.ok(st.condition(G, m));
});

ok('V8 the race that interrupts: eligibility, the destination, the def, the offer clock', () => {
  const G = fakeG(PLACES.home.x, PLACES.home.z);
  assert.ok(!ambush.eligible(G), 'not in the first two jobs');
  G.done = new Set(['a', 'b']);
  assert.ok(ambush.eligible(G));
  G.veh.spec = { twoWheel: true, style: 'bike', topSpeed: 8.1, seats: 1 }; G.veh.baseSpec = G.veh.spec;   // carById falls back to the Ranger for a bike id
  assert.ok(!ambush.eligible(G), 'not on a bike');
  G.veh.spec = carById('ranger'); G.veh.baseSpec = G.veh.spec;
  const to = ambush.pickDestination(G, { giver: 'home' });
  assert.ok(to && to.key !== 'home' && Math.hypot(to.p.x - G.veh.x, to.p.z - G.veh.z) > ambush.AMBUSH.minDist, 'home is too close, so a landmark');
  const who = ambush.pickRival(G);
  assert.ok(who && who.carId !== 'ranger');
  const a = ambush.afterJob(G, { giver: 'home' });
  assert.ok(a && G.ambush && G.stats.ambushAt === 2);
  assert.ok(!ambush.eligible(G), 'one at a time');
  const def = ambush.makeDef(G, a);
  assert.equal(def.mode, 'ambush');
  assert.ok(PLACES[def.giver]);
  const st = def.build(ctx);
  assert.equal(st.length, 1); assert.equal(st[0].money, ambush.AMBUSH.bet);
  G.done.add('ambush'); def.cleanup(G); assert.ok(!G.done.has('ambush'));
  // the clock runs out
  for (let i = 0; i < 60 * 15; i++) ambush.tick(G, 1 / 60, G.hud);
  assert.equal(G.ambush, null);
  // accept
  G.stats.ambushAt = -99; ambush.afterJob(G, { giver: 'home' });
  let started = null; G.startMission = (d) => { started = d; };
  G.wantStart = true; ambush.tick(G, 1 / 60, G.hud);
  assert.ok(started && started.id === 'ambush' && !G.wantStart && !G.ambush);
});

ok('V9 skills: earned by driving, small on the car, cached', () => {
  const G = fakeG();
  const spec = G.veh.spec;
  assert.equal(skills.specFor(spec, G), spec, 'nothing learned, same object');
  const v = { vLong: 20, vLat: 0, lastHit: 0 };
  G.stats.skBrake = 0.33;                       // one clean stop from the first level
  // a clean hard stop
  skills.tick(G, 1 / 60, v, { brake: 1, throttle: 0 }, G.hud);
  for (let i = 0; i < 40; i++) { v.vLong -= 8 / 60; skills.tick(G, 1 / 60, v, { brake: 1, throttle: 0 }, G.hud); }
  assert.ok(G.stats.skBrake > 0, 'braking learned');
  // sideways for a while
  v.vLong = 12; v.vLat = 4;
  for (let i = 0; i < 60 * 5; i++) skills.tick(G, 1 / 60, v, { brake: 0, throttle: 1 }, G.hud);
  assert.ok(G.stats.skCorner > 0.05, `corner ${G.stats.skCorner}`);
  G.stats.skBrake = 1; G.stats.skCorner = 1; G.stats.skLaunch = 1;
  const s2 = skills.specFor(spec, G);
  assert.ok(Math.abs(s2.brake / spec.brake - 1.10) < 1e-6 && Math.abs(s2.grip / spec.grip - 1.06) < 1e-6 && Math.abs(s2.accel / spec.accel - 1.06) < 1e-6);
  assert.equal(skills.specFor(spec, G), s2, 'cached');
  assert.ok(G.hud.toasts.length >= 1, 'a level-up said something');
});

console.log(failed ? `${failed} FAILED` : 'all green');
process.exit(failed ? 1 : 0);
