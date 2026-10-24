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
import { MISSIONS, ALL_MISSIONS, ARC } from '../src/game/missions.js';
import { Garage, UNLOCKS, FOR_SALE } from '../src/game/garage.js';
import * as save from '../src/game/save.js';
import { Nav } from '../src/game/nav.js';
import { stageTarget, resolveAt } from '../src/game/missionkit.js';
import { LIFE_MISSIONS } from '../src/game/lifejobs.js';
import { mainIds, OPTIONAL, FINALE, isMain, isRetired, storyBlocker } from '../src/game/campaign.js';

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
  ok(cart.seats === 1, 'a two-place bench (driver + one)');
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

group('« N’importe quelle petite clé » (mission 6, was « Le cart du Club »)');
{
  const def = MISSIONS.find((m) => m.id === 'golfcart');
  ok(!!def, 'the job is registered in MISSIONS');
  ok(def.giver === 'golf' && !!PLACES.golf, 'its giver is PLACES.golf');
  ok(/Club de Golf/.test(PLACES.golf.label), `which is « ${PLACES.golf.label} »`);
  // RESTRUCTURE (29 Sept 2026, Tom's approved ten-mission plan): the old
  // structure is gone on purpose. There is no longer a pause list that grows as
  // the five arc beats are earned: MISSIONS and ALL_MISSIONS are the same set,
  // the ten main missions (campaign.js MAIN, by id), the finale and the
  // optional jobs, and campaign.storyBlocker decides what is open. The counts
  // are derived from campaign.js so the set-pieces ids (nuittim) land without
  // a magic number changing.
  const expected = mainIds().length + 1 + Object.keys(OPTIONAL).length;
  ok(MISSIONS.length === expected, `${MISSIONS.length} jobs in the pause menu (${expected}: main + finale + optional)`);
  ok(ALL_MISSIONS.length === MISSIONS.length, `${ALL_MISSIONS.length} jobs in the whole summer, the same set`);
  ok(MISSIONS.every((m) => !isRetired(m.id)), 'no retired job is in the list');
  ok(MISSIONS.filter((m) => ARC.includes(m)).every((m) => isMain(m.id) || m.id === FINALE),
    'the arc beats left in the list are main missions or the finale');
  const open = MISSIONS.filter((m) => isMain(m.id) && !storyBlocker(m.id, [])).map((m) => m.id);
  ok(open.length === 1 && open[0] === 'alternateur', `only « L'alternateur » is open on a brand-new save (${open.join(', ')})`);
  ok(storyBlocker('golfcart', []) === 'alternateur', 'the golf night waits for the main missions before it');
  // Eleven since D31 (Tom, 13 Oct 2026) cut arcsurchauffe from step 7.
  ok(mainIds().length === 11 && mainIds().includes('nuittim') && !mainIds().includes('arcsurchauffe'), `all eleven main ids are built, « La nuit du Tim » included (${mainIds().length})`);

  // Updated 6 Oct 2026 for Tom's account: the bikes, Sayyad starts it and
  // drives first, Tom's joyride, the owners' chase, back to the bikes, the fence.
  const inCar = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 80 });
  const onBike = def.build({ carId: 'dbike', carName: 'Diamondback', seats: 1, money: 80 });
  ok(inCar.length === 12, `twelve stages when you drive up in a car (${inCar.length})`);
  ok(onBike.length === 11, 'eleven when you come on your bike: nothing to take out of the truck');
  ok(inCar[0].kind === 'velo' && inCar[1].kind === 'keys' && typeof inCar[1].onTick === 'function', 'the bikes, then the key-try beat');
  ok(def.timeOfDay === 'night', 'at night');

  for (const st of inCar) {
    ok(typeof st.text === 'string' && st.text.length > 0, `stage "${st.kind}" has objective text`);
    if (typeof st.at === 'string') ok(!!PLACES[st.at], `stage "${st.kind}" names a real place: ${st.at}`);
    const p = resolveAt(st.at, { parked: {} });
    ok(p && Number.isFinite(p.x) && Number.isFinite(p.z), `stage "${st.kind}" resolves to a point`);
    const tgt = stageTarget({ parked: {} }, {}, st);
    ok(tgt && tgt.r > 0, `stage "${st.kind}" has a marker of radius ${tgt && tgt.r}`);
  }
  const chase = inCar.filter((s) => /^chase/.test(s.kind));
  ok(chase.length === 4 && chase.every((s) => s.time > 0), 'four timed chase flags');
  ok(chase.every((s) => /proprios/i.test(s.failWhy)), `failing says « ${chase[0].failWhy} »`);
  const bikes = inCar.find((s) => s.kind === 'bikes');
  ok(!!bikes && bikes.time > 0 && bikes.hold === true, 'back to the bikes on the same clock, ends on a held E');
  ok(inCar[inCar.length - 1].kind === 'fence', 'and you leave over the fence, on the bike');
  ok(inCar.every((s) => !s.cost), 'and costs nothing, so there is no way to be too broke for it');

  // Cart-only: the flags and the run back refuse anything else.
  for (const st of inCar.filter((s) => /^cp|^chase|^bikes/.test(s.kind))) {
    ok(typeof st.condition === 'function', `stage "${st.kind}" has a condition`);
    ok(st.condition({ carId: 'cart', veh: { spec: cart } }) === true,
      `stage "${st.kind}" completes in the cart`);
    ok(st.condition({ carId: 'ranger', veh: { spec: carById('ranger') } }) === false,
      `stage "${st.kind}" does NOT complete in the Ranger`);
    ok(typeof st.prompt({ carId: 'ranger', veh: { spec: carById('ranger') } }) === 'string',
      `stage "${st.kind}" says why when you turn up in the wrong thing`);
  }
  ok(typeof def.cleanup === 'function', 'the job cleans up after itself');
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
  // Was « < 20 m from the clubhouse » when the default 12 m apron put it
  // inside the building (set-pieces note, 29 Sept). Straight out, the walls
  // reach about 21 m (measured with world.buildingAt in the browser).
  ok(dB > 22 && dB < 30, `and ${dB.toFixed(1)} m from the clubhouse centre: outside its walls, still at the club`);

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
  ok(seats.length === 1, 'one passenger seat (driver + one on the bench)');
  ok(Math.abs(seats[0][2] - cart.seatZ) < 0.6, 'beside the driver on the bench, not behind');
  ok(seats.every((s) => s[1] > 0.5 && s[1] < cart.h), 'under the canopy');
}

// ---------------------------------------------------------------- 6. never stranded

// Plan v2 B-01a (13 Oct panel, fix 1 for all five reviewers): golf night's
// tearDown swapped you back only within 25 m of your bike, so a fail out on
// the course left you in the 24 km/h cart for the rest of the summer. Every
// end kind, at 30 m, 300 m and 1,500 m from the Ranger, must leave you in the
// Ranger within 3 s of the end card.
group('never stranded: every golf-night end puts you back in the Ranger (B-01a)');
{
  const { golfnuit, TEE, JOYRIDE, BACK_LINE, GOLFNUIT } = await import('../src/game/setpieces/golfnuit.js');
  const { stageEnter, stageExit, missionCleanup } = await import('../src/game/missionkit.js');
  const { offerRetry, tickRetry, takeRetry, RETRY_WINDOW } = await import('../src/game/retry.js');
  const SPECS = {
    ranger: carById('ranger'), cart: carById('cart'), civic: carById('civic'),
    dbike: { id: 'dbike', name: 'Diamondback Sorrento', who: 'Yours', style: 'bike', twoWheel: true, seats: 1 },
  };
  const mkVeh = (id, p) => ({
    spec: SPECS[id], x: p.x, z: p.z, yaw: p.yaw || 0, speedKmh: 0, vLong: 0, damage: 0, passengers: 0,
    repair() { this.damage = 0; }, reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; },
  });
  const homeBike = { x: PLACES.home.x + 4, z: PLACES.home.z + 2, yaw: 0 };
  const lot = { x: PLACES.golf.x, z: PLACES.golf.z, yaw: PLACES.golf.a || 0 };
  const mkG = () => {
    const G = { parked: {}, carId: 'ranger', time: 0, character: 'tom', health: {}, toasts: [], day: 5 };
    G.hud = { toast: (t) => G.toasts.push(String(t)), prompt() {} };
    G.parked.cart = { ...save.homeParked().cart };
    G.parked.dbike = { ...homeBike };
    G.veh = mkVeh('ranger', lot);
    G.swapCar = (id) => {
      const v = G.veh, spot = G.parked[id];
      if (!spot) return;
      G.parked[v.spec.id] = { x: v.x, z: v.z, yaw: v.yaw };
      delete G.parked[id];
      G.carId = id; G.veh = mkVeh(id, spot);
    };
    return G;
  };
  const startNight = (G) => {
    const stages = golfnuit.build({ carId: 'ranger', carName: 'Ranger', seats: 2 });
    const m = { def: golfnuit, stages, idx: 0, elapsed: 0 };
    G.mission = m;
    return m;
  };
  const goto = (G, m, kind) => {
    // Walk the real stages up to `kind`: their onEnter / onTick / onExit do the swaps.
    while (m.stages[m.idx].kind !== kind) {
      const st = m.stages[m.idx];
      if (st.kind === 'keys') {
        G.veh.x = TEE.x + 2; G.veh.z = TEE.z; G.veh.speedKmh = 0;
        for (let k = 0; k < 3 && !inCartNow(G); k++) { G.wantStart = true; st.onTick(G, m, st, 1 / 60); }
      }
      stageExit(G, m, st);
      m.idx++;
      stageEnter(G, m, m.stages[m.idx]);
    }
  };
  const inCartNow = (G) => G.veh && G.veh.spec && G.veh.spec.id === 'cart';
  const away = (G, d) => {
    const r = G.parked.ranger;
    G.veh.x = r.x + d * Math.SQRT1_2; G.veh.z = r.z - d * Math.SQRT1_2;
  };
  // The five ways a night ends, each from the vehicle that end really happens in.
  const ENDS = {
    success: { at: 'fence', rig: 'dbike', end: (G, m) => { m.fenceS = { over: true }; missionCleanup(G, m, false); } },
    fail: { at: 'chase2', rig: 'cart', end: (G, m) => { m.failed = true; missionCleanup(G, m, true); } },
    abandon: { at: 'cp2', rig: 'cart', end: (G, m) => missionCleanup(G, m, true) },
    quit: { at: 'keys', rig: 'dbike', end: (G, m) => missionCleanup(G, m, true) },
    retryLapsed: {
      at: 'bikes', rig: 'cart',
      end: (G, m) => {
        m.failed = true;
        const offer = offerRetry({ G, mission: m, why: 'Les proprios t’ont pogné.' });
        missionCleanup(G, m, true); G.mission = null;
        return offer;
      },
    },
  };
  let held = 0, total = 0;
  for (const [kind, e] of Object.entries(ENDS)) {
    for (const d of [30, 300, 1500]) {
      total++;
      const G = mkG();
      const m = startNight(G);
      stageEnter(G, m, m.stages[0]);
      goto(G, m, e.at);
      const rigOk = G.veh.spec.id === e.rig;
      away(G, d);
      const before = G.veh.spec.id;
      const dist = Math.hypot(G.veh.x - G.parked.ranger.x, G.veh.z - G.parked.ranger.z);
      const tEnd = G.time;
      const offer = e.end(G, m);
      // The end card is up now; the clock runs on (the retry window too).
      let tIn = G.veh.spec.id === 'ranger' ? 0 : null, stayed = true;
      for (let i = 0; i < (RETRY_WINDOW + 2) * 10; i++) {
        G.time += 0.1;
        if (offer) tickRetry(G, 0.1, null, false);
        if (G.veh.spec.id === 'ranger') { if (tIn == null) tIn = G.time - tEnd; } else if (tIn != null) stayed = false;
      }
      const good = rigOk && tIn != null && tIn <= 3 && stayed;
      if (good) held++;
      ok(good, `${kind} in the ${before} ${dist.toFixed(0)} m from the Ranger: in the Ranger ${tIn == null ? 'never' : tIn.toFixed(1) + ' s'} after the end card`,
        `rig ${G.veh.spec.id}, rigOk ${rigOk}, stayed ${stayed}`);
      if (d === 300) {
        ok(G.toasts.some((t) => t === BACK_LINE.ranger || t === BACK_LINE.morning), `${kind}: the narrator says where the Ranger is`, G.toasts.slice(-2).join(' | '));
        const apron = save.apronSpot(PLACES.golf, GOLFNUIT.apronBack);
        ok(G.parked.cart && Math.hypot(G.parked.cart.x - apron.x, G.parked.cart.z - apron.z) < 1, `${kind}: the cart is back on its apron`);
        ok(G.parked.dbike && Math.hypot(G.parked.dbike.x - homeBike.x, G.parked.dbike.z - homeBike.z) < 1, `${kind}: the bike is back where it was before the night`);
        if (kind === 'retryLapsed') ok(!G.retry, 'the retry window ran out and nothing moved you');
      }
    }
  }
  ok(held === 15, `${held} of ${total} ends leave you in the Ranger within 3 s of the end card`);
  console.log(`  B01A_ENDS ${held}/${total}`);
  ok(TEE && JOYRIDE.length === 3, 'course data intact');

  // The success line is the morning after; every other end is the plain line.
  {
    const G = mkG(); const m = startNight(G); stageEnter(G, m, m.stages[0]); goto(G, m, 'fence');
    m.fenceS = { over: true }; missionCleanup(G, m, false);
    ok(G.toasts.includes(BACK_LINE.morning), `success: « ${BACK_LINE.morning} »`);
  }

  // A free retry resumes the job at the stage that failed. tearDown has put you
  // in the Ranger at the lot, so the stage puts the bike and the cart back under
  // you, and the next end still brings you home.
  {
    const G = mkG(); const m = startNight(G); stageEnter(G, m, m.stages[0]); goto(G, m, 'chase2');
    m.failed = true;
    offerRetry({ G, mission: m, why: 'x' });
    missionCleanup(G, m, true); G.mission = null;
    ok(G.veh.spec.id === 'ranger', 'after the fail: in the Ranger');
    const take = takeRetry(G);
    const stages = golfnuit.build({ carId: 'ranger', carName: 'Ranger', seats: 2 });
    const m2 = { def: golfnuit, stages, idx: take.saved.stage, elapsed: take.saved.elapsed };
    G.mission = m2;
    stageEnter(G, m2, stages[m2.idx]);
    ok(G.veh.spec.id === 'cart', `retry at « ${stages[m2.idx].kind} »: back in the cart`);
    ok(m2.cameIn === 'dbike' && !!G.parked.dbike && Math.hypot(G.parked.dbike.x - TEE.x, G.parked.dbike.z - TEE.z) < 5, 'and the bikes wait at the first tee');
    ok(!!G.parked.ranger, 'the Ranger stays in the lot');
    missionCleanup(G, m2, true);
    ok(G.veh.spec.id === 'ranger', 'quit the retry: in the Ranger again');
    ok(Math.hypot(G.parked.dbike.x - homeBike.x, G.parked.dbike.z - homeBike.z) < 1, 'and the bike went home with it');
  }
  // Came on the bike: the bike is what you came in, and that is what you get back.
  {
    const G = mkG();
    G.veh = mkVeh('dbike', lot); delete G.parked.dbike; G.parked.ranger = { ...homeBike, x: homeBike.x - 8 };
    const stages = golfnuit.build({ carId: 'dbike', carName: 'Diamondback', seats: 1 });
    const m = { def: golfnuit, stages, idx: 0, elapsed: 0 }; G.mission = m;
    stageEnter(G, m, stages[0]); goto(G, m, 'cp2');
    ok(inCartNow(G), 'came on the bike: in the cart at the second flag');
    away(G, 300);
    missionCleanup(G, m, true);
    ok(G.veh.spec.id === 'dbike', 'abandon: back on your bike, not in the cart');
    ok(G.toasts.includes(BACK_LINE.bike), `« ${BACK_LINE.bike} »`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
