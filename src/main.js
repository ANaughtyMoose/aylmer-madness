// Aylmer Madness — boot, game loop, camera, mission runner.
import { Renderer } from './core/gl.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { MeshBuilder, rgb } from './core/mesh.js';
import { m4, clamp, lerp, angleDelta } from './core/math.js';
import { buildWorld } from './game/world.js';
import { CARS, carById, Vehicle, buildCarBody, buildWheel, buildHead, buildShadow, DAMAGE } from './game/cars.js';
import { asBody, collideCars, driftBody, contact } from './game/collide.js';
import { DriveFx, updateRepair, restoreDamage } from './game/damage.js';
import { Traffic } from './game/traffic.js';
import { Hud } from './game/hud.js';
import { loadCarSkin } from './game/carskin.js';
import { Nav, routeLength } from './game/nav.js';
import { buildSky, skyOpts, cloudOpts } from './game/sky.js';
import { BigMap } from './game/bigmap.js';
import { MISSIONS, TIME_OF_DAY, loadProgress, saveProgress, resetProgress } from './game/missions.js';
import { PLACES, resolvePlaces } from './game/places.js';

const STEP = 1 / 60;
// drawDist is the chunk cutoff; fogMul thickens the fog so the cutoff hides in it.
const QUALITY = {
  low:  { scale: 0.68, dpr: 1.0, fov: 1.12, traffic: 8, drawDist: 520, fogMul: 2.0 },
  med:  { scale: 0.85, dpr: 1.5, fov: 1.15, traffic: 14, drawDist: 720, fogMul: 1.45 },
  high: { scale: 1.0,  dpr: 2.0, fov: 1.15, traffic: 20, drawDist: 950, fogMul: 1.1 },
};
const CAMS = [
  { name: 'chase', dist: 9.2, height: 3.7, pitch: -0.17, fovAdd: 0 },
  { name: 'close', dist: 6.4, height: 2.9, pitch: -0.15, fovAdd: 0.03 },
  { name: 'far',   dist: 14.5, height: 6.4, pitch: -0.26, fovAdd: -0.03 },
  { name: 'hood',  dist: -0.2, height: 1.55, pitch: -0.04, fovAdd: 0.06 },
];

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const input = new Input();
const audio = new Audio();
const hud = new Hud();

const G = {
  mode: 'menu',
  carId: 'ranger',
  quality: 'med',
  assist: true,
  cam: 0,
  camYaw: 0, camPos: [0, 5, 0],
  env: null, envTarget: null,
  world: null, meshes: null, renderer: null,
  veh: null, traffic: null,
  mission: null,
  done: loadProgress(),
  time: 0, fps: 60,
  nav: null, bigmap: null,
  route: null, routeKey: '', routeTimer: 0, waypoint: null,
  parked: {},           // carId -> {x, z, yaw} for the cars you're not driving
  best: loadBest(),
  street: '', streetTimer: 0,
  lookBack: false,
  // R3/R4 (driving agent). `health` is damage 0-100 per car for the session;
  // `envKey` is the current TIME_OF_DAY key and `night` is the lights-on flag
  // other systems can read; `fx` owns steam, crumples, lamps and fallen poles.
  health: {}, envKey: 'day', night: false,
  fx: null, repair: { t: 0 }, towed: false,
};
// Whose driveway each car lives in.
const OWNER = { ranger: 'home', saturn: 'marc', civic: 'steph', sunfire: 'dave' };

function loadBest() {
  try { return JSON.parse(localStorage.getItem('aylmer.best') || '{}') || {}; } catch (e) { return {}; }
}
function saveBest() {
  try { localStorage.setItem('aylmer.best', JSON.stringify(G.best)); } catch (e) { /* private mode */ }
}
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- menu

function buildMenu() {
  const wrap = $('cars');
  wrap.innerHTML = '';
  for (const c of CARS) {
    const el = document.createElement('div');
    el.className = 'card' + (c.id === G.carId ? ' sel' : '');
    const hex = '#' + c.body.toString(16).padStart(6, '0');
    const bar = (label, v) =>
      `<div class="bar"><b>${label}</b><u><i style="width:${Math.round(v * 100)}%"></i></u></div>`;
    el.innerHTML =
      `<div class="swatch" style="background:${hex}"></div>` +
      `<h3>${c.name}</h3><div class="who">${c.who} &middot; ${c.seats + 1} seats</div>` +
      bar('Speed', (c.topSpeed - 33) / 15) +
      bar('Accel', (c.accel - 3) / 3) +
      bar('Grip', (c.grip - 0.72) / 0.4) +
      `<div class="flav">${c.flavour}</div>`;
    el.onclick = () => { G.carId = c.id; buildMenu(); };
    wrap.appendChild(el);
  }
}

function startGame() {
  G.assist = $('optAssist').checked;
  audio.enabled = $('optAudio').checked;
  G.quality = $('optQuality').value;
  const q = QUALITY[G.quality];

  if (!G.renderer) {
    try {
      G.renderer = new Renderer(canvas);
    } catch (e) {
      $('menuinner').innerHTML = `<h1>Ouch</h1><p class="tag">${e.message}</p>`;
      return;
    }
  }
  G.renderer.scale = q.scale;
  G.renderer.maxDpr = q.dpr;

  if (!G.world) {
    $('start').textContent = 'BUILDING AYLMER…';
    setTimeout(() => { loadWorld(); enterDrive(); }, 30);   // let the label paint first
    return;
  }
  enterDrive();
}

function loadWorld() {
  const r = G.renderer;
  G.world = buildWorld(r);
  G.phys = {
    roadAt: (x, z) => G.world.roadAt(x, z),
    querySegments: (x, z, rad) => G.world.querySegments(x, z, rad),
    waterAt: (x, z) => G.world.waterAt(x, z),
    queryPoles: (x, z, rad) => G.world.queryPoles(x, z, rad),
    snapPole: (p, ux, uz) => G.world.snapPole(p, ux, uz),
    bounds: G.world.bounds,
  };
  resolvePlaces(G.world);
  G.nav = new Nav();
  G.bigmap = new BigMap($('bigmap'));
  G.bigmap.onWaypoint = (x, z) => {
    G.waypoint = { x, z };
    G.routeKey = '';
    hud.toast('Waypoint placé', 900);
  };
  G.meshes = { cars: {}, wheels: {} };
  G.sky = buildSky(r);
  for (const c of CARS) {
    G.meshes.cars[c.id] = r.upload(buildCarBody(c));
    G.meshes.wheels[c.id] = r.upload(buildWheel(c));
  }
  G.meshes.head = r.upload(buildHead());
  // Photo skins load in the background and replace the lofted models when present.
  G.meshes.skins = {};
  for (const c of CARS) {
    loadCarSkin(r, c).then((skin) => {
      if (skin) { G.meshes.skins[c.id] = skin; console.log(`skin: ${c.id} (${skin.tris} tris)`); }
    }).catch((e) => console.warn('skin failed', c.id, e));
  }
  G.meshes.shadow = r.upload(buildShadow());
  const mk = new MeshBuilder();
  mk.cyl(0, 0.5, 0, 1, 1, 14, rgb(0xffffff), 'y', false);
  G.meshes.marker = r.upload(mk);
  const ring = new MeshBuilder();
  ring.flat(-1, -1, 1, 1, 0, rgb(0xffffff));
  G.meshes.ring = r.upload(ring);
  G.fx = new DriveFx(r);
}

function enterDrive() {
  const spec = carById(G.carId);
  G.veh = new Vehicle(spec);
  G.veh.assist = G.assist;
  const h = PLACES[OWNER[spec.id]];
  G.veh.reset(h.x, h.z, h.a);
  G.health = {}; G.repair.t = 0; G.towed = false;
  audio.setEngineProfile(spec.sound);
  G.parked = {};
  for (const c of CARS) if (c.id !== spec.id) G.parked[c.id] = curbSpot(PLACES[OWNER[c.id]]);
  G.waypoint = null; G.route = null; G.routeKey = '';
  G.traffic = new Traffic(QUALITY[G.quality].traffic);
  G.camYaw = G.veh.yaw + Math.PI;
  G.camPos = [G.veh.x, 4, G.veh.z];
  setEnv('day', true);
  G.mission = null;
  G.mode = 'drive';
  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  hud.setVisible(true);
  hud.setCar(spec.name);
  hud.setRange(220);
  hud.setObjective('Free roam', 'Roule jusqu’à un marqueur jaune pour une job');
  hud.setTimer(null);
  hud.toast('AYLMER, QUÉBEC\nprends ton temps', 2600);
  audio.start(); audio.resume();
}

// A parking spot at the curb in front of a place, nose along the street.
function curbSpot(p) {
  const dx = p.bx - p.x, dz = p.bz - p.z, d = Math.hypot(dx, dz) || 1;
  return { x: p.x + (dx / d) * 2.6, z: p.z + (dz / d) * 2.6, yaw: p.a || 0 };
}

function swapCar(id) {
  const v = G.veh, spot = G.parked[id];
  if (!spot) return;
  G.health[v.spec.id] = v.damage;
  G.parked[v.spec.id] = { x: v.x, z: v.z, yaw: v.yaw };
  delete G.parked[id];
  const spec = carById(id);
  G.carId = id;
  G.veh = new Vehicle(spec);
  G.veh.assist = G.assist;
  G.veh.reset(spot.x, spot.z, spot.yaw);
  restoreDamage(G.veh, G.health[id]);
  audio.setEngineProfile(spec.sound);
  G.repair.t = 0;
  hud.setCar(spec.name);
  hud.toast(`${spec.who === 'Yours' ? 'Ton' : spec.who.replace("'s", '') + ' te passe son'} ${spec.name}`, 1800);
  audio.blip(520, 0.12, 'triangle', 0.15);
}

// ---------------------------------------------------------------- environment

function cloneEnv(e) {
  return {
    sky: e.sky.slice(), ground: e.ground.slice(), sun: e.sun.slice(),
    lightDir: e.lightDir.slice(), fog: e.fog.slice(), fogDensity: e.fogDensity,
  };
}
function setEnv(key, instant) {
  const t = TIME_OF_DAY[key] || TIME_OF_DAY.day;
  G.envKey = TIME_OF_DAY[key] ? key : 'day';
  G.night = G.envKey === 'night' || G.envKey === 'dusk';   // C4: headlights on
  G.envTarget = cloneEnv(t);
  if (instant || !G.env) { G.env = cloneEnv(t); G.env.fogDensity *= QUALITY[G.quality].fogMul; }
}
function stepEnv(dt) {
  const a = G.env, b = G.envTarget, k = Math.min(1, dt * 0.9);
  for (const f of ['sky', 'ground', 'sun', 'lightDir', 'fog']) {
    for (let i = 0; i < a[f].length; i++) a[f][i] = lerp(a[f][i], b[f][i], k);
  }
  a.fogDensity = lerp(a.fogDensity, b.fogDensity * QUALITY[G.quality].fogMul, k);
}

// ---------------------------------------------------------------- missions

function resolve(at) {
  if (typeof at === 'string') return PLACES[at];
  return at;
}

function startMission(def) {
  const spec = G.veh.spec;
  const stages = def.build({ carId: spec.id, carName: spec.name, seats: spec.seats });
  G.mission = { def, stages, idx: 0, timeLeft: null, failed: false, elapsed: 0 };
  G.waypoint = null;
  G.veh.passengers = 0;
  setEnv(def.timeOfDay);
  audio.chime(true);
  hud.toast(def.title.toUpperCase() + '\n' + def.brief, 3200);
  applyStage();
}

function applyStage() {
  const m = G.mission;
  const st = m.stages[m.idx];
  const p = resolve(st.at);
  hud.setObjective(st.text, st.sub || '');
  m.timeLeft = st.time != null ? st.time : null;
  m.target = { x: p.x, z: p.z, r: st.radius || 14 };
  G.routeKey = '';
}

function failMission(why) {
  hud.toast('RATÉ\n' + why, 3000);
  audio.chime(false);
  G.mission = null;
  G.veh.passengers = 0;
  setEnv('day');
  hud.setTimer(null);
  hud.setObjective('Free roam', 'Retourne au marqueur pour ré-essayer');
}

function updateMission(dt) {
  const m = G.mission;
  const v = G.veh;
  if (!m) {
    // Several missions share a start marker, so offer one and let Tab cycle.
    const near = MISSIONS.filter((d) => {
      const p = PLACES[d.giver];
      return Math.hypot(v.x - p.x, v.z - p.z) < 12;
    });
    G.near = near;
    if (!near.length) {
      G.offer = null;
      // A friend's car parked nearby? Take it.
      let carId = null, cd = 6.5;
      for (const id of Object.keys(G.parked)) {
        const d = Math.hypot(G.parked[id].x - v.x, G.parked[id].z - v.z);
        if (d < cd) { cd = d; carId = id; }
      }
      if (carId && Math.abs(v.vLong) < 3) {
        const c = carById(carId);
        hud.prompt(`E  —  prendre ${c.who === 'Yours' ? 'ton' : 'le'} ${c.name}${c.who === 'Yours' ? '' : ' de ' + c.who.replace("'s", '')}`);
        if (G.wantStart) { G.wantStart = false; hud.prompt(null); swapCar(carId); }
      } else hud.prompt(null);
      G.wantStart = false;
      return;
    }
    if (!G.offer || !near.includes(G.offer)) {
      G.offer = near.find((d) => !G.done.has(d.id)) || near[0];
    }
    if (G.wantCycle && near.length > 1) {
      G.offer = near[(near.indexOf(G.offer) + 1) % near.length];
    }
    G.wantCycle = false;
    const again = G.done.has(G.offer.id) ? ' (déjà fait)' : '';
    hud.prompt(`⏎  ${G.offer.title}${again}` + (near.length > 1 ? '   ·   Q pour une autre job' : ''));
    if (G.wantStart) { G.wantStart = false; hud.prompt(null); startMission(G.offer); }
    return;
  }
  G.wantStart = false; G.wantCycle = false;

  m.elapsed += dt;
  if (m.timeLeft != null) {
    m.timeLeft -= dt;
    hud.setTimer(Math.max(0, m.timeLeft));
    if (m.timeLeft <= 0) { failMission('Trop tard, mon chum.'); return; }
  } else hud.setTimer(null);

  const st = m.stages[m.idx];
  const d = Math.hypot(v.x - m.target.x, v.z - m.target.z);
  if (d < m.target.r) {
    if (st.maxSpeed && v.speedKmh > st.maxSpeed) {
      hud.prompt(`Ralentis — ${Math.round(st.maxSpeed)} km/h max ici`);
      return;
    }
    hud.prompt(null);
    if (st.passengers) v.passengers = clamp(v.passengers + st.passengers, 0, v.spec.seats);
    if (st.toast) hud.toast(st.toast, 2000);
    audio.blip(880, 0.14, 'triangle', 0.2);
    m.idx++;
    if (m.idx >= m.stages.length) {
      const def = m.def;
      G.done.add(def.id); saveProgress(def.id);
      audio.chime(true);
      const prev = G.best[def.id];
      const record = prev == null || m.elapsed < prev;
      if (record) { G.best[def.id] = m.elapsed; saveBest(); }
      hud.toast('FINI — ' + def.title + '\n' + fmtTime(m.elapsed) + (record ? '  NOUVEAU RECORD' : '  (record ' + fmtTime(prev) + ')')
        + '\n' + G.done.size + '/' + MISSIONS.length + ' jobs faites', 3800);
      G.mission = null;
      v.passengers = 0;
      setEnv('day');
      hud.setTimer(null);
      hud.setObjective('Free roam', 'Trouve un autre marqueur jaune');
      return;
    }
    applyStage();
  } else if (st.maxSpeed) hud.prompt(null);
}

// GPS: route to the mission target, else to the waypoint. Re-plans when you
// wander more than ~45 m off the line.
function updateRoute(dt) {
  const v = G.veh;
  const tgt = G.mission ? G.mission.target : G.waypoint;
  if (!tgt) { G.route = null; G.routeKey = ''; return; }
  if (G.waypoint && !G.mission && Math.hypot(v.x - tgt.x, v.z - tgt.z) < 22) {
    G.waypoint = null; G.route = null; hud.toast('Arrivé au waypoint', 1200); return;
  }
  const key = `${Math.round(tgt.x)},${Math.round(tgt.z)}`;
  G.routeTimer -= dt;
  let replan = key !== G.routeKey;
  if (!replan && G.routeTimer <= 0 && G.route) {
    G.routeTimer = 1.5;
    let bd = Infinity;
    for (let i = 0; i + 1 < G.route.length; i++) {
      const [ax, az] = G.route[i], [bx, bz] = G.route[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      const t = clamp(((v.x - ax) * ex + (v.z - az) * ez) / l2, 0, 1);
      bd = Math.min(bd, (ax + ex * t - v.x) ** 2 + (az + ez * t - v.z) ** 2);
    }
    replan = bd > 45 * 45;
  }
  if (replan) {
    G.route = G.nav.route(v.x, v.z, tgt.x, tgt.z);
    G.routeKey = key; G.routeTimer = 1.5;
  }
}

function openMap(on) {
  if (on) {
    G.mode = 'map';
    G.bigmap.open(G.veh.x, G.veh.z);
    $('bigmap').classList.remove('hidden');
    $('pause').classList.add('hidden');
    audio.engine(0, 0); audio.skid(0); audio.horn(false);
  } else {
    G.mode = 'drive'; last = performance.now();
    $('bigmap').classList.add('hidden');
  }
}

function mapState() {
  const v = G.veh;
  return {
    x: v.x, z: v.z, yaw: v.yaw, route: G.route, waypoint: G.waypoint,
    target: G.mission ? G.mission.target : null,
    missions: G.mission ? [] : MISSIONS.map((d) => ({ x: PLACES[d.giver].x, z: PLACES[d.giver].z, title: d.title, place: PLACES[d.giver].label, done: G.done.has(d.id) })),
    parked: Object.keys(G.parked).map((id) => ({ x: G.parked[id].x, z: G.parked[id].z, name: carById(id).name })),
    places: Object.values(PLACES).filter((p) => p.label && !/Chemin Fraser|Denise|Bancroft|Vanier/.test(p.label)),
  };
}

// ---------------------------------------------------------------- loop

let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  G.fps = lerp(G.fps, 1 / Math.max(dt, 1e-4), 0.05);

  if (G.mode === 'map') {
    if (input.hit('Tab', 'Escape')) openMap(false);
    else { G.bigmap.update(dt, input); G.bigmap.draw(mapState()); }
    input.endFrame();
    return;
  }
  if (G.mode !== 'drive') { input.endFrame(); return; }

  input.update(dt);
  handleKeys();

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    tick(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;

  stepEnv(dt);
  render(dt);
  input.endFrame();
}

function handleKeys() {
  if (input.hit('Escape')) { pause(true); return; }
  if (input.hit('Tab')) { openMap(true); return; }
  if (input.hit('KeyC')) G.cam = (G.cam + 1) % CAMS.length;
  if (input.hit('Backspace') && G.mission) { failMission('Abandonné.'); }
  G.lookBack = input.down('ShiftLeft', 'ShiftRight');
  if (input.hit('KeyR')) { G.veh.recover(); hud.toast('Remis sur le chemin', 1200); }
  if (input.hit('Enter', 'KeyE')) G.wantStart = true;
  if (input.hit('KeyQ')) G.wantCycle = true;
  if (input.hit('KeyM')) { audio.enabled = !audio.enabled; hud.toast(audio.enabled ? 'Son ON' : 'Son OFF', 900); }
  audio.horn(input.down('KeyH') || input.padHorn);
}

// R3/R4 — everything the crash work needs out of the loop, in one place so the
// rest of tick() stays the shape it was.
function driveHooks(dt, v) {
  for (const t of G.traffic.cars) {          // somebody leaning on the horn
    if (!t.honk) continue;
    const d = Math.hypot(t.x - v.x, t.z - v.z);
    if (d < 90) audio.honk(296 + (t.spec.mass % 6) * 24, 0.5, 0.075 * (1 - d / 90));
  }
  if (v.misfire) audio.misfire();
  if (v.lastHit > 0.12) input.rumble(v.lastHit, 90 + v.lastHit * 200);
  v.lastHit = 0;
  G.fx.tick(dt, v, G.world);
  G.health[v.spec.id] = v.damage;

  // Repairs at the Petro-Canada: pull in, stop, count to five.
  const rep = updateRepair(G.repair, dt, v, PLACES.gas);
  if (rep === 'start') hud.toast('Reste là cinq secondes,\non te r’garde ça', 2200);
  else if (rep === 'done') {
    v.repair(); G.health[v.spec.id] = 0;
    hud.toast('Comme neuf.\nFais attention à c’t’heure', 2400);
    audio.blip(760, 0.16, 'triangle', 0.18);
  }

  // Dead: the job is gone and so is the car, until the flatbed drops it home.
  if (v.damage >= DAMAGE.DEAD && !G.towed) {
    G.towed = true;
    const home = PLACES[OWNER[v.spec.id]];
    if (G.mission) failMission('Le char est fini. Remorqué.');
    else { hud.toast('LE CHAR EST FINI\nRemorqué chez vous, pis réparé', 3200); audio.chime(false); }
    v.reset(home.x, home.z, home.a);
    v.repair();
    G.health[v.spec.id] = 0;
    G.repair.t = 0;
  } else if (v.damage < DAMAGE.DEAD) G.towed = false;
}

function tick(dt) {
  const v = G.veh;
  const ctl = {
    steer: input.steer, throttle: input.throttle,
    brake: input.brake, handbrake: input.handbrake,
  };
  const preImpact = v.impact;
  v.update(dt, ctl, G.phys);
  G.traffic.update(dt, v);

  if (v.drowning > 1.4) {
    v.recover();
    hud.toast('L’Outaouais, c’est pas une route', 1800);
  }
  // R3 — parked cars are rigid bodies too: shove one and it stays shoved, and
  // its new spot is what G.parked remembers.
  for (const id of Object.keys(G.parked)) {
    const p = asBody(G.parked[id], carById(id));
    driftBody(p, dt, 4.5, 4.0);
    const closing = collideCars(v, p, 0.22, 0.70);
    if (closing > 0) { v.hit(closing, contact.nx, contact.nz); v.syncFrame(); }
  }
  // Walls, poles, traffic and parked cars have all had their say by now.
  if (v.impact > preImpact + 0.08) audio.crash(v.impact);
  driveHooks(dt, v);
  updateMission(dt);
  G.time += dt;

  G.streetTimer -= dt;
  if (G.streetTimer <= 0) { G.streetTimer = 0.4; hud.setStreet(G.nav.streetName(v.x, v.z)); }
  updateRoute(dt);

  // Audio: fake five-speed so the note climbs and drops like a real box.
  const frac = clamp(Math.abs(v.vLong) / v.spec.topSpeed, 0, 1);
  const gear = Math.min(4, Math.floor(frac * 4.4));
  const rpm = clamp(0.18 + ((frac * 4.4) - gear) * 0.82, 0, 1);
  audio.engine(rpm, ctl.throttle * 0.7 + Math.min(0.3, frac), v.speedKmh);
  audio.skid(v.skid);
}

const mm = m4.create();
const black = new Float32Array([0, 0, 0]);
const yellow = new Float32Array([1, 0.79, 0.3]);
const white = new Float32Array([1, 1, 1]);

function render(dt) {
  const r = G.renderer, v = G.veh, cam = CAMS[G.cam];

  // Chase camera: yaw eases toward the car, and a slide swings it wide.
  const revCam = cam.name === 'hood' && v.reversing;   // D5: look where you're going
  const want = v.yaw + (G.lookBack || revCam ? 0 : Math.PI) - clamp(v.vLat * 0.02, -0.35, 0.35);
  G.camYaw += angleDelta(want, G.camYaw) * Math.min(1, dt * (cam.name === 'hood' || G.lookBack ? 22 : 5.5));
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const back = cam.dist + Math.abs(v.vLong) * 0.09;
  const cx = Math.sin(G.camYaw + Math.PI), cz = Math.cos(G.camYaw + Math.PI);
  let px, pz;
  if (cam.name === 'hood') {
    const hd = revCam ? -cam.dist - 1.7 : cam.dist;
    px = v.x + fx * hd; pz = v.z + fz * hd;
  } else {
    px = v.x - cx * back; pz = v.z - cz * back;
  }
  const py = cam.height + Math.abs(v.vLong) * 0.012;
  G.camPos[0] = lerp(G.camPos[0], px, Math.min(1, dt * 9));
  G.camPos[1] = lerp(G.camPos[1], py, Math.min(1, dt * 6));
  G.camPos[2] = lerp(G.camPos[2], pz, Math.min(1, dt * 9));

  const fov = QUALITY[G.quality].fov + cam.fovAdd + clamp(Math.abs(v.vLong) / v.spec.topSpeed, 0, 1) * 0.09;
  r.setEnvironment(G.env);
  r.begin(G.camPos, G.camYaw, cam.pitch, fov);

  m4.compose(mm, G.camPos[0], 0, G.camPos[2], 0, 0, 0);
  r.draw(G.sky.mesh, mm, skyOpts(G.env));
  if (G.quality !== 'low') r.draw(G.sky.clouds, mm, cloudOpts(G.env));
  m4.identity(mm);
  r.draw(G.world.distant, mm, { fogMul: 0.28 });
  const dd = QUALITY[G.quality].drawDist, dd2 = dd * dd;
  for (const c of G.world.chunks) {
    const dx = c.cx - v.x, dz = c.cz - v.z;
    if (dx * dx + dz * dz > dd2) continue;
    if (r.visible(c.mesh)) r.draw(c.mesh, mm);
  }

  drawCar(v.spec, v.x, v.z, v.yaw, v.pitch, v.roll, v.spin, v.steer, null, v.passengers, v.y);
  for (const t of G.traffic.cars) {
    if (Math.hypot(t.x - v.x, t.z - v.z) > 320) continue;
    drawCar(t.spec, t.x, t.z, t.yaw, 0, 0, t.spin, 0, t.tint, 0);
  }
  for (const id of Object.keys(G.parked)) {
    const p = G.parked[id];
    if (Math.hypot(p.x - v.x, p.z - v.z) > 320) continue;
    drawCar(carById(id), p.x, p.z, p.yaw, 0, 0, 0, 0, null, 0);
  }
  drawMarkers();
  if (G.fx) G.fx.render(v, G.world, G.night, G.traffic.cars);

  r.end();

  hud.setSpeed(v.speedKmh);
  hud.setDamage(v.damage);
  hud.setReverse(v.reversing);
  hud.draw({
    x: v.x, z: v.z, yaw: v.yaw,
    targets: markerList(),
    traffic: G.traffic.cars,
    route: G.route,
  });
}

function drawCar(spec, x, z, yaw, pitch, roll, spin, steer, tint, passengers, y = 0) {
  const r = G.renderer;
  const skin = G.meshes.skins[spec.id];
  const opts = tint ? { colorMul: tint } : {};
  if (skin) opts.tex = skin.tex;
  m4.compose(mm, x, y, z, yaw, pitch, roll);
  r.draw(skin ? skin.mesh : G.meshes.cars[spec.id], mm, opts);

  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const hx = spec.track / 2;
  const wheelR = skin ? skin.wheelR : spec.wheelR;
  const wopts = tint ? { colorMul: tint } : undefined;
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const lx = sx * hx, lz = skin ? (sz > 0 ? skin.wheelZ[0] : skin.wheelZ[1]) : sz * spec.axleZ;
    const wx = x + lx * cy + lz * sy;
    const wz = z - lx * sy + lz * cy;
    m4.compose(mm, wx, y + wheelR, wz, yaw - (sz > 0 ? steer : 0), spin, 0, 1, wheelR / spec.wheelR, wheelR / spec.wheelR);
    r.draw(G.meshes.wheels[spec.id], mm, wopts);
  }

  if (passengers > 0) {
    const seats = Vehicle.prototype.seatPositions.call({ spec });
    for (let i = 0; i < Math.min(passengers, seats.length); i++) {
      const [lx, ly, lz] = seats[i];
      m4.compose(mm, x + lx * cy + lz * sy, y + ly, z - lx * sy + lz * cy, yaw, 0, 0, 1, 1, 1);
      r.draw(G.meshes.head, mm);
    }
  }

  m4.compose(mm, x, 0.06, z, yaw, 0, 0, spec.wid + 0.5, 1, spec.len + 0.4);
  r.draw(G.meshes.shadow, mm, { alpha: 0.3, unlit: true, colorMul: black });
}

function markerList() {
  const out = [];
  if (G.mission) {
    out.push({ x: G.mission.target.x, z: G.mission.target.z, kind: 'objective' });
  } else {
    for (const def of MISSIONS) {
      const p = PLACES[def.giver];
      out.push({ x: p.x, z: p.z, kind: 'mission' });
    }
    for (const id of Object.keys(G.parked)) out.push({ x: G.parked[id].x, z: G.parked[id].z, kind: 'car' });
  }
  if (G.waypoint) out.push({ x: G.waypoint.x, z: G.waypoint.z, kind: G.mission ? 'mission' : 'objective' });
  return out;
}

const cyan = new Float32Array([0.31, 0.83, 1]);
function drawMarkers() {
  const r = G.renderer, v = G.veh;
  const pulse = 0.75 + Math.sin(G.time * 3) * 0.25;
  if (G.waypoint && !G.mission) {
    m4.compose(mm, G.waypoint.x, 0, G.waypoint.z, 0, 0, 0, 6, 9 + pulse * 2, 6);
    r.draw(G.meshes.marker, mm, { alpha: 0.22, unlit: true, colorMul: cyan });
  }
  if (G.mission) {
    const t = G.mission.target;
    m4.compose(mm, t.x, 0, t.z, 0, 0, 0, t.r, 7 + pulse * 2, t.r);
    r.draw(G.meshes.marker, mm, { alpha: 0.22, unlit: true, colorMul: yellow });
    m4.compose(mm, t.x, 0.09, t.z, 0, 0, 0, t.r, 1, t.r);
    r.draw(G.meshes.ring, mm, { alpha: 0.3, unlit: true, colorMul: yellow });
  } else {
    for (const def of MISSIONS) {
      const p = PLACES[def.giver];
      if (Math.hypot(p.x - v.x, p.z - v.z) > 600) continue;
      const c = G.done.has(def.id) ? white : yellow;
      m4.compose(mm, p.x, 0, p.z, 0, 0, 0, 8, 6 + pulse, 8);
      r.draw(G.meshes.marker, mm, { alpha: G.done.has(def.id) ? 0.1 : 0.2, unlit: true, colorMul: c });
    }
  }
}

// ---------------------------------------------------------------- pause / wiring

function fillJobs() {
  const el = $('jobs');
  el.innerHTML = MISSIONS.map((d) => {
    const done = G.done.has(d.id), b = G.best[d.id];
    return `<div class="job${done ? ' done' : ''}"><span>${done ? '✓' : '·'}</span>` +
      `<span><span class="t">${d.title}</span><br><span class="w">${d.brief}</span></span>` +
      `<span class="w">départ: ${PLACES[d.giver].label}</span>` +
      `<span class="b">${b != null ? fmtTime(b) : '—'}</span></div>`;
  }).join('');
}

function pause(on) {
  if (on) {
    G.mode = 'paused';
    fillJobs();
    $('pause').classList.remove('hidden');
    audio.horn(false);
    audio.engine(0, 0); audio.skid(0);
  } else {
    G.mode = 'drive';
    last = performance.now();
    $('pause').classList.add('hidden');
  }
}

$('start').onclick = startGame;
$('resume').onclick = () => pause(false);
$('mapbtn').onclick = () => { pause(false); openMap(true); };
$('garage').onclick = () => {
  pause(false); G.mode = 'menu'; G.mission = null;
  hud.setVisible(false); $('menu').classList.remove('hidden'); $('start').textContent = 'DRIVE';
};
$('wipe').onclick = () => {
  resetProgress(); G.done = new Set();
  hud.toast('Progression effacée', 1600);
  pause(false);
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.mode === 'paused') pause(false);
});
window.addEventListener('pointerdown', () => audio.resume(), { once: true });

buildMenu();
hud.setVisible(false);
requestAnimationFrame(frame);

// Debug hook: lets a console (or a test) step the sim without a live rAF.
window.AYLMER = {
  G, hud, input,
  step(dt = STEP) { if (G.mode === 'drive') { input.update(dt); handleKeys(); tick(dt); stepEnv(dt); input.endFrame(); } },
  render() { if (G.mode === 'drive') render(STEP); },
  teleport(x, z, yaw = 0) { G.veh.reset(x, z, yaw); },
  start: startMission,
};
