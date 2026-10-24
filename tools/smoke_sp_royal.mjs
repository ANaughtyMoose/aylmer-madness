// Mission 9, « 5 h 45 au Royal Ottawa » (school + russellroyal):
//   node tools/smoke_sp_royal.mjs
import { MAP } from '../src/game/mapdata.js';
import { carById, Vehicle } from '../src/game/cars.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { ALL_MISSIONS } from '../src/game/missions.js';
import { stageEnter, stageStep, stageExit, stageTarget, missionCleanup } from '../src/game/missionkit.js';
import { wrapGround, newAir, airStep, governorStep } from '../src/game/setpieces/cartkit.js';
import {
  ROYAL, newChase, chaseStep, newHill, hillStep, newString, stringStep, newLaunch, launchStep,
  newSki, skiStep, skierPos, hillAssist, newRant, rantStep, RANT,
} from '../src/game/setpieces/royal_mech.js';
import {
  SCHOOL_MISSION, RUSSELL_MISSION, CHASE, HILL, HILL_TOP, HILL_BOTTOM, LAUNCH_PAD, LAUNCH_RAMP,
  SKI_ZONE, SKI_RAMPS, CART_SPOT, RUSSELL_SPOT, chaseRamps, SAY_JUMP, K,
} from '../src/game/setpieces/royal.js';
import { createRoyalFx } from '../src/game/setpieces/royal_fx.js';

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
const DT = 1 / 60;

// ---------------------------------------------------------------- chase
group('the marshal (chaseStep)');
{
  let s = newChase();
  for (let i = 0; i < 60 * 5; i++) s = chaseStep(s, DT, { speedKmh: 34 });
  ok(s.gap > ROYAL.marshalGap0 && s.catches === 0, `flat out in the cart, the gap opens (${s.gap.toFixed(0)} m)`);
  let caught = 0; s = newChase();
  for (let i = 0; i < 60 * 30; i++) { s = chaseStep(s, DT, { speedKmh: 0 }); if (s.caught) caught++; }
  ok(caught >= 1 && s.catches === caught, `stopped, he catches up (${caught} near-catches in 30 s)`);
  ok(s.gap > 0 && s.gap <= ROYAL.marshalCatchBack, 'and falls back after each one (no instant fail)');
  ok(newChase().gap === ROYAL.marshalGap0, 'chaseStep does not mutate');
}

// ---------------------------------------------------------------- hill
group('handbrake hill (hillStep)');
{
  let s = newHill();
  s = hillStep(s, DT, { atTop: true });
  ok(s.crest, 'the crest counts');
  for (let i = 0; i < 60 * 3; i++) s = hillStep(s, DT, { onHill: true, handbrake: true, speedKmh: 30 });
  ok(s.screech >= ROYAL.hillNeed, `3 s of Espace on the hill: ${s.screech.toFixed(1)} s of screech`);
  s = hillStep(s, DT, { atBottom: true });
  ok(s.done, 'the bottom with enough screech: done');
  let t = hillStep(newHill(), DT, { atTop: true });
  for (let i = 0; i < 60; i++) t = hillStep(t, DT, { onHill: true, handbrake: false, slip: 0, speedKmh: 30 });
  ok(t.screech === 0, 'no Espace, no slide: no screech');
  for (let i = 0; i < 30; i++) t = hillStep(t, DT, { onHill: true, slip: 3.5, speedKmh: 30 });
  ok(t.screech > 0.4, 'a real slide counts without Espace');
  t = hillStep(t, DT, { atBottom: true });
  ok(!t.done && t.short, 'the bottom without enough: sent back up, not failed');
  for (let i = 0; i < 60; i++) t = hillStep(t, DT, { onHill: true, handbrake: true, speedKmh: 30 });
  ok(t.screech < 1, 'screech does not count while being sent back');
  t = hillStep(t, DT, { atTop: true });
  ok(!t.short && t.crest, 'the top clears it');
  let parked = hillStep(newHill(), DT, { atTop: true });
  for (let i = 0; i < 600; i++) parked = hillStep(parked, DT, { onHill: true, handbrake: true, speedKmh: 0 });
  ok(parked.screech === 0, 'sitting still with Espace held is not a screech');
}

// ---------------------------------------------------------------- string
group('weed-whacker string (stringStep)');
{
  let s = newString();
  s = stringStep(s, { press: true, speedKmh: 20 });
  ok(s.ties === 0 && s.rolling, 'rolling: E does nothing');
  for (let i = 0; i < ROYAL.stringNeed - 1; i++) s = stringStep(s, { press: true, speedKmh: 0 });
  ok(!s.done && s.ties === ROYAL.stringNeed - 1, `${s.ties} ties, not yet`);
  s = stringStep(s, { press: false, speedKmh: 0 });
  ok(!s.done, 'no press, no tie');
  s = stringStep(s, { press: true, speedKmh: 2 });
  ok(s.done, `${ROYAL.stringNeed} ties: the bumper holds`);
}

// ---------------------------------------------------------------- launch (pure)
group('golf ball in the exhaust (launchStep)');
{
  let s = newLaunch(), r;
  r = launchStep(s, DT, { press: true, speedKmh: 20 }); s = r.state;
  ok(s.phase === 'idle', 'rolling: no ball');
  r = launchStep(s, DT, { press: true, speedKmh: 0 }); s = r.state;
  ok(s.phase === 'jammed', 'stopped, E: the ball is in');
  r = launchStep(s, DT, { throttle: 1 }); s = r.state;
  ok(s.phase === 'sputter' && r.kick === 0, 'W: it sputters first');
  let t = 0;
  while (s.phase === 'sputter' && t < 5) { r = launchStep(s, DT, { throttle: 1, vLong: 0 }); s = r.state; t += DT; }
  ok(Math.abs(t - ROYAL.sputterT) < 0.1, `after ${t.toFixed(2)} s of pout pout`);
  r = launchStep(s, DT, { throttle: 1, vLong: 0 }); s = r.state;
  ok(r.kick > 15, `then the kick: +${r.kick.toFixed(1)} m/s`);
  r = launchStep(s, DT, { throttle: 1, vLong: 16.1, inAir: true }); s = r.state;
  ok(s.phase === 'flying' && r.kick === 0, 'takeoff ends the push');
  r = launchStep(s, DT, { landed: true }); s = r.state;
  ok(s.done, 'landing: done');
  let q = { ...newLaunch(), phase: 'sputter' };
  for (let i = 0; i < 120; i++) q = launchStep(q, DT, { throttle: 0 }).state;
  ok(q.phase === 'sputter', 'let go of W and it just waits');
}

// ---------------------------------------------------------------- real physics
const flatG = { h: 0, nx: 0, ny: 1, nz: 0, kind: 'grass' };
const flat = () => flatG;
function world(list) {
  const ground = wrapGround(flat, list);
  return {
    roadAt: () => false, querySegments: () => [], queryPoles: () => [], waterAt: () => false,
    groundAt: ground, groundY: (x, z) => ground(x, z).h, bounds: MAP.bounds,
  };
}
group('the launch through cars.js');
{
  const ramp = { ...LAUNCH_RAMP, x: 0, z: 40, yaw: 0 };
  const w = world([ramp]);
  const v = new Vehicle(carById('cart')); v.reset(0, 0, 0);
  const ctl = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  let s = launchStep(newLaunch(), DT, { press: true, speedKmh: 0 }).state;
  let air = newAir(), best = 0, top = 0;
  ctl.throttle = 1;
  for (let i = 0; i < 60 * 12 && !s.done; i++) {
    const r = launchStep(s, DT, { throttle: 1, speedKmh: v.speedKmh, vLong: v.vLong, inAir: v.inAir || v.airT > 0, landed: false });
    s = r.state;
    if (s.phase === 'sputter') { v.vx *= 0.9; v.vz *= 0.9; v.vLong *= 0.9; }
    if (r.kick > 0) { v.vx += Math.sin(v.yaw) * r.kick; v.vz += Math.cos(v.yaw) * r.kick; v.vLong += r.kick; }
    v.update(DT, ctl, w);
    top = Math.max(top, v.speedKmh);
    const a = airStep(air, v, DT); air = a.state;
    if (a.landed) { best = Math.max(best, a.landed.air); s = launchStep(s, DT, { landed: true }).state; }
  }
  ok(top > 45, `the cart hits ${top.toFixed(0)} km/h (stock top is 24)`);
  ok(best >= 1.2, `and flies ${best.toFixed(2)} s off the kicker`);
}
group('the hill through cars.js');
{
  const hill = { ...HILL, x: 0, z: 0, yaw: 0 };   // climbs toward +z; crest at z=0; descend toward -z
  const w = world([hill]);
  const v = new Vehicle(carById('cart'));
  v.reset(0, -1, Math.PI, w.groundY(0, -1));      // just over the crest, facing down
  v.vz = -4; v.vLong = 4;                         // rolling over the top at ~14 km/h
  const ctl = { steer: 0.35, throttle: 1, brake: 0, handbrake: true };
  let s = hillStep(newHill(), DT, { atTop: true }), t = 0, top = 0;
  while (t < 20 && v.z > -HILL.len - 5) {
    const pu = hillAssist(v, { x: 0, z: -1 }, DT, { onFace: v.z < 0 && v.z > -HILL.len, handbrake: ctl.handbrake });
    v.vx += pu.dvx; v.vz += pu.dvz;
    governorStep(v, DT, K.govKmh);                 // cartTick does this in the game
    v.update(DT, ctl, w); t += DT; top = Math.max(top, v.speedKmh);
    ctl.steer = Math.sin(t * 2) * 0.4;
    ctl.handbrake = Math.floor(t * 1.5) % 2 === 0;   // Espace in bursts, the way you would
    s = hillStep(s, DT, { handbrake: ctl.handbrake, speedKmh: v.speedKmh, slip: v.vLat, onHill: v.z < 0 && v.z > -HILL.len, atBottom: false });
  }
  ok(v.z <= -HILL.len - 5, `the cart gets down the hill with Espace in bursts (${t.toFixed(1)} s, ${top.toFixed(0)} km/h top)`);
  ok(s.screech >= ROYAL.hillNeed, `${s.screech.toFixed(1)} s of screech on the way down`);
  ok(top > 25 && t < 10, 'and it is quick about it, not a crawl');
  const none = hillAssist({ vx: 0, vz: 0 }, { x: 0, z: -1 }, DT, { onFace: true, handbrake: false });
  const fast = hillAssist({ vx: 0, vz: -20 }, { x: 0, z: -1 }, DT, { onFace: true, handbrake: true });
  ok(none.dvz === 0 && fast.dvz === 0, 'no assist without Espace, none past the top speed');
}

// ---------------------------------------------------------------- ski
group('fairway skiing (skiStep)');
{
  let s = newSki();
  for (let i = 0; i < 60 * 5; i++) s = skiStep(s, DT, { speedKmh: 25, yawRate: 0 });
  ok(Math.abs(s.swing) < 0.01 && s.score === 0, 'straight line: Tom trails, no points');
  s = newSki(); let t = 0;
  while (!s.done && t < 90) { s = skiStep(s, DT, { speedKmh: 26, yawRate: Math.sin(t * 1.3) * 0.9 }); t += DT; }
  ok(s.done, `zigzag at 26 km/h: ${ROYAL.skiNeed} points in ${t.toFixed(0)} s`, `score ${s.score.toFixed(1)}`);
  ok(t < 60, 'in under a minute of carving');
  let f = newSki(); t = 0;
  while (f.falls === 0 && t < 20) { f = skiStep(f, DT, { speedKmh: 40, yawRate: 1.4 }); t += DT; }
  ok(f.falls === 1 && f.down > 0, `a hard turn at 40 km/h: Tom eats it (after ${t.toFixed(1)} s)`);
  const sc = f.score;
  for (let i = 0; i < 30; i++) f = skiStep(f, DT, { speedKmh: 30, yawRate: 1 });
  ok(f.down > 0 && f.score === sc, 'no points while he is down');
  for (let i = 0; i < 60 * 3; i++) f = skiStep(f, DT, { speedKmh: 10, yawRate: 0 });
  ok(f.down === 0, 'and he gets back up');
  let slow = newSki();
  for (let i = 0; i < 60 * 10; i++) slow = skiStep(slow, DT, { speedKmh: 6, yawRate: 1.5 });
  ok(slow.score === 0, 'too slow to carve');
  const j = skiStep(newSki(), DT, { speedKmh: 20, yawRate: 0, air: true });
  ok(j.score === ROYAL.airBonus, 'a jump with Tom on the rope is a bonus');
  const p = skierPos({ x: 0, z: 0, yaw: 0 }, { swing: 0 });
  ok(Math.abs(p.z + ROYAL.rope) < 1e-9, 'Tom is a rope length behind the cart');
}

// ---------------------------------------------------------------- rant
group('the rant (Russell, English)');
{
  const FR = /(?<![\p{L}’])(le|la|les|un|une|des|du|de|pis|pas|je|tu|il|y|c’est|ça|que|qui|est|mon|ma|ton|au|dans|pour|avec|va|non|bon|là|sur|moi|toi|mais|si|fait)(?![\p{L}’])/iu;
  ok(RANT.length >= 8 && RANT.length <= 12, `${RANT.length} lines`);
  for (const l of [...RANT, ...SAY_JUMP]) {
    ok(l.length <= 70 && l.split(/\s+/).length <= 12 && !FR.test(l) && !/—/.test(l), `« ${l} »`);
  }
  let s = newRant(), said = [], t = 0;
  while (said.length < RANT.length && t < 200) { const r = rantStep(s, DT); s = r.state; if (r.say) said.push(r.say); t += DT; }
  ok(said.length === RANT.length && said[0] === RANT[0], `all of it in ${t.toFixed(0)} s of driving`);
}

// ---------------------------------------------------------------- the ground
group('the course is on open ground at the Royal Ottawa');
{
  const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const areas = MAP.areas.filter((a) => Array.isArray(a.p) && Array.isArray(a.p[0]));
  const club = areas.find((a) => a.name === 'Royal Ottawa Golf Club');
  ok(!!club, 'the club polygon is in mapdata');
  const bad = areas.filter((a) => ['water', 'wood'].includes(a.k));
  const pts = [CART_SPOT, RUSSELL_SPOT, ...CHASE, ...chaseRamps(), HILL, HILL_TOP, HILL_BOTTOM,
    { x: HILL.x + HILL.back, z: HILL.z }, { x: HILL.x - HILL.len, z: HILL.z },
    LAUNCH_PAD, LAUNCH_RAMP, { x: LAUNCH_RAMP.x - 40, z: LAUNCH_RAMP.z }, SKI_ZONE, ...SKI_RAMPS];
  for (const p of pts) {
    const wet = bad.some((a) => inPoly(p.x, p.z, a.p));
    let bd = Infinity; for (const b of MAP.buildings) bd = Math.min(bd, Math.hypot(b.c[0] - p.x, b.c[1] - p.z));
    ok(club && inPoly(p.x, p.z, club.p) && !wet && bd > 25, `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) on the course, ${bd.toFixed(0)} m from a building`);
  }
  const c = PLACES.royalottawa;
  ok(Math.hypot(CART_SPOT.x - c.x, CART_SPOT.z - c.z) < 60, 'the cart is next to the pickup pillar');
}

// ---------------------------------------------------------------- the missions
group('text rules');
{
  ok(ALL_MISSIONS.includes(SCHOOL_MISSION) && ALL_MISSIONS.includes(RUSSELL_MISSION), 'both registered');
  ok(/5 h 45/.test(SCHOOL_MISSION.brief) && SCHOOL_MISSION.timeOfDay === 'morning', 'school: 5 h 45, morning');
  const sch = SCHOOL_MISSION.build({ carId: 'ranger', carName: 'Ranger' });
  ok(sch.length === 1 && sch[0].at === 'royalottawa' && sch[0].time === 260 && sch[0].money === 20, 'school: one timed drive, 260 s (s1-timers pace), $20');
  const st = RUSSELL_MISSION.build({ carId: 'ranger' });
  ok(st.length === 1 + CHASE.length + 6, `${st.length} russellroyal stages`);
  for (const s of [...sch, ...st]) {
    ok(s.text && s.sub && s.hint && s.hint.length > 8, `${s.kind}: text, sub, hint`);
    ok(/\bEspace\b|\bGPS\b|pilier|(?:^|[\s(«])[EWSAD](?:\/[EWSAD])?(?=[\s,.!:·)»]|$)/u.test(s.sub), `${s.kind}: sub names a key`);
    for (const t of [s.text, s.sub, s.hint, s.holdText, s.toast, s.failWhy]) if (t) ok(!/—/.test(t), `${s.kind}: no em dash`, t);
  }
  ok(!/—/.test(SCHOOL_MISSION.brief + RUSSELL_MISSION.brief), 'briefs: no em dash');
  const home = st[st.length - 1];
  ok(home.at === 'home' && home.passengers === -1 && home.money === K.gas && /couvre pas le gaz/.test(home.toast), 'home: Russell out, gas money under the gas');
  ok(st.filter((s) => s.time).every((s) => s.kind.startsWith('chase')), 'the only clock is the chase');
}

function fakeG(carId = 'ranger') {
  const toasts = [], lines = [];
  const G = {
    carId, phys: { groundAt: flat, groundY: () => 0 },
    parked: { cart: { x: 1250, z: -1330, yaw: 0 } },
    veh: null, hud: { toast: (t) => toasts.push(t), prompt() {} }, wantStart: false,
    heckle: { line: (who, t) => lines.push([who, t]) }, rivals: [], raceParked: {},
    toasts, lines,
  };
  const mkVeh = (id, x, z) => ({ spec: carById(id), x, z, yaw: 0, speedKmh: 0, passengers: 0, damage: 0, airT: 0, vx: 0, vz: 0, vLong: 0, vLat: 0, yawRate: 0, throttle: 0 });
  G.veh = mkVeh(carId, PLACES.royalottawa.x, PLACES.royalottawa.z);
  G.swapCar = (id) => {
    const spot = G.parked[id];
    G.parked[G.veh.spec.id] = { x: G.veh.x, z: G.veh.z, yaw: 0 };
    delete G.parked[id];
    G.carId = id; G.veh = mkVeh(id, spot.x, spot.z);
  };
  return G;
}
function runner(G, def, ctx) {
  const m = { def, stages: def.build(ctx), idx: 0 };
  G.mission = m;
  const enter = () => { const st = m.stages[m.idx]; m.timeLeft = st.time ?? null; m.target = stageTarget(G, m, st); stageEnter(G, m, st); };
  const step = () => stageStep(G, m, m.stages[m.idx], DT);
  const done = () => {
    const st = m.stages[m.idx];
    if (st.passengers) G.veh.passengers = Math.max(0, G.veh.passengers + st.passengers);
    stageExit(G, m, st); m.idx++; if (m.idx < m.stages.length) enter();
  };
  enter();
  return { m, step, done, st: () => m.stages[m.idx] };
}

group('school with a fake G');
{
  const G = fakeG();
  G.veh.x = 0; G.veh.z = 0;
  const r = runner(G, SCHOOL_MISSION, { carId: 'ranger', carName: 'Ranger' });
  ok(r.step() == null, 'at home: not there yet');
  G.veh.x = PLACES.royalottawa.x; G.veh.z = PLACES.royalottawa.z;
  ok(r.step() === 'done', 'at the club: punched in');
}

group('russellroyal with a fake G, start to finish');
{
  const G = fakeG();
  const flatRef = G.phys.groundAt;
  const r = runner(G, RUSSELL_MISSION, {});
  const { m } = r;
  G.wantStart = true;
  ok(r.step() === 'done', 'pickup: stopped at the club, E');
  r.done();
  ok(G.carId === 'cart' && m.cameIn === 'ranger' && !!G.parked.ranger, 'in a cart, the Ranger parked at the club');
  ok(Math.hypot(G.veh.x - CART_SPOT.x, G.veh.z - CART_SPOT.z) < 1, 'the cart is the Royal Ottawa one, not the Gatineau apron');
  ok(m.cartHome && m.cartHome.x === 1250, 'the Gatineau cart spot is remembered');
  ok(G.phys.groundAt !== flatRef && G.phys.groundY(HILL.x + 1, HILL.z) > 7, 'ramps and the big hill are in');
  ok(G.rivals.length === 1 && G.rivals[0].name === 'Russell', 'Russell is out there in his own cart');
  ok(m.timeLeft === ROYAL.chaseTime, 'the chase clock starts');
  // Stand still a while: the marshal catches up, the clock pays, no fail.
  G.veh.speedKmh = 0;
  for (let i = 0; i < 60 * 10; i++) { const x = r.step(); m.timeLeft -= DT; if (x) break; }
  ok(m.chase.catches >= 1 && m.timeLeft < ROYAL.chaseTime - 10 - ROYAL.catchPenalty + 0.5, `sitting still: ${m.chase.catches} near-catch, clock ${m.timeLeft.toFixed(0)} s`);
  const left = m.timeLeft;
  for (const p of CHASE) {
    G.veh.x = p.x; G.veh.z = p.z; G.veh.speedKmh = 30;
    ok(r.step() === 'done', r.st().text);
    r.done();
    if (r.st().kind.startsWith('chase')) ok(Math.abs(m.timeLeft - left) < 1, 'one clock across the flags');
  }
  // hill
  ok(r.st().kind === 'hill' && m.target.x === HILL_TOP.x, 'the hill: marker at the top');
  G.veh.x = HILL_TOP.x; G.veh.z = HILL_TOP.z; G.veh.speedKmh = 20; r.step();
  ok(m.target.x === HILL_BOTTOM.x, 'at the top: marker moves to the bottom');
  G.veh.x = HILL_BOTTOM.x; G.veh.z = HILL_BOTTOM.z; r.step();
  ok(m.hill.short && m.target.x === HILL_TOP.x, 'straight down without Espace: back up, no fail');
  G.veh.x = HILL_TOP.x; G.veh.z = HILL_TOP.z; r.step();
  G.veh.x = HILL.x - 20; G.veh.z = HILL.z; G.veh.vLat = 4; G.veh.speedKmh = 30;
  let res = null;
  for (let i = 0; i < 60 * 3 && !res; i++) res = r.step();
  G.veh.x = HILL_BOTTOM.x; G.veh.z = HILL_BOTTOM.z;
  res = r.step();
  ok(res === 'done', 'slide down, reach the bottom: done');
  r.done();
  ok(G.rivals.length === 0, 'Russell leaves his cart behind');
  // string
  ok(r.st().kind === 'string', 'the string');
  G.veh.speedKmh = 20; G.wantStart = true; r.step();
  ok(m.string.ties === 0, 'rolling: no tie');
  G.veh.speedKmh = 0; res = null;
  for (let i = 0; i < ROYAL.stringNeed && !res; i++) { G.wantStart = true; res = r.step(); }
  ok(res === 'done', `${ROYAL.stringNeed} E: tied`);
  r.done();
  // launch
  ok(r.st().kind === 'launch', 'the golf ball');
  G.veh.x = LAUNCH_PAD.x; G.veh.z = LAUNCH_PAD.z; G.veh.speedKmh = 0; G.veh.yaw = -Math.PI / 2;
  G.wantStart = true; r.step();
  ok(m.launch.phase === 'jammed', 'E on the pad: jammed');
  G.veh.throttle = 1; res = null;
  let maxV = 0;
  for (let i = 0; i < 60 * 6 && !res; i++) {
    res = r.step(); maxV = Math.max(maxV, -G.veh.vx);
    if (m.launch.phase === 'flying') { G.veh.airT = 0.1; G.veh.inAir = true; }
    if (m.launch.phase === 'flying' && i % 60 === 0) { G.veh.airT = 0; G.veh.lastAir = 1.5; G.veh.inAir = false; }
  }
  ok(res === 'done', 'W: sputter, launch, land');
  ok(maxV > 14, `kicked west at ${(maxV * 3.6).toFixed(0)} km/h`);
  r.done();
  // ski
  ok(r.st().kind === 'ski', 'fairway skiing');
  G.veh.speedKmh = 26; res = null; let t = 0;
  for (; t < 120 && !res; t += DT) { G.veh.yawRate = Math.sin(t * 1.3) * 0.9; res = r.step(); }
  ok(res === 'done', `carved out in ${t.toFixed(0)} s`);
  r.done();
  // back to your car
  ok(r.st().kind === 'back', 'back to your car');
  const car = G.parked.ranger;
  ok(m.target && Math.hypot(m.target.x - car.x, m.target.z - car.z) < 1, 'its marker is your car');
  G.veh.x = car.x + 3; G.veh.z = car.z; G.veh.speedKmh = 0; G.wantStart = true;
  ok(r.step() === 'done', 'stopped next to it, E');
  r.done();
  ok(G.carId === 'ranger' && G.veh.passengers === 1, 'back in the Ranger, Russell aboard');
  ok(G.parked.cart && G.parked.cart.x === 1250, 'the club cart is back on its Gatineau apron');
  ok(G.phys.groundAt === flatRef, 'ramps gone');
  // home
  ok(r.st().kind === 'home', 'drive Russell home');
  G.lines.length = 0;
  for (let i = 0; i < 60 * 70; i++) r.step();
  const rl = G.lines.filter(([w]) => w === 'Russell').map(([, l]) => l);
  ok(rl.length === RANT.length, `Russell explains, ${rl.length} lines`);
  G.veh.x = PLACES.home.x; G.veh.z = PLACES.home.z; G.wantStart = true;
  ok(r.step() === 'done', 'in the driveway, E');
  r.done();
  ok(G.veh.passengers === 0, 'Russell gets out');
  missionCleanup(G, m, false);
  ok(G.carId === 'ranger' && G.phys.groundAt === flatRef, 'cleanup after the finish changes nothing');
}

group('Backspace mid-job');
{
  for (const upto of ['chase3', 'hill', 'ski']) {
    const G = fakeG();
    const flatRef = G.phys.groundAt;
    const r = runner(G, RUSSELL_MISSION, {});
    G.wantStart = true; r.step(); r.done();
    while (r.st().kind !== upto) { r.done(); }
    const inCart0 = G.carId === 'cart';
    // Drive back next to the Ranger, then abort.
    const car = G.parked.ranger;
    G.veh.x = car.x + 2; G.veh.z = car.z;
    missionCleanup(G, r.m, true);
    ok(inCart0 && G.carId === 'ranger', `${upto}: back in the Ranger`);
    ok(G.phys.groundAt === flatRef && G.rivals.length === 0, `${upto}: ramps and Russell gone`);
    ok(r.m.fx === null && G.parked.cart && G.parked.cart.x === 1250, `${upto}: overlays gone, cart home`);
  }
  // Far from the car: you stay in the cart (golfnuit's contract), ramps still go.
  const G = fakeG();
  const flatRef = G.phys.groundAt;
  const r = runner(G, RUSSELL_MISSION, {});
  G.wantStart = true; r.step(); r.done();
  G.veh.x = 4900; G.veh.z = -2820;
  missionCleanup(G, r.m, true);
  ok(G.carId === 'cart' && !!G.parked.ranger && G.phys.groundAt === flatRef, 'far from your car: still in the cart, Ranger parked, ramps gone');
  let threw = null;
  try { RUSSELL_MISSION.cleanup({}, {}); RUSSELL_MISSION.cleanup({ carId: 'cart' }, { cameIn: 'ranger' }); createRoyalFx().destroy(); } catch (e) { threw = e; }
  ok(!threw, 'cleanup on a half-built job does not throw', threw && threw.message);
}

group('two wheels cannot carry Russell');
{
  const G = fakeG();
  G.veh.spec = { id: 'dbike', twoWheel: true, seats: 1 };
  const r = runner(G, RUSSELL_MISSION, {});
  G.wantStart = true;
  ok(r.step() == null && G.carId !== 'cart', 'on a bike: blocked at the pickup');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
