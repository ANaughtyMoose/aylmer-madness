#!/usr/bin/env node
// The review bot (tools/review/page-agent.js) against the real road graph, with
// no browser (S3-BOT, 20 Oct 2026). The bot is the stand-in for a decent
// keyboard player, so a pack measures the game and not the bot:
//   * corner speed: the look-ahead brakes for the Parker to Principale left turn
//     (it used to arrive at 72 km/h and wedge on the British Hotel), holds speed
//     down a straight, and reads a corner drawn as many short segments as one;
//   * routing: checkpoint 3 to 4 of bz_vieux goes down Bancroft (against its
//     one-way, as a player in a hurry does), not round by Parker;
//   * a point-mass drive of the Parker corner at the bot's own caps arrives at
//     the corner no faster than its grip allows.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { MAP } = await import(path.join(ROOT, 'src/game/mapdata.js'));
const { Nav } = await import(path.join(ROOT, 'src/game/nav.js'));
const { CARS } = await import(path.join(ROOT, 'src/game/cars.js'));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };

// ---- load the page agent in a sandbox with a stub page
const nav = new Nav();
const saved = MAP.roads.map((r) => r.oneway);
for (const r of MAP.roads) if (r.oneway) r.oneway = false;
const nav2 = new Nav();
MAP.roads.forEach((r, i) => { if (saved[i] !== undefined) r.oneway = saved[i]; });
const G = { nav, veh: null, mode: 'drive' };
const win = { AYLMER: { G, audio: null }, dispatchEvent() {}, __rawTiming: null };
const ctx = vm.createContext({
  window: win, document: { querySelectorAll: () => [], getElementById: () => null, querySelector: () => null },
  performance: { now: () => 0 }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, console,
  KeyboardEvent: class {}, getComputedStyle: () => ({}), Promise, Math, Object, JSON, Float64Array, Set, Map, Number, String, Array, Infinity,
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools/review/page-agent.js'), 'utf8'), ctx, { filename: 'page-agent.js' });
const RV = win.__RV;
ok(RV && typeof RV.cornerAhead === 'function' && typeof RV.botRoute === 'function', 'page agent loads and exposes cornerAhead and botRoute');
RV.useNav2(nav2);

const ranger = CARS.find((c) => c.id === 'ranger');
const car = (x, z, yaw, kmh) => ({ x, z, yaw, speedKmh: kmh, vLong: kmh / 3.6, spec: ranger });
const plen = (r) => r.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - r[i][0], p[1] - r[i][1]), 0);

// ---- 1. the Parker corner: south on Parker, left (east) onto Principale
const parker = nav.route(-925, 4, -870, -88);
ok(parker && parker.some((p) => Math.abs(p[0] + 935) < 3 && Math.abs(p[1] + 83) < 3), 'GPS route Parker south to Principale passes the corner at (-935, -83)');
const idxNear = (r, x, z) => { let bi = 0, bd = Infinity; r.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; bi = i; } }); return bi; };
{
  // 60 m before the corner, at 72 km/h, heading south.
  const v = car(-931, -25, Math.PI, 72);
  const i = Math.min(parker.length - 1, idxNear(parker, v.x, v.z) + 1);
  const t = RV.cornerAhead(parker, i, v, null);
  console.log('    at 58 m from the corner, 72 km/h:', JSON.stringify(t && { cap: +t.cap.toFixed(1), ang: +t.ang.toFixed(2), d: t.d }));
  ok(t && t.ang > 1.2, 'the corner reads as one corner over 70 degrees');
  ok(t && t.cap > 60, 'the cap 58 m out still lets it run (the braking point is later)');
  const v3 = car(-932.5, -50, Math.PI, 72);
  const t3 = RV.cornerAhead(parker, Math.min(parker.length - 1, idxNear(parker, v3.x, v3.z) + 1), v3, null);
  console.log('    at 33 m from the corner, 72 km/h:', JSON.stringify(t3 && { cap: +t3.cap.toFixed(1), d: t3.d }));
  ok(t3 && t3.cap < 60, 'the cap 33 m out is under 60 km/h: brake now (the bot used to hold 72 into it)');
  const v2 = car(-934.5, -73, Math.PI, 40);
  const t2 = RV.cornerAhead(parker, Math.min(parker.length - 1, idxNear(parker, v2.x, v2.z) + 1), v2, null);
  ok(t2 && t2.cap < 34, `the cap 10 m out is a corner speed (${t2 && t2.cap.toFixed(1)} km/h, under 34)`);
}
// ---- 2. a point-mass drive at the bot's caps: speed at the corner
{
  let x = -930, z = 0, kmh = 72, at = null;
  const r = parker, dt = 1 / 30, aB = ranger.brake * 0.85, aA = 2.5;
  let i = 1;
  for (let n = 0; n < 30 * 20; n++) {
    while (i < r.length - 1 && Math.hypot(r[i][0] - x, r[i][1] - z) < 4) i++;
    const yaw = Math.atan2(r[i][0] - x, r[i][1] - z);
    const t = RV.cornerAhead(r, i, car(x, z, yaw, kmh), null);
    const cap = t ? Math.max(12, t.cap) : 95;
    if (kmh > cap + 5) kmh -= aB * dt * 3.6; else if (kmh < cap - 2) kmh += aA * dt * 3.6;
    const s = kmh / 3.6 * dt; x += Math.sin(yaw) * s; z += Math.cos(yaw) * s;
    if (at == null && Math.hypot(x + 935, z + 83) < 4) at = kmh;
    if (z < -86 && x > -925) break;
  }
  const vmax = Math.sqrt(ranger.grip * 9.81 * 12) * 3.6;   // a 90 degree street corner, ~12 m radius, full grip
  console.log(`    point-mass at the corner: ${at && at.toFixed(1)} km/h (full-grip limit for a 12 m radius ${vmax.toFixed(1)})`);
  ok(at != null && at < vmax, 'the point-mass bot reaches the corner under the grip limit');
}
// ---- 3. a straight holds speed
{
  const r = nav.route(-856, 4, -416, -36);   // du Patrimoine eastward, then the corner at Frank-Robinson
  const v = car(r[1][0], r[1][1], Math.atan2(r[2][0] - r[1][0], r[2][1] - r[1][1]), 60);
  const t = RV.cornerAhead([[-800, 0], [-700, 0], [-600, 0], [-500, 0]], 1, car(-800, 0, Math.PI / 2, 90), null);
  ok(!t || t.cap > 120, `a straight 300 m road sets no cap (${t && Number.isFinite(t.cap) ? t.cap.toFixed(0) : 'none'})`);
  // The same 90 degree corner drawn as one vertex and as six 2 m chords reads the same.
  const sharp = [[0, -100], [0, 0], [100, 0]];
  const arc = [[0, -100], [0, -6]]; for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI / 2; arc.push([6 - 6 * Math.cos(a), -6 + 6 * Math.sin(a)]); } arc.push([100, 0]);
  const v1 = car(0, -40, 0, 50);
  const c1 = RV.cornerAhead(sharp, 1, v1, null), c2 = RV.cornerAhead(arc, 1, v1, null);
  ok(c1 && c2 && Math.abs(c1.cap - c2.cap) < 8 && c2.ang > 1.3, `one vertex and six short chords read as the same corner (${c1 && c1.cap.toFixed(0)} vs ${c2 && c2.cap.toFixed(0)} km/h)`);
  void v; void r;
}
// ---- 4. routing: bz_vieux checkpoint 3 to 4
{
  const gps = nav.route(-856, 4, -867, -99), bot = RV.botRoute(-856, 4, -867, -99);
  console.log(`    cp3 to cp4: GPS ${plen(gps).toFixed(0)} m, bot ${plen(bot).toFixed(0)} m`);
  ok(plen(bot) < 140 && bot.every((p) => p[0] > -880), 'the bot goes straight down Bancroft (under 140 m, never west of x -880)');
  const g2 = nav.route(-895, -86.6, -426, -130), b2 = RV.botRoute(-895, -86.6, -426, -130);
  ok(Math.abs(plen(g2) - plen(b2)) < 1, 'where the GPS is already the short way the bot follows the GPS');
}
// ---- 4b. pursuit point along the route, not across a corner (bz_vieux, dep to the finish)
{
  const r = nav.route(-786.8, -339.4, -867.6, -103);
  const i = r.findIndex((p) => Math.abs(p[0] + 788) < 2 && Math.abs(p[1] + 187) < 2);
  const v = car(-786, -197, -0.2, 40);
  const aim = RV.alongRoute(r, i, v, 5 + 40 / 3.6 * 0.6);
  // ...also when idx has already stepped past the corner node (within 12 m of it).
  const aim2 = RV.alongRoute(r, i + 2, car(-785, -200, -0.1, 27), 5 + 27 / 3.6 * 0.6);
  console.log('    aim with idx past the corner:', aim2.map(Math.round).join(', '));
  ok(Math.hypot(aim2[0] + 785, aim2[1] + 188) < 9, 'with idx past the corner node the aim is still at the corner');
  console.log('    aim from (-786, -197):', aim.map(Math.round).join(', '));
  ok(i > 0 && Math.hypot(aim[0] + 788, aim[1] + 187) < 25 && aim[0] > -810, 'the pursuit point stays at the corner, not 80 m down the next street');
}
// ---- 4c. a race gate short of the route's last node is not a hairpin (racecivic, rue Bancroft)
{
  const raw = RV.botRoute(-870, -170, -867.6, -103);
  const r = [...RV.clipEnd(raw, -867.6, -103), [-867.6, -103]];
  const tail = RV.clipStart(RV.botRoute(-867.6, -103, -935, -83), -867.6, -103);
  const v = car(-869.5, -150, 0, 60);
  const naive = RV.cornerAhead([...raw, [-867.6, -103]], 1, v, RV.botRoute(-867.6, -103, -935, -83));
  const t = RV.cornerAhead(r, 1, v, tail);
  console.log(`    47 m short of the gate: cap ${t && t.cap.toFixed(0)} km/h clipped, ${naive && naive.cap.toFixed(0)} unclipped`);
  ok(t && t.cap > 50, 'the gate on Bancroft is driven at speed, the left onto Principale after it still sets a cap');
}
// ---- 5. overtaking: a car at 30 km/h 25 m ahead in the lane, the other lane clear
{
  const v = car(0, 0, 0, 70);
  G.world = { roadAt: () => true };
  G.traffic = { cars: [{ x: 0.5, z: 25, yaw: 0, speed: 30 / 3.6 }] };
  RV.D.pass = 0;
  const off = RV.passPlan(v, 1 / 60);
  ok(Math.abs(off) > 3, `a slow car ahead starts a pass (offset ${off} m)`);
  RV.D.pass = 0;
  G.traffic.cars.push({ x: -3.4, z: 50, yaw: Math.PI, speed: 14 }, { x: 3.4, z: 40, yaw: 0, speed: 5 });
  ok(RV.passPlan(v, 1 / 60) === 0, 'no pass when both lanes have a car in the next 70 m');
  RV.D.pass = 0;
  G.traffic.cars = [{ x: 0.5, z: 25, yaw: 0, speed: 30 / 3.6 }];
  G.world = { roadAt: (x) => Math.abs(x) < 2 };
  ok(RV.passPlan(v, 1 / 60) === 0, 'no pass onto the kerb (no road beside)');
  G.traffic = null; G.world = null; RV.D.pass = 0;
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
