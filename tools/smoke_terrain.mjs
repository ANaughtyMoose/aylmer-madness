#!/usr/bin/env node
// Headless checks on the height field (terrain.js) and the vertical half of the
// driving model (cars.js): that the ground is continuous where it is supposed
// to be and a cliff exactly where it is supposed to be, that the normals are
// unit vectors, that a car dropped on it lands and settles, that the jumps
// produce the airtime and the (small) damage they were tuned for — and, most
// importantly, that a flat town drives EXACTLY as it did before any of this
// existed.
//
//   node tools/smoke_terrain.mjs
//
// Like smoke_driving.mjs this touches neither WebGL nor the DOM: terrain.js has
// no imports at all and cars.js only pulls in core/mesh.js and core/math.js, so
// the 3.2 MB of mapdata stays unread.
import { carById, Vehicle } from '../src/game/cars.js';
import { buildTerrain, featureBounds, FEATURES, SURF, FLAT } from '../src/game/terrain.js';

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; out.push(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

const terrain = buildTerrain();
const groundAt = terrain.groundAt;

// ---------------------------------------------------------------- the field

{
  ok('every feature has a unique id',
    new Set(FEATURES.map((f) => f.id)).size === FEATURES.length,
    `${FEATURES.length} features`);
  ok('every feature names a surface the driving model knows',
    FEATURES.every((f) => SURF[f.kind] && SURF[f.side || f.kind]),
    [...new Set(FEATURES.map((f) => f.kind))].join(', '));
  ok('the grid keeps the per-cell work down',
    terrain.stats.maxPerCell <= 6,
    `${terrain.stats.cells} cells, at most ${terrain.stats.maxPerCell} features in one`);

  // Away from everything the town is flat, and says nothing about the surface —
  // which is what lets cars.js fall back to "tarmac or grass" unchanged.
  const g = groundAt(20000, 20000);
  ok('an empty cell is flat, up, and has no opinion on the surface',
    g.h === 0 && g.nx === 0 && g.ny === 1 && g.nz === 0 && g.kind === '');
  ok('groundAt is allocation-free: the same record comes back every time',
    groundAt(0, 0) === groundAt(700, -368));
  ok('the flat answer is frozen so nobody can poison it',
    Object.isFrozen(FLAT));
}

// ---------------------------------------------------------------- normals

{
  let worst = 0, down = 0, n = 0;
  for (const f of FEATURES) {
    const b = featureBounds(f, 3);
    for (let x = b.x0; x <= b.x1; x += 0.37) {
      for (let z = b.z0; z <= b.z1; z += 0.37) {
        const g = groundAt(x, z);
        const l = Math.hypot(g.nx, g.ny, g.nz);
        if (Math.abs(l - 1) > worst) worst = Math.abs(l - 1);
        if (g.ny <= 0) down++;
        n++;
      }
    }
  }
  ok('normals are unit length everywhere on every feature',
    worst < 1e-12, `${n} samples, worst |n|-1 = ${worst.toExponential(2)}`);
  ok('...and every one of them points up', down === 0);
}

// ---------------------------------------------------------------- continuity
//
// A ramp face has to be walkable: no step a car could fall into. Each feature is
// swept in its OWN frame, a shrunken 0.2 m inside its outline, so what is under
// test is the surface you drive on and not the edge where it meets the grass.
// Pads are the exception — a loading dock is a vertical wall on every side that
// carries no slope run, and those steps are the whole point of it.

{
  const STEP = 0.1, MAX = 0.5;
  let worstSmooth = 0, worstWhere = '', nSmooth = 0;
  const line = (id, x0, z0, dx, dz, len) => {
    let prev = null;
    for (let t = 0; t <= len; t += STEP) {
      const h = groundAt(x0 + dx * t, z0 + dz * t).h;
      if (prev !== null) {
        const d = Math.abs(h - prev);
        nSmooth++;
        if (d > worstSmooth) { worstSmooth = d; worstWhere = id; }
      }
      prev = h;
    }
  };
  for (const f of FEATURES) {
    if (f.type === 'ridge') {
      // Across the section at every metre of spine, and along the crown.
      const half = f.hw + f.run - 0.2;
      for (let i = 0; i + 3 < f.pts.length; i += 2) {
        const ax = f.pts[i], az = f.pts[i + 1], bx = f.pts[i + 2], bz = f.pts[i + 3];
        const L = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let sIdx = 1; sIdx < L - 1; sIdx += 1) {
          line(f.id, ax + ux * sIdx + uz * half, az + uz * sIdx - ux * half, -uz, ux, 2 * half);
        }
        line(f.id, ax + ux * 0.2, az + uz * 0.2, ux, uz, L - 0.4);
      }
    } else if (f.type === 'mound') {
      for (let a = 0; a < Math.PI; a += 0.1) {
        const dx = Math.cos(a), dz = Math.sin(a);
        const r = Math.min(f.rx, f.rz) * 0.995;
        line(f.id, f.cx - dx * r, f.cz - dz * r, dx, dz, 2 * r);
      }
    } else if (f.type === 'prof') {
      const sn = Math.sin(f.yaw), cs = Math.cos(f.yaw);
      const w0 = f.prof[0] + 0.2, w1 = f.prof[f.prof.length - 2] - 0.2;
      for (let u = -(f.hw + f.skirt) + 0.2; u <= f.hw + f.skirt - 0.2; u += 0.4) {
        const x0 = f.cx + u * cs + w0 * sn, z0 = f.cz - u * sn + w0 * cs;
        line(f.id, x0, z0, sn, cs, w1 - w0);
      }
    }
  }
  ok('ramps, berms and slipways step no more than 0.5 m per 0.1 m of face',
    worstSmooth <= MAX, `${nSmooth} samples, worst ${r3(worstSmooth)} m on ${worstWhere}`);

  // ...and now the walls. Sweep every pad's bounding box and check that nothing
  // it produces is a partial drop a car could get stuck half way down.
  let cliffs = 0, tallest = 0, offPad = 0;
  for (const f of FEATURES) {
    const b = featureBounds(f, 2);
    for (const axis of [0, 1]) {
      const a0 = axis ? b.z0 : b.x0, a1 = axis ? b.z1 : b.x1;
      const c0 = axis ? b.x0 : b.z0, c1 = axis ? b.x1 : b.z1;
      for (let c = c0; c <= c1; c += 0.5) {
        let prev = null;
        for (let a = a0; a <= a1; a += STEP) {
          const h = axis ? groundAt(c, a).h : groundAt(a, c).h;
          if (prev !== null) {
            const d = Math.abs(h - prev);
            if (d > MAX) {
              cliffs++;
              if (d > tallest) tallest = d;
              if (f.type !== 'pad' && f.type !== 'prof') offPad++;
            }
          }
          prev = h;
        }
      }
    }
  }
  ok('the only steps in the whole field are pad walls and the slipway trench',
    offPad === 0, `${cliffs} wall samples, ${offPad} of them on a ramp`);
  ok('...and none of them is tall enough to swallow a car',
    tallest <= 2.2, `tallest ${r2(tallest)} m`);
}

// ---------------------------------------------------------------- worlds

const bounds = { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 };
const flat = {
  roadAt: () => true, waterAt: () => false, querySegments: () => [], bounds,
};
const flatGrass = { ...flat, roadAt: () => false };
// The real height field, with tarmac nowhere so the kerb rule stays out of it.
const hills = { ...flatGrass, groundAt };
const CTL = { steer: 0, throttle: 0, brake: 0, handbrake: false };
const ctl = (o) => ({ ...CTL, ...o });

function launch(id, x, z, yaw, speed, frames, c = CTL, world = hills) {
  const v = new Vehicle(carById(id));
  v.reset(x, z, yaw);
  v.onRoad = false;
  v.vx = Math.sin(yaw) * speed; v.vz = Math.cos(yaw) * speed;
  v.syncFrame();
  let air = 0, peak = 0, land = 0, best = 0, nan = false;
  for (let i = 0; i < frames; i++) {
    v.update(1 / 60, c, world);
    if (v.air) air += 1 / 60;
    peak = Math.max(peak, v.y - v.gh);
    if (v.landed) land = Math.max(land, v.landed);
    if (v.lastAir > best) best = v.lastAir;
    if (!Number.isFinite(v.x + v.z + v.y + v.vy + v.yaw + v.pitch + v.roll)) nan = true;
  }
  return { v, air, peak, land, best, nan };
}

// ---------------------------------------------------------------- a 2 m drop

{
  const v = new Vehicle(carById('saturn'));
  v.reset(0, 0, 0);
  v.y = 2; v.air = true;
  let t = 0, landT = 0, settleT = 0, force = 0;
  for (let i = 0; i < 300; i++) {
    v.update(1 / 60, CTL, hills);
    t += 1 / 60;
    if (!landT && !v.air) { landT = t; force = v.landed; }
    if (landT && !settleT && Math.abs(v.vy) < 0.05 && Math.abs(v.susp) < 0.01) settleT = t;
  }
  // sqrt(2 * 2 / 9.81) = 0.639 s of free fall, hitting at 6.26 m/s.
  ok('a 2 m drop is on the ground inside 1.2 s',
    landT > 0 && landT < 1.2, `${r3(landT)} s`);
  ok('...at very nearly the ballistic 6.26 m/s',
    Math.abs(force - 6.26) < 0.2, `${r2(force)} m/s`);
  ok('...and the springs have settled inside 2 s',
    settleT > 0 && settleT < 2, `${r3(settleT)} s`);
  ok('...having squatted on the way, and come back',
    v.susp === 0 || Math.abs(v.susp) < 0.01, `susp ${r3(v.susp)} m`);
  ok('...for a couple of points of damage, not a write-off',
    v.damage > 0 && v.damage < 6, `${r2(v.damage)}`);
  ok('...and the flight is reported afterwards',
    Math.abs(v.lastAir - 0.617) < 0.05, `lastAir ${r3(v.lastAir)} s`);
}

// ---------------------------------------------------------------- the jumps

{
  // The rail berm at Chemin Fraser (853, -394), taken square on at 70 km/h.
  const r = launch('saturn', 853, -352, Math.PI, 19.44, 240, ctl({ throttle: 1 }));
  ok('the rail berm at 70 km/h is worth more than 0.6 s of air',
    r.best > 0.6, `${r3(r.best)} s`);
  ok('...and puts the car metres up',
    r.peak > 1.5, `${r2(r.peak)} m of clearance`);
  ok('...and it lands, hard, without breaking',
    r.land > 5 && !r.nan, `${r2(r.land)} m/s`);
  ok('...for single digits of damage',
    r.v.damage > 0 && r.v.damage < 12, `${r2(r.v.damage)}`);
  ok('...with no NaN anywhere in the car', !r.nan);

  // The Galeries loading dock: west end of the south lot, up the north ramp.
  const d = launch('sunfire', -168, -233.6, 1.5708, 16, 380, ctl({ throttle: 1 }));
  ok('the Galeries dock ramp gets you onto the deck and off the kicker',
    d.best > 0.6, `${r3(d.best)} s`);
  ok('...clearing the 1.6 m service fence at x = -92',
    d.v.x > -85, `ended at x ${r2(d.v.x)}`);
  ok('...cheaply', d.v.damage < 12, `${r2(d.v.damage)} damage`);

  // The boat launch: down the slipway, off the lip, into Lac Deschênes.
  const water = { ...hills, waterAt: (x) => x < -1802 };
  // On the centreline, 24 m up the apron: the way a player arrives off the lot.
  const b = launch('civic', -1785.1, -226.3, -0.5667, 16, 420, ctl({ throttle: 1 }), water);
  ok('the marina slipway throws you clear of the shore',
    b.best > 0.9 && b.peak > 2, `${r3(b.best)} s, ${r2(b.peak)} m up`);
  ok('...and the river takes it from there — main.js resets you past 1.4 s',
    b.v.drowning > 1.4, `drowning ${r2(b.v.drowning)} s`);
}

// ---------------------------------------------------------------- kerbs (D3)

{
  let onRoad = true;
  const kerb = { ...flat, roadAt: () => onRoad, groundAt };
  const hop = (speed) => {
    onRoad = true;
    const v = new Vehicle(carById('civic'));
    v.reset(0, 0, 0);
    v.vz = speed; v.syncFrame();
    v.update(1 / 60, CTL, kerb);
    const before = v.vLong;
    onRoad = false;
    let peak = 0, air = 0;
    for (let i = 0; i < 120; i++) {
      v.update(1 / 60, CTL, kerb);
      peak = Math.max(peak, v.y - v.gh);
      if (v.air) air += 1 / 60;
    }
    return { peak, air, before, after: v.vLong, v };
  };
  const fast = hop(11.1);      // 40 km/h
  const slow = hop(5.5);       // 20 km/h
  ok('D3: a kerb at 40 km/h is a real hop',
    fast.peak > 0.15 && fast.peak < 0.6, `peak ${r3(fast.peak)} m`);
  ok('D3: ...with the wheels genuinely off the ground',
    fast.air > 0.25, `${r2(fast.air)} s`);
  ok('D3: a kerb at 20 km/h is a thud',
    slow.peak < 0.06, `peak ${r3(slow.peak)} m`);
  ok('D3: and the slow one costs proportionally more speed',
    (slow.before - slow.after) / slow.before > (fast.before - fast.after) / fast.before,
    `slow -${r2(100 * (slow.before - slow.after) / slow.before)} %, fast -${r2(100 * (fast.before - fast.after) / fast.before)} %`);
  ok('D3: neither of them costs any bodywork',
    fast.v.damage === 0 && slow.v.damage === 0);
}

// ---------------------------------------------------------------- surfaces

{
  const spread = (kind) => {
    const s = SURF[kind];
    return s;
  };
  ok('grass still drives exactly like the old flat 0.72 penalty',
    spread('grass').power === 0.72 && spread('grass').grip === 0.72 && spread('grass').drag === 1);
  ok('asphalt and concrete carry no penalty at all',
    SURF.asphalt.power === 1 && SURF.concrete.power === 1);
  ok('a park path costs grip but not speed, as asked',
    SURF.path.power === 1 && SURF.path.grip < 0.95);
  ok('sand is the slowest and the slidiest thing in town',
    SURF.sand.power === Math.min(...Object.values(SURF).map((s) => s.power))
    && SURF.sand.grip === Math.min(...Object.values(SURF).map((s) => s.grip)));
  ok('only the stairs really shake you',
    Object.keys(SURF).filter((k) => SURF[k].shake >= 0.5).join() === 'stair');

  // Kinds actually come back off the ground where they should.
  const at = (x, z) => groundAt(x, z).kind;
  ok('the berm is gravel on top and grass down the sides',
    at(700, -368) === 'gravel' && at(700, -376) === 'grass',
    `${at(700, -368)} / ${at(700, -376)}`);
  ok('the Galeries deck is concrete', at(-120, -230) === 'concrete');
  ok('the Symmes flight is stair', at(-1562, 12) === 'stair');
  ok('Parc des Cèdres has a path and a beach',
    at(-1880, -430) === 'path' && at(-1955, -428) === 'sand',
    `${at(-1880, -430)} / ${at(-1955, -428)}`);
}

// ---------------------------------------------------------------- the flat town
//
// The reference numbers below were taken from the committed code BEFORE the
// height field existed: 5 s at full throttle, on tarmac and on grass, for all
// four cars. Nothing in a town with no features under it is allowed to move.

{
  const REF = {
    'road/ranger': [0, 38.157413368, 0, 14.45539533, 0, 1, 0, -0.031039319, 0],
    'road/civic': [0, 58.007227556, 0, 21.559588374, 0, 1, 0, -0.02836343, 0],
    'road/saturn': [0, 46.101108107, 0, 17.374564681, 0, 1, 0, -0.0290553, 0],
    'road/sunfire': [0, 49.535238474, 0, 18.641232004, 0, 1, 0, -0.034001649, 0],
    'grass/ranger': [-4.150539456, 11.931264091, -0.70730181, 4.46297343, 0.169654945, 0.72, 0, -0.00955899, -0.020564083],
    'grass/civic': [-19.449499366, 14.701006103, -1.874722428, 9.779762424, 0.73810367, 0.72, 0, -0.015304072, -0.076993656],
    'grass/saturn': [-9.709238678, 15.085075731, -1.186038468, 6.675556802, 0.377767307, 0.72, 0, -0.011999594, -0.040956791],
    'grass/sunfire': [-12.022408566, 16.134319718, -1.321171957, 7.604325601, 0.4670921, 0.72, 0, -0.015206784, -0.05679784],
  };
  let worst = 0, worstKey = '';
  for (const [name, world] of [['road', flat], ['grass', flatGrass]]) {
    for (const id of ['ranger', 'civic', 'saturn', 'sunfire']) {
      const v = new Vehicle(carById(id));
      v.reset(0, 0, 0);
      v.onRoad = world.roadAt();
      const c = ctl({ throttle: 1, steer: name === 'grass' ? 0.35 : 0 });
      for (let i = 0; i < 300; i++) v.update(1 / 60, c, world);
      const got = [v.x, v.z, v.yaw, v.vLong, v.vLat, v.surface, v.y, v.pitch, v.roll];
      const want = REF[name + '/' + id];
      for (let i = 0; i < got.length; i++) {
        const d = Math.abs(got[i] - want[i]);
        if (d > worst) { worst = d; worstKey = `${name}/${id}[${i}]`; }
      }
    }
  }
  // The table above is written to nine decimals, so that is as tight as the
  // comparison can be; anything the height field did to the flat case would be
  // orders of magnitude bigger than the last digit.
  ok('a 5 s straight run in the flat town is what it always was, to the last digit',
    worst < 1e-9, `worst drift ${worst.toExponential(2)} (${worstKey || 'none'})`);

  // ...and a world that has never heard of groundAt still works.
  const v = new Vehicle(carById('civic'));
  v.reset(0, 0, 0);
  for (let i = 0; i < 120; i++) v.update(1 / 60, ctl({ throttle: 1 }), flat);
  ok('a world with no groundAt at all (smoke.mjs, the mission bots) still drives',
    v.z > 8 && v.y === 0 && v.gh === 0 && !v.air, `z ${r2(v.z)}`);
}

// ---------------------------------------------------------------- speed

{
  // The physics loop calls this twice a frame per car; it has a budget.
  const pts = [];
  for (let i = 0; i < 4096; i++) {
    // Half on a feature, half out in the fields, which is roughly the mix a
    // drive across town produces.
    pts.push(i & 1 ? 700 + ((i * 7) % 60) - 30 : ((i * 137) % 5000) - 2500,
      i & 1 ? -368 + ((i * 11) % 40) - 20 : ((i * 61) % 3500) - 1750);
  }
  let sink = 0;
  for (let r = 0; r < 40; r++) for (let i = 0; i < pts.length; i += 2) sink += groundAt(pts[i], pts[i + 1]).h;
  const t0 = process.hrtime.bigint();
  for (let r = 0; r < 200; r++) for (let i = 0; i < pts.length; i += 2) sink += groundAt(pts[i], pts[i + 1]).h;
  const ns = Number(process.hrtime.bigint() - t0) / (200 * pts.length / 2);
  ok('groundAt stays inside its 200 ns budget', ns < 200,
    `${ns.toFixed(0)} ns/call (sink ${r2(sink)})`);
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
