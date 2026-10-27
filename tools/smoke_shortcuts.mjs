#!/usr/bin/env node
// C-06 shortcuts (w6-shortcuts): the data is real and public, each cut beats
// the GPS road, the pace car on the road, the pass tracker, the seal and the
// save round trip. Pure node: the real map and the real road bake with a
// stubbed renderer (the smoke_modes trick), no DOM, no browser.
//
//   node tools/smoke_shortcuts.mjs

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, beginPath() {},
  moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, closePath() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = globalThis.document || {
  createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
  getElementById() { return null; },
};
{
  let seed = 0x9e3779b9;
  Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e6) / 1e6; };
}
const mem = new Map();
globalThis.localStorage = globalThis.localStorage || {
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
const ok = (c, m, extra = '') => { if (c) { pass++; console.log(`  ok   ${m}${extra ? '   ' + extra : ''}`); } else { fail++; console.log(`  FAIL ${m}${extra ? '   ' + extra : ''}`); } };
const group = (n) => console.log('\n' + n);
const r1 = (v) => Math.round(v * 10) / 10;

const SC = await import('../src/game/shortcuts.js');
const { MAP } = await import('../src/game/mapdata.js');
const { Nav } = await import('../src/game/nav.js');
const { FEATURES, featureBounds, SURF } = await import('../src/game/terrain.js');
const { COURSES } = await import('../src/game/modes.js');
const { ALL_MISSIONS } = await import('../src/game/missions.js');

const sd = (px, pz, a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1], L = dx*dx+dz*dz; const t = L ? Math.max(0, Math.min(1, ((px-a[0])*dx+(pz-a[1])*dz)/L)) : 0; return Math.hypot(px-a[0]-t*dx, pz-a[1]-t*dz); };
const len = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); return L; };
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length-1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0]) c = !c; return c; };
const polyD = (x, z, p) => { if (inPoly(x, z, p)) return 0; let m = 1e9; for (let i = 0, j = p.length-1; i < p.length; j = i++) m = Math.min(m, sd(x, z, p[j], p[i])); return m; };
const streets = MAP.roads.filter((r) => r.cls !== 'service' && r.name);
const streetD = (x, z) => { let m = 1e9; for (const r of streets) for (let i = 1; i < r.pts.length; i++) m = Math.min(m, sd(x, z, r.pts[i-1], r.pts[i])); return m; };
const onStreet = (x, z) => { for (const r of streets) for (let i = 1; i < r.pts.length; i++) { if (sd(x, z, r.pts[i-1], r.pts[i]) < (r.w || 8) / 2 + 1) return true; } return false; };
// 1 m samples along a polyline, from arc length a0 to a1.
function samples(pts, a0 = 0, a1 = Infinity) {
  const out = []; let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]), n = Math.max(1, Math.ceil(L));
    for (let j = 0; j < n; j++) { const t = j / n, at = s + L*t; if (at >= a0 && at <= a1) out.push([pts[i-1][0] + (pts[i][0]-pts[i-1][0])*t, pts[i-1][1] + (pts[i][1]-pts[i-1][1])*t]); }
    s += L;
  }
  return out;
}
// Arc length of the point on the polyline nearest q.
function arcAt(pts, q) { let s = 0, best = 1e9, at = 0; for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); for (let j = 0; j <= 20; j++) { const t = j/20, x = pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t, z = pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t, d = Math.hypot(x-q[0], z-q[1]); if (d < best) { best = d; at = s + L*t; } } s += L; } return at; }

const LIVE = SC.SHORTCUTS.filter((s) => s.on);
const nav = new Nav();
const V = 13.89;                                  // 50 km/h

// ================================================================ 1
group('shortcuts: the data is real and public');
{
  ok(LIVE.length === 4 && SC.SHORTCUTS.every((s) => s.on), '4 rows, all on (D28; the church is the 4th, Tom 14 Oct)');
  const ids = SC.SHORTCUTS.map((s) => s.id);
  ok(new Set(ids).size === ids.length, 'ids unique');
  const other = new Set([...COURSES.map((c) => c.id), ...ALL_MISSIONS.map((m) => m.id)]);
  ok(ids.every((id) => !other.has(id) && !other.has('cp_' + id)), 'no id is a course or story id');
  ok(JSON.stringify(SC.gateDefs().map((d) => d.id)) === JSON.stringify(['cp_sc_arena', 'cp_sc_piste', 'cp_sc_eglise']), 'gateDefs: three gate pairs (Galeries is a shortcut, not a gate)');
  ok(SC.SHORTCUTS.every((s) => s.pts.length >= 2 && s.pass.length === 3 && s.cutM > 0 && s.seal && s.from && s.to), 'rows well formed');
  for (const s of LIVE) {
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    ok(streetD(a[0], a[1]) <= 8 && streetD(b[0], b[1]) <= 8, `${s.id}: both ends on a street`, `${r1(streetD(a[0], a[1]))} m, ${r1(streetD(b[0], b[1]))} m`);
    const off = samples(s.pts, arcAt(s.pts, s.pass[0]), arcAt(s.pts, s.pass[2])).filter(([x, z]) => !onStreet(x, z));
    const bl = MAP.buildings.filter((q) => s.pts.some((p) => Math.hypot(q.c[0]-p[0], q.c[1]-p[1]) < 250));
    let minB = 1e9; for (const [x, z] of off) for (const q of bl) { const d = polyD(x, z, q.p); if (d < minB) minB = d; }
    ok(minB >= 3.0, `${s.id}: off-street part at least 3 m from every building`, `${r1(minB)} m over ${off.length} samples`);
    let minF = 1e9;
    // Pads with H 0 are flat lot surfaces (canadianTireLot is the Galeries lot itself), not obstacles.
    let near = '';
    for (const f of FEATURES) { if (f.type !== 'pad' && f.type !== 'mound') continue; if (f.type === 'pad' && !(f.H > 0)) continue; const bb = featureBounds(f, 0); const [x0, x1, z0, z1] = Array.isArray(bb) ? bb : [bb.x0 ?? bb.minX, bb.x1 ?? bb.maxX, bb.z0 ?? bb.minZ, bb.z1 ?? bb.maxZ];
      for (const [x, z] of s.pts) { const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1); const d = Math.hypot(dx, dz); if (d < minF) { minF = d; near = f.id; } } }
    ok(minF >= 4, `${s.id}: no vertex within 4 m of a raised pad or a mound`, `${r1(minF)} m (${near})`);
    const wet = samples(s.pts).some(([x, z]) => MAP.water.some((w) => inPoly(x, z, w.p)));
    ok(!wet, `${s.id}: no point in the water`);
  }
  const text = JSON.stringify(SC.SHORTCUTS.map((s) => [s.name, s.where, s.from.label, s.to.label]));
  ok(!/\b\d{2,4}\b/.test(text), 'no house number in any text');
  ok(!/\b(mike|sayyad|abraham|adam|zahra|tom|max|lex|steph|marina|margaret)\b/i.test(text), 'no cast or friend named in any text');
}

// ================================================================ 2
group('shortcuts: each one beats the road by 4 s at the same speed');
const measured = {};
{
  const grass = (SURF.grass && SURF.grass.power) || 0.81;
  for (const s of LIVE) {
    const road = nav.route(s.from.x, s.from.z, s.to.x, s.to.z);
    const roadM = len(road);
    let on = 0, off = 0;
    for (const [x, z] of samples(s.pts)) { if (onStreet(x, z)) on++; else off++; }
    const k = s.cutM / (on + off); on *= k; off *= k;
    const cutS = on / V + off / (V * grass), roadS = roadM / V, margin = roadS - cutS;
    measured[s.id] = { roadM, cutS, roadS, margin };
    console.log(`       ${s.id}: road ${Math.round(roadM)} m (${r1(roadS)} s), cut ${Math.round(s.cutM)} m (${r1(cutS)} s, ${Math.round(off)} m off-street at grass power ${grass})`);
    ok(margin >= 4.0, `${s.id}: beats the road by 4 s or more`, `${r1(margin)} s`);
    ok(Math.abs(roadM - s.roadM) / s.roadM <= 0.05, `${s.id}: frozen roadM within 5 %`, `${s.roadM} vs ${Math.round(roadM)}`);
    ok(Math.abs(s.cutM - s.cutM0) / s.cutM0 <= 0.05, `${s.id}: frozen cutM within 5 %`, `${s.cutM0} vs ${Math.round(s.cutM)}`);
  }
}

// ================================================================ 3
group('shortcuts: the pace car on the road, and on the cut');
{
  const { buildWorld } = await import('../src/game/world.js');
  const MATS = (await import('../src/game/materials_stub.js')).default;
  const { resolvePlaces } = await import('../src/game/places.js');
  const { carById } = await import('../src/game/cars.js');
  const { Rival, SKILL } = await import('../src/game/race.js');
  const { installJumps } = await import('../src/game/jumps.js');
  installJumps();
  const world = buildWorld(new StubRenderer(), MATS);
  resolvePlaces(world);
  const phys = {
    roadAt: (x, z) => world.roadAt(x, z), querySegments: (x, z, r) => world.querySegments(x, z, r),
    waterAt: (x, z) => world.waterAt(x, z), queryPoles: (x, z, r) => world.queryPoles(x, z, r),
    snapPole: (p, ux, uz) => world.snapPole(p, ux, uz), groundAt: world.groundAt, bounds: world.bounds,
  };
  function lap(path, s) {
    const rv = new Rival(carById('ranger'), { skill: SKILL.pace });
    const a = Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]);
    rv.place(path[0][0], path[0][1], a); rv.setPath(path); rv.active = true; rv.done = 0;
    const end = path[path.length - 1], STEP = 1 / 60;
    for (let t = 0; t < 300; t += STEP) {
      rv.update(STEP, phys, null);
      if (Math.hypot(rv.x - end[0], rv.z - end[1]) < 26) return { t, resets: rv.resets };
    }
    return { t: null, resets: rv.resets };
  }
  for (const s of LIVE) {
    const road = lap(nav.route(s.from.x, s.from.z, s.to.x, s.to.z), s);
    const cut = lap(s.pts, s);
    console.log(`       ${s.id}: pace car road ${road.t == null ? 'DNF' : r1(road.t) + ' s'} (${road.resets} resets), cut ${cut.t == null ? 'DNF' : r1(cut.t) + ' s'} (${cut.resets} resets)`);
    ok(road.t != null, `${s.id}: the pace car finishes the road`);
    if (s.pace > 0 && road.t != null) ok(Math.abs(road.t - s.pace) / s.pace <= 0.08, `${s.id}: frozen pace within 8 %`, `${s.pace} vs ${r1(road.t)}`);
    if (s.pace > 0 && s.gate !== false) {
      ok(Math.round(s.pace * 0.90) - measured[s.id].cutS >= 4, `${s.id}: gold is 4 s above the 50 km/h cut time`, `${Math.round(s.pace * 0.9)} vs ${r1(measured[s.id].cutS)}`);
      ok(cut.t != null && Math.round(s.pace * 0.90) > cut.t, `${s.id}: the pace car through the cut beats gold`, `${cut.t == null ? 'DNF' : r1(cut.t)} vs ${Math.round(s.pace * 0.9)}`);
    }
  }
}

// ================================================================ 5
group('shortcuts: found once, either way, only through the cut');
const G = { mode: 'drive', stats: {} };
function drive(g, pts, speed = V, hz = 10) {
  const r = []; const dt = 1 / hz;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i-1], [bx, bz] = pts[i]; const L = Math.hypot(bx-ax, bz-az); const n = Math.max(1, Math.ceil(L / (speed * dt)));
    for (let j = 0; j <= n; j++) { const t = j / n; const e = SC.tick(g, dt, { x: ax + (bx-ax)*t, z: az + (bz-az)*t }); if (e) r.push(e); }
  }
  return r;
}
{
  SC._reset();
  let ev = drive(G, LIVE[0].pts);
  ok(ev.length === 1 && ev[0].id === LIVE[0].id && ev[0].text.startsWith('Raccourci trouvé! 1/4'), 'found forward once', JSON.stringify(ev[0] && ev[0].text));
  ev = drive(G, LIVE[1].pts.slice().reverse());
  ok(ev.length === 1 && ev[0].n === 2, 'backward on another cut gives 2/4');
  ok(drive(G, LIVE[0].pts).length === 0, 'a second pass returns nothing');
  ok(SC.countLine(G) === 'Raccourcis 2/4' && SC.countLine(G, true) === 'Shortcuts 2/4', 'countLine', SC.countLine(G));
  ok(SC.mapLines(G).length === 2 && SC.mapLines(G) === SC.mapLines(G), 'mapLines: the found cuts, same array between finds');
  SC._reset(); G.stats = {};
  let roadFires = 0;
  for (const s of LIVE) roadFires += drive(G, nav.route(s.from.x, s.from.z, s.to.x, s.to.z)).length + drive(G, nav.route(s.to.x, s.to.z, s.from.x, s.from.z)).length;
  ok(roadFires === 0, 'driving the GPS road either way never fires', `${roadFires}`);
  SC._reset(); G.stats = {};
  const p = LIVE[2];
  ok(drive(G, [p.pts[0], p.pass[0], [p.pass[0][0] + 60, p.pass[0][1] - 60], p.pts[p.pts.length-1]]).length === 0, 'leaving the line 40 m+ cancels');
  SC._reset(); G.stats = {};
  ok(drive(G, p.pts, 41.7).length === 1, '150 km/h at 10 Hz still fires');
  SC._reset(); G.stats = {};
  ok(drive(G, p.pts, V, 120).length === 1, '120 Hz sub-steps fire exactly once');
  SC._reset(); G.stats = {};
  ok(drive(G, p.pts, 0.5).length === 0, 'too slow (over max(20, cutM/4) s) cancels');
  SC._reset(); G.stats = {};
  const c = LIVE[3];
  ok(drive(G, c.pts).length === 1, 'the church cut is found forward');
  SC._reset(); G.stats = {};
  ok(drive(G, c.pts.slice().reverse()).length === 1, '...and backward');
  SC._reset(); G.stats = {};
  // A teleport across a cut is not a drive through it.
  SC.tick(G, 0.1, { x: c.pass[0][0], z: c.pass[0][1] }); SC.tick(G, 0.1, { x: c.pass[0][0], z: c.pass[0][1] });
  SC.tick(G, 0.1, { x: c.pass[1][0], z: c.pass[1][1] });
  ok(SC.tick(G, 0.1, { x: c.pass[2][0], z: c.pass[2][1] }) === null, 'a teleport along the pass points does not count');
  ok(SC.tick({ mode: 'menu' }, 1, { x: 0, z: 0 }) === null, 'not in drive: null');
  SC._reset();
  ok(drive({ mode: 'drive', stats: {}, settings: { lang: 'en' } }, LIVE[0].pts)[0].text.startsWith('Shortcut found! 1/4\n'), 'English toast keeps the French name');
}

// ================================================================ 6
group('shortcuts: seal only what is not found');
{
  const calls = []; let hook = null;
  const stub = { seal: (id, o) => calls.push([id, o]), onUnseal: (fn) => { hook = fn; } };
  SC._reset(); SC._useBreakables(stub);
  SC.tick({ mode: 'drive', stats: {} }, 0.01, { x: 0, z: 0 });
  ok(calls.length === 4, 'a fresh summer seals 4', `${calls.length}`);
  SC._reset(); calls.length = 0;
  SC.tick({ mode: 'drive', stats: { shortcuts: { v: 1, found: ['sc_arena'] } } }, 0.01, { x: 0, z: 0 });
  ok(calls.length === 3 && !calls.some((c) => c[0] === 'sc_arena'), 'a save with sc_arena found seals 3');
  hook && hook('sc_galeries');
  const d = SC.debug();
  ok(d.smashed.includes('sc_galeries') && !d.found.includes('sc_galeries'), 'onUnseal adds to smashed, not to found');
  SC._reset(); SC._useBreakables({});
  let threw = false; try { SC.tick({ mode: 'drive', stats: {} }, 0.01, { x: 0, z: 0 }); } catch { threw = true; }
  ok(!threw && Object.values(SC.debug().sealed).every((v) => v === false), 'no seal export: nothing throws, nothing sealed');
  SC._useBreakables(null);
}

// ================================================================ 7
group('shortcuts: save round trip');
{
  SC._reset();
  const g1 = { mode: 'drive', stats: {} };
  drive(g1, LIVE[3].pts);
  const blob = g1.stats.shortcuts;
  ok(blob && blob.v === 1 && blob.found.length === 1 && blob.found[0] === 'sc_eglise', 'found is written to G.stats.shortcuts', JSON.stringify(blob));
  ok(JSON.stringify(blob).length < 200, 'blob under 200 chars');
  // What save.js does: snapshot copies stats, enterDrive builds a new G.stats.
  const saved = JSON.parse(JSON.stringify({ stats: { ...g1.stats } }));
  saved.stats.shortcuts.found.push('sc_nowhere');
  SC._reset();
  const g2 = { mode: 'drive', stats: { crashes: 0, ...saved.stats } };
  ok(SC.countLine(g2) === 'Raccourcis 1/4', 'restored on a new G.stats object', SC.countLine(g2));
  ok(!SC.debug(g2).found.includes('sc_nowhere'), 'unknown id dropped');
  ok(drive(g2, LIVE[3].pts).length === 0, 'a found cut stays found after a load');
  g2.stats = { crashes: 0 };                      // a new summer
  ok(SC.countLine(g2) === 'Raccourcis 0/4', 'a new summer starts at 0/4');
}

// ================================================================ 11
group('cost: tick is cheap');
{
  const g = { mode: 'drive', stats: {} };
  let best = Infinity;
  for (let run = 0; run < 3; run++) {          // best of three: the VM is shared
    SC._reset(); for (let i = 0; i < 2000; i++) SC.tick(g, 1/120, { x: -900, z: 330 });
    SC._reset(); const t0 = performance.now();
    for (let i = 0; i < 10000; i++) SC.tick(g, 1/120, { x: -940 + i * 0.015, z: 316 + i * 0.0117 });
    best = Math.min(best, performance.now() - t0);
  }
  ok(best < 5, `10k ticks at 120 Hz`, `${best.toFixed(2)} ms (< 5)`);
}

console.log(fail ? `\nsmoke_shortcuts: ${pass} ok, ${fail} FAIL` : `\nsmoke_shortcuts: all ${pass} ok`);
process.exit(fail ? 1 : 0);
