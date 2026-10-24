#!/usr/bin/env node
// The harness `jumps` beat, in node, on the real bake (S3-JUMPS).
//
//   node tools/probe_jumps.mjs [id ...] [--from-back <m>]
//
// For every ramp: a fresh Ranger standing still at the table's `from` point,
// pointed at `entry`, full throttle, steering at entry, then the lip, then the
// landing. Prints the speed at the lip, the air it really got (flight that
// starts within 16 m of the lip, flown to the ground), and the table's
// prediction at its own `kmh`. Not part of npm test: it is the measuring stick
// the table was tuned with (docs/qa/rf/S3-JUMPS.md).
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 40 })
  : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) : () => {}) });
globalThis.document = {
  createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
  getElementById() { return null; },
};
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
};
class StubRenderer {
  upload(b) { if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() {}
}

const { JUMPS, installJumps, jumpAir, predictAir, jumpSlope, AirScorer, nearestJump } = await import('../src/game/jumps.js');
installJumps();
const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { carById, Vehicle } = await import('../src/game/cars.js');
const world = buildWorld(new StubRenderer(), MATS);
const phys = {
  roadAt: (x, z) => world.roadAt(x, z), querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z), queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz), groundAt: world.groundAt, bounds: world.bounds,
};

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** One ramp from its run-up, as the harness flies it. */
export function probe(j, carId = 'ranger') {
  const run = j.path && j.path.length ? j.path : [j.entry || j.from];
  const via = run[run.length - 1];
  const lx = j.x - via[0], lz = j.z - via[1], L = Math.hypot(lx, lz) || 1;
  const pts = [...run, [j.x, j.z], [j.x + lx / L * 40, j.z + lz / L * 40]];
  const N = pts.length;
  const v = new Vehicle(carById(carId));
  v.assist = true;
  const aim0 = pts[0];
  v.reset(j.from[0], j.from[1], Math.atan2(aim0[0] - j.from[0], aim0[1] - j.from[1]), world.groundAt(j.from[0], j.from[1]).h);
  v.onRoad = phys.roadAt(v.x, v.z);
  const S = Math.sin(j.yaw), C = Math.cos(j.yaw);
  const dt = 1 / 60;
  let pi = 0, lip = null, flight = null, best = null, t = 0, steer = 0;
  const sc = new AirScorer(), recs = [];
  for (let i = 0; i < 60 * 40; i++) {
    t += dt;
    const p = pts[Math.min(pi, N - 1)];
    const q = pts[pi - 1] || j.from;
    const past = pi >= 1 && pi < N && ((v.x - p[0]) * (p[0] - q[0]) + (v.z - p[1]) * (p[1] - q[1])) > 0;
    if (pi < N && (Math.hypot(p[0] - v.x, p[1] - v.z) < 9 || past)) pi++;
    // Keyboard-shaped steering: full lock either way past a 0.04 rad dead band,
    // through the same ramp input.js puts on a held key (4.2/s on, 7.5/s back).
    const err = wrap(Math.atan2(p[0] - v.x, p[1] - v.z) - v.yaw);
    const want = v.airT > 0 ? 0 : err > 0.04 ? 1 : err < -0.04 ? -1 : 0;
    const rate = Math.abs(want) > Math.abs(steer) && Math.sign(want) === Math.sign(steer || want) ? 4.2 : 7.5;
    steer += Math.max(-rate * dt, Math.min(rate * dt, want - steer));
    v.update(dt, { steer: -steer, throttle: 1, brake: 0, handbrake: false }, phys);
    { const nj = nearestJump(v.x, v.z); const near = nj && nj.d < 70;
      const rec = sc.update(dt, v, { siteId: near ? nj.jump.id : `g${Math.round(v.x / 40)},${Math.round(v.z / 40)}`, ramp: near, day: 1 });
      if (rec) recs.push(`${rec.air.toFixed(2)}s/${Math.round(rec.dist)}m/x${rec.combo}/${rec.pay}$/${rec.grade}`); }
    const w = (v.x - j.x) * S + (v.z - j.z) * C;
    if (lip == null && w > -1.5 && v.airT === 0 && Math.abs((v.x - j.x) * C - (v.z - j.z) * S) < 12) lip = v.speedKmh;
    if (v.airT > 0 && !flight) flight = { w0: w, kmh: v.speedKmh, t0: t, x0: v.x, z0: v.z };
    if (flight && v.airT === 0) {
      const air = v.lastAir;
      const rec = { air, w0: flight.w0, kmh: flight.kmh, dist: Math.hypot(v.x - flight.x0, v.z - flight.z0), at: flight.t0 };
      if (Math.abs(flight.w0) < 16 && (!best || air > best.air)) best = rec;
      flight = null;
      if (best && w > 20) break;
    }
    if (w > 220) break;
  }
  const end = { pi, x: +v.x.toFixed(1), z: +v.z.toFixed(1), kmh: +v.speedKmh.toFixed(1), t: +t.toFixed(1), w: +((v.x - j.x) * S + (v.z - j.z) * C).toFixed(1), off: +((v.x - j.x) * C - (v.z - j.z) * S).toFixed(1), dmg: +v.damage.toFixed(1) };
  return { lipKmh: lip, best, end, recs, run: Math.hypot(j.x - j.from[0], j.z - j.from[1]) };
}

const r1 = (n) => (n == null ? '-' : (Math.round(n * 10) / 10).toFixed(1));
const r2 = (n) => (n == null ? '-' : (Math.round(n * 100) / 100).toFixed(2));
console.log('id            run m  kmh  pred s | lip km/h  take-off km/h  air s  dist m  pred@lip  real/pred');
for (const j of JUMPS) {
  if (ids.length && !ids.includes(j.id)) continue;
  const r = probe(j);
  const pred = jumpAir(j);
  const drop = j.type === 'crest' ? j.H * 0.5 : j.H;
  const atLip = r.best ? predictAir(jumpSlope(j), r.best.kmh / 3.6, drop) : null;
  console.log(`${j.id.padEnd(13)} ${String(Math.round(r.run)).padStart(5)}  ${String(j.kmh).padStart(3)}  ${r2(pred).padStart(5)}  | ${r1(r.lipKmh).padStart(7)}  ${r1(r.best && r.best.kmh).padStart(12)}  ${r2(r.best && r.best.air).padStart(5)}  ${r1(r.best && r.best.dist).padStart(6)}  ${r2(atLip).padStart(7)}  ${r.best ? r2(r.best.air / pred) : '-'}` + (process.argv.includes('--end') || !r.best ? '   end ' + JSON.stringify(r.end) : '') + (process.argv.includes('--recs') ? '   ' + r.recs.join(' ') : ''));
}

// --line: what is on the straight legs from -> entry -> lip (collider clearance, surfaces).
export function lineReport(j, a = j.from, b = j.entry || j.from, step = 4) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rows = [];
  for (let d = 0; d <= L; d += step) {
    const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
    let c = 99;
    for (const s of (world.querySegments(x, z, 6) || [])) {
      const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2));
      c = Math.min(c, Math.hypot(s.ax + ex * t - x, s.az + ez * t - z));
    }
    for (const q of (world.queryPoles(x, z, 6) || [])) c = Math.min(c, Math.hypot((q.x ?? q[0]) - x, (q.z ?? q[1]) - z));
    const g = world.groundAt(x, z);
    rows.push(`${Math.round(d)}:${phys.roadAt(x, z) ? 'R' : g.kind}${c < 3 ? '!' + c.toFixed(1) : ''}`);
  }
  return rows.join(' ');
}
if (args.includes('--line')) for (const j of JUMPS) {
  if (ids.length && !ids.includes(j.id)) continue;
  console.log(`\n${j.id} from->entry: ${lineReport(j)}\n${j.id} entry->lip: ${lineReport(j, j.entry || j.from, [j.x, j.z])}`);
}

// --search: look for a run-up point on the pavement behind `entry` whose straight
// line to it is clear (3 m from anything solid, dry), and fly each from there.
// Prints the best few by lip speed, preferring a small turn at the entry.
function clearLine(a, b, need = 3) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 0; d <= L; d += 3) {
    const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
    if (world.waterAt(x, z) && !phys.roadAt(x, z)) return false;
    for (const s of (world.querySegments(x, z, need + 1) || [])) {
      const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2));
      if (Math.hypot(s.ax + ex * t - x, s.az + ez * t - z) < need) return false;
    }
    for (const q of (world.queryPoles(x, z, need + 1) || [])) if (Math.hypot((q.x ?? q[0]) - x, (q.z ?? q[1]) - z) < need) return false;
  }
  return true;
}
if (args.includes('--search')) for (const j of JUMPS) {
  if (ids.length && !ids.includes(j.id)) continue;
  const via = j.entry || j.from;
  const back = Math.atan2(via[0] - j.x, via[1] - j.z);   // heading from the lip back to entry
  const found = [];
  for (let dth = -70; dth <= 70; dth += 5) {
    const th = back + dth * Math.PI / 180;
    for (let D = 60; D <= 480; D += 10) {
      const f = [via[0] + Math.sin(th) * D, via[1] + Math.cos(th) * D];
      if (!phys.roadAt(f[0], f[1])) continue;
      if (!clearLine(f, via)) continue;
      const r = probe({ ...j, from: f });
      if (!r.best || r.best.air < 0.5) continue;
      found.push({ from: f.map((n) => +n.toFixed(1)), D, dth, run: Math.round(r.run), lip: +(r.lipKmh || 0).toFixed(1), air: +r.best.air.toFixed(2), dmg: r.end.dmg });
    }
  }
  found.sort((a, b) => b.lip - a.lip);
  console.log(`\n${j.id} (table from ${j.from}, kmh ${j.kmh}): ${found.length} clear run-ups`);
  for (const f of found.slice(0, 8)) console.log('  ' + JSON.stringify(f));
  const small = found.filter((f) => Math.abs(f.dth) <= 25).slice(0, 4);
  for (const f of small) console.log('  small turn ' + JSON.stringify(f));
}

// --roads: run-ups that follow the road. Every road node 180 to 520 m from
// `entry`, routed to it by the game's own GPS router; keep the smooth ones
// (no bend over 35 degrees inside any 40 m), thin the route to a waypoint every
// ~30 m, and fly the ramp from there.
function thin(route, every = 30) {
  const out = [route[0]];
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    acc += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    if (acc >= every) { out.push(route[i]); acc = 0; }
  }
  if (out[out.length - 1] !== route[route.length - 1]) out.push(route[route.length - 1]);
  return out;
}
function trimStart(route, m) {
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    acc += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    if (acc >= m) return route.slice(i);
  }
  return route.slice(-2);
}
function smooth(route, maxDeg = 35, win = 40) {
  const h = [];
  for (let i = 1; i < route.length; i++) {
    const L = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    if (L > 0.5) h.push({ a: Math.atan2(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]), L });
  }
  for (let i = 0; i < h.length; i++) {
    let d = 0;
    for (let k = i + 1; k < h.length && d < win; k++) {
      d += h[k].L;
      if (Math.abs(wrap(h[k].a - h[i].a)) > maxDeg * Math.PI / 180) return false;
    }
  }
  return true;
}
if (args.includes('--roads')) {
  const { Nav } = await import('../src/game/nav.js');
  const nav = new Nav();
  for (const j of JUMPS) {
    if (ids.length && !ids.includes(j.id)) continue;
    const via = j.entry || j.from;
    const found = [];
    const seen = new Set();
    const cnt = { len: 0, bend: 0, noair: 0, dmg: 0 };
    for (const n of nav.nodes) {
      const D = Math.hypot(n.x - via[0], n.z - via[1]);
      if (D < 180 || D > 520) continue;
      const k = `${Math.round(n.x / 15)},${Math.round(n.z / 15)}`;
      if (seen.has(k)) continue; seen.add(k);
      const route = nav.route(n.x, n.z, via[0], via[1]);
      if (!route || route.length < 2) continue;
      let len = 0;
      for (let i = 1; i < route.length; i++) len += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
      if (len < 200 || len > 560 || len > D * 1.6) { cnt.len++; continue; }
      if (!smooth(trimStart(thin(route), +(process.env.FREE || 70)), +(process.env.BEND || 40), 70)) { cnt.bend++; continue; }
      const wp = thin(route).slice(1, -1);
      // an approach, not a lap: every waypoint gets nearer the lip, none passes it
      const dl = (p) => Math.hypot(p[0] - j.x, p[1] - j.z);
      const de = dl(via);
      let mono = true, prev = Infinity;
      for (const p of [[n.x, n.z], ...wp]) { const d = dl(p); if (d > prev + 10 || d < de - 5) { mono = false; break; } prev = Math.min(prev, d); }
      if (!mono) { cnt.lap = (cnt.lap || 0) + 1; continue; }
      const r = probe({ ...j, from: [n.x, n.z], path: wp });
      if (!r.best || r.best.air < 0.5) { cnt.noair++; continue; }
      if (r.end.dmg > 3) { cnt.dmg++; continue; }
      found.push({ from: [+n.x.toFixed(1), +n.z.toFixed(1)], len: Math.round(len), wp: wp.length, lip: +(r.lipKmh || 0).toFixed(1), off: +r.best.kmh.toFixed(1), air: +r.best.air.toFixed(2), dmg: r.end.dmg, path: wp.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) });
    }
    found.sort((a, b) => b.lip - a.lip);
    console.log(`\n${j.id} (table from ${j.from}, kmh ${j.kmh}): ${found.length} road run-ups ${JSON.stringify(cnt)}`);
    for (const f of found.slice(0, 5)) console.log('  ' + JSON.stringify(f));
  }
}

// --try <id> <x,z> [<x,z> ...]: fly one ramp from the first point through the rest (the path).
if (args.includes('--try')) {
  const raw = process.argv.slice(process.argv.indexOf('--try') + 1);
  const j = JUMPS.find((q) => q.id === raw[0]);
  const P = raw.slice(1).filter((a) => /^-?[\d.]+,-?[\d.]+$/.test(a)).map((a) => a.split(',').map(Number));
  const kmh = raw.find((a) => /^kmh=/.test(a));
  const ent = raw.find((a) => /^entry=/.test(a));
  const jj = { ...j, from: P[0], path: P.slice(1), ...(kmh ? { kmh: +kmh.slice(4) } : {}), ...(ent ? { entry: ent.slice(6).split(',').map(Number) } : {}) };
  if (raw.includes('line')) console.log(lineReport(jj, jj.from, jj.path[0] || jj.entry) + '\n' + lineReport(jj, jj.entry, [jj.x - Math.sin(jj.yaw) * 58, jj.z - Math.cos(jj.yaw) * 58]));
  const r = probe(jj);
  console.log(`try ${j.id} from ${P[0]} via ${P.length - 1}: run ${Math.round(r.run)} m, lip ${r1(r.lipKmh)}, take-off ${r1(r.best && r.best.kmh)}, air ${r2(r.best && r.best.air)} (pred ${r2(jumpAir(jj))} at ${jj.kmh}), dist ${r1(r.best && r.best.dist)}, end ${JSON.stringify(r.end)}  ${r.recs.join(' ')}`);
}

// --solid x,z r: the solid segments and poles near a point.
if (args.includes('--solid')) {
  const raw = process.argv.slice(process.argv.indexOf('--solid') + 1);
  const [x, z] = raw[0].split(',').map(Number), r = +(raw[1] || 15);
  for (const s of (world.querySegments(x, z, r) || [])) console.log('seg', [s.ax, s.az, s.bx, s.bz].map((n) => n.toFixed(1)).join(','), s.kind || s.tag || s.type || '', Object.keys(s).join('/'));
  for (const q of (world.queryPoles(x, z, r) || [])) console.log('pole', (q.x ?? q[0]).toFixed(1), (q.z ?? q[1]).toFixed(1));
}

// --dogleg <id> <x,z>: two-leg run-ups from-->P1-->x,z (the last point on the ramp's own line),
// both legs clear by 3 m, from on the pavement; flown, best take-off speed first.
if (args.includes('--dogleg')) {
  const raw = process.argv.slice(process.argv.indexOf('--dogleg') + 1);
  const j = JUMPS.find((q) => q.id === raw[0]);
  const last = raw[1].split(',').map(Number);
  const found = [];
  for (let px = last[0] - 200; px <= last[0] + 200; px += 10) for (let pz = last[1] - 200; pz <= last[1] + 200; pz += 10) {
    const P1 = [px, pz];
    const d1 = Math.hypot(px - last[0], pz - last[1]);
    if (d1 < 30 || d1 > 160 || !clearLine(P1, last)) continue;
    if ((px - j.x) * Math.sin(j.yaw) + (pz - j.z) * Math.cos(j.yaw) > -80) continue;   // behind the lip
    const a1 = Math.atan2(last[0] - px, last[1] - pz);
    for (let D = 60; D <= 220; D += 20) for (let dth = -40; dth <= 40; dth += 20) {
      const th = a1 + Math.PI + dth * Math.PI / 180;
      const f = [px + Math.sin(th) * D, pz + Math.cos(th) * D];
      if (!phys.roadAt(f[0], f[1]) || !clearLine(f, P1)) continue;
      if ((f[0] - j.x) * Math.sin(j.yaw) + (f[1] - j.z) * Math.cos(j.yaw) > -100) continue;
      const r = probe({ ...j, from: f, path: [P1, last] });
      if (!r.best || r.best.air < 1) continue;
      found.push({ from: f.map((n) => +n.toFixed(1)), P1, run: Math.round(D + d1), take: +r.best.kmh.toFixed(1), air: +r.best.air.toFixed(2), dmg: r.end.dmg });
    }
  }
  found.sort((a, b) => a.dmg - b.dmg || b.take - a.take);
  for (const f of found.slice(0, 10)) console.log(JSON.stringify(f));
  console.log(found.length, 'found');
}
