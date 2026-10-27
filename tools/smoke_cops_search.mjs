#!/usr/bin/env node
// [w6-escape] C-16, node only: line of sight through buildings, the no-world
// fallback (smoke_race's path), the search circle in the full tick, the siren
// going quiet, the faster drain outside the circle, and the hide spots.
//
//   node tools/smoke_cops_search.mjs
//
// Same stubs and real road bake as smoke_race.mjs. Sight is forced with a
// G.world = { buildingAt } stub where a test needs it. Nothing prints an address.
import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, beginPath() {},
  moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, closePath() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = {
  createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
  getElementById() { return null; },
};
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
class StubRenderer {
  upload(b) { if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() {}
}

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);
const r1 = (v) => Math.round(v * 10) / 10;

const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { Nav } = await import('../src/game/nav.js');
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { carById, Vehicle } = await import('../src/game/cars.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Signals } = await import('../src/game/signals.js');
const {
  Cops, SIGHT, SEARCH, BLIND_T, HEAT, LOSE_T, LOSE_D, TICKET, escapePay,
  HIDE, COPS_TEXT, setHideSpots, hideSpots, loadHideSpots,
} = await import('../src/game/cops.js');
const { MAP } = await import('../src/game/mapdata.js');
const { langOf, breachOf, MAIN_CAST } = await import('./smoke_lang.mjs');
const { Wallet } = await import('../src/game/money.js');

const world = buildWorld(new StubRenderer(), MATS);
resolvePlaces(world);
const nav = new Nav();
const phys = {
  roadAt: (x, z) => world.roadAt(x, z),
  querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z),
  queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz),
  bounds: world.bounds,
};

function copG(x = 0, z = 0, yaw = 0) {
  const veh = new Vehicle(carById('ranger'));
  veh.reset(x, z, yaw);
  const hud = {
    toasts: [], prompts: [], stars: -1,
    toast(t) { this.toasts.push(t); }, prompt(t) { this.prompts.push(t); },
    setStars(n) { this.stars = n; },
  };
  const wallet = new Wallet(null);
  wallet.set(300);
  const traffic = new Traffic(6);
  traffic.signals = null;
  return {
    veh, hud, wallet, nav, phys, traffic, signals: new Signals(),
    audio: { blip() {}, chime() {}, crash() {}, honk() {}, sirenRange() {}, siren(on) { this.on = on; } },
    rivals: [], parked: {}, mission: null, cops: new Cops(),
    failed: null,
    failMission(why) { this.failed = why; this.mission = null; },
    ranRed: false, stats: null,
  };
}
// Sight blocked everywhere past the 45 m "hear" range.
const BLIND = { buildingAt: () => true };
const OPEN = { buildingAt: () => false };
const DT = 1 / 60;
const freeze = (u, x, z) => { u.veh.reset(x, z, 0); u.routeT = 1e6; u.setPath([[x, z], [x, z + 1]]); u.sawT = 99; };
const stop = (v) => { v.vLong = 0; v.vx = 0; v.vz = 0; };

// ================================================================ unit checks
group('sight (unit)');
{
  const c = new Cops();
  const u = { x: 0, z: 0 };
  ok(c._sees({}, u, 500, 0, 2) === true, 'no world: seen');
  ok(c._sees({ world: {} }, u, 500, 0, 2) === true, 'no buildingAt: seen');
  const wall = { world: { buildingAt: (x) => x > 40 && x < 50 } };
  ok(c._sees(wall, u, 30, 0, 2) === true, 'inside hear range: seen through anything');
  ok(c._sees(wall, u, 80, 0, 2) === false, 'wall between at 80 m: not seen');
  ok(c._sees({ world: OPEN }, u, 100, 0, 2) === true, 'open road at 100 m: seen');
  ok(c._sees({ world: OPEN }, u, SIGHT.d[2] + 10, 0, 2) === false, '2 stars, 120 m, clear ray: not seen');
  ok(c._sees({ world: OPEN }, u, SIGHT.d[2] + 10, 0, 3) === true, '3 stars see further');
  c.search = { x: 100, z: -50, r: SEARCH.r[2], t0: 0 };
  c.lastSeen = { x: 100, z: -50, yaw: 0.5, t: 0 };
  const sc = c.searchCircle();
  ok(sc.x === 100 && sc.z === -50 && sc.r === 140, 'searchCircle reads back');
  ok(c.searchCircle() === sc, 'searchCircle reuses one object');
  let inside = true;
  for (let i = 0; i < 200; i++) {
    const p = { x: 0, z: 0, searched: i % 3 !== 0 };
    const t = c._searchPoint(p, i % 2, nav);
    if (Math.hypot(t[0] - 100, t[1] + 50) > 140 + 1e-6) inside = false;
  }
  ok(inside, '200 search points inside the circle');
  c.clear();
  ok(c.searchCircle() === null, 'clear() drops the search');
}

// ================================================================ fallback
group('fallback: no G.world is today\'s chase');
{
  const p = PLACES.tims;
  const G = copG(p.x, p.z);
  const C = G.cops;
  C.heat = 2.2;
  const ends = [];
  const route = nav.route.bind(nav);
  G.nav = { nearest: nav.nearest.bind(nav), route: (a, b, x, z) => { ends.push([x, z]); return route(a, b, x, z); } };
  let circle = false;
  for (let i = 0; i < 600; i++) { stop(G.veh); C.heat = 2.2; C.update(DT, G); if (C.searchCircle()) circle = true; }
  ok(!circle, 'searchCircle() stays null for 600 ticks');
  ok(ends.length > 0 && ends.every((e) => Math.hypot(e[0] - G.veh.x, e[1] - G.veh.z) < 25),
    'every re-plan homes on the truck', `${ends.length} re-plans`);
}

// ================================================================ search
group('search circle: full tick, sight blocked past 45 m');
{
  const p = PLACES.tims;
  const G = copG(p.x, p.z);
  G.world = BLIND;
  const C = G.cops;
  C.seed(16);
  C.heat = 2.2;
  C.update(DT, G);
  ok(C.units.length === 2, 'two units on you');
  ok(C.lastSeen && Math.hypot(C.lastSeen.x - p.x, C.lastSeen.z - p.z) < 1, 'dispatch counts as seen: lastSeen is the truck');
  // Park both on street nodes about 180 m behind the way the truck will go
  // (inside LOSE_D) and freeze them: nobody sees you.
  const away = nav.route(p.x, p.z, p.x + 600, p.z + 600) || [];
  const ax = away.length > 6 ? away[6][0] - p.x : 1, az = away.length > 6 ? away[6][1] - p.z : 1;
  const al = Math.hypot(ax, az) || 1;
  for (let i = 0; i < 2; i++) {
    const n = nav.nearest(p.x - ax / al * (170 + 20 * i) + (i ? 30 : -30) * az / al, p.z - az / al * (170 + 20 * i) - (i ? 30 : -30) * ax / al);
    freeze(C.units[i], n.x, n.z);
  }
  console.log(`  (units parked ${C.units.map((u) => Math.round(Math.hypot(u.x - p.x, u.z - p.z))).join(' and ')} m off)`);
  let t = 0, engagedAt = -1, quietAt = -1;
  while (t < 8) {
    stop(G.veh); C.heat = 2.2;
    C.update(DT, G); t += DT;
    if (engagedAt < 0 && C.searchCircle()) engagedAt = t;
    if (engagedAt >= 0 && quietAt < 0 && C.sirenOn === false) quietAt = t;
  }
  ok(engagedAt >= BLIND_T - 0.05 && engagedAt < BLIND_T + 0.5, `search engages ${BLIND_T} s after they lose sight`, `${r1(engagedAt)} s`);
  ok(C.searchCircle() && C.searchCircle().r === 140, 'at 2 stars the circle is 140 m');
  ok(G.hud.toasts.some((s) => /perdu de vue/.test(s)), 'the teach toast says so');
  // Quiet once blind for SEARCH.sirenQuiet s (C-16: 4 s blind, so 2 s after the circle).
  ok(quietAt > engagedAt && Math.abs(quietAt - SEARCH.sirenQuiet) < 0.4,
    `siren goes quiet after ${SEARCH.sirenQuiet} s blind, while searching`, `${r1(quietAt)} s`);
  ok(G.audio.on === false, 'audio told: siren off');
  const sirenCalls = [];
  G.audio.siren = (on) => sirenCalls.push(on);
  for (let i = 0; i < 180; i++) { stop(G.veh); C.heat = 2.2; C.update(DT, G); }
  ok(!sirenCalls.includes(true), 'the once-a-second re-ask does not switch it back on');

  // The sweep: let them drive, drive the truck away, record every route end.
  const ends = [];
  const route = nav.route.bind(nav);
  G.nav = { nearest: nav.nearest.bind(nav), route: (a, b, x, z) => { ends.push([x, z, G.veh.x, G.veh.z]); return route(a, b, x, z); } };
  for (const u of C.units) u.routeT = 0;
  const S = C.searchCircle();
  const cx = S.x, cz = S.z, r = S.r;
  let k = 1, why = 'time', outMax = 0;
  for (let i = 0; i < 60 * 14 && k < away.length; i++) {
    // 20 m/s along a nav route, no step near JUMP_D.
    const [tx, tz] = away[k];
    const dx = tx - G.veh.x, dz = tz - G.veh.z, d = Math.hypot(dx, dz);
    const st = 20 * DT;
    if (d <= st) { G.veh.x = tx; G.veh.z = tz; k++; }
    else { G.veh.x += dx / d * st; G.veh.z += dz / d * st; G.veh.yaw = Math.atan2(dx, dz); }
    G.veh.vx = 0; G.veh.vz = 0; G.veh.vLong = 20;
    C.update(DT, G);
    outMax = Math.max(outMax, Math.hypot(G.veh.x - cx, G.veh.z - cz));
    if (!C.searchCircle()) { why = 'search ended'; break; }
  }
  if (k >= away.length) why = 'end of route';
  console.log(`  (drive: ${why}, ${away.length} route points, furthest ${Math.round(outMax)} m from the centre, units ${C.units.map((u) => Math.round(Math.hypot(u.x - G.veh.x, u.z - G.veh.z)) + ' m ' + (u.onLine ? 'line' : 'gps')).join(', ')})`);
  ok(ends.length > 0, 'they re-plan while searching', `${ends.length} re-plans`);
  ok(ends.every((e) => Math.hypot(e[0] - cx, e[1] - cz) <= r + 8), 'every re-plan ends inside the circle');
  const far = ends.filter((e) => Math.hypot(e[2] - cx, e[3] - cz) > r + 30);
  ok(far.every((e) => Math.hypot(e[0] - e[2], e[1] - e[3]) > 25), 'never routed to the true position once you are out',
    `${far.length} re-plans with you out`);
  ok(!C.searchCircle() || C.units.every((u) => u.ctx.band === SEARCH.band), `band ${SEARCH.band}: a sweep, not a pursuit`);

  // Seen again: a unit at 20 m.
  C.units[0].veh.reset(G.veh.x + 20, G.veh.z, 0);
  C.units[0].setPath([[G.veh.x + 20, G.veh.z], [G.veh.x + 20, G.veh.z + 1]]);
  for (let i = 0; i < 20; i++) { stop(G.veh); C.update(DT, G); }
  ok(C.searchCircle() === null && C.seen, 'a unit at 20 m: seen again, search dropped');
  ok(G.hud.toasts.some((s) => /revu/.test(s)), 'with a word about it');
  ok(C.sirenOn === true, 'and the siren is back');
}

group('search circle: 3 stars is 200 m');
{
  const p = PLACES.tims;
  const G = copG(p.x, p.z);
  G.world = BLIND;
  const C = G.cops;
  C.heat = 3.2;
  C.update(DT, G);
  C.units.forEach((u, i) => freeze(u, p.x + (i ? -250 : 250), p.z));
  C.blocks.length = 0;
  for (let i = 0; i < 60 * 3; i++) { stop(G.veh); C.heat = 3.2; C.update(DT, G); C.blocks.length = 0; }
  ok(C.searchCircle() && C.searchCircle().r === 200, 'r 200', `${C.searchCircle() && C.searchCircle().r}`);
}

// ================================================================ losing them
group('leave the circle: the clock holds inside, runs and drains faster outside');
{
  const p = PLACES.tims;
  const G = copG(p.x, p.z);
  G.world = BLIND;
  const C = G.cops;
  C.heat = 2.6;
  C.update(DT, G);
  C.units.forEach((u, i) => freeze(u, p.x + (i ? -200 : 200), p.z));
  for (let i = 0; i < 60 * 3; i++) { stop(G.veh); C.update(DT, G); }
  ok(!!C.searchCircle(), 'search on');
  const u0 = C.unseen;
  for (let i = 0; i < 60 * 3; i++) { stop(G.veh); C.update(DT, G); }
  ok(Math.abs(C.unseen - u0) < 1e-9, 'inside the circle, unseen: the clock holds', `${r1(u0)} -> ${r1(C.unseen)}`);
  // Out of the circle: move the truck 160 m along z (under JUMP_D a step).
  for (let i = 0; i < 8; i++) { G.veh.z += 20; stop(G.veh); C.update(DT, G); }
  C.units.forEach((u, i) => freeze(u, G.veh.x + (i ? -200 : 200), G.veh.z));
  const ua = C.unseen;
  for (let i = 0; i < 60; i++) { stop(G.veh); C.update(DT, G); }
  ok(Math.abs(C.unseen - ua - 1) < 0.05, 'outside: the clock runs at dt', `${r1(C.unseen - ua)} s in 1 s`);
  let t = 0;
  while (C.unseen <= SEARCH.loseT && t < 20) { stop(G.veh); C.update(DT, G); t += DT; }
  const h0 = C.heat;
  for (let i = 0; i < 60 * 2; i++) { stop(G.veh); C.update(DT, G); }
  const rate = (h0 - C.heat) / 2;
  ok(Math.abs(rate - HEAT.decay * SEARCH.drain) < 0.03, `outside the circle the stars drain at ${HEAT.decay}x${SEARCH.drain} / s`, `${r1(rate * 100) / 100}`);
  ok(SEARCH.loseT < LOSE_T, `and start after ${SEARCH.loseT} s, not ${LOSE_T}`);
}


// ================================================================ hide spots
const HS = await loadHideSpots();
ok(!!HS && hideSpots().length >= 3, 'hidespots.json loads in node', `${hideSpots().length} spots`);

// Truck stopped at a spot centre, heat h, one spawn tick, then every unit
// parked 250 m off (inside LOSE_D, so heat cannot bleed during the count) and frozen.
function hideG(sp, h = 2.2) {
  const G = copG(sp.x, sp.z);
  G.world = BLIND;
  const C = G.cops;
  C.heat = h;
  stop(G.veh);
  C.update(DT, G);
  C.units.forEach((u, i) => freeze(u, sp.x + (i ? -250 : 250), sp.z));
  C.blocks.length = 0;
  return G;
}
const run = (G, secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { stop(G.veh); if (each) each(); G.cops.update(DT, G); } };

for (const sp of hideSpots()) {
  group(`hide spot: ${sp.label}`);
  const G = hideG(sp);
  const C = G.cops;
  const money = G.wallet.value;
  run(G, 7.9);
  ok(C.stars === 2 && C.heat > 2, 'still 2 stars at 7.9 s', `heat ${r1(C.heat)}`);
  ok(C.promptText && C.promptText.startsWith(COPS_TEXT.hide), 'the countdown is on screen', C.promptText || 'none');
  run(G, 0.3);
  ok(C.heat < 2, 'one star down by 8.2 s', `heat ${r1(C.heat)}`);
  let t = 8.2, units = 0;
  while (C.chasing && t < 16) { units = C.units.length; run(G, DT); t += DT; }
  ok(!C.chasing && C.heat === 0, 'escaped by hiding', `at ${r1(t)} s`);
  ok(t <= 14.2, 'in 8 + 6 s', `${r1(t)} s`);
  ok(C.lastEscape && C.lastEscape.how === 'hide' && C.lastEscape.spot === sp.id, 'lastEscape says hide and which spot');
  ok(G.wallet.value === money + escapePay(2), `paid escapePay(2) = ${escapePay(2)} $`, `${money} -> ${G.wallet.value}`);
  ok(G.hud.toasts.some((x) => x.startsWith(COPS_TEXT.hidden)), 'toast: « Y ont passé tout droit. »');
  ok(C.units.length === 0 && C.leaving.length === units && units > 0, 'the cruisers drive off instead of vanishing', `${C.leaving.length} leaving`);
  ok(C.promptText === null && G.hud.prompts[G.hud.prompts.length - 1] === null, 'no countdown left on screen');
  // Burned: the same spot again, the first star takes HIDE.burnFirst.
  C.heat = 2.2; stop(G.veh); C.update(DT, G);
  C.units.forEach((u, i) => freeze(u, sp.x + (i ? -250 : 250), sp.z));
  run(G, HIDE.burnFirst - 0.3);
  ok(C.heat > 2, `burned spot: still 2 stars at ${HIDE.burnFirst - 0.3} s`, `heat ${r1(C.heat)}`);
  run(G, 0.6);
  ok(C.heat < 2, `and one down by ${HIDE.burnFirst + 0.3} s`);
}

group('hide spot: what breaks the count');
{
  const sp = hideSpots()[0];
  let G = hideG(sp), C = G.cops;
  run(G, 4);
  const t4 = C.hide.t;
  ok(t4 > 3, 'counting', `${r1(t4)} s`);
  for (let i = 0; i < 6; i++) { G.veh.vLong = 5 / 3.6; C.update(DT, G); }
  ok(C.hide.t === 0, 'rolling at 5 km/h resets it');
  run(G, 2);
  const u0 = C.units[0];
  freeze(u0, sp.x + 25, sp.z);
  run(G, 0.3);
  const tp = C.hide.t;
  run(G, 1);
  ok(Math.abs(C.hide.t - tp) < 1e-9 && tp > 1, 'a cruiser at 25 m that does not see you pauses it', `${r1(tp)} s held`);
  ok(C.promptText === COPS_TEXT.still, 'prompt « Bouge pas… »');
  freeze(u0, sp.x + 10, sp.z);
  run(G, 0.3);
  ok(C.seen && C.hide.t === 0, 'at 10 m: seen, reset');

  G = hideG(sp); C = G.cops;
  run(G, 1);
  freeze(C.units[0], sp.x + 40, sp.z); C.units[0].sawT = 0;
  run(G, 0.3);
  ok(C.seen, 'a cruiser at 40 m that watched you turn in sees you');

  G = hideG(sp); C = G.cops;
  freeze(C.units[0], sp.x + 28, sp.z);
  run(G, 10);
  ok(!C.busted, 'no bust in 10 s stopped in a spot with a cruiser parked at 28 m');
  // (The parked cruiser settles a couple of metres on its springs, so the hold
  // itself is checked at 25 m above, not here at the edge of HIDE.pass.)

  // A scripted escape stage pays 0 and leaves loseThem's condition true.
  G = hideG(sp, 1.3); C = G.cops;
  G.mission = { stages: [{ kind: 'escape' }], idx: 0 };
  const money = G.wallet.value;
  let t = 0;
  while (C.chasing && t < 12) { run(G, DT); t += DT; }
  ok(!C.chasing && C.heat < 0.05, 'scripted: escaped by hiding at 1 star', `${r1(t)} s`);
  ok(G.wallet.value === money && C.lastEscape.pay === 0, 'scripted escape stage pays 0');
}

group('search targets never land on a hide spot or the lost-sight point (W8-BUGS)');
{
  // Cloud run 27 Oct: sight lost at the Galeries spot itself, unit 0 drove to
  // that exact point and busted the hidden truck at 7 m. Every first target,
  // every later one, and the fallback keep SEARCH.miss off the centre and 20 m
  // off any spot's edge, for every spot, every heading, both units, 2 and 3 stars.
  let bad = [], n = 0;
  const offSpots = (x, z) => hideSpots().every((p) => Math.hypot(x - p.x, z - p.z) >= p.r + 20 - 1e-6);
  for (const sp of hideSpots()) {
    for (const stars of [2, 3]) {
      for (let k = 0; k < 8; k++) {
        const c = new Cops();
        c.seed(7 + k);
        const yaw = k * Math.PI / 4;
        c.lastSeen = { x: sp.x, z: sp.z, yaw, t: 0 };
        c.search = { x: sp.x, z: sp.z, r: SEARCH.r[stars], t0: 0 };
        for (const i of [0, 1]) {
          const u = { searched: false };
          for (let j = 0; j < 6; j++) {
            const t = c._searchPoint(u, i, nav);
            n++;
            const d = Math.hypot(t[0] - sp.x, t[1] - sp.z);
            if (d < SEARCH.miss - 1e-6 || !offSpots(t[0], t[1]) || d > SEARCH.r[stars] + 1e-6) bad.push(`${sp.id} ${stars}* yaw ${k} unit ${i} #${j}: ${r1(d)} m`);
          }
        }
      }
    }
  }
  ok(bad.length === 0 && n > 0, `${n} search targets: none within ${SEARCH.miss} m of where sight was lost, none near a spot, all inside the circle`, bad.slice(0, 4).join('; '));
  // No nav at all (fallbacks): the first targets still keep away.
  const sp = hideSpots()[0];
  const c = new Cops();
  c.lastSeen = { x: sp.x, z: sp.z, yaw: 0, t: 0 };
  c.search = { x: sp.x, z: sp.z, r: SEARCH.r[2], t0: 0 };
  const t0 = c._searchPoint({ searched: false }, 0, null);
  ok(Math.hypot(t0[0] - sp.x, t0[1] - sp.z) >= SEARCH.miss, 'without a road graph unit 0 still does not drive onto the spot', `${r1(Math.hypot(t0[0] - sp.x, t0[1] - sp.z))} m`);
  // Full tick: lose them AT the spot, then let the search run with units free.
  const G = hideG(sp);
  const C = G.cops;
  for (const u of C.units) { u.routeT = 0; }
  let closest = Infinity;
  for (let i = 0; i < 60 * 3; i++) { stop(G.veh); C.update(DT, G); }
  for (const u of C.units) if (u.target) closest = Math.min(closest, Math.hypot(u.target[0] - sp.x, u.target[1] - sp.z));
  ok(!C.searchCircle() || closest >= SEARCH.miss, 'a live search from the spot sends no unit to the spot', `${r1(closest)} m`);
}

group('data: hide spots and lines');
{
  const P = hideSpots();
  ok(new Set(P.map((p) => p.id)).size === P.length, 'ids unique');
  ok(P.length >= 3, '3 or more spots');
  const segD = (x, z, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    return Math.hypot(ax + t * dx - x, az + t * dz - z);
  };
  const DRIVE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential']);
  const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
  for (const sp of P) {
    let street = Infinity, house = Infinity;
    for (const r of MAP.roads) {
      if (!DRIVE.has(r.cls)) continue;
      for (let i = 0; i + 1 < r.pts.length; i++) street = Math.min(street, segD(sp.x, sp.z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]));
    }
    for (const b of MAP.buildings) {
      if (b.k !== 'house' && b.k !== 'terrace' && b.k !== 'apartments') continue;
      if (Math.abs(b.c[0] - sp.x) > 200 || Math.abs(b.c[1] - sp.z) > 200) continue;
      if (inPoly(sp.x, sp.z, b.p)) { house = 0; break; }
      for (let i = 0, j = b.p.length - 1; i < b.p.length; j = i++) house = Math.min(house, segD(sp.x, sp.z, b.p[j][0], b.p[j][1], b.p[i][0], b.p[i][1]));
    }
    const g = world.groundAt ? world.groundAt(sp.x, sp.z) : null;
    ok(!world.buildingAt(sp.x, sp.z, 1.5) && !world.waterAt(sp.x, sp.z) && (!g || g.ny > 0.97), `${sp.id}: off buildings, dry, flat`);
    ok(street >= 20, `${sp.id}: 20 m or more from a street`, `${r1(street)} m`);
    ok(house >= 30, `${sp.id}: 30 m or more from any house footprint`, `${r1(house)} m`);
  }
  const ban = new RegExp(`Ranger|Ford|\\bTom\\b|plaque|plate|${MAIN_CAST.map((n) => `\\b${n}\\b`).join('|')}`, 'i');
  const L = HS.lines;
  let n = 0, bad = [];
  for (const k of ['search', 'respotted', 'drop', 'escaped']) {
    ok(L[k].length >= 3 && L[k].length <= 6, `lines.${k}: 3 to 6`);
    for (const line of L[k]) {
      n++;
      if (langOf(line) !== 'fr' || breachOf('walkon', line) !== null || ban.test(line)) bad.push(`${k}: ${langOf(line)}`);
    }
  }
  ok(!bad.length, `${n} radio lines: French, clean, no names`, bad.join(' | '));
  const nb = Object.entries(COPS_TEXT).filter(([, t]) => breachOf('narrator', t) !== null || ban.test(t));
  ok(!nb.length, 'COPS_TEXT narrator strings clean', nb.map(([k]) => k).join(', '));
}

group('cost: 600 ticks at 2 stars, search on vs no world');
{
  const p = PLACES.tims;
  const bench = (w) => {
    const G = copG(p.x, p.z);
    if (w) G.world = w;
    const C = G.cops;
    C.heat = 2.2; stop(G.veh); C.update(DT, G);
    C.units.forEach((u, i) => freeze(u, p.x + (i ? -120 : 120), p.z));
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 600; i++) { stop(G.veh); C.heat = 2.2; C.update(DT, G); }
    return Number(process.hrtime.bigint() - t0) / 1000 / 600;
  };
  const a = bench({ buildingAt: (x, z, pad) => world.buildingAt(x, z, pad) }), b = bench(null);
  console.log(`  info  ${a.toFixed(1)} us/tick with sight (real buildingAt), ${b.toFixed(1)} without, delta ${(a - b).toFixed(1)} us`);
}

group('escape pay: 3 stars beats the ticket');
ok(escapePay(3) > TICKET, `${escapePay(3)} $ > ${TICKET} $`);
ok(LOSE_D === 300, 'LOSE_D unchanged');

console.log(`\nsmoke_cops_search: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
