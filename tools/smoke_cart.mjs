// The golf cart, and the job that exists for it:  node tools/smoke_cart.mjs
//
// Five things, none of which any other suite covers:
//   1. the cart's meshes build at all, and cheaply enough to draw
//   2. it really does grip better on turf than on tarmac — the whole point
//   3. « Le cart du Club » is a well-formed mission, cart-only, and it pays
//   4. a brand-new game has it parked at the clubhouse, drivable, off the lot
//   5. two seats, so « Ramasser la gang » re-plans into two trips like the Ranger
import { MAP } from '../src/game/mapdata.js';
import {
  CARS, carById, buildCarBody, buildWheel, buildCarLamps, buildCrumple,
  carLampBoxes, Vehicle,
} from '../src/game/cars.js';
import { SURF } from '../src/game/terrain.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MISSIONS } from '../src/game/missions.js';
import { Garage, UNLOCKS, FOR_SALE } from '../src/game/garage.js';
import * as save from '../src/game/save.js';
import { Nav } from '../src/game/nav.js';
import { stageTarget, resolveAt } from '../src/game/missionkit.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// localStorage stand-in, so Garage can be built in node.
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

const fakeWorld = {
  bounds: MAP.bounds,
  nearestRoad(x, z) {
    let bd = Infinity, best = { x, z, yaw: 0, name: '' };
    for (const r of MAP.roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '' }; }
      }
    }
    return best;
  },
};
resolvePlaces(fakeWorld);

const cart = carById('cart');

// ---------------------------------------------------------------- 1. meshes

group('the cart builds');
{
  ok(cart.id === 'cart', 'there is a car called "cart"', cart.id);
  ok(cart.style === 'cart', 'and it has its own body style');

  let body = null, wheel = null, lamps = null, crumple = null, err = null;
  try {
    body = buildCarBody(cart);
    wheel = buildWheel(cart);
    lamps = buildCarLamps(cart);
    crumple = buildCrumple();
  } catch (e) { err = e; }
  ok(!err, 'body / wheel / lamps / crumple all build without throwing', err && err.message);
  const tris = body ? body.i.length / 3 : Infinity;
  ok(tris < 900, `the body is ${tris} triangles, under the 900 budget`);
  ok(wheel && wheel.i.length / 3 > 0, 'the wheel has geometry');
  // Every lamp group the renderer will ask for has to exist, even if it is tiny.
  const L = carLampBoxes(cart);
  for (const k of ['head', 'tail', 'rev']) {
    ok(Array.isArray(L[k]) && L[k].length > 0, `carLampBoxes gives it ${k} lamps`);
  }
  ok(L.head.length === 1, 'two little headlamps (one box, mirrored) and nothing else up front');
  for (const k of Object.keys(lamps || {})) {
    ok(lamps[k] && Array.isArray(lamps[k].i), `buildCarLamps.${k} is a mesh`);
  }
  ok(crumple && crumple.i.length > 0, 'the shared crumple cap still builds');

  // Dimensions, the same check tools/car_views.mjs makes.
  const nm = buildCarBody(cart, { noMirrors: true });
  const L2 = nm.max[2] - nm.min[2], W = nm.max[0] - nm.min[0], H = nm.max[1];
  const pct = (a, b) => Math.abs(a / b - 1) * 100;
  ok(pct(L2, cart.len) <= 3, `mesh length ${L2.toFixed(2)} m vs ${cart.len} m spec`);
  ok(pct(W, cart.wid) <= 3, `mesh width ${W.toFixed(2)} m vs ${cart.wid} m spec`);
  ok(pct(H, cart.h) <= 3, `mesh height ${H.toFixed(2)} m vs ${cart.h} m spec — the canopy`);
  ok(cart.wheelR <= 0.28, `tiny wheels: ${cart.wheelR} m`);
  ok(cart.seats === 2, 'a two-place bench');
  ok(cart.mass === 400, '400 kg');
  // Terminal speed, not the nominal number: the engine force tapers into the
  // drag well short of `topSpeed`, so measure what the car actually does.
  const flatOut = (kind) => {
    const world = {
      roadAt: () => kind === 'asphalt', querySegments: () => [], queryPoles: () => [],
      waterAt: () => false, groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind }),
      groundY: () => 0, bounds: MAP.bounds,
    };
    const v = new Vehicle(cart);
    v.reset(0, 0, 0);
    const ctl = { steer: 0, throttle: 1, brake: 0, handbrake: false };
    for (let i = 0; i < 60 * 40; i++) v.update(1 / 60, ctl, world);
    return v.speedKmh;
  };
  const top = flatOut('asphalt');
  ok(Math.abs(top - 24) < 1.5, `${top.toFixed(1)} km/h flat out`);
  // Turf costs it nothing; gravel, which is not turf, still does.
  for (const kind of ['grass', 'path', 'sand']) {
    ok(Math.abs(flatOut(kind) - top) < 0.5, `and the same ${flatOut(kind).toFixed(1)} km/h on ${kind}`);
  }
  ok(flatOut('gravel') < top - 4, `gravel still slows it to ${flatOut('gravel').toFixed(1)} km/h`);
}

// ---------------------------------------------------------------- 2. turf

group('built for turf');
{
  ok(cart.turf > 1, `the cart carries a turf factor of ${cart.turf}`);
  ok(CARS.filter((c) => c.turf).length === 1, 'and it is the only car that does');

  // The number the driving model actually multiplies by: spec grip x surface.
  const asphalt = cart.grip * SURF.asphalt.grip;
  for (const kind of ['grass', 'path', 'sand']) {
    const turf = cart.grip * SURF[kind].grip * cart.turf;
    ok(turf > asphalt, `${kind}: grip ${turf.toFixed(2)} beats asphalt's ${asphalt.toFixed(2)}`);
  }
  ok(cart.grip * SURF.gravel.grip * 1 < asphalt, 'gravel is NOT turf, and still costs it grip');

  // ...and again through the real Vehicle, which is where the guarded line is.
  // Slide the cart sideways and see how much of that slip the tyres eat in a
  // second: more bite means less left over.
  const slipLeft = (kind) => {
    const world = {
      roadAt: () => kind === 'asphalt',
      querySegments: () => [],
      queryPoles: () => [],
      waterAt: () => false,
      groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind }),
      groundY: () => 0,
      bounds: MAP.bounds,
    };
    const v = new Vehicle(cart);
    v.reset(0, 0, 0);
    v.assist = false;
    v.vx = 4; v.vz = 4;              // 45 degrees of slide
    v.syncFrame();
    const ctl = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    for (let i = 0; i < 60; i++) v.update(1 / 60, ctl, world);
    return Math.abs(v.vLat);
  };
  const onGrass = slipLeft('grass'), onAsphalt = slipLeft('asphalt');
  ok(onGrass < onAsphalt,
    `it hangs on to a slide on grass (${onGrass.toFixed(3)} m/s left) better than on tarmac (${onAsphalt.toFixed(3)})`);

  // No other car gained anything from the new line.
  const ranger = carById('ranger');
  const rGrass = ranger.grip * SURF.grass.grip, rAsph = ranger.grip * SURF.asphalt.grip;
  ok(rGrass < rAsph, 'the Ranger is unchanged: grass still costs it grip');
}

// ---------------------------------------------------------------- 3. the job

group('« Le cart du Club »');
{
  const def = MISSIONS.find((m) => m.id === 'golfcart');
  ok(!!def, 'the job is registered in MISSIONS');
  ok(def.giver === 'golf' && !!PLACES.golf, 'its giver is PLACES.golf');
  ok(/Club de Golf/.test(PLACES.golf.label), `which is « ${PLACES.golf.label} »`);
  ok(MISSIONS.length === 15, `${MISSIONS.length} jobs in the pause menu`);

  const inCar = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 80 });
  const inCart = def.build({ carId: 'cart', carName: cart.name, seats: 2, money: 80 });
  ok(inCar.length === 3, `three stages when you drive up in a car (${inCar.length})`);
  ok(inCart.length === 2, 'two when you are already in the cart — no need to fetch one');
  ok(inCar[0].hold === true && /E/.test(inCar[0].holdText), 'the first stage is a held E on a cart');

  for (const st of inCar) {
    ok(typeof st.text === 'string' && st.text.length > 0, `stage "${st.kind}" has objective text`);
    if (typeof st.at === 'string') ok(!!PLACES[st.at], `stage "${st.kind}" names a real place: ${st.at}`);
    const p = resolveAt(st.at, { parked: {} });
    ok(p && Number.isFinite(p.x) && Number.isFinite(p.z), `stage "${st.kind}" resolves to a point`);
    const tgt = stageTarget({ parked: {} }, {}, st);
    ok(tgt && tgt.r > 0, `stage "${st.kind}" has a marker of radius ${tgt && tgt.r}`);
  }
  const beach = inCar.find((s) => s.at === 'beach');
  ok(!!beach && beach.radius === 20, 'the beach checkpoint is 20 m across');
  const back = inCar[inCar.length - 1];
  ok(back.at === 'golf', 'and the last stage brings it home to the Club');
  ok(back.time > 0, `with a ${Math.round(back.time / 60)}-minute marshal timer`);
  ok(/marshal/i.test(back.failWhy), `failing says « ${back.failWhy} »`);
  ok(back.money === 25, 'it pays $25');
  ok(inCar.every((s) => !s.cost), 'and costs nothing, so there is no way to be too broke for it');

  // Cart-only: the two driving stages refuse anything else.
  for (const st of [beach, back]) {
    ok(typeof st.condition === 'function', `stage "${st.kind}" has a condition`);
    ok(st.condition({ carId: 'cart', veh: { spec: cart } }) === true,
      `stage "${st.kind}" completes in the cart`);
    ok(st.condition({ carId: 'ranger', veh: { spec: carById('ranger') } }) === false,
      `stage "${st.kind}" does NOT complete in the Ranger`);
    ok(typeof st.prompt({ carId: 'ranger', veh: { spec: carById('ranger') } }) === 'string',
      `stage "${st.kind}" says why when you turn up in the wrong thing`);
  }
  ok(typeof def.cleanup === 'function', 'the job cleans up after itself');
  // cleanup must survive being called on a half-built mission (Backspace on
  // stage one, before anything was swapped).
  let threw = null;
  try { def.cleanup({}, {}); def.cleanup({ carId: 'cart' }, { cameIn: 'ranger' }); } catch (e) { threw = e; }
  ok(!threw, 'and cleanup on a half-finished job does not throw', threw && threw.message);

  // The giver has to be reachable, or the job is a marker in a field.
  const nav = new Nav();
  const r = nav.route(PLACES.home.x, PLACES.home.z, PLACES.golf.x, PLACES.golf.z);
  ok(r && r.length > 1, 'and you can drive to it from home');
}

// ---------------------------------------------------------------- 4. parked

group('parked at the clubhouse');
{
  localStorage.clear();
  const g = new Garage(new Set());
  ok(g.has('cart', new Set()), 'garage.has(cart) with nothing done at all');
  ok(g.reason('cart', new Set()) === null, 'so the menu card is never locked');
  ok(UNLOCKS.cart.kind === 'free', 'it is unlocked because nobody owns it, not because you earned it');
  ok(!FOR_SALE.includes('cart'), 'it is not on the used lot');
  ok(g.newlyUnlocked(new Set()).every((u) => u.id !== 'cart'),
    'and it never fires an « on te passe les clés » toast');

  ok(save.OWNER.cart === 'golf', "save.js parks it at the golf course");
  const home = save.homeParked();
  ok(!!home.cart, 'a new game gives it a spot');
  const p = PLACES.golf;
  const d = Math.hypot(home.cart.x - p.x, home.cart.z - p.z);
  // Far enough off the marker that « E — prendre le cart » and the job prompt
  // are two different things (the runner offers a job inside 12 m).
  ok(d > 12, `it sits ${d.toFixed(1)} m off the job marker, so both prompts fit`);
  const dB = Math.hypot(home.cart.x - (p.bx ?? p.x), home.cart.z - (p.bz ?? p.z));
  ok(dB < 20, `and ${dB.toFixed(1)} m from the clubhouse itself`);

  const fresh = save.newSave();
  ok(!!fresh.parked.cart, 'and a brand-new save has it parked there');

  // Nobody else drives one.
  ok(cart.noTraffic === true, 'ambient traffic never spawns a golf cart');
}

// ---------------------------------------------------------------- 5. seats

group('two seats');
{
  const gang = MISSIONS.find((m) => m.id === 'gang');
  const inCart = gang.build({ carId: 'cart', carName: cart.name, seats: cart.seats });
  const inRanger = gang.build({ carId: 'ranger', carName: 'Ranger', seats: 2 });
  const inVan = gang.build({ carId: 'caravan', carName: 'Caravan', seats: 6 });
  ok(inCart.length === inRanger.length,
    `the gang job in the cart is the ${inCart.length}-stage two-trip version, same as the Ranger`);
  ok(inCart.length > inVan.length, 'and longer than the one-trip van run');

  // The bench sits the passenger beside you, not 1.1 m behind the seat.
  const seats = Vehicle.prototype.seatPositions.call({ spec: cart });
  ok(seats.length === 2, 'two seat positions');
  ok(Math.abs(seats[0][2] - seats[1][2]) < 0.01, 'side by side on the bench, not one behind the other');
  ok(seats.every((s) => s[1] > 0.5 && s[1] < cart.h), 'both of them under the canopy');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
