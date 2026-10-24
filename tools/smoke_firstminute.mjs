// The first sixty seconds:  node tools/smoke_firstminute.mjs
//
// Refine plan A-07 (6 Oct panel). Lex: time to fun 4/10, control at 143 s, and
// « L'alternateur » is "the weakest five minutes, and it is the first five".
// Sean: skip the opening on later launches. What has to stay true:
//
//   1. the opening plays once; every New Game after that skips it (seenBefore)
//   2. a ramp sits ON L'alternateur's GPS line (B-04), and the job says
//      « Essaie le tremplin » once, a few seconds before it
//   5. (B-04) a bot that backs out of the drive and follows the GPS line at 60
//      to 70 km/h flies >= 1.0 s off it, long enough for the jump slow-mo,
//      within 40 s of control; and the truck coming home over it is not stopped
//   3. the way home has a verb (the box on the bench slides) that never fails
//      the job, and no speed cap, so the errand fits in 3.5 minutes
//   4. a stray W into Margaret's Saturn at the start costs no damage
import fs from 'node:fs';
import { missionById, rampCall, boxTick, BOX, BOX_LINES, FIRST_RAMP, RAMP_CALL_D } from '../src/game/missions.js';
import { Nav } from '../src/game/nav.js';
import { JUMPS, jumpAir, installJumps } from '../src/game/jumps.js';
import { PLACES } from '../src/game/places.js';
import { MAP } from '../src/game/mapdata.js';
import { seenBefore } from '../src/game/intro/opening.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

group('1. the opening plays once');
ok(seenBefore({ settings: { storySeen: true } }) === true, 'seen: the next New Game skips it');
ok(seenBefore({ settings: { storySeen: false } }) === false, 'first launch: it plays');
ok(seenBefore(null) === false, 'no settings yet: it plays');
{
  const src = fs.readFileSync(new URL('../src/game/intro/opening.js', import.meta.url), 'utf8');
  ok(/if \(!replay && seenBefore\(this\.h\.G\)\)/.test(src), 'begin() checks it, and a replay from the menu never skips');
}

group('2. a ramp on the GPS line, inside forty seconds');
const ramp = JUMPS.find((j) => j.id === FIRST_RAMP);
ok(!!ramp, `${FIRST_RAMP} is in the jump table`);
// B-04: the line the player is told to follow is the GPS route, so that is the
// line the ramp has to be on. Same router as main.js (Nav over MAP.roads).
const nav = new Nav();
const ROUTE = nav.route(PLACES.home.x, PLACES.home.z, PLACES.ctire.x, PLACES.ctire.z) || [];
const CUM = [0];
for (let i = 1; i < ROUTE.length; i++) CUM.push(CUM[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
function onRoute(x, z) {
  let best = { d: Infinity, s: 0, i: 0 };
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, az] = ROUTE[i - 1], [bx, bz] = ROUTE[i];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const d = Math.hypot(ax + ex * t - x, az + ez * t - z);
    if (d < best.d) best = { d, s: CUM[i - 1] + t * Math.sqrt(l2), i };
  }
  return best;
}
function routeAt(s) {
  s = Math.max(0, Math.min(CUM[CUM.length - 1], s));
  let i = 1; while (i < CUM.length - 1 && CUM[i] < s) i++;
  const t = (s - CUM[i - 1]) / ((CUM[i] - CUM[i - 1]) || 1);
  return [ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * t, ROUTE[i - 1][1] + (ROUTE[i][1] - ROUTE[i - 1][1]) * t];
}
const roads = MAP.roads.filter((r) => r.name === "Chemin d'Aylmer");
function nearestOn(name, x, z) {
  let best = { d: Infinity };
  for (const r of roads.filter((q) => q.name === name)) {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const d = Math.hypot(ax + ex * t - x, az + ez * t - z);
      if (d < best.d) best = { d, x: ax + ex * t, z: az + ez * t };
    }
  }
  return best;
}
if (ramp) {
  const r = onRoute(ramp.x, ramp.z);
  ok(ROUTE.length > 10, "the alternateur route reaches the Canadian Tire", `${ROUTE.length} points, ${Math.round(CUM[CUM.length - 1])} m`);
  ok(r.d <= 1.5, 'the GPS line passes within 1.5 m of the lip', `${r.d.toFixed(2)} m`);
  const [ax, az] = ROUTE[r.i - 1], [bx, bz] = ROUTE[r.i];
  const along = Math.cos(Math.atan2(bx - ax, bz - az) - ramp.yaw);
  ok(along > 0.99, 'and the ramp points the way the line goes (west, to the Galeries)', `cos ${along.toFixed(4)}`);
  ok(r.s < 600, 'under 600 m of road from the driveway', `${Math.round(r.s)} m`);
  const near = nearestOn("Chemin d'Aylmer", ramp.x, ramp.z);
  ok(near.d < 1.5 && ramp.hw * 2 >= 13.6, 'it is across chemin d’Aylmer, both lanes', `${near.d.toFixed(2)} m off the centreline, ${ramp.hw * 2} m wide`);
  // A two-way road: no cliff on the face the oncoming lane meets, none at the
  // sides, and a foot curved enough that cars.js never reads it as a landing.
  const P = ramp.prof || [];
  const slopes = [];
  for (let i = 0; i + 3 < P.length; i += 2) slopes.push((P[i + 3] - P[i + 1]) / (P[i + 2] - P[i]));
  const lipAt = P.findIndex((v, i) => i % 2 === 1 && v === Math.max(...P.filter((_, k) => k % 2 === 1)));
  const up = slopes.slice(0, (lipAt - 1) / 2);
  const kinks = up.map((sl, i) => sl - (i ? up[i - 1] : 0));
  ok(P.length >= 8 && P[P.length - 1] === 0 && P[P.length - 2] - P[lipAt - 1] >= 10 && ramp.skirt > 0,
    'no cliffs: a long west face and feathered sides', `west face ${(P[P.length - 2] - P[lipAt - 1]).toFixed(1)} m, skirt ${ramp.skirt} m`);
  ok(kinks.length >= 2 && kinks.every((k) => k > 0 && k * (70 / 3.6) < 4.0),
    'the foot is curved: every kink under LAND_SAFE (4 m/s) at 70 km/h', kinks.map((k) => (k * 70 / 3.6).toFixed(1) + ' m/s').join(', '));
  ok(jumpAir(ramp) >= 1.6 && ramp.kmh <= 70, 'built to fly at the speed a new driver goes', `${jumpAir(ramp).toFixed(2)} s at ${ramp.kmh} km/h`);

  const toasts = [];
  const G = { veh: { x: ramp.x + 500, z: ramp.z }, hud: { toast: (t) => toasts.push(t) } };
  const m = {};
  ok(rampCall(G, m, ramp) === null, 'nothing said a long way off');
  G.veh.x = ramp.x + RAMP_CALL_D - 10;
  const said = rampCall(G, m, ramp);
  ok(/Essaie le tremplin/.test(said || ''), '« Essaie le tremplin » when you get near', said);
  ok(rampCall(G, m, ramp) === null && toasts.length === 1, 'and only once');
  ok(!/[\u2013\u2014]/.test(said || ''), 'no em or en dash in the new line');
}

group('3. the way home: the box slides, the job never fails');
const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 0 };
const st = missionById('alternateur').build(ctx);
ok(typeof st[0].onTick === 'function', 'stage 1 watches for the ramp');
ok(!st[1].maxSpeed, 'stage 2 has no speed cap (the bot drove the whole leg at 35)');
ok(st[1].radius >= 20, 'and a wide pillar in the drive', `${st[1].radius} m`);
ok(typeof st[1].onTick === 'function' && /glisse/.test(st[1].sub), 'the box is the verb, and the sub says so', st[1].sub);
{
  const toasts = [];
  const G = { veh: { x: 0, z: 0, yaw: 0, speedKmh: 60 }, hud: { toast: (t) => toasts.push(t) } };
  const m = {};
  st[1].onEnter(G, m, st[1]);
  const dt = 1 / 60;
  let fails = 0;
  for (let i = 0; i < 120; i++) { const r = st[1].onTick(G, m, st[1], dt); if (r && r.fail) fails++; }
  ok(toasts.length === 0, 'steady driving: the box stays put');
  // A hard stop: 60 km/h to 30 in a sixtieth of a second is far past BOX.brake.
  G.veh.speedKmh = 30; st[1].onTick(G, m, st[1], dt);
  ok(toasts.length === 1 && toasts[0] === BOX_LINES[0], 'a hard stop: it slides', toasts[0]);
  G.veh.speedKmh = 0; st[1].onTick(G, m, st[1], dt);
  ok(toasts.length === 1, `then it rests ${BOX.again} s before it can slide again`);
  for (let i = 0; i < Math.ceil(BOX.again / dt) + 2; i++) st[1].onTick(G, m, st[1], dt);
  G.veh.speedKmh = 50; G.veh.inAir = true; st[1].onTick(G, m, st[1], dt);
  ok(toasts.length === 2 && toasts[1] === BOX_LINES[1], 'air: it falls on the floor', toasts[1]);
  for (let i = 0; i < 400; i++) { G.veh.inAir = i % 2 === 0; const r = st[1].onTick(G, m, st[1], dt); if (r && r.fail) fails++; }
  ok(fails === 0, 'and nothing it does fails the job', `${m.boxSlides} slides`);
  ok(BOX_LINES.every((l) => !/\u2014/.test(l)), 'no em dash in the box lines');
  ok(boxTick({ veh: null }, {}, dt) === null, 'no car, no crash');
}

group('4. a stray W into the Saturn is free');
{
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(/v\.hit\(closing, contact\.nx, contact\.nz, tap \? 0 : 1\)/.test(src), 'the Saturn tap costs no damage');
}

group('5. follow blue: a bot backs out, drives the GPS line, and flies');
{
  // The real bake, as smoke_jumps does it: buildWorld() on a stub renderer,
  // so the ground under the bot is the ground the game ships.
  const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 40 })
    : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) : () => {}) });
  globalThis.document ??= { createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; }, getElementById() { return null; } };
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  class StubRenderer {
    upload(b) { if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
    texture() { return {}; } visible() { return true; } draw() {}
  }
  installJumps();
  const { buildWorld } = await import('../src/game/world.js');
  const MATS = (await import('../src/game/materials_stub.js')).default;
  const { carById, Vehicle } = await import('../src/game/cars.js');
  const { fraserParking } = await import('../src/game/homeparking.js');
  const world = buildWorld(new StubRenderer(), MATS);
  const phys = {
    roadAt: (x, z) => world.roadAt(x, z), querySegments: (x, z, r) => world.querySegments(x, z, r),
    waterAt: (x, z) => world.waterAt(x, z), queryPoles: (x, z, r) => world.queryPoles(x, z, r),
    snapPole: (p, ux, uz) => world.snapPole(p, ux, uz), groundAt: world.groundAt, bounds: world.bounds,
  };
  // main.js fires the jump slow-mo at SLOWMO.jumpAir seconds off the ground.
  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const slowAt = +((mainSrc.match(/jumpAir:\s*([\d.]+)/) || [])[1] || NaN);
  ok(slowAt > 0, 'main.js still has a jump slow-mo threshold', `${slowAt} s`);

  const spec = carById('ranger');
  const park = fraserParking(world, null, spec, 0);
  const start = ramp ? onRoute(ramp.x, ramp.z) : { s: 0 };
  // One run: nose-in at 299 (homeparking), S until the truck is on Fraser, then
  // W and pure pursuit on the GPS line, `kmh` on the straights, slower into the
  // corners. Returns the first flight that counts and when the call was said.
  function run(kmh) {
    const v = new Vehicle(spec); v.assist = true;
    v.reset(park.x, park.z, park.yaw); v.onRoad = phys.roadAt(v.x, v.z);
    const ctl = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    const dt = 1 / 60, G = { veh: v, hud: { toast() {} } }, m = {};
    const [ax, az] = ROUTE[0], [bx, bz] = ROUTE[1], L0 = Math.hypot(bx - ax, bz - az);
    let phase = 'rev', t = 0, s = 0, cur = null, callT = null, best = null, imp = 0, dmg0 = null, dmg1 = 0;
    for (let i = 0; i < 60 * 60 && !best; i++) {
      t += dt;
      const p = onRoute(v.x, v.z); if (p.d < 30) s = Math.max(s, p.s);
      if (phase === 'rev') {
        ctl.throttle = 0; ctl.brake = 1; ctl.steer = 0;
        if (Math.abs(((v.x - ax) * (bz - az) - (v.z - az) * (bx - ax)) / L0) < 1.5) phase = 'stop';
      } else if (phase === 'stop') {
        ctl.brake = 0; ctl.throttle = 1;
        if (v.vLong > -0.3) phase = 'go';
      } else {
        const [wx, wz] = routeAt(s + Math.max(8, Math.abs(v.vLong) * 0.7));
        const h = Math.atan2(wx - v.x, wz - v.z) - v.yaw, e = Math.atan2(Math.sin(h), Math.cos(h));
        const a0 = routeAt(s + 2), a1 = routeAt(s + 20), a2 = routeAt(s + 40);
        const h1 = Math.atan2(a1[0] - a0[0], a1[1] - a0[1]), h2 = Math.atan2(a2[0] - a1[0], a2[1] - a1[1]);
        const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
        const want = turn > 0.6 ? 30 : turn > 0.3 ? 45 : kmh;
        ctl.steer = v.inAir ? 0 : Math.max(-1, Math.min(1, -e * 1.9 + v.yawRate * 0.26));
        ctl.throttle = v.speedKmh < want ? 1 : 0.2; ctl.brake = v.speedKmh > want + 8 ? 1 : 0;
      }
      const pre = Math.abs(v.speedKmh || 0);
      v.update(dt, ctl, phys);
      const dr = Math.hypot(v.x - ramp.x, v.z - ramp.z);
      if (dr < 20 && !v.inAir && !best && !cur) {
        if (dmg0 == null) dmg0 = v.damage;
        dmg1 = v.damage;
        if (pre > 40) imp = Math.max(imp, v.impact);   // main.js: crash slow-mo past 0.6 at > 40 km/h
      }
      if (callT == null && rampCall(G, m, ramp)) callT = t;
      if (v.inAir) { if (!cur) cur = { t0: t, x: v.x, z: v.z, kmh: v.speedKmh }; }
      else if (cur) {
        cur.air = t - cur.t0;
        if (cur.air >= 1.0 && Math.hypot(cur.x - ramp.x, cur.z - ramp.z) < 16) best = cur;
        cur = null;
      }
    }
    return { best, callT, s, imp, climbDmg: dmg0 == null ? 0 : dmg1 - dmg0 };
  }
  if (ramp) {
    for (const kmh of [60, 65, 70]) {
      const { best, callT, imp, climbDmg } = run(kmh);
      ok(imp < 0.6 && climbDmg < 0.5, `${kmh} km/h: the climb is not a crash (no crash slow-mo to block the jump one)`, `impact ${imp.toFixed(2)}, ${climbDmg.toFixed(2)} damage on the way up`);
      ok(!!best, `${kmh} km/h: the bot leaves the ground off the lip`, best ? `${best.air.toFixed(2)} s at ${Math.round(best.kmh)} km/h` : 'no flight');
      if (!best) continue;
      ok(best.air >= 1.0 && best.air >= slowAt, `${kmh} km/h: >= 1.0 s of air, and the jump slow-mo fires`, `${best.air.toFixed(2)} s vs ${slowAt} s`);
      ok(best.t0 <= 40, `${kmh} km/h: airborne within 40 s of control`, `${best.t0.toFixed(1)} s`);
      const lead = callT == null ? NaN : best.t0 - callT;
      ok(lead >= 3 && lead <= 9, `${kmh} km/h: « Essaie le tremplin » lands 3 to 9 s before the lip`, `${lead.toFixed(1)} s`);
    }
    // The way home: eastbound at 60, the truck rides up the long west face and
    // hops off the steep side. It must come out the far end still driving.
    const v = new Vehicle(spec); v.assist = true;
    const S = Math.sin(ramp.yaw), C = Math.cos(ramp.yaw);
    v.reset(ramp.x + S * 70, ramp.z + C * 70, ramp.yaw + Math.PI); v.onRoad = phys.roadAt(v.x, v.z);
    v.vLong = 60 / 3.6; v.vx = -S * v.vLong; v.vz = -C * v.vLong;
    const ctl = { steer: 0, throttle: 0.5, brake: 0, handbrake: false };
    let air = 0, minK = Infinity;
    for (let i = 0; i < 60 * 8; i++) {
      v.update(1 / 60, ctl, phys);
      if (v.inAir) air += 1 / 60;
      const w = (v.x - ramp.x) * S + (v.z - ramp.z) * C;
      if (w < 20 && w > -40) minK = Math.min(minK, v.speedKmh);
    }
    ok(minK > 35 && v.damage < 10, 'eastbound at 60: over it and still driving, no cliff', `${Math.round(minK)} km/h at worst, ${air.toFixed(2)} s of air, ${v.damage.toFixed(1)} damage`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
