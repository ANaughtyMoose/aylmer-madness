// The two buses and the two bicycles:  node tools/smoke_vehicles.mjs
//
// game/vehicles.js registers four vehicles into the same CARS table cars.js
// owns, so this suite asks of them exactly what tools/smoke_driving.mjs asks of
// the cars — a unique handbrake, a sane reverse, a sound profile, a gearbox —
// plus the five things that are only true of these four:
//
//   1. the meshes build, come out the size the spec claims, and wind correctly
//   2. the city bus really did get rebodied: same chassis numbers, new shape
//   3. a bicycle is legs — the sprint runs out, and the space bar is a hop
//   4. a bicycle goes where a truck cannot: sand, grass, path, and gaps
//   5. the ambient world has cyclists, one bus on a route and one school bus
//
// NOTE for whoever folds these into cars.js: the moment these specs live in
// the CARS literal, smoke_driving's "everyone else backs up at 25 km/h" list
// needs the four new ids added to its exception, and smoke_cart's "the cart is
// the only car with a turf factor" becomes "the cart and the two bikes".
import { MAP } from '../src/game/mapdata.js';
import { CARS, carById, Vehicle, buildCarBody, buildWheel } from '../src/game/cars.js';
import { SURF } from '../src/game/terrain.js';
import { STRIDE } from '../src/core/mesh.js';
import { FONT } from '../src/game/vehiclekit.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const r1 = (n) => Number(n).toFixed(1);

// localStorage stand-in, so the Garage can be built in node.
if (!globalThis.localStorage) {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

// The lot bus BEFORE anything touches it, so the rebody can be checked against
// what it replaced rather than against a number typed twice.
const before = { ...carById('bus') };

const { Garage, UNLOCKS, FOR_SALE } = await import('../src/game/garage.js');
const save = await import('../src/game/save.js');
const { VEHICLE_OWNERS, bikeState } = await import('../src/game/vehicles.js');
const { bikeControl } = await import('../src/game/bikes.js');
const { Traffic } = await import('../src/game/traffic.js');

const IDS = ['bus', 'schoolbus', 'cruiser', 'dbike'];
const BIKES = ['cruiser', 'dbike'];

// ------------------------------------------------------------------ helpers

function tris(mb) {
  const out = [];
  for (let k = 0; k < mb.i.length; k += 3) {
    const P = [], N = [];
    for (let j = 0; j < 3; j++) {
      const b = mb.i[k + j] * STRIDE;
      P.push([mb.v[b], mb.v[b + 1], mb.v[b + 2]]);
      N.push([mb.v[b + 3], mb.v[b + 4], mb.v[b + 5]]);
    }
    out.push({ P, N });
  }
  return out;
}
function windingBad(mb) {
  let bad = 0;
  for (const t of tris(mb)) {
    const [a, b, c] = t.P;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const g = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const l = Math.hypot(...g);
    if (l < 1e-9) continue;
    const n = [0, 1, 2].map((i) => (t.N[0][i] + t.N[1][i] + t.N[2][i]) / 3);
    if ((g[0] * n[0] + g[1] * n[1] + g[2] * n[2]) / l < 0) bad++;
  }
  return bad;
}
const world = (kind) => ({
  roadAt: () => kind === 'asphalt', querySegments: () => [], queryPoles: () => [],
  waterAt: () => false, groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind }),
  groundY: () => 0, bounds: MAP.bounds,
});
const CTL = () => ({ steer: 0, throttle: 0, brake: 0, handbrake: false });

// Flat out on a surface, with fresh legs for anything that has legs. `secs` is
// deliberately short for a bicycle: a sprint that lasts a minute is not one.
function flatOut(id, kind, secs = 40) {
  const spec = carById(id);
  const v = new Vehicle(spec);
  v.reset(0, 0, 0);
  const G = { veh: v };
  let top = 0;
  for (let i = 0; i < 60 * secs; i++) {
    const ctl = CTL();
    ctl.throttle = 1;
    bikeControl(G, ctl, 1 / 60);
    v.update(1 / 60, ctl, world(kind));
    if (v.speedKmh > top) top = v.speedKmh;
  }
  return top;
}

// ---------------------------------------------------------------- 1. meshes

group('the four build');
{
  for (const id of IDS) {
    const s = carById(id);
    ok(!!s && !!s.buildBody, `${id} is in CARS with a body of its own`);
    const body = s.buildBody(s), wheel = s.buildWheel(s);
    const steer = s.buildSteer ? s.buildSteer(s) : null;
    const n = body.i.length / 3 + wheel.i.length / 3 + (steer ? steer.i.length / 3 : 0);
    ok(n > 200 && n < 4200, `${id}: ${body.i.length / 3} body + ${wheel.i.length / 3} wheel`
      + (steer ? ` + ${steer.i.length / 3} steering` : '') + ' tris');
    ok(windingBad(body) === 0, `${id}: every body triangle faces the way its normals say`,
      `${windingBad(body)} backwards`);
    ok(windingBad(wheel) === 0, `${id}: ...and every wheel triangle`);
    // Dimensions over the WHOLE assembly, the way tools/car_views.mjs measures
    // them: a bicycle's bars are half its width and its wheels half its length.
    const lo = body.min.slice(), hi = body.max.slice();
    if (steer) for (const p of [0, 1, 2]) {
      lo[p] = Math.min(lo[p], steer.min[p] + (p === 2 ? s.axleZ : 0));
      hi[p] = Math.max(hi[p], steer.max[p] + (p === 2 ? s.axleZ : 0));
    }
    if (s.twoWheel) {
      lo[2] = Math.min(lo[2], -(s.axleZ + s.wheelR));
      hi[2] = Math.max(hi[2], s.axleZ + s.wheelR);
      hi[1] = Math.max(hi[1], s.wheelR * 2);
      ok(s.track === 0, `${id}: one track — both drawn wheels are in the frame's plane`);
    }
    const L = hi[2] - lo[2], W = hi[0] - lo[0], H = hi[1];
    ok(Math.abs(L / s.len - 1) <= 0.03, `${id}: mesh ${r1(L)} m long vs ${s.len} m spec`);
    ok(Math.abs(H / s.h - 1) <= 0.03, `${id}: mesh ${r1(H)} m tall vs ${s.h} m spec`);
    if (s.twoWheel) ok(Math.abs(W / s.wid - 1) <= 0.03, `${id}: ${r1(W)} m over the bars vs ${s.wid} m spec`);
  }
  // Everything written on the four is in the font, or it silently comes out as
  // spaces on the destination sign.
  const words = ['40 LAVIGNE', '7901', 'STO', '40', 'ÉCOLIERS', 'ARRÊT', '3800',
    'DIAMONDBACK', 'DB', 'TRACER'];
  const missing = [...new Set(words.join('').toUpperCase())]
    .filter((c) => !FONT[c] && !'ÉÊÈ'.includes(c));
  ok(missing.length === 0, 'every letter the four wear has a glyph', missing.join(''));
}

// ------------------------------------------------------- 2. the rebodied bus

group('the lot bus is a New Look now');
{
  const bus = carById('bus');
  for (const k of ['len', 'wid', 'h', 'wheelbase', 'overhangF', 'track', 'wheelR',
    'topSpeed', 'accel', 'brake', 'grip', 'steerMax', 'mass', 'seats', 'revTop']) {
    ok(bus[k] === before[k], `it drives exactly as it did: ${k} still ${bus[k]}`);
  }
  ok(/New Look/.test(bus.name), `and it is called « ${bus.name} »`);
  ok(bus.sign === '40 LAVIGNE' && bus.fleet === '7901', 'route 40 LAVIGNE, fleet 7901');
  ok(UNLOCKS.bus.kind === 'buy' && UNLOCKS.bus.cost === 1500, 'still $1,500 on the used lot');
  ok(FOR_SALE.includes('bus'), 'still on the lot');
  ok(!FOR_SALE.includes('schoolbus'), 'the school bus is not for sale');
}

// --------------------------------------------------- 3. the table invariants

group('what smoke_driving asks of every car');
{
  const grips = CARS.map((c) => c.hbGrip);
  ok(new Set(grips).size === CARS.length, 'every vehicle still has its own handbrake grip',
    `${new Set(grips).size} of ${CARS.length}`);
  ok(CARS.every((c) => c.revEngage >= 0.2 && c.revEngage <= 0.3),
    'every vehicle engages R in 0.2–0.3 s');
  ok(CARS.every((c) => c.sound && c.drive && c.sound.cyl >= 4),
    'every vehicle has a sound profile and a gearbox');
  ok(new Set(CARS.map((c) => `${c.sound.cyl}:${c.sound.idle}:${c.sound.redline}`)).size === CARS.length,
    'and no two of them sound the same');
  for (const id of BIKES) {
    const s = carById(id);
    ok(s.revTop < 2, `${id} only walks backwards (${r1(s.revTop * 3.6)} km/h)`);
    ok(s.electric && s.sound.idle === 0, `${id} is silent at a standstill`);
  }
}

// ------------------------------------------------------------ 4. bike physics

group('a bicycle is legs');
{
  for (const id of BIKES) {
    const spec = carById(id);
    const top = flatOut(id, 'asphalt', 10);
    ok(top > 19 && top < 30, `${id}: ${r1(top)} km/h flat out on a fresh pair of legs`);
    // ...and the same on everything a bike belongs on. `turf` is what does it.
    for (const kind of ['grass', 'path', 'sand']) {
      const t = flatOut(id, kind, 10);
      ok(Math.abs(t - top) < 0.6, `${id}: and ${r1(t)} km/h on ${kind}`);
    }
    ok(flatOut(id, 'gravel', 10) < top - 1.5, `${id}: gravel is not a bike surface`);
    ok(spec.turf > 1, `${id}: turf factor ${spec.turf}`);
  }
  const dbike = carById('dbike'), cruiser = carById('cruiser');
  ok(flatOut('dbike', 'asphalt', 10) > flatOut('cruiser', 'asphalt', 10),
    'the Diamondback is quicker than the cruiser, which is a lot of bike to push');

  // The sprint runs out. Two runs of the same length, back to back, on the same
  // Vehicle: the second one is measurably worse.
  const v = new Vehicle(dbike);
  v.reset(0, 0, 0);
  const G = { veh: v };
  const w = world('asphalt');
  const sprint = (secs) => {
    let top2 = 0;
    for (let i = 0; i < 60 * secs; i++) {
      const ctl = CTL(); ctl.throttle = 1;
      bikeControl(G, ctl, 1 / 60);
      v.update(1 / 60, ctl, w);
      if (v.speedKmh > top2) top2 = v.speedKmh;
    }
    return top2;
  };
  const fresh = sprint(8);
  ok(bikeState().stamina < 0.4, `eight seconds of it leaves ${bikeState().stamina.toFixed(2)} of the legs`);
  // Keep the pedal down: what it settles at once the legs are gone is the
  // number that matters, and it is a good five km/h off the sprint.
  sprint(40);
  ok(bikeState().stamina === 0, 'forty seconds more and there is nothing left');
  const spent = v.speedKmh;
  ok(spent < fresh - 3, `spent legs hold ${r1(spent)} km/h against a ${r1(fresh)} km/h sprint`);
  // ...and coasting brings them back.
  for (let i = 0; i < 60 * 12; i++) { const ctl = CTL(); bikeControl(G, ctl, 1 / 60); v.update(1 / 60, ctl, w); }
  ok(bikeState().stamina > 0.9, `twelve seconds freewheeling and they are back (${bikeState().stamina.toFixed(2)})`);

  // The bunny-hop. Space is not a handbrake on a bicycle.
  const v2 = new Vehicle(dbike);
  v2.reset(0, 0, 0);
  const G2 = { veh: v2 };
  for (let i = 0; i < 60 * 3; i++) { const c = CTL(); c.throttle = 1; bikeControl(G2, c, 1 / 60); v2.update(1 / 60, c, w); }
  const speedIn = v2.speedKmh;
  const hopCtl = CTL(); hopCtl.throttle = 1; hopCtl.handbrake = true;
  bikeControl(G2, hopCtl, 1 / 60);
  ok(hopCtl.handbrake === false, 'the lever is swallowed — a bicycle has no handbrake');
  ok(v2.vy > 2.5, `and it is 3 m/s of up instead (${v2.vy.toFixed(2)})`);
  let hi = 0, air = 0;
  for (let i = 0; i < 90; i++) {
    const c = CTL(); c.throttle = 1;
    bikeControl(G2, c, 1 / 60);
    v2.update(1 / 60, c, w);
    hi = Math.max(hi, v2.y - v2.gh);
    if (v2.inAir) air++;
  }
  ok(hi > 0.30 && hi < 0.70, `the hop clears ${hi.toFixed(2)} m — a 0.15 m kerb and then some`);
  ok(air > 20, `${(air / 60).toFixed(2)} s of air`);
  ok(v2.speedKmh > speedIn * 0.85, 'and it costs almost nothing in speed');
  // Holding the key does not pogo: one press, one hop.
  const yBefore = v2.y;
  for (let i = 0; i < 60 * 2; i++) { const c = CTL(); c.throttle = 1; c.handbrake = true; bikeControl(G2, c, 1 / 60); v2.update(1 / 60, c, w); }
  ok(Math.abs(v2.y - yBefore) < 0.05, 'holding it down does not pogo');
}

// ------------------------------------------- 5. where a bike goes and a truck doesn't

group('places a truck cannot follow');
{
  const gap = (id) => carById(id).wid * 0.52;      // cars.js collide() probe radius
  const ranger = gap('ranger'), bike = gap('dbike'), bus = gap('bus');
  ok(bike < ranger * 0.4,
    `the collider is ${bike.toFixed(2)} m against the Ranger's ${ranger.toFixed(2)} and the bus's ${bus.toFixed(2)}`);
  ok(bike * 2 < 0.7, `so a ${(bike * 2).toFixed(2)} m gap between two walls is a road`);
  for (const kind of ['sand', 'grass', 'path']) {
    const b = flatOut('dbike', kind, 10), t = flatOut('ranger', kind, 10);
    ok(b > 15, `${kind}: the bike still does ${r1(b)} km/h`);
    if (kind !== 'sand') continue;
    // Both halves of the promise, because the two of them pull against each
    // other and a merge once broke each in turn. The beach has to be crossable
    // in a truck — it used to pin one at a dead stop, which read as a bug in
    // the world and not as a choice — and it has to be the bicycle's, by
    // enough that you would go and fetch one rather than shrug and drive.
    ok(t > 8, `sand: the Ranger is not pinned — ${r1(t)} km/h in ten seconds`);
    ok(t < b * 0.75, `sand: and the bike owns the beach`,
      `${r1(b)} km/h against the Ranger's ${r1(t)}`);
  }
  // Nothing on four wheels beats a bicycle across the Plage des Cèdres. The
  // golf cart is the exception that proves it: `turf` says it belongs on soft
  // ground, so it is exempt from the off-road penalty and rides with the bikes.
  {
    const bikes = BIKES.map((id) => flatOut(id, 'sand', 10));
    const cars = CARS.filter((c) => !c.turf && !BIKES.includes(c.id))
      .map((c) => [c.id, flatOut(c.id, 'sand', 10)])
      .sort((a, b) => b[1] - a[1]);
    ok(Math.min(...bikes) > cars[0][1],
      'sand: the slowest bicycle still beats the quickest car',
      `${r1(Math.min(...bikes))} km/h against the ${cars[0][0]}'s ${r1(cars[0][1])}`);
  }
  // The kerb, which is the actual border between the road and the sidewalk.
  // cars.js kicks anything that crosses one with speed on and scrubs it; a bike
  // that hops the kerb is in the air when it crosses and pays nothing.
  {
    const kerbWorld = (v) => ({
      roadAt: (x) => x < 0,                       // the kerb line is x = 0
      querySegments: () => [], queryPoles: () => [], waterAt: () => false,
      groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind: v.x < 0 ? 'asphalt' : 'grass' }),
      groundY: () => 0, bounds: MAP.bounds,
    });
    // The scrub is spent in the moment of crossing and pedalled back within a
    // second, so what is measured is the dip, not the speed a hundred metres on.
    const cross = (hop) => {
      const v = new Vehicle(carById('dbike'));
      v.reset(-14, 0, Math.PI / 2);               // pointing at +X, at the kerb
      const G = { veh: v };
      const w = kerbWorld(v);
      let hopped = false, over = -1, dip = Infinity;
      for (let i = 0; i < 60 * 12; i++) {
        const c = CTL(); c.throttle = 1;
        // Hop with a metre and a half to go, which is where you would.
        if (hop && !hopped && v.x > -1.6) { c.handbrake = true; hopped = true; }
        bikeControl(G, c, 1 / 60);
        v.update(1 / 60, c, w);
        if (over < 0 && v.x > 0) over = i;
        if (over >= 0 && i - over < 20) dip = Math.min(dip, v.speedKmh);
        if (over >= 0 && i - over >= 20) break;
      }
      return dip;
    };
    const rolled = cross(false), hopped = cross(true);
    ok(hopped > rolled + 0.5,
      `hopping the kerb keeps ${r1(hopped)} km/h across it where riding into it drops to ${r1(rolled)}`);
  }
  // Grip, not just power: SURF x spec.turf is what the model multiplies by.
  for (const kind of ['grass', 'path', 'sand']) {
    const d = carById('dbike');
    ok(d.grip * SURF[kind].grip * d.turf > d.grip * SURF.asphalt.grip,
      `${kind}: the knobbies bite harder than they do on tarmac`);
  }
}

// ------------------------------------------------------------- 6. the garage

group('who owns what');
{
  const g = new Garage(new Set());
  for (const id of ['schoolbus', 'cruiser', 'dbike']) {
    ok(g.has(id, new Set()), `${id} is drivable from the first frame`);
    ok(g.reason(id, new Set()) === null, `...so its menu card is never locked`);
    ok(UNLOCKS[id].kind === 'free', `${id} is free because nobody owns it, not because you earned it`);
    ok(g.newlyUnlocked(new Set()).every((u) => u.id !== id), `${id} never announces itself`);
  }
  ok(VEHICLE_OWNERS.cruiser === 'steph', "Sayyad's cruiser lives at 75 Denise-Friend");
  ok(VEHICLE_OWNERS.dbike === 'home', 'yours lives at 299 Chemin Fraser');
  ok(VEHICLE_OWNERS.schoolbus === 'aigle', "the school bus lives at École de l'Aigle");
  for (const id of Object.keys(VEHICLE_OWNERS)) {
    ok(save.OWNER[id] === VEHICLE_OWNERS[id], `save.js parks ${id} in the same place`);
  }
  ok(carById('cruiser').who === 'Sayyad', 'the cruiser is Sayyad\'s by name');
  const names = CARS.map((c) => c.name + c.flavour + (c.who || '')).join(' ');
  ok(!/\b(steph|marc|dave)\b/i.test(names), 'no internal owner key leaks into anything a player reads');
}

// ------------------------------------------------------------- 7. the street

group('the ambient population');
{
  const T = new Traffic(12, 7);
  const by = {};
  for (const c of T.cars) by[c.spec.id] = (by[c.spec.id] || 0) + 1;
  const cyclists = T.cars.filter((c) => c.kind === 'bike');
  ok(cyclists.length >= 2, `${cyclists.length} cyclists on the road`);
  ok(cyclists.every((c) => c.spec.rider === true),
    'every one of them is drawn with somebody on it');
  ok(cyclists.every((c) => c.lane > 0.5), 'and rides a metre right of the driving lane');
  ok(cyclists.every((c) => c.cap < 6), `capped at ${r1(cyclists[0].cap * 3.6)} km/h — nobody pedals at 47`);
  const city = T.cars.filter((c) => c.kind === 'city');
  ok(city.length === 1, 'one STO bus working a route');
  ok(city[0].stopEvery && city[0].stopFor > 3, 'and it pulls over every twenty seconds or so');
  const school = T.cars.filter((c) => c.kind === 'school');
  ok(school.length === 1, 'one school bus — it is July, so a camp run, not a route');
  ok(school[0].spec.rider !== true, 'nobody is drawn pedalling a school bus');
  ok(T.cars.length === 12 + cyclists.length + 2, `${T.cars.length} moving things in total`);
  // It has to survive being run, which is where a bad lane offset shows up.
  const player = { x: T.cars[0].x, z: T.cars[0].z, yaw: 0, vx: 0, vz: 0, mass: 1400, len: 4.8, wid: 1.8, hit: () => 0, syncFrame: () => {} };
  for (let i = 0; i < 600; i++) T.update(1 / 60, player);
  ok(T.cars.every((c) => isFinite(c.x) && isFinite(c.z) && isFinite(c.speed)),
    'ten seconds of it and everybody is still on the map');
  ok(T.cars.some((c) => c.kind === 'city' && c.dwellT >= 0), 'the bus is keeping its own clock');
  void by;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
void buildCarBody; void buildWheel;
