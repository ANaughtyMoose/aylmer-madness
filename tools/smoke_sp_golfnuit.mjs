// Mission 6, « N'importe quelle petite clé », and the shared cart kit:
//   node tools/smoke_sp_golfnuit.mjs
import { MAP } from '../src/game/mapdata.js';
import { carById, Vehicle } from '../src/game/cars.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MISSIONS } from '../src/game/missions.js';
import { GOLF_MISSIONS } from '../src/game/golfjob.js';
import { stageEnter, stageStep, stageExit, stageTarget, missionCleanup } from '../src/game/missionkit.js';
import {
  golfnuit, tryKey, newKeys, COURSE, courseRamps, allRamps, GOLFNUIT, jumpBonus,
  JOYRIDE, CHASE, TEE, SAYYAD_PATH, FENCE, fenceStep, buildFenceMesh, sayyadSteer,
  SAYYAD, SAY_JUMP, OWNERS_WHO, OWNERS_LINES, OWNERS_CLOSE, OWNERS_LAST,
} from '../src/game/setpieces/golfnuit.js';
import {
  rampAt, wrapGround, kickerAir, installRamps, removeRamps, chainStages,
  newAir, airStep, forgiveLanding, governorStep, swapIntoCart, swapBack, buildRampMesh,
} from '../src/game/setpieces/cartkit.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

if (!globalThis.localStorage) {
  const mm = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mm.has(k) ? mm.get(k) : null), setItem: (k, v) => mm.set(k, String(v)),
    removeItem: (k) => mm.delete(k), clear: () => mm.clear(), key: (i) => [...mm.keys()][i] ?? null,
    get length() { return mm.size; },
  };
}
resolvePlaces({
  bounds: MAP.bounds,
  nearestRoad(x, z) {
    let bd = Infinity, best = { x, z, yaw: 0, name: '' };
    for (const r of MAP.roads) for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '' }; }
    }
    return best;
  },
});

// ---------------------------------------------------------------- keys
group('the keys');
{
  let s = newKeys();
  const a = tryKey(s); s = a.state;
  ok(a.result === 'fail' && a.key && a.key.say, 'key 1 fails, and Sayyad says something');
  const b = tryKey(s); s = b.state;
  ok(b.result === 'fail', 'key 2 fails');
  const c = tryKey(s); s = c.state;
  ok(c.result === 'works' && s.works, 'key 3 works');
  ok(tryKey(s).result === 'already', 'and after that there is nothing left to try');
  ok(newKeys().tries === 0, 'tryKey does not mutate its input');
  for (const r of [a, b, c]) ok(r.key.say.length <= 70 && r.key.say.split(/\s+/).length <= 12, `bubble short: « ${r.key.say} »`);
}

// ---------------------------------------------------------------- ramps
group('runtime ramps');
const flatG = { h: 0, nx: 0, ny: 1, nz: 0, kind: 'grass' };
const flat = () => flatG;
{
  const r = { x: 0, z: 0, yaw: 0, len: 2.6, height: 1.1 };
  ok(Math.abs(rampAt(r, 0, -2.6).h) < 1e-9, 'zero at the foot (no hit on the way in)');
  ok(Math.abs(rampAt(r, 0, -0.0001).h - 1.1) < 1e-3, 'full height at the lip');
  ok(Math.abs(rampAt(r, 0, -0.0001).gz - 2 * 1.1 / 2.6) < 1e-3, 'lip slope is 2H/len');
  ok(rampAt(r, 3, -1) === null, 'nothing beside it');
  const g = wrapGround(flat, [r])(0, -1);
  ok(g.h > 0 && g.nz < 0 && g.ny < 1, 'wrapGround adds height and tilts the normal');
  ok(wrapGround(flat, [r])(50, 50) === flatG, 'and passes through away from it');
  const yawed = { ...r, yaw: Math.PI / 2 };
  ok(rampAt(yawed, -1, 0) && rampAt(yawed, -1, 0).gx > 0, 'a yawed ramp climbs along its heading');
  const mesh = buildRampMesh(r);
  ok(mesh && mesh.i && mesh.i.length > 0, 'the wedge mesh builds');
  ok(kickerAir(r, 24) > 1.1, `prediction: ${kickerAir(r, 24).toFixed(2)} s of air at 24 km/h`);
}

// A real cart on a flat world with one ramp, through cars.js.
function world(list) {
  const ground = wrapGround(flat, list);
  return {
    roadAt: () => false, querySegments: () => [], queryPoles: () => [], waterAt: () => false,
    groundAt: ground, groundY: (x, z) => ground(x, z).h, bounds: MAP.bounds,
  };
}
function jumpRun(gov) {
  const r = { x: 0, z: 60, yaw: 0, len: GOLFNUIT.rampLen, height: GOLFNUIT.rampH };
  const w = world([r]);
  const v = new Vehicle(carById('cart'));
  v.reset(0, 0, 0);
  const ctl = { steer: 0, throttle: 1, brake: 0, handbrake: false };
  const air = newAir(); let st = air, landed = null, top = 0, dmg0 = 0;
  for (let i = 0; i < 60 * 30 && !landed; i++) {
    if (gov) governorStep(v, 1 / 60, GOLFNUIT.govKmh);
    v.update(1 / 60, ctl, w);
    top = Math.max(top, v.speedKmh);
    const s = airStep(st, v, 1 / 60); st = s.state;
    forgiveLanding(st, v);
    if (s.landed && s.landed.jump) landed = s.landed;
    if (!st.flying && v.z < 55) dmg0 = v.damage;
  }
  return { landed, top, v, st, dmg0 };
}
group('the cart off a ramp');
{
  const slow = jumpRun(false);
  ok(slow.landed && slow.landed.air >= 1.0, `stock cart (${slow.top.toFixed(1)} km/h): ${slow.landed && slow.landed.air.toFixed(2)} s of air`);
  const fast = jumpRun(true);
  ok(Math.abs(fast.top - GOLFNUIT.govKmh) < 3.5, `governor off: ${fast.top.toFixed(1)} km/h on the run-up`);
  ok(fast.landed && fast.landed.air >= 1.4, `and ${fast.landed && fast.landed.air.toFixed(2)} s of air`);
  ok(fast.v.damage <= fast.dmg0 + 1e-9, `the landing costs the tub nothing (${fast.v.damage.toFixed(2)})`);
  ok(fast.st.jumps === 1, 'the tracker counted one jump');
  // No governor on a car nobody asked for.
  const v = new Vehicle(carById('cart')); v.reset(0, 0, 0);
  ok(governorStep(v, 1 / 60, 34) === 0, 'governorStep does nothing without the pedal');
}

group('install / remove');
{
  const phys = { groundAt: flat, groundY: () => 0 };
  const G = { phys };
  const h = installRamps(G, [{ x: 0, z: 0, yaw: 0, len: 2.6, height: 1.1 }]);
  ok(G.phys.groundAt !== flat && G.phys.groundY(0, -0.1) > 1, 'installRamps wraps G.phys');
  removeRamps(G, h);
  ok(G.phys.groundAt === flat, 'removeRamps puts the original back');
  let threw = null;
  try { removeRamps(G, h); removeRamps(G, null); removeRamps({}, installRamps({}, [])); } catch (e) { threw = e; }
  ok(!threw, 'and is safe twice, with null, and without a world', threw && threw.message);
  const st = chainStages([{ x: 1, z: 2 }, { x: 3, z: 4 }], { label: 'CP', sub: 'W' });
  ok(st.length === 2 && st[1].text === 'CP 2/2' && st[0].at.x === 1, 'chainStages builds one stage per point');
}

group('swap in and back');
{
  const mk = () => {
    const G = { carId: 'ranger', veh: { spec: { id: 'ranger' }, x: 0, z: 0 }, parked: {} };
    G.swapCar = (id) => {
      G.parked[G.veh.spec.id] = { x: G.veh.x, z: G.veh.z, yaw: 0 };
      delete G.parked[id];
      G.carId = id; G.veh = { spec: { id }, x: G.veh.x, z: G.veh.z };
    };
    return G;
  };
  const G = mk(), m = {};
  ok(swapIntoCart(G, m, { x: 5, z: 5 }) && G.carId === 'cart' && m.cameIn === 'ranger', 'no cart parked: a fresh one, and you are in it');
  ok(!!G.parked.ranger, 'your car stays parked');
  G.veh.x = 400;
  ok(!swapBack(G, m) && G.carId === 'cart', 'far from your car: no swap back');
  G.veh.x = 3;
  ok(swapBack(G, m, { cartSpot: { x: 9, z: 9, yaw: 0 } }) && G.carId === 'ranger', 'next to it: back in your car');
  ok(G.parked.cart.x === 9, 'and the cart goes back on the apron');
}

// ---------------------------------------------------------------- mission
// Tom, 6 Oct 2026: "Sayyad started it, drove it around with Tom, the owners of
// the course came out and chased us, we had a brief high-speed golf cart chase,
// went back to our bikes, then biked away and hopped a fence."
group('the mission: Tom’s beats, in his order');
{
  ok(GOLF_MISSIONS.length === 1 && GOLF_MISSIONS[0] === golfnuit, 'golfjob.js exports it as GOLF_MISSIONS');
  ok(MISSIONS.some((d) => d.id === 'golfcart'), 'registered under the old id golfcart');
  ok(golfnuit.title === 'N’importe quelle petite clé', golfnuit.title);
  ok(golfnuit.timeOfDay === 'night' && golfnuit.giver === 'golf', 'night, given at the golf');
  ok(/vélo/.test(golfnuit.brief), 'the brief says they came on bikes');
  const inCar = golfnuit.build({ carId: 'ranger', seats: 2 });
  const onBike = golfnuit.build({ carId: 'dbike', seats: 1 });
  const kinds = inCar.map((s) => s.kind);
  const want = ['velo', 'keys', 'sayyad', 'cp1', 'cp2', 'cp3', 'chase1', 'chase2', 'chase3', 'chase4', 'bikes', 'fence'];
  ok(kinds.join(',') === want.join(','), `the stages: ${kinds.join(' > ')}`);
  ok(onBike.length === inCar.length - 1 && onBike[0].kind === 'keys', 'on a bike already: no bikes out of the truck');
  ok(JOYRIDE.length === 3 && CHASE.length === 4, 'three joyride flags, four chase flags');
  for (const st of inCar) {
    ok(st.text && st.sub && st.hint, `${st.kind}: text, sub, hint`);
    ok(/\b(E|W|A\/D|GPS|Espace)\b/.test(st.sub), `${st.kind}: sub names a key`);
    for (const t of [st.text, st.sub, st.hint, st.holdText, st.toast, st.failWhy]) {
      if (t) ok(!/—/.test(t), `${st.kind}: no em dash`, t);
    }
  }
  const chase = inCar.filter((s) => /^chase|^bikes/.test(s.kind));
  ok(chase.every((s) => s.time === GOLFNUIT.chaseTime), `one ${GOLFNUIT.chaseTime} s clock across the chase and the bikes`);
  // s1-timers: the clock comes from the pace rule now; smoke_timers holds it
  // between the cart ceiling and floor. This only says it is still a sprint.
  ok(GOLFNUIT.chaseTime >= 45 && GOLFNUIT.chaseTime <= 130, 'the chase is brief');
  ok(chase.every((s) => /pogné/.test(s.failWhy) && !/bless|hôpital|cass/i.test(s.failWhy)), 'getting caught is a talking-to, nobody hurt');
  ok(inCar.find((s) => s.kind === 'bikes').hold === true, 'the bikes: stop and E');
  ok(inCar.filter((s) => s.kind !== 'fence').every((s) => !s.cost), 'it costs nothing');
  ok(jumpBonus(3) === 6 && jumpBonus(100) === GOLFNUIT.jumpPayMax, 'jump bonus is small and capped');
}

group('who speaks what');
{
  const W = (list) => { const set = new Set(list.split('|')); return { test: (t) => (String(t).toLowerCase().match(/[\p{L}’']+/gu) || []).some((w) => set.has(w)) }; };
  const en = W('the|you|i|it|is|my|your|me|a|that|to|of|on|one|next|okay|off|again|told|any|this|have|they|leave|write|down|both|hands|lap|roof|sorry|sir|give|another|i’m|you’re|it’s|somebody’s|gonna|four|wheels|faster|do|go|jump|bikes|bike|truck|lights|small|key|trust');
  const fr = W('le|la|les|vous|ça|c’est|pis|tout|notre|au|vos|de|des|je|j’vous|icitte|mes|arrêtez|revenez|heille|presque|allumez|lumières|dessus|suite|autres|pèse|l’avais|moins');
  const sayyad = [...Object.values(SAYYAD), ...SAY_JUMP, ...[0, 1, 2].map((i) => tryKey({ tries: i, works: false }).key.say)];
  ok(sayyad.every((t) => en.test(t) || /^[A-Z!. ]+$/.test(t)), 'Sayyad speaks English', sayyad.filter((t) => !en.test(t)).join(' | '));
  ok(sayyad.every((t) => !fr.test(t)), 'no French in Sayyad’s mouth', sayyad.filter((t) => fr.test(t)).join(' | '));
  const owners = [...OWNERS_LINES, OWNERS_CLOSE, OWNERS_LAST];
  ok(OWNERS_WHO === 'Le proprio', 'the owners speak as « Le proprio »');
  ok(owners.every((t) => fr.test(t) || /presque|Pèse|revenez/i.test(t)), 'the owners speak French', owners.join(' | '));
  ok(owners.every((t) => !en.test(t.replace(/’/g, "'"))), 'and no English', owners.filter((t) => en.test(t)).join(' | '));
  ok(/sir/i.test(SAYYAD.sorry), 'Sayyad is polite with his elders, even these ones');
  for (const t of [...sayyad, ...owners]) {
    ok(t.length <= 70 && t.split(/\s+/).length <= 12 && !/—/.test(t), `bubble fits: « ${t} »`);
  }
}

group('the fence');
{
  const f = FENCE;
  let s = { prev: null, boosted: false, over: false };
  // Ride straight into it: bounced back.
  let r = fenceStep(s, { x: f.x, z: f.z - 0.3, vy: 0, inAir: false }); s = r.s;
  r = fenceStep(s, { x: f.x, z: f.z + 0.2, vy: 0, inAir: false }); s = r.s;
  ok(r.bounce && !r.done, 'riding into the wire bounces you back');
  // Hop 5 m before it: boosted, over, landed.
  s = { prev: null, boosted: false, over: false };
  r = fenceStep(s, { x: f.x, z: f.z - 5, vy: 3.05, inAir: true, speedKmh: 25 }); s = r.s;
  ok(r.boost >= GOLFNUIT.fenceVy, `a hop 5 m out gets the boost (${r.boost} m/s)`);
  const peak = (r.boost * r.boost) / (2 * 9.81);
  ok(peak > GOLFNUIT.fenceH, `which clears the fence (${peak.toFixed(2)} m over ${GOLFNUIT.fenceH} m)`);
  const air = (2 * r.boost) / 9.81;
  ok(air * (25 / 3.6) > 5 + 1, `and stays up long enough to land past it at 25 km/h (${(air * 25 / 3.6).toFixed(1)} m)`);
  const slow = fenceStep({ prev: null, boosted: false, over: false }, { x: f.x, z: f.z - 6, vy: 3.05, inAir: true, speedKmh: 6 });
  ok(slow.carry > 0 && (2 * slow.boost / 9.81) * slow.carry > 6, 'a slow hop is carried over too (it is a game)');
  r = fenceStep(s, { x: f.x, z: f.z + 0.4, vy: 1, inAir: true }); s = r.s;
  ok(!r.bounce && s.over && !r.done, 'over it, still in the air');
  r = fenceStep(s, { x: f.x, z: f.z + 4, vy: 0, inAir: false });
  ok(r.done, 'and back on the ground on the street side: done');
  // A hop 20 m out does nothing for you.
  r = fenceStep({ prev: null, boosted: false, over: false }, { x: f.x, z: f.z - 20, vy: 3, inAir: true });
  ok(r.boost == null, 'a hop from too far gets no boost');
  // Round the end of it: not the fence, no bounce, not done.
  r = fenceStep({ prev: -1, boosted: false, over: false }, { x: f.x + f.len, z: f.z + 1, vy: 0, inAir: false });
  ok(!r.bounce && !r.done, 'going round the end is not hopping it');
  const mesh = buildFenceMesh();
  ok(mesh && mesh.i && mesh.i.length > 0, 'the fence mesh builds');
}

group('Sayyad drives');
{
  const v = { x: TEE.x, z: TEE.z, yaw: Math.PI, vx: 0, vz: 0 };
  const m = {};
  let end = false, t = 0;
  for (; t < 30 && !end; t += 1 / 60) {
    end = sayyadSteer(v, m, 1 / 60);
    v.x += v.vx / 60; v.z += v.vz / 60;
  }
  ok(end, `he drives the whole stretch (${t.toFixed(1)} s)`);
  ok(t > 6 && t < GOLFNUIT.sayyadMax, 'in a few seconds, not a cutscene');
  const lastP = SAYYAD_PATH[SAYYAD_PATH.length - 1];
  ok(Math.hypot(v.x - lastP.x, v.z - lastP.z) < 7 && v.vx === 0 && v.vz === 0, 'and stops at the top of the fairway');
}

group('the course is on open ground');
{
  const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const bad = MAP.areas.filter((a) => (a.k === 'water') && Array.isArray(a.p) && Array.isArray(a.p[0]));
  const pts = [...COURSE, ...allRamps(), TEE, ...SAYYAD_PATH, FENCE];
  for (const p of pts) {
    const wet = bad.some((a) => inPoly(p.x, p.z, a.p));
    let bd = Infinity; for (const b of MAP.buildings) bd = Math.min(bd, Math.hypot(b.c[0] - p.x, b.c[1] - p.z));
    ok(!wet && bd > 25, `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) dry, ${bd.toFixed(0)} m from a building`);
  }
  const g = PLACES.golf;
  ok(Math.hypot(TEE.x - g.x, TEE.z - g.z) < 120, 'the first tee is near the clubhouse');
  ok(Math.hypot(FENCE.x - TEE.x, FENCE.z - TEE.z) < 150, 'and the fence near the tee');
  let rd = Infinity;
  for (const r of MAP.roads) for (const [x, z] of r.pts) if (r.name === 'Rue du Golf') rd = Math.min(rd, Math.hypot(x - FENCE.x, z - FENCE.z));
  ok(rd < 40, `the fence is on the rue du Golf side (${rd.toFixed(0)} m)`);
}

group('playing it with a fake G');
const flat2 = () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind: 'grass' });
function fakeG(carId = 'ranger') {
  const G = {
    carId, phys: { groundAt: flat2, groundY: () => 0 }, parked: { cart: { x: 1250, z: -1300, yaw: 0 } },
    hud: { toast() {}, prompt() {} }, wantStart: false, rivals: [],
  };
  const mk = (id, x, z) => ({ spec: { id, seats: 1, twoWheel: /bike|cruiser/.test(id) }, x, z, yaw: Math.PI, speedKmh: 0, passengers: 0, damage: 0, airT: 0, vx: 0, vz: 0, vy: 0, inAir: false });
  G.veh = mk(carId, 1257, -1292);
  G.swapCar = (id) => {
    const p = G.parked[id];
    G.parked[G.veh.spec.id] = { x: G.veh.x, z: G.veh.z, yaw: 0 };
    delete G.parked[id];
    G.carId = id; G.veh = mk(id, p ? p.x : G.veh.x, p ? p.z : G.veh.z);
  };
  return G;
}
{
  const G = fakeG();
  const def = golfnuit;
  const m = { def, stages: def.build({ carId: 'ranger', seats: 2 }), idx: 0 };
  G.mission = m;
  const enter = () => { const st = m.stages[m.idx]; m.target = stageTarget(G, m, st); stageEnter(G, m, st); };
  const done = () => { const st = m.stages[m.idx]; stageExit(G, m, st); m.idx++; if (m.idx < m.stages.length) enter(); };
  const kind = () => m.stages[m.idx] && m.stages[m.idx].kind;
  const step = () => stageStep(G, m, m.stages[m.idx], 1 / 60);
  enter();
  // velo
  G.wantStart = true;
  ok(step() === 'done', 'velo: stopped in the lot, E');
  done();
  ok(G.carId === 'dbike' && !!G.parked.ranger, 'on the Diamondback; the truck stays in the lot');
  ok(G.phys.groundAt !== flat2, 'the ramps go in with the keys stage');
  ok(Math.hypot(G.parked.cart.x - TEE.x, G.parked.cart.z - TEE.z) < 1, 'the cart waits at the first tee');
  // keys: ride over, three keys
  G.veh.x = TEE.x + 3; G.veh.z = TEE.z;
  let res = null;
  for (let k = 0; k < 3; k++) { G.wantStart = true; res = step(); if (k < 2) ok(res == null, `key ${k + 1}: nothing`); }
  ok(res === 'done' && G.carId === 'cart' && m.cameIn === 'dbike', 'key 3: Sayyad starts it, you are in the cart, the bike parked');
  done();
  ok(kind() === 'sayyad', 'then Sayyad drives');
  for (let t = 0; t < 40 * 60 && kind() === 'sayyad'; t++) {
    const r = step();
    G.veh.x += G.veh.vx / 60; G.veh.z += G.veh.vz / 60;
    if (r === 'done') done();
  }
  ok(kind() === 'cp1', 'and hands over at the top of the fairway');
  for (const p of JOYRIDE) { G.veh.x = p.x; G.veh.z = p.z; ok(step() === 'done', m.stages[m.idx].text); done(); }
  ok(kind() === 'chase1' && !!m.chase, 'the lights, the owners, the chase');
  ok(G.rivals.length === 0 || G.rivals.some((r) => r.name === 'Les proprios'), 'their cart (when there is a world for it)');
  // A near-catch: sit still until the gap closes.
  m.timeLeft = GOLFNUIT.chaseTime;
  G.veh.x = 0; G.veh.z = 0;
  const t0 = m.timeLeft;
  for (let i = 0; i < 60 * 7; i++) { step(); m.timeLeft -= 1 / 60; }
  ok(m.chase.catches >= 1 && m.timeLeft < t0 - 7 - GOLFNUIT.catchPenalty + 0.1, `standing still: they nearly get you (${m.chase.catches}), it costs seconds`);
  ok(m.idx === m.stages.findIndex((s) => s.kind === 'chase1'), 'but the job goes on');
  for (const p of CHASE) {
    G.veh.x = p.x; G.veh.z = p.z;
    ok(step() === 'done', m.stages[m.idx].text);
    const left = m.timeLeft;
    done();
    ok(m.timeLeft === left, 'the clock carries over');
  }
  ok(kind() === 'bikes', 'back to the bikes');
  const bike = G.parked.dbike;
  G.veh.x = bike.x + 2; G.veh.z = bike.z; G.wantStart = true;
  ok(step() === 'done', 'stopped by the bikes, E');
  done();
  ok(G.carId === 'dbike' && !!G.parked.cart, 'on the bike, the cart left behind');
  ok(G.phys.groundAt === flat2, 'the ramps are gone');
  ok(kind() === 'fence', 'then the fence');
  // Ride at it and hop.
  G.veh.x = FENCE.x; G.veh.z = FENCE.z - 5; G.veh.inAir = true; G.veh.vy = 3.05; G.veh.speedKmh = 22;
  step();
  ok(G.veh.vy >= GOLFNUIT.fenceVy, 'Espace near the fence: the hop clears it');
  G.veh.z = FENCE.z + 0.5; step();
  G.veh.z = FENCE.z + 4; G.veh.inAir = false;
  ok(step() === 'done', 'over the fence and down: safe');
  done();
  ok(m.idx === m.stages.length, 'the job is done');
  missionCleanup(G, m, true);
  ok(G.carId === 'ranger' && Math.hypot(G.parked.cart.x - 1257, G.parked.cart.z + 1297) < 30, 'cleanup sends the cart home to the clubhouse');
}
{
  // Backspace in the middle of the chase, next to the bike: back on it.
  const G = fakeG('dbike');
  const m = { def: golfnuit, stages: golfnuit.build({ carId: 'dbike' }), idx: 0 };
  G.mission = m;
  stageEnter(G, m, m.stages[0]);
  G.veh.x = TEE.x; G.veh.z = TEE.z;
  for (let k = 0; k < 3; k++) { G.wantStart = true; stageStep(G, m, m.stages[0], 1 / 60); }
  ok(G.carId === 'cart', 'in the cart');
  missionCleanup(G, m, true);
  ok(G.carId === 'dbike' && G.phys.groundAt === flat2, 'Backspace next to the bike: back on it, ramps gone');
  let threw = null;
  try { golfnuit.cleanup({}, {}); golfnuit.cleanup({ carId: 'cart' }, { cameIn: 'dbike' }); } catch (e) { threw = e; }
  ok(!threw, 'cleanup on a half-built job does not throw', threw && threw.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
