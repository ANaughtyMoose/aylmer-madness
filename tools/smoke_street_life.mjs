// Street life (refine plan A-09). Three things a player notices on a drive
// down Principale: whether the street is full, whether the town repeats
// itself, and whether a close pass in traffic registers as one.
//
//   - medium traffic is at least 24 cars, and respawns favour the main drags
//     over side streets (Gemini 6 Oct: Principale looks empty and staged);
//   - a dated line (the Saint-Jean scratch tickets) is only said around its
//     date, nothing from another season is said at all, and twenty minutes of
//     free roam never repeats a line inside ten;
//   - traffic.nearMisses / onNearMiss / drainNearMisses (the C-01 contract):
//     a fast close pass counts once, a touch never counts, a slow or wide
//     pass does not count.
//
//   node tools/smoke_street_life.mjs
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  - ' + extra : '')); }
};

await import('../src/game/mapdata.js');
const { Traffic } = await import('../src/game/traffic.js');
const { QUALITY } = await import('../src/game/options.js');
const { Peds, AMBIENT, applyAmbient, inSeason, CHAT_MEMORY } = await import('../src/game/peds.js');
const { heckle } = await import('../src/game/heckle.js');
const { PLACES } = await import('../src/game/places.js');
const { DEFAULT_SETTINGS } = await import('../src/game/store.js');

console.log('traffic count');
ok(QUALITY.med.traffic >= 24, `medium tier runs ${QUALITY.med.traffic} cars`);
ok(QUALITY.high.traffic >= QUALITY.med.traffic && QUALITY.low.traffic <= QUALITY.med.traffic, 'low <= med <= high');

console.log('respawns favour the arterials');
{
  // Hold a player on Principale for ten minutes; every car culled and dropped
  // back into the ring is a respawn. Count what class of road they land on.
  const at = PLACES.principale || { x: 0, z: 0 };
  const t = new Traffic(QUALITY.med.traffic, 11);
  const player = { x: at.x, z: at.z, spec: { wid: 1.8 }, nudge() {} };
  let big = 0, side = 0, ringBig = 0, ringSide = 0;
  // What the ring offers, by edge count, for comparison.
  for (const e of t.edges) {
    const A = t.nodes[e.a], B = t.nodes[e.b];
    const d = Math.hypot((A.x + B.x) / 2 - at.x, (A.z + B.z) / 2 - at.z);
    if (d >= 120 && d <= 300) { if (e.cls === 'residential') ringSide++; else ringBig++; }
  }
  const orig = t.respawn.bind(t);
  t.respawn = (car, p) => {
    const r = orig(car, p);
    if (r) { if (t.edges[car.edge].cls === 'residential') side++; else big++; }
    return r;
  };
  for (let i = 0; i < 60 * 600; i++) t.update(1 / 60, player);
  const share = big / Math.max(1, big + side);
  const ringShare = ringBig / Math.max(1, ringBig + ringSide);
  ok(big + side >= 30, `${big + side} respawns in ten minutes`);
  ok(share >= ringShare + 0.15, `${(share * 100).toFixed(0)} % of respawns on the bigger roads (ring offers ${(ringShare * 100).toFixed(0)} %)`);
  let near = 0;
  for (const c of t.cars) if (Math.hypot(c.x - at.x, c.z - at.z) < 420) near++;
  ok(near >= 24, `${near} vehicles within 420 m at the end`);
}

console.log('near misses');
{
  const t = new Traffic(1, 5);
  const car = t.cars[0];
  // A still test car on the graph, the player passing it at 60 km/h.
  const pass1 = (lateral, speed, contact = false) => {
    t.nearMisses.length = 0;
    const evs = [];
    t.onNearMiss = (ev) => evs.push(ev);
    car.nearT = 0;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = fz, rz = -fx;
    const side = (car.wid + 1.9) / 2 + lateral;
    const p = { x: 0, z: 0, vx: -fx * speed, vz: -fz * speed, len: 4.6, wid: 1.9, mass: 1500 };
    for (let s = 12; s >= -12; s -= speed / 60) {
      p.x = car.x + fx * s + rx * side; p.z = car.z + fz * s + rz * side;
      car.vx = 0; car.vz = 0; car.stunT = 0;
      t.player = p;
      // A clipped corner just before the boxes come abreast: what
      // collidePlayer() does on any contact with the player.
      if (contact && s < 7.2 && s > 6.5) car.nearT = 3;
      t.nearMiss(car, p);
    }
    return evs;
  };
  const a = pass1(0.6, 16.7);
  ok(a.length === 1, `a 60 km/h pass with 0.6 m of air counts once (${a.length})`);
  ok(a[0] && a[0].gap > 0.5 && a[0].gap < 0.7 && a[0].kind === 'car', 'the event carries the gap and the kind', a[0] ? a[0].gap.toFixed(2) : '');
  ok(pass1(2.5, 16.7).length === 0, 'with 2.5 m of air it does not');
  ok(pass1(0.6, 5).length === 0, 'at 18 km/h it does not');
  ok(pass1(0.6, 16.7, true).length === 0, 'a touch never counts');
  const drained = t.drainNearMisses();
  ok(drained.length === 1 && t.drainNearMisses().length === 0, 'drainNearMisses hands over the log once');
  ok(Array.isArray(t.nearMisses) && t.nearCount === 1, 'nearMisses and nearCount are there for C-01');
}

console.log('season by date');
{
  const json = JSON.parse(fs.readFileSync(new URL('../assets/text/ambient.json', import.meta.url), 'utf8'));
  applyAmbient(json);
  const sj = AMBIENT.find((r) => /saint-jean/i.test(r.line));
  ok(!!sj, 'the Saint-Jean scratch-ticket line is in the pool');
  ok(sj && inSeason(sj, 2), 'said on 24 June');
  ok(sj && !inSeason(sj, 50), 'not said on 11 August');
  ok(sj && !inSeason(sj, null), 'not said with no calendar');
  ok(!inSeason({ line: 'Y’a de la neige su’ le char.' }, 10), 'snow is never in season');
  ok(inSeason({ line: 'Rien de spécial.', from: '08-01', to: '08-31' }, 45) && !inSeason({ line: 'Rien de spécial.', from: '08-01', to: '08-31' }, 5), 'a record can carry its own window');
  const undated = AMBIENT.filter((r) => inSeason(r, 30)).length;
  ok(undated === AMBIENT.length - 1, `${undated} of ${AMBIENT.length} lines are fine on 22 July`);
}

console.log('twenty minutes of free roam');
{
  const fakeR = { upload: () => ({}) };
  for (const day of [2, 50]) {
    const peds = new Peds(fakeR, null, 0x5151 + day);
    const G = { settings: { ...DEFAULT_SETTINGS }, veh: { x: 0, z: 0, speedKmh: 50 }, envKey: 'day', day };
    heckle.bind(G);
    const p = peds.list[0];
    p.live = true;
    const route = ['principale', 'mall', 'tims', 'beach', 'home'].map((k) => PLACES[k]).filter(Boolean);
    const last = new Map();
    let n = 0, repeat = null, dated = 0;
    const dt = 1 / 10;
    for (let t = 0; t < 20 * 60; t += dt) {
      const at = route[Math.floor(t / 150) % route.length];
      G.veh.x = at.x; G.veh.z = at.z; p.x = at.x + 4; p.z = at.z;
      peds.time += dt;
      heckle.update(dt, G);
      const rec = peds.chatter(dt, G);
      if (!rec) continue;
      n++;
      if (/saint-jean/i.test(rec.line)) dated++;
      const prev = last.get(rec.line);
      if (prev !== undefined && peds.time - prev < CHAT_MEMORY) repeat = rec.line;
      last.set(rec.line, peds.time);
    }
    ok(n >= 40 && !repeat, `day ${day}: ${n} lines, none twice inside ten minutes`, repeat || '');
    if (day === 50) ok(dated === 0, 'and no Saint-Jean tickets in August');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
