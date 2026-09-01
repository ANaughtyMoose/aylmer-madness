// Headless smoke test:  node tools/smoke.mjs
//
// There is no browser in here, so anything that touches WebGL is stubbed. What
// this actually checks is the stuff that is easy to break and expensive to find
// by driving around: mission wiring, the stage model, the doughnut accumulator,
// the canoe's water constraint, and the couch's arc.
import { MISSIONS, TIME_OF_DAY } from '../src/game/missions.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MAP } from '../src/game/mapdata.js';
import { CARS } from '../src/game/cars.js';
import { DoughnutMeter, COUCH, couchLaunch, couchSim, CouchFlight } from '../src/game/stunts.js';
import { Boat, PADDLE, currentToward } from '../src/game/boat.js';
import {
  Props, buildPropMeshes, ISLAND, ISLAND_CLOSE, PADDLE_LAUNCH, MIKE_TREE, YARD_SALE, islandLandAt,
} from '../src/game/props.js';
import { Wallet } from '../src/game/money.js';
import {
  stageTarget, stageEnter, stageExit, stageStep, stageSettle, missionCleanup,
  meterBar, fillBar, missionStyleBonus,
} from '../src/game/missionkit.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- stubs

// The water mask, straight out of mapdata — the same test world.js exposes.
const B = MAP.bounds, wm = MAP.waterMask;
const mask = Uint8Array.from(Buffer.from(wm.b64, 'base64'));
const waterAt = (x, z) => {
  const i = Math.floor((x - (wm.minX ?? B.minX)) / wm.cell);
  if (i < 0 || i >= wm.w) return false;
  const j = Math.floor((z - (wm.minZ ?? B.minZ)) / wm.cell);
  if (j < 0 || j >= wm.h) return false;
  return mask[j * wm.w + i] === 1;
};

// Just enough "world" for resolvePlaces() and the boat.
const fakeWorld = {
  bounds: B,
  waterAt,
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

// A renderer that counts triangles instead of drawing them.
const fakeRenderer = {
  uploads: 0,
  upload(builder) {
    this.uploads++;
    return { vao: null, count: builder.i.length, tris: builder.i.length / 3, min: builder.min, max: builder.max };
  },
  drawn: 0,
  draw() { this.drawn++; },
};

resolvePlaces(fakeWorld);

// ---------------------------------------------------------------- 1. missions

group('missions');
ok(MISSIONS.length >= 10, `${MISSIONS.length} jobs registered`);
{
  const start = { stats: { nearMiss: 4, jumps: 1 }, damage: 12 };
  const stylish = missionStyleBonus(start, { nearMiss: 7, jumps: 3 }, 14);
  ok(stylish.money === 17 && stylish.clean, 'style bonus pays near misses, jumps, and a clean finish', JSON.stringify(stylish));
  const capped = missionStyleBonus(start, { nearMiss: 99, jumps: 99 }, 40);
  ok(capped.money === 17 && !capped.clean, 'style bonus caps risky play and withholds clean-car money', JSON.stringify(capped));
}
const ids = new Set();
for (const m of MISSIONS) {
  ok(!ids.has(m.id), `unique id: ${m.id}`);
  ids.add(m.id);
  ok(!!PLACES[m.giver], `${m.id}: giver "${m.giver}" is a real place`);
  ok(!!TIME_OF_DAY[m.timeOfDay], `${m.id}: timeOfDay "${m.timeOfDay}"`);
  ok(typeof m.title === 'string' && m.title.length > 0, `${m.id}: has a title`);
}
for (const want of ['canot', 'sayyad', 'divan']) {
  ok(ids.has(want), `new job present: ${want}`);
}

group('stage wiring, per car');
for (const car of CARS) {
  const ctx = { carId: car.id, carName: car.name, seats: car.seats, money: 80 };
  for (const m of MISSIONS) {
    const stages = m.build(ctx);
    ok(Array.isArray(stages) && stages.length > 0, `${m.id} / ${car.id} (${car.seats + 1} seats): ${stages.length} stages`);
    for (const st of stages) {
      ok(typeof st.text === 'string' && st.text.length > 0, `${m.id}: stage has objective text`);
      if (typeof st.at === 'string') ok(!!PLACES[st.at], `${m.id}: stage place "${st.at}"`);
      if (st.at && typeof st.at === 'object') {
        ok(Number.isFinite(st.at.x) && Number.isFinite(st.at.z), `${m.id}: literal stage point`);
      }
      if (st.noTarget) ok(!!st.condition || !!st.onTick, `${m.id}: a stage with no target has a condition`);
    }
  }
}
// The Ranger's bench splits the "pick up the gang" run in two.
{
  const two = MISSIONS.find((m) => m.id === 'gang').build({ carName: 'x', seats: 2 });
  const three = MISSIONS.find((m) => m.id === 'gang').build({ carName: 'x', seats: 3 });
  ok(two.length === 5 && three.length === 4, `gang re-plans for the bench (${two.length} vs ${three.length} stages)`);
}

group('places for the new jobs');
for (const [key, must] of [['ctire', 'Canadian Tire'], ['yardsale', 'Wychwood'],
  ['sayyad', 'Denise-Friend'], ['mike', 'Frank-Robinson'], ['island', 'Aylmer']]) {
  const p = PLACES[key];
  ok(!!p, `PLACES.${key} exists`);
  ok(!!p && p.label.includes(must), `PLACES.${key} label mentions ${must}`, p && p.label);
  ok(!!p && Number.isFinite(p.x) && Number.isFinite(p.z), `PLACES.${key} has coordinates`);
}
ok(PLACES.sayyad.bx === PLACES.steph.bx && PLACES.sayyad.bz === PLACES.steph.bz,
  'sayyad is the same house as steph');
ok(waterAt(ISLAND.x, ISLAND.z), 'Île Aylmer sits on water in the mask');
ok(waterAt(PADDLE_LAUNCH.x, PADDLE_LAUNCH.z), 'the canoe launch point is water');
for (const [name, isle] of [['ISLAND', ISLAND], ['ISLAND_CLOSE', ISLAND_CLOSE]]) {
  ok(waterAt(isle.x, isle.z), `${name} sits on water`);
  // Straight, unbroken water from the launch to it.
  const n = 500;
  let blocked = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!waterAt(PADDLE_LAUNCH.x + (isle.x - PADDLE_LAUNCH.x) * t,
      PADDLE_LAUNCH.z + (isle.z - PADDLE_LAUNCH.z) * t)) blocked++;
  }
  ok(blocked === 0, `launch -> ${name} is open water the whole way`, blocked + ' samples on land');
  // ...and 40 m of elbow room all round, so the island fits without touching shore.
  let ring = 0;
  for (let a = 0; a < 360; a += 10) {
    if (!waterAt(isle.x + Math.cos(a * Math.PI / 180) * 42, isle.z + Math.sin(a * Math.PI / 180) * 42)) ring++;
  }
  ok(ring === 0, `${name} has clear water all round it`, ring + ' bearings hit land');
  const d = Math.hypot(isle.x - PADDLE_LAUNCH.x, isle.z - PADDLE_LAUNCH.z);
  console.log(`       (${name} is ${Math.round(d)} m from the launch)`);
}
ok(!waterAt(MIKE_TREE.x, MIKE_TREE.z) && !waterAt(YARD_SALE.x, YARD_SALE.z),
  "Mike's tree and the garage sale are on dry land");

// ---------------------------------------------------------------- 2. doughnuts

group('doughnut accumulator');
{
  const meter = new DoughnutMeter();
  const dt = 1 / 60;
  const spin = 3.0;                     // rad/s
  const car = { x: 0, z: 0, yaw: 0, vLat: 5.0, yawRate: -spin, speedKmh: 22 };
  // Three clean revolutions.
  const steps = Math.ceil((3 * Math.PI * 2) / spin / dt) + 2;
  for (let i = 0; i < steps; i++) {
    car.yaw += spin * dt;
    meter.update(dt, car, { handbrake: true, cx: 0, cz: 0 });
  }
  ok(meter.count === 3, 'three revolutions == three doughnuts', 'got ' + meter.count);

  // Stop sliding for longer than DONUT.pause: the part-lap is thrown away.
  for (let i = 0; i < 60; i++) {
    car.yaw += spin * dt;
    meter.update(dt, car, { handbrake: true, cx: 0, cz: 0 });
  }
  const partial = meter.state().progress;
  ok(partial > 0.1 && partial < 0.9, 'mid-lap progress is showing', String(partial));
  car.vLat = 0; car.yawRate = 0; car.speedKmh = 0;
  for (let i = 0; i < 90; i++) meter.update(dt, car, { handbrake: false, cx: 0, cz: 0 });
  ok(meter.state().progress === 0, 'a pause resets the lap');
  ok(meter.count === 3, 'a pause does not take doughnuts away');

  // Out of the zone, nothing counts.
  const away = new DoughnutMeter();
  const far = { x: 500, z: 500, yaw: 0, vLat: 6, yawRate: -spin, speedKmh: 30 };
  for (let i = 0; i < steps; i++) { far.yaw += spin * dt; away.update(dt, far, { handbrake: true, cx: 0, cz: 0 }); }
  ok(away.count === 0, 'doughnuts done elsewhere do not count');

  // Too slow is just a three-point turn.
  const slow = new DoughnutMeter();
  const crawl = { x: 0, z: 0, yaw: 0, vLat: 6, yawRate: -spin, speedKmh: 4 };
  for (let i = 0; i < steps; i++) { crawl.yaw += spin * dt; slow.update(dt, crawl, { handbrake: true, cx: 0, cz: 0 }); }
  ok(slow.count === 0, 'below 8 km/h nothing counts');
}

// ---------------------------------------------------------------- 3. the canoe

group('canoe');
{
  // Half-plane world: water is x < 0.
  const pond = { bounds: { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 }, waterAt: (x) => x < 0 };
  const b = new Boat(pond, {});
  b.reset(-40, 0, Math.PI / 2);            // yaw PI/2 -> forward is +X
  let maxX = -Infinity, grounded = false;
  for (let i = 0; i < 60 * 60; i++) {
    b.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
    maxX = Math.max(maxX, b.x);
    grounded = grounded || b.grounded;
  }
  ok(maxX < 0, 'the canoe cannot leave the water', 'reached x=' + maxX.toFixed(2));
  ok(grounded, 'hitting the shore grounds it');
  ok(Math.abs(b.vLong) < 0.6, 'and stops it', 'vLong=' + b.vLong.toFixed(2));

  // Île Aylmer is land as far as the canoe is concerned.
  const lake = new Boat({ bounds: B, waterAt }, { land: (x, z) => islandLandAt(x, z) });
  ok(lake.floats(ISLAND.x - 60, ISLAND.z) === true, 'open water beside the island floats');
  ok(lake.floats(ISLAND.x, ISLAND.z) === false, 'the island itself does not');
  ok(islandLandAt(ISLAND.x + ISLAND.rx * 0.5, ISLAND.z) === true, 'islandLandAt: inside');
  ok(islandLandAt(ISLAND.x + ISLAND.rx + 12, ISLAND.z) === false, 'islandLandAt: outside');

  // Top speed, drag and the leak all behave.
  const open = new Boat({ bounds: B, waterAt: () => true }, {});
  open.reset(0, 0, 0);
  for (let i = 0; i < 60 * 40; i++) open.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  ok(open.vLong > 1.5 && open.vLong <= PADDLE.top + 1e-6,
    `cruises at ${open.vLong.toFixed(2)} m/s (cap ${PADDLE.top})`);

  const leaky = new Boat({ bounds: B, waterAt: () => true }, {});
  leaky.reset(0, 0, 0);
  leaky.setLeak(0, 480);
  const good = new Boat({ bounds: B, waterAt: () => true }, {});
  good.reset(0, 0, 0);
  good.setLeak(1, 480);
  ok(leaky.leakRate > good.leakRate, 'a bad Bondo patch leaks faster');
  for (let i = 0; i < 60 * 300; i++) good.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  ok(!good.swamped, 'a perfect patch survives a five-minute crossing');

  // The current points at the island, and the crossing is winnable.
  const cur = currentToward(PADDLE_LAUNCH, ISLAND);
  const dot = (cur.x * (ISLAND.x - PADDLE_LAUNCH.x) + cur.z * (ISLAND.z - PADDLE_LAUNCH.z));
  ok(dot > 0, 'the current runs toward the island');
  const crossing = new Boat({ bounds: B, waterAt }, {
    land: (x, z) => islandLandAt(x, z), current: cur,
  });
  crossing.reset(PADDLE_LAUNCH.x, PADDLE_LAUNCH.z,
    Math.atan2(ISLAND.x - PADDLE_LAUNCH.x, ISLAND.z - PADDLE_LAUNCH.z));
  crossing.setLeak(0.35, 480);           // the worst patch the minigame can give
  let t = 0, arrived = false;
  while (t < 600 && !crossing.swamped) {
    crossing.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
    t += 1 / 60;
    if (Math.hypot(crossing.x - ISLAND.x, crossing.z - ISLAND.z) < 34) { arrived = true; break; }
  }
  ok(arrived, `the worst patch still reaches the island (${t.toFixed(0)} s)`,
    'water ' + crossing.water.toFixed(2));
  ok(crossing.water < 1, 'without sinking', 'water=' + crossing.water.toFixed(2));
}

// ---------------------------------------------------------------- 4. the couch

group('the couch');
{
  const tree = MIKE_TREE;
  // Aimed dead at the trunk from 2.75 m, doing 40 km/h.
  const shoot = (kmh, sideOffset = 0, back = 2.75) => {
    const speed = kmh / 3.6;
    const yaw = 0.7;                              // any heading works
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const car = {
      x: tree.x - fx * back + rx * sideOffset,
      z: tree.z - fz * back + rz * sideOffset,
      yaw, vLong: speed,
    };
    const launch = couchLaunch(car, tree);
    return { launch, sim: launch.ok ? couchSim(launch, tree) : null };
  };

  const at40 = shoot(40);
  ok(at40.launch.ok, 'a 40 km/h hit launches the couch');
  ok(at40.sim.stuck, 'and it sticks in the crown');
  const dCrown = Math.hypot(at40.sim.x - tree.x, at40.sim.y - tree.crownY, at40.sim.z - tree.z);
  ok(dCrown <= tree.crownR + 1e-9,
    `landing point is inside the crown (${dCrown.toFixed(2)} m <= ${tree.crownR})`);
  ok(at40.sim.y > 3.5, 'and it is up in the tree, not on the grass', 'y=' + at40.sim.y.toFixed(2));

  ok(!shoot(34).launch.ok && shoot(34).launch.reason === 'slow', 'under 35 km/h nothing happens');
  ok(shoot(36).sim.stuck, '36 km/h is enough');
  ok(!shoot(75).sim.stuck, 'far too fast and it sails clean over');
  ok(shoot(40, 1.0).sim.stuck, 'a slightly off-centre hit is forgiven');
  ok(shoot(40, 2.2, 2.0).launch.ok, 'clipping the edge of the trunk still launches it');
  ok(!shoot(40, 2.2, 2.0).sim.stuck, 'but it spins off sideways onto the lawn');
  ok(!shoot(40, 0, 6).launch.ok && shoot(40, 0, 6).launch.reason === 'far',
    'driving past at a distance does nothing');

  // The animated version agrees with the closed-form one and terminates.
  const fl = new CouchFlight(at40.launch, tree);
  let steps = 0;
  while (!fl.done && steps < 1000) { fl.update(1 / 60); steps++; }
  ok(fl.done, 'CouchFlight terminates');
  ok(fl.stuck === at40.sim.stuck, 'CouchFlight agrees with couchSim');
  ok(near(fl.y, at40.sim.y, 1e-9), 'and lands in the same place');
  ok(COUCH.minKmh === 35, 'the minimum is still 35 km/h');
}

// ---------------------------------------------------------------- 5. props

group('props');
{
  const meshes = buildPropMeshes(fakeRenderer);
  ok(fakeRenderer.uploads === Object.keys(meshes).length, `${fakeRenderer.uploads} prop meshes uploaded once`);
  let tris = 0;
  for (const [k, mesh] of Object.entries(meshes)) {
    ok(mesh.tris > 0, `${k}: ${mesh.tris} tris`);
    tris += mesh.tris;
  }
  ok(tris < 4000, `all props together are ${tris} tris (cheap enough for the Air)`);

  const props = new Props(fakeRenderer, meshes);
  props.add({ id: 'island', mesh: 'island', x: ISLAND.x, z: ISLAND.z });
  props.add({ id: 'job:canoe', mesh: 'canoe', attach: 'car', off: [0, 1.8, 0.1] });
  props.add({ id: 'job:wake', mesh: 'wake', attach: 'boat', off: [0, 0.05, -1] });
  ok(props.list.length === 3, 'three props registered');

  // Attached props ride the host, using the same local->world transform drawCar uses.
  const G = { veh: { x: 100, z: -50, yaw: Math.PI / 2, pitch: 0, roll: 0 }, boat: null };
  props.update(1 / 60, G);
  const canoe = props.get('job:canoe');
  ok(near(canoe.x, 100 + 0.1, 1e-6) && near(canoe.z, -50, 1e-6) && near(canoe.y, 1.8),
    'roof prop follows the car', `${canoe.x.toFixed(3)},${canoe.z.toFixed(3)}`);
  ok(near(canoe.yaw, Math.PI / 2), 'and its heading');

  ok(props.removePrefix('job:') === 2, 'removePrefix tears the job down');
  ok(props.list.length === 1 && props.has('island'), 'and leaves the scenery alone');

  fakeRenderer.drawn = 0;
  props.draw(fakeRenderer, { x: ISLAND.x, z: ISLAND.z });
  ok(fakeRenderer.drawn === 1, 'the island draws when you are near it');
  fakeRenderer.drawn = 0;
  props.draw(fakeRenderer, { x: 0, z: 0 });
  ok(fakeRenderer.drawn === 0, 'and is culled when you are not');
}

// ---------------------------------------------------------------- 6. stage model

group('stage model');
{
  const hudLog = [];
  const hud = { prompt: (t) => hudLog.push(t), toast: () => {} };
  const wallet = new Wallet(null);
  wallet.set(80);
  const G = {
    hud, wallet, audio: null, props: new Props(fakeRenderer, {}),
    veh: { x: 0, z: 0, yaw: 0, vLong: 0, vLat: 0, yawRate: 0, speedKmh: 0, spec: { seats: 3, h: 1.4 }, passengers: 0 },
    boat: null, focus: null, wantStart: false,
  };
  const st = {
    text: 'test', at: { x: 0, z: 0 }, radius: 10, hold: true, cost: 45,
    holdText: 'E — acheter', brokeText: 'pas assez',
  };
  const m = { stages: [st], idx: 0, target: null };
  m.target = stageTarget(G, m, st);
  stageEnter(G, m, st);
  ok(m.target && m.target.r === 10, 'stageTarget resolves a literal point');

  ok(stageStep(G, m, st, 1 / 60) === null, 'a hold stage waits for E');
  ok(hudLog[hudLog.length - 1] === 'E — acheter', 'and prompts for it');
  G.wantStart = true;
  ok(stageStep(G, m, st, 1 / 60) === 'done', 'pressing E completes it');

  // Out of range: no completion, no matter how hard you press E.
  G.veh.x = 400; G.wantStart = true;
  ok(stageStep(G, m, st, 1 / 60) === null, 'out of range it stays put');
  G.veh.x = 0;

  // Too broke.
  wallet.set(10);
  G.wantStart = true;
  ok(stageStep(G, m, st, 1 / 60) === null, 'a price you cannot pay blocks the stage');
  ok(hudLog[hudLog.length - 1] === 'pas assez', 'and says so');
  wallet.set(80);
  ok(wallet.spend(45) && wallet.value === 35, 'the wallet charges');
  ok(!wallet.spend(999) && wallet.value === 35, 'and refuses what it cannot cover');

  // Moving too fast to interact.
  G.veh.speedKmh = 40; G.wantStart = true;
  ok(stageStep(G, m, st, 1 / 60) === null, 'you have to stop first');
  G.veh.speedKmh = 0;

  // anywhere: the marker stays but the distance test is off.
  const roam = { text: 'roam', at: { x: 0, z: 0 }, radius: 10, anywhere: true, condition: () => true };
  const m2 = { stages: [roam], idx: 0, target: null };
  m2.target = stageTarget(G, m2, roam);
  G.veh.x = 9999;
  ok(stageStep(G, m2, roam, 1 / 60) === 'done', 'an `anywhere` stage ignores the radius');
  ok(m2.target !== null, 'but keeps its map marker');
  G.veh.x = 0;

  // onTick can fail the job outright.
  const doomed = { text: 'x', noTarget: true, onTick: () => ({ fail: 'coulé' }) };
  const m3 = { stages: [doomed], idx: 0, target: stageTarget(G, { }, doomed) };
  const r = stageStep(G, m3, doomed, 1 / 60);
  ok(r && r.fail === 'coulé', 'onTick can fail the mission');
  ok(m3.target === null, 'noTarget means no marker');
}

// ---------------------------------------------------------------- 7. playthroughs

// A cut-down copy of main.js's runner, so the three new jobs actually get walked
// from first stage to last with a bot at the wheel. This is what catches the
// silly stuff: a typo'd prop id, a hook reaching for something that is not there.
function makeG() {
  const spec = CARS.find((c) => c.id === 'saturn');
  const veh = {
    spec, x: 0, z: 0, yaw: 0, vLong: 0, vLat: 0, vx: 0, vz: 0,
    yawRate: 0, pitch: 0, roll: 0, impact: 0, passengers: 0,
    get speedKmh() { return Math.abs(this.vLong) * 3.6; },
    reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.vLong = 0; this.vLat = 0; },
  };
  const wallet = new Wallet(null);
  wallet.set(80);
  return {
    veh, wallet, boat: null, focus: null, wantStart: false, mission: null,
    props: new Props(fakeRenderer, buildPropMeshes(fakeRenderer)),
    phys: { waterAt, bounds: B, roadAt: () => true, querySegments: () => [] },
    hud: { prompts: [], toasts: [], prompt(t) { this.prompts.push(t); }, toast(t) { this.toasts.push(t); } },
    audio: { blip() {}, chime() {}, crash() {} },
    input: { handbrake: false, steer: 0, throttle: 0, brake: 0 },
  };
}

// Returns { done, failed, log } after running `pilot` each step.
function play(G, def, pilot, maxSteps = 60 * 900) {
  const dt = 1 / 60;
  const m = { def, stages: def.build({ carName: G.veh.spec.name, seats: G.veh.spec.seats, money: G.wallet.value }), idx: 0, elapsed: 0, timeLeft: null, target: null };
  G.mission = m;
  const enter = () => {
    const st = m.stages[m.idx];
    m.timeLeft = st.time != null ? st.time : null;
    m.target = stageTarget(G, m, st);
    stageEnter(G, m, st);
  };
  enter();
  const log = [];
  const marks = {};
  for (let i = 0; i < maxSteps; i++) {
    const st = m.stages[m.idx];
    pilot(G, m, st, i * dt);
    if (m.timeLeft != null) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) return { done: false, failed: st.failWhy || 'timeout', log, m };
    }
    const res = stageStep(G, m, st, dt);
    G.wantStart = false;
    if (G.props) G.props.update(dt, G);
    if (!res) continue;
    if (res.fail) { missionCleanup(G, m, true); return { done: false, failed: res.fail, log, m, marks }; }
    stageSettle(G, m, st);
    stageExit(G, m, st);
    log.push(st.kind || 'stage');
    marks[st.kind || 'stage' + m.idx] = i * dt;
    m.idx++;
    if (m.idx >= m.stages.length) { missionCleanup(G, m, false); return { done: true, failed: null, log, m, marks, t: i * dt }; }
    enter();
  }
  return { done: false, failed: 'ran out of steps at stage ' + m.idx, log, m, marks };
}

const park = (G, p) => { G.veh.x = p.x; G.veh.z = p.z; G.veh.vLong = 0; G.veh.vLat = 0; };

group('playthrough: le canot a 45 piasses');
{
  const G = makeG();
  const def = MISSIONS.find((d) => d.id === 'canot');
  const res = play(G, def, (G2, m, st) => {
    if (st.kind === 'buy') { park(G2, PLACES[st.at]); G2.wantStart = true; return; }
    if (st.kind === 'repair') {
      park(G2, PLACES.beach);
      const r = m.repair;
      if (!r || !r.on) { G2.wantStart = true; return; }
      // Tap only when the cursor is actually in the green.
      const u = (r.t * 0.62 * 2) % 2;
      const pos = u < 1 ? u : 2 - u;
      if (pos > 0.46 && pos < 0.54) G2.wantStart = true;
      return;
    }
    if (st.kind === 'paddle' && G2.boat) {
      // Point at the island and hold W.
      const b = G2.boat;
      const want = Math.atan2(ISLAND.x - b.x, ISLAND.z - b.z);
      const err = ((want - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      G2.input.steer = Math.max(-1, Math.min(1, -err * 2));
      G2.input.throttle = 1;
      b.update(1 / 60, { steer: G2.input.steer, throttle: 1, brake: 0 });
    }
  });
  ok(res.done, 'the canoe job completes', res.failed || '');
  ok(res.log.join(',') === 'buy,buy,repair,paddle', 'stages ran in order: ' + res.log.join(','));
  // 45 for the canoe, 21 for the Bondo, and the gars campé sur l'île gives you
  // 90 for it when you land — every job has to pay something now.
  ok(G.wallet.value === 80 - 45 - 21 + 90, `canoe -45, Bondo -21, sold on the island +90 (left: ${G.wallet.value})`);
  const paddleSecs = res.marks.paddle - res.marks.repair;
  ok(paddleSecs > 120 && paddleSecs < 420,
    `the crossing takes ${Math.round(paddleSecs)} s of paddling flat out`);
  ok(G.boat === null && G.focus === null, 'the canoe is put away afterwards');
  ok(G.props.list.filter((p) => p.id.startsWith('job:')).length === 0, 'and its props are cleaned up');
}

group('playthrough: too broke for the canoe');
{
  const G = makeG();
  G.wallet.set(12);
  const def = MISSIONS.find((d) => d.id === 'canot');
  const res = play(G, def, (G2, m, st) => {
    if (st.kind === 'buy') { park(G2, PLACES[st.at]); G2.wantStart = true; }
  }, 600);
  ok(!res.done && res.log.length === 0, 'twelve dollars does not buy a canoe');
  ok(G.hud.prompts.some((t) => t && t.includes('tondre des gazons')), 'and it says why');
}

group('playthrough: reveiller Sayyad');
{
  const G = makeG();
  const def = MISSIONS.find((d) => d.id === 'sayyad');
  const house = PLACES.sayyad;
  const res = play(G, def, (G2, m, st, t) => {
    if (st.kind === 'drive') { park(G2, house); return; }
    if (st.kind === 'doughnuts') {
      // Sit on the spot and spin.
      G2.veh.x = house.x + 4; G2.veh.z = house.z + 2;
      G2.veh.yaw += 3.0 / 60;
      G2.veh.yawRate = -3.0; G2.veh.vLat = 5; G2.veh.vLong = 6;
      G2.input.handbrake = true;
      return;
    }
    if (st.kind === 'escape') {
      G2.input.handbrake = false;
      G2.veh.x = house.x + 400; G2.veh.z = house.z;
    }
  });
  ok(res.done, 'Sayyad wakes up', res.failed || '');
  ok(res.log.join(',') === 'drive,doughnuts,escape', 'stages: ' + res.log.join(','));
  ok(G.hud.toasts.some((t) => t.includes('C’EST QUOI CE BRUIT-LÀ')), 'and he says his line');
  ok(G.props.list.filter((p) => p.id.startsWith('job:')).length === 0, 'the lit windows are cleaned up');
  ok(G.wallet.value === 100, `he pays back the 20 $ he owed (${G.wallet.value})`);
}

group('playthrough: Sayyad, but you dawdle');
{
  const G = makeG();
  const def = MISSIONS.find((d) => d.id === 'sayyad');
  const house = PLACES.sayyad;
  const res = play(G, def, (G2, m, st) => {
    if (st.kind === 'drive') { park(G2, house); return; }
    if (st.kind === 'doughnuts') {
      G2.veh.x = house.x + 4; G2.veh.z = house.z + 2;
      G2.veh.yaw += 3.0 / 60;
      G2.veh.yawRate = -3.0; G2.veh.vLat = 5; G2.veh.vLong = 6;
      G2.input.handbrake = true;
      return;
    }
    // ...and then just sit there for the escape stage.
    G2.veh.vLong = 0; G2.veh.vLat = 0;
  }, 60 * 200);
  ok(!res.done && /plaque/.test(res.failed || ''), 'the neighbours call: ' + res.failed);
}

group('playthrough: le divan de Mike');
{
  const G = makeG();
  const def = MISSIONS.find((d) => d.id === 'divan');
  const res = play(G, def, (G2, m, st) => {
    if (st.kind === 'load') { park(G2, PLACES.mike); G2.wantStart = true; return; }
    if (st.kind === 'couch' && m.couch && m.couch.loaded) {
      // Line up 2.75 m short of the trunk at 40 km/h.
      const yaw = 0.8, fx = Math.sin(yaw), fz = Math.cos(yaw);
      G2.veh.yaw = yaw;
      G2.veh.x = MIKE_TREE.x - fx * 2.75;
      G2.veh.z = MIKE_TREE.z - fz * 2.75;
      G2.veh.vLong = 40 / 3.6;
    }
  }, 60 * 120);
  ok(res.done, 'the couch ends up in the tree', res.failed || '');
  ok(G.hud.toasts.some((t) => t.includes('OSTIE')), 'Mike is pleased');
  ok(G.props.list.filter((p) => p.id.startsWith('job:')).length === 0, 'the couch props are cleaned up');
}

group('playthrough: three misses and Mike gives up');
{
  const G = makeG();
  const def = MISSIONS.find((d) => d.id === 'divan');
  const res = play(G, def, (G2, m, st) => {
    if (st.kind === 'load') { park(G2, PLACES.mike); G2.wantStart = true; return; }
    if (st.kind === 'couch' && m.couch) {
      if (m.couch.loaded) {
        // Way too fast, and off-centre: it sails over every time.
        const yaw = 0.8, fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        G2.veh.yaw = yaw;
        G2.veh.x = MIKE_TREE.x - fx * 2.0 + rx * 2.2;
        G2.veh.z = MIKE_TREE.z - fz * 2.0 + rz * 2.2;
        G2.veh.vLong = 40 / 3.6;
      } else if (m.couch.rest) {
        // Drive back to it and reload.
        G2.veh.x = m.couch.rest.x; G2.veh.z = m.couch.rest.z; G2.veh.vLong = 0;
        G2.wantStart = true;
      }
    }
  }, 60 * 120);
  ok(!res.done && /au chemin/.test(res.failed || ''), 'after three tries Mike quits: ' + res.failed);
}

group('hud text meters');
ok(meterBar(0.5, 0.4, 0.6).includes('◆'), 'meterBar draws the cursor');
ok(meterBar(0.02, 0.4, 0.6).indexOf('◆') < meterBar(0.9, 0.4, 0.6).indexOf('◆'), 'and it moves');
ok(fillBar(0, 10) === '[··········]' && fillBar(1, 10) === '[▮▮▮▮▮▮▮▮▮▮]', 'fillBar fills');

// ----------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
