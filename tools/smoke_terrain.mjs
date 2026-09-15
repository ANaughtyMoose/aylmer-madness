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
  const d = launch('sunfire', -168, -433.6, 1.5708, 16, 380, ctl({ throttle: 1 }));
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
  // The off-road penalty was softened by roughly a third (see the note on SURF).
  // These bounds are the shape of it, not the exact numbers: grass has to stay
  // clearly slower and slipperier than tarmac while leaving you something to
  // drive with, and it has to stay the reference the drag term normalises to.
  ok('grass still costs you real speed and real grip',
    spread('grass').power < 0.9 && spread('grass').grip < 0.85 && spread('grass').drag < 1,
    `power ${spread('grass').power}, grip ${spread('grass').grip}, drag ${spread('grass').drag}`);
  ok('...but a lawn is a shortcut, not a handbrake',
    spread('grass').power > 0.75 && spread('grass').grip > 0.7);
  ok('the surfaces stay in order: asphalt beats path beats gravel beats grass beats sand',
    SURF.asphalt.power > SURF.path.power && SURF.path.power > SURF.gravel.power
    && SURF.gravel.power > SURF.grass.power && SURF.grass.power > SURF.sand.power);
  ok('asphalt and concrete carry no penalty at all',
    SURF.asphalt.power === 1 && SURF.concrete.power === 1);
  // This used to read « a park path costs grip but not speed, as asked » and
  // pinned `SURF.path.power === 1`. What was asked for turned out to be a
  // Ranger doing 149 km/h down the Parc des Cèdres trail — identical to the
  // chemin d'Aylmer — so a footpath was the fastest shortcut in town. The
  // assertion was wrong, not the measurement: the note over SURF has always
  // said the order is asphalt > gravel/path > grass > sand, and `path` was the
  // one row that never joined it. It is in the gravel tier now, a little
  // better because it is paved, and it still costs real grip.
  ok('a park path is in the gravel tier, not the road tier',
    SURF.path.power < 1 && SURF.path.power > SURF.gravel.power
    && SURF.path.power < SURF.dirt.power,
    `power ${SURF.path.power}`);
  ok('...and it costs grip and rattles you',
    SURF.path.grip < 0.9 && SURF.path.shake > SURF.grass.shake,
    `grip ${SURF.path.grip}, shake ${SURF.path.shake}`);
  // A jump's approach line is packed ground and has to stay free, or the ramp
  // cannot be reached at the speed it asks for. jumps.js builds it from `track`
  // for exactly that reason; if the two ever collapse back into one row,
  // smoke_jumps stops flying L'Envolée des Cèdres.
  ok('a beaten jump track is not a footpath and still costs nothing',
    SURF.track.power === 1 && SURF.track.drag === 1 && SURF.track.power > SURF.path.power);
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
  ok('the Galeries rear deck is concrete', at(-120, -430) === 'concrete');
  ok('Canadian Tire customer parking is asphalt', at(-157, -236) === 'asphalt');
  ok('the Symmes flight is stair', at(-1562, 12) === 'stair');
  ok('Parc des Cèdres has a path and a beach',
    at(-1880, -430) === 'path' && at(-1955, -428) === 'sand',
    `${at(-1880, -430)} / ${at(-1955, -428)}`);
}

// ---------------------------------------------------------------- the flat town
//
// The reference numbers below are 5 s at full throttle, on tarmac and on grass,
// for all four cars. Nothing in a town with no features under it is allowed to
// move them — which is what this guards.
//
// Rebaselined once for two changes that landed together and both legitimately
// move every row: the off-road penalty was softened (SURF / GRASS, now 0.81),
// and cars.js stopped letting drag eat a sixth of every car's stated top speed
// (`aero` / `vPow`, see finalizeCar). Neither branch's table is right on its
// own; these numbers come from the merged code. They pin the whole path —
// the ramp target, the drag normalisation, the lateral grip, the thrust curve
// — to nine decimals, so none of it can drift again without somebody choosing.
//
// Rebaselined a SECOND time, and for two rows only. cars.js gained a per-car
// `feel` block (see the long note over the FEEL table there): a torque curve
// read off the car's own gear ratios, a traction limit at low speed, a gap
// between gears, and its own steering rack, tyre and counter-steer numbers.
// Every one of those terms is optional and resolves to an exact 1 or an exact 0
// when a vehicle does not declare it, so the ranger, saturn and sunfire rows
// below are UNCHANGED to the last digit and that is the point of them — the
// Ranger is the reference car whose handling was signed off, and
// tools/smoke_feel.mjs exists to keep proving it. The Civic declares a block,
// so both its rows moved: it is now a 1.5 with a 6500 limit that is soft under
// 4000 and loses 0.06 s at every up-shift, which is why 5 s of full throttle
// leaves it 13.5 m short of where it used to be on tarmac (46.07 m, was 59.58)
// and pointing less far round on grass. Nothing else in the table moved,
// because nothing else has a block yet.
//
// Rebaselined a THIRD time, for three of the four rows, when the rest of the
// roster got its blocks. The Saturn and the Sunfire now declare one — a soft
// torque curve, a slower rack, a little wallow — so both of their rows moved in
// the direction you would expect: 5 s of full throttle is 42.67 m of tarmac
// instead of 47.33 for the Saturn and 47.63 instead of 50.76 for the Sunfire,
// because neither engine has all of itself below 3000 rpm any more, and both
// come round less on grass because a body that leans loses bite while it is
// leaning. The Civic's two rows moved again for a different reason: WSPIN_V,
// the speed at which wheelspin has hooked up, went from 24 m/s to 14 (see the
// note over it in cars.js — at 24 the Firebird was still spinning its tyres at
// highway speed and took 11.9 s to 100 km/h), and the Civic shares that
// constant, so it now stops scrabbling sooner and covers 47.40 m instead of
// 46.07. THE RANGER ROW IS UNTOUCHED TO THE LAST DIGIT, again, and that is
// still the whole point: it declares no block, so none of this reaches it.

{
  const REF = {
    'road/ranger': [0, 39.086020339, 0, 15.10366738, 0, 1, 0, -0.034946719, 0],
    'road/civic': [0, 47.403041051, 0, 19.606611227, 0, 1, 0, -0.034845976, 0],
    'road/saturn': [0, 42.672258933, 0, 16.928490268, 0, 1, 0, -0.032794667, 0],
    'road/sunfire': [0, 47.628785187, 0, 18.658972425, 0, 1, 0, -0.039140525, 0],
    'grass/ranger': [-8.906805509, 16.796348942, -1.011796229, 7.236878419, 0.372345805, 0.81, 0, -0.017148101, -0.048907851],
    'grass/civic': [-13.949619298, 14.052830887, -1.594292575, 8.562245876, 0.565141584, 0.81, 0, -0.017768968, -0.06399078],
    'grass/saturn': [-11.475750528, 16.015632114, -1.274411492, 7.845229255, 0.459056741, 0.81, 0, -0.017328463, -0.053506701],
    'grass/sunfire': [-15.657218949, 17.651077416, -1.485889648, 9.666992295, 0.77171989, 0.81, 0, -0.023205926, -0.08368666],
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
  ok('a 5 s straight run in the flat town matches the reference table to the last digit',
    worst < 1e-9, `worst drift ${worst.toExponential(2)} (${worstKey || 'none'})`);

  // ...and a world that has never heard of groundAt still works.
  const v = new Vehicle(carById('civic'));
  v.reset(0, 0, 0);
  for (let i = 0; i < 120; i++) v.update(1 / 60, ctl({ throttle: 1 }), flat);
  // The threshold was 8 m and is 6 m: this asks « did the car move and stay on
  // the deck », not « how quick is the Civic », and the 1987 Si covers 7.1 m in
  // its first two seconds where the old 1.6 covered nine. See the note over REF.
  ok('a world with no groundAt at all (smoke.mjs, the mission bots) still drives',
    v.z > 6 && v.y === 0 && v.gh === 0 && !v.air, `z ${r2(v.z)}`);
}

// -------------------------------------------------- the path, actually driven
//
// The table above says what the numbers are; this says what they buy. A car on
// a footpath has to be measurably slower than the same car on the road, and a
// machine built for turf has to not notice — that is the whole reason the trail
// through Parc des Cèdres exists.
{
  const flatOut = (spec, kind, secs = 40) => {
    const world = {
      roadAt: () => kind === 'asphalt', querySegments: () => [], queryPoles: () => [],
      waterAt: () => false, groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind }),
      groundY: () => 0, bounds,
    };
    const veh = new Vehicle(spec);
    veh.reset(0, 0, 0);
    const c = ctl({ throttle: 1 });
    for (let i = 0; i < 60 * secs; i++) veh.update(1 / 60, c, world);
    return veh.speedKmh;
  };
  const truck = carById('ranger');
  const road = flatOut(truck, 'asphalt'), path = flatOut(truck, 'path');
  ok('the Ranger pays for cutting through the park',
    path < road - 25 && path > flatOut(truck, 'gravel'),
    `${r2(path)} km/h on the path against ${r2(road)} on the road and ${r2(flatOut(truck, 'gravel'))} on gravel`);
  const cart = carById('cart');
  ok('...and the golf cart, which is built for it, does not',
    Math.abs(flatOut(cart, 'path') - flatOut(cart, 'asphalt')) < 0.5,
    `${r2(flatOut(cart, 'path'))} km/h either way`);
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

// ---------------------------------------------------------------- the hill
//
// Everything above this line is the flat town, and it has to keep being the
// flat town — that is what `buildTerrain(FEATURES)` with no base still means.
// This is the other half of the deal: the same features laid over a base
// raster. The base here is synthetic, built in this file, so the suite still
// imports nothing heavier than terrain.js and still runs in a second; the real
// one is a 3.4 MB LiDAR grid and smoke_ground.mjs is what checks that.
//
// Two of them, both on the shipped grid (637 x 444 nodes, 8 m, from
// -2540.6,-1769.2, covering x -2540.6..2547.4 and z -1769.2..1774.8):
//
//   plane  h = 0.03x + 0.01z, node gradients analytic. Bilinear interpolation
//          reproduces a plane exactly, so this one pins the arithmetic: any
//          drift in the weights shows up immediately and to the last digit.
//   hill   h = 12 sin(x/300) cos(z/250), node gradients by central difference
//          in the interior and one-sided at the edges, which is how
//          build_ground.py bakes the real ones. Rolling, signed, 24 m from
//          trough to crest and 4 to 5 % at its steepest: enough relief to move
//          a normal and to put every feature on a slope.
//
// The claim under test throughout is that a feature is an OFFSET. Whatever the
// base does underneath it, `groundAt(x,z).h - baseAt(x,z).h` has to come back
// as exactly the number the flat town used to hand out, and the dig has to go
// as far below the hillside as it used to go below zero.

{
  const GW = 637, GH = 444, GC = 8, GX0 = -2540.6, GZ0 = -1769.2;
  const GX1 = GX0 + (GW - 1) * GC, GZ1 = GZ0 + (GH - 1) * GC;

  const mkBase = (fh, fgx, fgz) => {
    const hgt = new Float32Array(GW * GH);
    const gx = new Float32Array(GW * GH), gz = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) hgt[j * GW + i] = fh(GX0 + i * GC, GZ0 + j * GC);
    }
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        if (fgx) { gx[k] = fgx(GX0 + i * GC, GZ0 + j * GC); gz[k] = fgz(GX0 + i * GC, GZ0 + j * GC); continue; }
        const i0 = i > 0 ? i - 1 : i, i1 = i < GW - 1 ? i + 1 : i;
        const j0 = j > 0 ? j - 1 : j, j1 = j < GH - 1 ? j + 1 : j;
        gx[k] = (hgt[j * GW + i1] - hgt[j * GW + i0]) / ((i1 - i0) * GC);
        gz[k] = (hgt[j1 * GW + i] - hgt[j0 * GW + i]) / ((j1 - j0) * GC);
      }
    }
    return { x0: GX0, z0: GZ0, cell: GC, w: GW, h: GH, hgt, gx, gz };
  };

  const PH = (x, z) => 0.03 * x + 0.01 * z;
  const planeBase = mkBase(PH, () => 0.03, () => 0.01);
  const hillH = (x, z) => 12 * Math.sin(x / 300) * Math.cos(z / 250);
  const hillBase = mkBase(hillH, null, null);

  const planeT = buildTerrain(FEATURES, planeBase);
  const hillT = buildTerrain(FEATURES, hillBase);

  // An independent bilinear, written out the obvious way, to compare against.
  const bil = (arr, x, z) => {
    const cx = Math.min(Math.max(x, GX0), GX1), cz = Math.min(Math.max(z, GZ0), GZ1);
    const fx = (cx - GX0) / GC, fz = (cz - GZ0) / GC;
    const i = Math.min(Math.floor(fx), GW - 2), j = Math.min(Math.floor(fz), GH - 2);
    const tx = fx - i, tz = fz - j, a = j * GW + i, c = a + GW;
    return arr[a] * (1 - tx) * (1 - tz) + arr[a + 1] * tx * (1 - tz)
      + arr[c] * (1 - tx) * tz + arr[c + 1] * tx * tz;
  };

  // ---- the plumbing the mesh builder needs -------------------------------
  ok('a terrain with no base says so, and reads zero everywhere',
    terrain.base === null && terrain.baseRect === null
    && terrain.baseAt(123, 456).h === 0 && terrain.baseAt(123, 456).ny === 1);
  const rect = hillT.baseRect;
  ok('a terrain with a base hands world.js the rectangle and the fade band',
    hillT.base === hillBase && rect.x0 === GX0 && rect.z0 === GZ0
    && Math.abs(rect.x1 - GX1) < 1e-9 && Math.abs(rect.z1 - GZ1) < 1e-9 && rect.fade === 400,
    `x ${r2(rect.x0)}..${r2(rect.x1)}, z ${r2(rect.z0)}..${r2(rect.z1)}, fade ${rect.fade} m`);
  ok('baseAt is allocation-free too: the same record comes back every time',
    hillT.baseAt(0, 0) === hillT.baseAt(700, -368));
  ok('...and it is NOT the groundAt record, so world.js can ask for both at once',
    hillT.baseAt(0, 0) !== hillT.groundAt(0, 0));
  ok('groundAt is still allocation-free with a base under it',
    hillT.groundAt(0, 0) === hillT.groundAt(700, -368));

  // ---- an empty cell is the base, exactly --------------------------------
  //
  // Bilinear interpolation reproduces a plane, so on the plane base the answer
  // off a feature is the plane itself — up to the float32 the raster is stored
  // in, which is why the analytic check is 1e-4 and the one against our own
  // bilinear is 1e-9.
  {
    const spots = [[1200.3, 1200.7], [-500.25, 900.125], [2000.9, -1200.4],
      [0.5, 800.3], [-2200.1, 1500.6]];
    let worstBil = 0, worstPlane = 0, worstN = 0, anyKind = false;
    for (const [x, z] of spots) {
      const g = planeT.groundAt(x, z);
      if (g.kind !== '') anyKind = true;
      worstBil = Math.max(worstBil, Math.abs(g.h - bil(planeBase.hgt, x, z)));
      worstPlane = Math.max(worstPlane, Math.abs(g.h - PH(x, z)));
      const l = Math.hypot(0.03, 1, 0.01);
      worstN = Math.max(worstN, Math.abs(g.nx - -0.03 / l), Math.abs(g.ny - 1 / l),
        Math.abs(g.nz - -0.01 / l));
    }
    ok('off a feature the ground IS the base, to the last digit of the bilinear',
      worstBil < 1e-9 && !anyKind, `worst ${worstBil.toExponential(2)} m`);
    ok('...and on a plane base that is the plane itself',
      worstPlane < 1e-4, `worst ${worstPlane.toExponential(2)} m (float32 raster)`);
    ok('...wearing the plane\'s normal, not a flat one',
      worstN < 1e-7, `worst component drift ${worstN.toExponential(2)}`);
  }

  // ---- every feature is an offset, everywhere ----------------------------
  //
  // The whole field, swept feature by feature the way the normals section
  // above sweeps it, against the flat town's answer for the same point.
  {
    let worst = 0, worstWhere = '', kindMismatch = 0, n = 0;
    let worstN = 0, down = 0, raised = 0, dug = 0;
    for (const [tag, T, step] of [['hill', hillT, 0.37], ['plane', planeT, 0.83]]) {
      for (const f of FEATURES) {
        const b = featureBounds(f, 3);
        for (let x = b.x0; x <= b.x1; x += step) {
          for (let z = b.z0; z <= b.z1; z += step) {
            const g = T.groundAt(x, z);
            const gh = g.h, gk = g.kind;
            if (tag === 'hill') {
              const l = Math.hypot(g.nx, g.ny, g.nz);
              if (Math.abs(l - 1) > worstN) worstN = Math.abs(l - 1);
              if (g.ny <= 0) down++;
            }
            const off = gh - T.baseAt(x, z).h;
            const flatG = groundAt(x, z);
            if (flatG.h > 0) raised++; else if (flatG.h < 0) dug++;
            if (gk !== flatG.kind) kindMismatch++;
            const d = Math.abs(off - flatG.h);
            if (d > worst) { worst = d; worstWhere = `${tag}/${f.id}`; }
            n++;
          }
        }
      }
    }
    ok('a feature is an offset above the base, not an altitude',
      worst < 1e-9, `${n} samples, worst ${worst.toExponential(2)} m on ${worstWhere}`);
    ok('...and the sweep really did cover both the raised half and the dig',
      raised > 1000 && dug > 100, `${raised} raised, ${dug} dug`);
    ok('...and the surface a feature reports does not depend on the base',
      kindMismatch === 0, `${kindMismatch} mismatches`);
    ok('normals are unit length everywhere on every feature, on a hill',
      worstN < 1e-12, `worst |n|-1 = ${worstN.toExponential(2)}`);
    ok('...and every one of them still points up', down === 0);
  }

  // ---- the two places a player actually notices --------------------------
  {
    // The rail berm where Chemin Fraser crosses it: the crown carries 2.5 m of
    // fill whether the ground under it is at 0, at 25 or on a slope.
    const crown = [846.0, -393.0];
    const bh = hillT.baseAt(crown[0], crown[1]).h;
    const gh = hillT.groundAt(crown[0], crown[1]).h;
    ok('the rail berm is 2.5 m of fill on top of whatever hill it crosses',
      Math.abs((gh - bh) - groundAt(crown[0], crown[1]).h) < 1e-9
      && Math.abs(groundAt(crown[0], crown[1]).h - 2.5) < 1e-9,
      `base ${r3(bh)} m + ${r3(gh - bh)} m of berm = ${r3(gh)} m`);

    // The slipway, which has to end UNDER the lake however high the lawn above
    // it sits. Find the deepest point of the trench in the flat town, then ask
    // for the same point on the hill.
    const f = FEATURES.find((x) => x.id === 'launch');
    const b = featureBounds(f, 1);
    let deep = 0, dx = 0, dz = 0;
    for (let x = b.x0; x <= b.x1; x += 0.25) {
      for (let z = b.z0; z <= b.z1; z += 0.25) {
        const h = groundAt(x, z).h;
        if (h < deep) { deep = h; dx = x; dz = z; }
      }
    }
    const hb = hillT.baseAt(dx, dz).h, hg = hillT.groundAt(dx, dz).h;
    const pb = planeT.baseAt(dx, dz).h, pg = planeT.groundAt(dx, dz).h;
    ok('the marina slipway digs the same trench below the hillside as below zero',
      deep < -1.5 && Math.abs((hg - hb) - deep) < 1e-9 && Math.abs((pg - pb) - deep) < 1e-9,
      `${r3(deep)} m at (${r2(dx)}, ${r2(dz)}), base ${r3(hb)} m -> ${r3(hg)} m`);
  }

  // ---- continuity across the 8 m cell lines ------------------------------
  //
  // The reason baseAt interpolates the node gradients instead of differencing
  // the interpolated surface. Height was never going to step; the normal was,
  // once per cell, and a normal that steps is a vertical kick the suspension
  // reports as a bump on a road that is perfectly smooth to look at. Walked at
  // 0.1 m, which is about 2 cm short of a frame at 180 km/h. Steps that touch a
  // feature are skipped — pad walls are meant to be cliffs and have their own
  // section above.
  {
    const STEP = 0.1;
    let worstH = 0, worstNx = 0, worstNz = 0, n = 0;
    const walk = (x0, z0, ux, uz, len) => {
      let ph = null, pnx = 0, pnz = 0;
      for (let t = 0; t <= len; t += STEP) {
        const x = x0 + ux * t, z = z0 + uz * t;
        const pure = groundAt(x, z).h === 0 && groundAt(x, z).kind === '';
        const g = hillT.groundAt(x, z);
        if (pure && ph !== null) {
          worstH = Math.max(worstH, Math.abs(g.h - ph));
          worstNx = Math.max(worstNx, Math.abs(g.nx - pnx));
          worstNz = Math.max(worstNz, Math.abs(g.nz - pnz));
          n++;
        }
        ph = pure ? g.h : null; pnx = g.nx; pnz = g.nz;
      }
    };
    walk(-2000, 900, 1, 0, 4000);                       // straight across the cells
    walk(2000, -1700, 0, 1, 3400);                      // straight down them
    walk(-2400, -1700, 0.81602, 0.57801, 5883);         // and through the corners
    ok('the base is C0 in height across every cell line',
      worstH < 0.5, `${n} steps, worst ${r3(worstH)} m per 0.1 m`);
    ok('...and C0 in the normal too, which is the part you can feel',
      worstNx < 0.02 && worstNz < 0.02,
      `worst dnx ${worstNx.toExponential(2)}, dnz ${worstNz.toExponential(2)}`);
  }

  // ---- the fade out of the raster ----------------------------------------
  //
  // The raster stops at the edge of the Aylmer clip; the world does not. The
  // edge height is taken out over 400 m of smoothstep, so 148, Hull and the
  // long run east are the flat ground they always were, reached down a 6 %
  // ramp rather than off a 10 m wall.
  {
    const edgeH = hillT.baseAt(GX1, 0).h;
    const in399 = hillT.baseAt(GX1 + 399, 0).h;
    const g401 = hillT.groundAt(GX1 + 401, 0);
    ok('the edge of the raster is real ground to fade out of',
      Math.abs(edgeH) > 1, `${r3(edgeH)} m at x ${r2(GX1)}`);
    ok('399 m outside, the base is still there but barely',
      in399 !== 0 && Math.abs(in399) < 0.01,
      `${in399.toExponential(2)} m (edge was ${r3(edgeH)} m)`);
    ok('401 m outside it is exactly zero and exactly level — 148 is untouched',
      g401.h === 0 && g401.nx === 0 && g401.ny === 1 && g401.nz === 0 && g401.kind === '');

    // Both seams, walked at 0.1 m. The far one, where the fade reaches zero, is
    // the easy one: the smoothstep arrives there with zero slope, so the ramp
    // itself contributes almost nothing and a step would stand alone.
    //
    // The near one, where the raster ends and the fade begins, is a CREASE and
    // is meant to be. Outside, the height is the clamped edge value taken out
    // by a smoothstep whose slope at d = 0 is zero; inside, it is the hillside
    // still running at its own gradient. Those cannot meet smoothly — no single
    // fade curve matches an edge slope that varies all the way round the
    // rectangle — so the ground goes over the boundary the way it goes over the
    // crest of a hill. What is not allowed is a STEP in the height, and what is
    // bounded is the size of the crease: no worse than the slope the hillside
    // arrives with, which here is 0.024 m/m of nx.
    const walkSeam = (lo, hi) => {
      let wh = 0, wn = 0, ph = null, pn = 0;
      for (let d = lo; d <= hi; d += 0.1) {
        const g = hillT.baseAt(GX1 + d, 0);
        if (ph !== null) { wh = Math.max(wh, Math.abs(g.h - ph)); wn = Math.max(wn, Math.abs(g.nx - pn)); }
        ph = g.h; pn = g.nx;
      }
      return { wh, wn };
    };
    const far = walkSeam(395, 405), near = walkSeam(-5, 5);
    const edgeSlope = Math.abs(hillT.baseAt(GX1 - 0.05, 0).nx);
    ok('...and crossing the 400 m line is a step in nothing at all',
      far.wh < 1e-3 && far.wn < 1e-3,
      `worst dh ${far.wh.toExponential(2)} m, dnx ${far.wn.toExponential(2)} per 0.1 m`);
    ok('...and leaving the raster is a crease no sharper than the hillside itself',
      near.wh < 0.01 && near.wn <= edgeSlope + 1e-9,
      `worst dh ${near.wh.toExponential(2)} m, dnx ${r3(near.wn)} against an edge nx of ${r3(edgeSlope)}`);

    // The fade has to carry its own product-rule term or the normal stops
    // describing the height it is attached to: the mesh would slope one way
    // and the car would be pushed the other.
    let worstG = 0;
    for (let d = 5; d < 395; d += 7.3) {
      const x = GX1 + d;
      const h0 = hillT.baseAt(x - 0.01, 0).h, h1 = hillT.baseAt(x + 0.01, 0).h;
      const g = hillT.baseAt(x, 0);
      worstG = Math.max(worstG, Math.abs((h1 - h0) / 0.02 - -g.nx / g.ny));
    }
    ok('...with a normal that still agrees with the height it belongs to',
      worstG < 1e-4, `worst dh/dx drift ${worstG.toExponential(2)}`);
  }

  // ---- and it still has to be fast ---------------------------------------
  //
  // The same 4096 points as the budget section above, half on the berm and half
  // scattered, but run against BOTH fields, alternately, and scored on the best
  // of seven. The flat number is measured here rather than reused from above
  // for one reason: this machine is not quiet, and an absolute nanosecond
  // budget measured while something else is compiling swings 220 to 380 on
  // identical code. What does not swing is the ratio between two loops timed
  // twenty milliseconds apart, so that is what is pinned.
  //
  // The claim: sampling a 3.4 MB raster — twelve float reads, four weights and
  // a smoothstep test — costs less than the feature lookup it sits underneath.
  // Measured over a dozen runs it comes out between 1.66x and 1.89x, so 2.5x is
  // the line: comfortably clear of the spread, and still tight enough to catch
  // the sampler doubling in cost. The absolute 400 ns is the tripwire for
  // something structurally wrong (an allocation, a deopt, a lost inline).
  //
  // What is NOT claimed is the flat field's own 200 ns. Twelve reads scattered
  // over 3.4 MB cannot be free, and on this machine they are not: the flat path
  // measures about 135 ns and the hill about 230. Whether that clears 200 in
  // absolute terms depends on what else the box is doing, which is exactly the
  // thing a test must not depend on.
  {
    const pts = [];
    for (let i = 0; i < 4096; i++) {
      pts.push(i & 1 ? 700 + ((i * 7) % 60) - 30 : ((i * 137) % 5000) - 2500,
        i & 1 ? -368 + ((i * 11) % 40) - 20 : ((i * 61) % 3500) - 1750);
    }
    let sink = 0;
    const time = (G) => {
      const t0 = process.hrtime.bigint();
      for (let r = 0; r < 60; r++) for (let i = 0; i < pts.length; i += 2) sink += G(pts[i], pts[i + 1]).h;
      return Number(process.hrtime.bigint() - t0) / (60 * pts.length / 2);
    };
    const hillG = hillT.groundAt;
    for (let r = 0; r < 4; r++) { time(groundAt); time(hillG); }
    let flatNs = Infinity, hillNs = Infinity;
    for (let r = 0; r < 9; r++) {
      flatNs = Math.min(flatNs, time(groundAt));
      hillNs = Math.min(hillNs, time(hillG));
    }
    ok('a bilinear of the raster costs less than the features on top of it',
      hillNs < 2.5 * flatNs && hillNs < 400,
      `${hillNs.toFixed(0)} ns/call with the hill against ${flatNs.toFixed(0)} flat, `
      + `${(hillNs / flatNs).toFixed(2)}x (sink ${r2(sink)})`);
  }
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
