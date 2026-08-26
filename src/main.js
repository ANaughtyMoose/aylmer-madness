// Aylmer Madness — boot, game loop, camera, mission runner.
import { Renderer } from './core/gl.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { MeshBuilder, rgb } from './core/mesh.js';
import { m4, clamp, lerp, angleDelta } from './core/math.js';
import { buildWorld, buildHeadlights, nightAmount, HOUSE_NEAR } from './game/world.js';
import { loadMaterials } from './game/materials.js';
import MATS_STUB from './game/materials_stub.js';
import { CARS, carById, Vehicle, buildCarBody, buildWheel, buildHead, buildShadow, DAMAGE } from './game/cars.js';
import { asBody, collideCars, driftBody, contact } from './game/collide.js';
import { DriveFx, updateRepair, restoreDamage } from './game/damage.js';
import { Traffic } from './game/traffic.js';
import { Hud } from './game/hud.js';
import { loadCarSkin } from './game/carskin.js';
import { Nav, routeLength } from './game/nav.js';
import { buildSky, skyOpts, cloudOpts, cloudModel } from './game/sky.js';
import { BigMap } from './game/bigmap.js';
import { MISSIONS, TIME_OF_DAY, loadProgress, saveProgress, resetProgress } from './game/missions.js';
import { PLACES, resolvePlaces } from './game/places.js';
import { t, setLang, KEYMAP } from './game/i18n.js';
import {
  loadSettings, saveSettings, loadMapPrefs, saveMapPrefs,
  loadGarage, saveGarage, clearGarage, MAP_SIZES,
} from './game/store.js';
import {
  Legend, Tutorial, Loading, IntroCard, keyboardHTML, settingsHTML, wireSettings,
} from './game/ui.js';
import { CarTurntable } from './game/turntable.js';
import { Gearbox } from './game/gearbox.js';
import { Garage } from './game/garage.js';
import { Radio } from './game/radio.js';
import { Signals } from './game/signals.js';
// Side jobs: props, the canoe, and the extended stage model. Everything below
// hooks in through G — main.js does not know what a doughnut is.
import { Props, buildPropMeshes, ISLAND, MIKE_TREE } from './game/props.js';
import { Wallet, START as START_CASH } from './game/money.js';
import {
  stageTarget, stageEnter, stageExit, stageStep, stageSettle, missionCleanup,
} from './game/missionkit.js';

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
  settings: loadSettings(),   // lang, lookBackToggle, steerSens, fov, assist, audio
  mapPrefs: loadMapPrefs(),   // { size: index into MAP_SIZES, range: metres }
  health: {},                 // carId -> 0..100, if the damage model fills it in
  introUntil: 0,              // G.time before which the mission clock is held
  tutoMapOpened: false, tutoJobTaken: false,
  // R3/R4 (driving agent). `health` is damage 0-100 per car for the session;
  // `envKey` is the current TIME_OF_DAY key and `night` is the lights-on flag
  // other systems can read; `fx` owns steam, crumples, lamps and fallen poles.
  envKey: 'day', night: false,
  fx: null, repair: { t: 0 }, towed: false,
  // side-job state: hand-placed props, the canoe, who the camera follows, cash
  props: null, boat: null, focus: null, wallet: null,
  // Progression + the deck. `gearbox` turns road speed into rpm for the engine
  // note (game/gearbox.js); `garage` says which cars you are allowed to drive.
  gearbox: null, garage: null, radio: null,
  hud, audio, input,
};
setLang(G.settings.lang);
G.assist = G.settings.assist;
audio.enabled = G.settings.audio;

const legend = new Legend();
const tutorial = new Tutorial();
const loading = new Loading();
const introCard = new IntroCard();
hud.setSize(MAP_SIZES[G.mapPrefs.size]);
hud.setRange(G.mapPrefs.range);
// Whose driveway each car lives in.
// Margaret's Saturn lives in the same driveway as your Ranger at 299 Fraser.
const OWNER = {
  ranger: 'home', saturn: 'home', civic: 'steph', sunfire: 'dave',
  // The four beaters live on the lot until somebody buys them, and after that
  // they live in your driveway with everything else.
  cutlass: 'usedlot', cavalier: 'usedlot', caravan: 'usedlot', bus: 'usedlot',
};
// Bought beaters come home with you; everything else lives with its owner.
const homeKey = (id) => (OWNER[id] === 'usedlot' ? 'home' : OWNER[id]);
const homeOf = (id) => PLACES[homeKey(id)] || PLACES.home;

const garage = new Garage(G.done);
G.garage = garage;
const radio = new Radio(audio);
G.radio = radio;
radio.onChange = paintRadio;
// If the car you were last in is not yours any more (progress was wiped), the
// Ranger always is.
if (!garage.has(G.carId, G.done)) G.carId = 'ranger';

// The radio's one line of HUD, bottom-left under the objective.
function paintRadio(st) {
  const el = $('radio');
  if (!el) return;
  const s = st || radio.state();
  el.classList.toggle('hidden', !(s.on || s.wantOn) || G.mode !== 'drive');
  // It sits one line above the street name, which hud.setSize() slides sideways
  // when the minimap changes size.
  const street = $('street');
  if (street && street.style.left) el.style.left = street.style.left;
  const name = $('radiostation'), track = $('radiotrack');
  if (name) name.textContent = s.stationName;
  if (track) track.textContent = s.track || s.slogan || '';
}

function toggleRadio() {
  const st = radio.toggle();
  hud.toast(st.wantOn
    ? `${st.stationName}${st.slogan ? ' \u2014 ' + st.slogan : ''}\n${st.track}`
    : t('radio.off'), 1800);
  paintRadio(st);
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem('aylmer.best') || '{}') || {}; } catch (e) { return {}; }
}
function saveBest() {
  try { localStorage.setItem('aylmer.best', JSON.stringify(G.best)); } catch (e) { /* private mode */ }
}
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- menu

const turntable = new CarTurntable();

function buildMenu() {
  const wrap = $('cars');
  wrap.innerHTML = '';
  const cards = [];
  for (const c of CARS) {
    const owned = garage.has(c.id, G.done);
    const el = document.createElement('div');
    el.className = 'card' + (c.id === G.carId ? ' sel' : '') + (owned ? '' : ' locked');
    const hex = '#' + c.body.toString(16).padStart(6, '0');
    // The bus is off the end of every one of these scales, so clamp them.
    const bar = (label, v) => {
      const w = Math.round(Math.max(0.04, Math.min(1, v)) * 100);
      return `<div class="bar"><b>${label}</b><u><i style="width:${w}%"></i></u></div>`;
    };
    // The turntable canvas replaces the paint swatch when WebGL is available;
    // the body colour stays as a thin stripe so the car is still identifiable.
    const art = turntable.ok
      ? `<canvas class="turn" width="300" height="200"></canvas>` +
        `<div class="stripe" style="background:${hex}"></div>`
      : `<div class="swatch" style="background:${hex}"></div>`;
    const lock = owned ? '' :
      `<div class="lock"><span>\u{1F512}</span>${garage.reason(c.id, G.done, G.settings.lang)}</div>`;
    el.innerHTML = art + lock +
      `<h3>${c.name}</h3><div class="who">${c.who} &middot; ${c.seats + 1} ${t('menu.seats')}</div>` +
      bar('Speed', (c.topSpeed - 24) / 24) +
      bar('Accel', (c.accel - 1.4) / 4.2) +
      bar('Grip', (c.grip - 0.60) / 0.52) +
      `<div class="flav">${c.flavour}</div>`;
    el.onclick = () => { if (!owned) return; G.carId = c.id; buildMenu(); };
    wrap.appendChild(el);
    const cv = el.querySelector('canvas.turn');
    if (cv) cards.push({ id: c.id, canvas: cv });
  }
  if (cards.length) turntable.setCards(cards);
  applyMenuText();
}

// Every string on the menu screen that is chrome rather than car copy.
function applyMenuText() {
  const set = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
  set('menutag', t('menu.tag'));
  set('lblAssist', t('menu.assist'));
  set('lblAudio', t('menu.audio'));
  set('lblQuality', t('menu.graphics'));
  set('lblLang', t('menu.lang'));
  set('start', t('menu.drive'));
  const q = $('optQuality');
  if (q) {
    q.options[0].textContent = t('menu.q.low');
    q.options[1].textContent = t('menu.q.med');
    q.options[2].textContent = t('menu.q.high');
  }
  const mk = $('menukeys');
  if (mk) {
    mk.innerHTML = KEYMAP.map((k) =>
      `<div class="lrow">${k.caps.map((c) => `<kbd>${c}</kbd>`).join('')}` +
      (k.alt ? `<span class="alt">${k.alt}</span>` : '') +
      `<span class="lab">${t(k.label)}</span></div>`).join('');
  }
}

function startGame() {
  if (!garage.has(G.carId, G.done)) G.carId = 'ranger';
  G.assist = $('optAssist').checked;
  audio.enabled = $('optAudio').checked;
  G.settings.assist = G.assist;
  G.settings.audio = audio.enabled;
  saveSettings(G.settings);
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
    $('start').textContent = t('menu.building');
    turntable.stop();
    // Each stage paints its own label before it runs, so the screen is telling
    // the truth about what is taking the time. The bar animates on the
    // compositor, so it keeps moving even while buildWorld blocks.
    loading.run(worldStages()).then(enterDrive).catch((e) => {
      $('menuinner').innerHTML = `<h1>Ouch</h1><p class="tag">${e.message}</p>`;
    });
    return;
  }
  turntable.stop();
  enterDrive();
}

// [label, work] pairs. buildWorld is one synchronous blob we do not own, so it
// gets one honest combined label rather than four fake ones.
function worldStages() {
  const r = G.renderer;
  return [
    // The atlas is one 2048² PNG off the network, so this stage is a promise —
    // Loading.run waits for it. If it does not turn up the houses fall back to
    // flat vertex colours and the game still runs.
    [t('load.mats'), () => loadMaterials(r).then((m) => { G.mats = m; }).catch((e) => {
      console.warn('materials: atlas failed to load, falling back to vertex colours —', e.message);
      G.mats = MATS_STUB;
    })],
    [t('load.world'), () => {
      G.world = buildWorld(r, G.mats || MATS_STUB);
      G.phys = {
        roadAt: (x, z) => G.world.roadAt(x, z),
        querySegments: (x, z, rad) => G.world.querySegments(x, z, rad),
        waterAt: (x, z) => G.world.waterAt(x, z),
        queryPoles: (x, z, rad) => G.world.queryPoles(x, z, rad),
        snapPole: (p, ux, uz) => G.world.snapPole(p, ux, uz),
        bounds: G.world.bounds,
      };
    }],
    [t('load.places'), () => { resolvePlaces(G.world); }],
    [t('load.gps'), () => { G.nav = new Nav(); }],
    [t('load.map'), () => {
      G.bigmap = new BigMap($('bigmap'));
      G.bigmap.onWaypoint = (x, z) => {
        G.waypoint = { x, z };
        G.routeKey = '';
        hud.toast('Waypoint placé', 900);
      };
    }],
    [t('load.cars'), () => {
      G.meshes = { cars: {}, wheels: {}, cones: {} };
      G.sky = buildSky(r);
      G.signals = new Signals().build(r);
      for (const c of CARS) {
        G.meshes.cars[c.id] = r.upload(buildCarBody(c));
        G.meshes.wheels[c.id] = r.upload(buildWheel(c));
        G.meshes.cones[c.id] = buildHeadlights(r, c);
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
      // Hand-placed props (canoe, couch, Île Aylmer, Mike's maple...). Built and
      // uploaded once, here; nothing in props.js ever builds geometry per frame.
      G.propMeshes = buildPropMeshes(r);
      G.props = new Props(r, G.propMeshes);
    }],
    [t('load.ready'), () => {}],
  ];
}

function enterDrive() {
  const spec = carById(G.carId);
  G.veh = new Vehicle(spec);
  G.veh.assist = G.assist;
  const h = PLACES[OWNER[spec.id]];
  G.veh.reset(h.x, h.z, h.a);
  G.health = {}; G.repair.t = 0; G.towed = false;
  audio.setEngineProfile(spec.sound);
  G.gearbox = new Gearbox(spec.drive);
  G.parked = {};
  garage.setProgress(G.done);
  // Cars you have are at their owner's kerb (several at one address get their own
  // slot along the street); the ones on the lot stand in a row with the price
  // soaped on the glass whether or not you can afford them.
  const slots = {};
  for (const c of CARS) {
    if (!garage.has(c.id, G.done)) continue;
    const k = homeKey(c.id);
    const slot = (slots[k] = (slots[k] || 0) + 1) - 1;   // your own car takes slot 0
    if (c.id !== spec.id) G.parked[c.id] = curbSpot(PLACES[k], slot);
  }
  const sale = garage.forSale();
  for (let i = 0; i < sale.length; i++) {
    if (sale[i] === spec.id) continue;
    G.parked[sale[i]] = lotSpot(PLACES.usedlot, i);
  }
  // Where you left the other three last session, if you took the same car out.
  const saved = loadGarage();
  if (saved.carId === spec.id) {
    for (const id of Object.keys(G.parked)) {
      if (saved.parked[id]) G.parked[id] = { ...saved.parked[id] };
    }
    G.health = saved.health || {};
  }
  G.waypoint = null; G.route = null; G.routeKey = '';
  G.traffic = new Traffic(QUALITY[G.quality].traffic);
  G.traffic.signals = G.signals;
  // Detailed houses reach HOUSE_NEAR normally; 'low' pulls them in to 140 m,
  // where its thicker fog has already eaten most of the difference.
  G.world.setHouseNear(G.quality === 'low' ? 140 : HOUSE_NEAR);
  G.camYaw = G.veh.yaw + Math.PI;
  G.camPos = [G.veh.x, 4, G.veh.z];
  setEnv('day', true);
  G.mission = null;
  G.boat = null; G.focus = null;
  if (!G.wallet) G.wallet = new Wallet($('money'));
  G.wallet.render();
  if (G.props) {
    G.props.clear();
    // Permanent scenery the map data has no idea about.
    G.props.add({ id: 'island', mesh: 'island', x: ISLAND.x, z: ISLAND.z, yaw: ISLAND.yaw, far: 2200 });
    G.props.add({ id: 'miketree', mesh: 'bigtree', x: MIKE_TREE.x, z: MIKE_TREE.z, far: 500 });
  }
  G.mode = 'drive';
  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  hud.setVisible(true);
  hud.setCar(spec.name);
  hud.setSize(MAP_SIZES[G.mapPrefs.size]);
  hud.setRange(G.mapPrefs.range);
  hud.setObjective(t('hud.freeroam'), t('hud.freeroam.sub'));
  hud.setTimer(null);
  hud.setGear(1);
  hud.toast('AYLMER, QUÉBEC\nprends ton temps', 2600);
  legend.render();
  G.tutoMapOpened = false; G.tutoJobTaken = false;
  saveGarageNow();
  audio.start(); audio.resume();
  radio.resume();
  radio.loadTape().then(() => paintRadio()).catch(() => {});
  paintRadio();
}

function saveGarageNow() {
  saveGarage({ carId: G.carId, parked: G.parked, health: G.health });
}

// A row of parking spots along the kerb — the used lot, where four beaters sit
// nose-to-tail. `i` is the place in the row.
function lotSpot(p, i = 0) {
  const a = p.a || 0;
  const fx = Math.sin(a), fz = Math.cos(a);
  let dx = p.bx - p.x, dz = p.bz - p.z;
  const d = Math.hypot(dx, dz);
  // If the marker snapped exactly onto the building there is no "in" direction;
  // step off the road to the right instead.
  if (d < 0.5) { dx = fz; dz = -fx; } else { dx /= d; dz /= d; }
  const along = (i - 1.5) * 6.2;
  return { x: p.x + dx * 4.0 + fx * along, z: p.z + dz * 4.0 + fz * along, yaw: a };
}

// A parking spot at the curb in front of a place, nose along the street.
function curbSpot(p, slot = 0) {
  const dx = p.bx - p.x, dz = p.bz - p.z, d = Math.hypot(dx, dz) || 1;
  // `slot` spaces cars parked at the same address along the street.
  const a = p.a || 0, tx = Math.sin(a) * 6.5 * slot, tz = Math.cos(a) * 6.5 * slot;
  return { x: p.x + (dx / d) * 2.6 + tx, z: p.z + (dz / d) * 2.6 + tz, yaw: a };
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
  G.gearbox = new Gearbox(spec.drive);
  G.repair.t = 0;
  hud.setCar(spec.name);
  hud.toast(`${spec.who === 'Yours' ? 'Ton' : spec.who.replace("'s", '') + ' te passe son'} ${spec.name}`, 1800);
  audio.blip(520, 0.12, 'triangle', 0.15);
  saveGarageNow();
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

function startMission(def) {
  const spec = G.veh.spec;
  const stages = def.build({
    carId: spec.id, carName: spec.name, seats: spec.seats,
    money: G.wallet ? G.wallet.value : 0,
  });
  G.mission = { def, stages, idx: 0, timeLeft: null, failed: false, elapsed: 0 };
  G.waypoint = null;
  G.veh.passengers = 0;
  setEnv(def.timeOfDay);
  audio.chime(true);
  applyStage();
  // Two seconds of title / brief / clock / route preview before the clock runs.
  const first = G.mission.target;
  const route = G.nav ? G.nav.route(G.veh.x, G.veh.z, first.x, first.z) : null;
  if (route) { G.route = route; G.routeKey = `${Math.round(first.x)},${Math.round(first.z)}`; }
  introCard.show({
    title: def.title, brief: def.brief, time: G.mission.timeLeft,
    route, from: { x: G.veh.x, z: G.veh.z }, to: first,
  }, 2);
  G.introUntil = G.time + 2;
  G.tutoJobTaken = true;
}

function applyStage() {
  const m = G.mission;
  const st = m.stages[m.idx];
  hud.setObjective(st.text, st.sub || '');
  m.timeLeft = st.time != null ? st.time : null;
  m.target = stageTarget(G, m, st);
  G.routeKey = '';
  stageEnter(G, m, st);
}

function failMission(why) {
  hud.toast('RATÉ\n' + why, 3000);
  audio.chime(false);
  missionCleanup(G, G.mission, true);
  hud.prompt(null);
  G.mission = null;
  G.introUntil = 0;
  introCard.hide();
  G.veh.passengers = 0;
  setEnv('day');
  hud.setTimer(null);
  hud.setObjective(t('hud.freeroam'), t('hud.freeroam.again'));
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
        if (!garage.has(carId, G.done)) {
          // On the lot: the same hold/cost shape the yard sale uses, except the
          // thing you are buying drives away.
          const cost = garage.cost(carId);
          const can = garage.canBuy(carId, G.wallet, G.done);
          hud.prompt(`E  \u2014  acheter ${c.name}   \u00b7   ${cost} $` + (can.ok ? '' : `   (${can.why})`));
          if (G.wantStart) {
            G.wantStart = false;
            const r = garage.buy(carId, G.wallet, G.done);
            if (r.ok) {
              hud.prompt(null);
              hud.toast(`Vendu.\n${c.name} \u2014 ${cost} $`, 2600);
              audio.chime(true);
              swapCar(carId);
            } else hud.toast(r.why, 2400);
          }
        } else {
          hud.prompt(`E  —  prendre ${c.who === 'Yours' ? 'ton' : 'le'} ${c.name}${c.who === 'Yours' ? '' : ' de ' + c.who.replace("'s", '')}`);
          if (G.wantStart) { G.wantStart = false; hud.prompt(null); swapCar(carId); }
        }
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
  G.wantCycle = false;
  // The intro card is up: show the clock but do not run it.
  if (G.introUntil && G.time < G.introUntil) { G.wantStart = false; hud.setTimer(m.timeLeft); return; }

  m.elapsed += dt;
  const st = m.stages[m.idx];
  if (m.timeLeft != null) {
    m.timeLeft -= dt;
    hud.setTimer(Math.max(0, m.timeLeft));
    if (m.timeLeft <= 0) { failMission(st.failWhy || 'Trop tard, mon chum.'); return; }
  } else hud.setTimer(null);

  // Everything a stage can be — radius, timer, speed cap, a held E, a price, a
  // custom condition — lives in missionkit.js. This is just the plumbing.
  const res = stageStep(G, m, st, dt);
  G.wantStart = false;
  if (!res) return;
  if (res.fail) { failMission(res.fail); return; }

  hud.prompt(null);
  if (st.passengers) v.passengers = clamp(v.passengers + st.passengers, 0, v.spec.seats);
  if (st.toast) hud.toast(st.toast, 2400);
  stageSettle(G, m, st);
  audio.blip(880, 0.14, 'triangle', 0.2);
  stageExit(G, m, st);
  m.idx++;
  if (m.idx >= m.stages.length) {
    const def = m.def;
    G.done.add(def.id); saveProgress(def.id);
    audio.chime(true);
    // Somebody may just have decided to lend you their car.
    garage.setProgress(G.done);
    for (const u of garage.newlyUnlocked(G.done)) {
      if (u.toast) hud.toast(u.toast, 3600);
      if (u.id !== G.carId && !G.parked[u.id]) {
        // Next free slot at that address (your own car counts if it lives there).
        const k = homeKey(u.id);
        let slot = homeKey(G.carId) === k ? 1 : 0;
        for (const id of Object.keys(G.parked)) if (homeKey(id) === k) slot++;
        G.parked[u.id] = curbSpot(homeOf(u.id), slot);
      }
    }
    const prev = G.best[def.id];
    const record = prev == null || m.elapsed < prev;
    if (record) { G.best[def.id] = m.elapsed; saveBest(); }
    hud.toast('FINI — ' + def.title + '\n' + fmtTime(m.elapsed) + (record ? '  NOUVEAU RECORD' : '  (record ' + fmtTime(prev) + ')')
      + '\n' + G.done.size + '/' + MISSIONS.length + ' jobs faites', 3800);
    missionCleanup(G, m, false);
    G.mission = null;
    G.introUntil = 0;
    v.passengers = 0;
    setEnv('day');
    hud.setTimer(null);
    hud.setObjective(t('hud.freeroam'), t('hud.freeroam.next'));
    return;
  }
  applyStage();
}

// GPS: route to the mission target, else to the waypoint. Re-plans when you
// wander more than ~45 m off the line.
function updateRoute(dt) {
  const v = G.veh;
  const tgt = (G.mission && G.mission.target) ? G.mission.target : (G.mission ? null : G.waypoint);
  // Stages that happen off the road graph (the paddle) ask for no GPS line.
  if (!tgt || (G.mission && G.mission.stages[G.mission.idx].noRoute)) {
    G.route = null; G.routeKey = ''; return;
  }
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
    G.tutoMapOpened = true;
    const f = G.focus || G.veh;
    G.bigmap.open(f.x, f.z);
    $('bigmap').classList.remove('hidden');
    $('pause').classList.add('hidden');
    audio.engine(0, 0); audio.skid(0); audio.horn(false);
    paintRadio();
  } else {
    G.mode = 'drive'; last = performance.now();
    $('bigmap').classList.add('hidden');
    paintRadio();
  }
}

function mapState() {
  const v = G.focus || G.veh;
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
  // Shift is hold-to-look; the "bascule" setting latches it instead.
  if (G.settings.lookBackToggle) {
    if (input.hit('ShiftLeft', 'ShiftRight')) G.lookBack = !G.lookBack;
  } else {
    G.lookBack = input.down('ShiftLeft', 'ShiftRight');
  }
  // R is the radio (it is 1999 and the deck matters); T is the get-me-out-of-here.
  if (input.hit('KeyT')) { G.veh.recover(); hud.toast('Remis sur le chemin', 1200); }
  if (input.hit('KeyR')) toggleRadio();
  if (input.hit('Enter', 'KeyE')) G.wantStart = true;
  if (input.hit('KeyQ')) G.wantCycle = true;
  // Mute moved off M so N can cycle the minimap size.
  if (input.hit('Digit0', 'Numpad0', 'F9')) {
    audio.enabled = !audio.enabled;
    G.settings.audio = audio.enabled;
    saveSettings(G.settings);
    hud.toast(audio.enabled ? t('toast.mute.on') : t('toast.mute.off'), 900);
  }
  if (input.hit('KeyN')) cycleMapSize();
  if (input.down('Equal', 'NumpadAdd')) zoomMap(-1);
  else if (input.down('Minus', 'NumpadSubtract')) zoomMap(1);
  if (input.hit('Slash', 'NumpadDivide')) legend.toggle();
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

// Small corner map <-> large corner map. Tab is the third size (full screen).
function cycleMapSize() {
  G.mapPrefs.size = (G.mapPrefs.size + 1) % MAP_SIZES.length;
  hud.setSize(MAP_SIZES[G.mapPrefs.size]);
  saveMapPrefs(G.mapPrefs);
  hud.toast(t('toast.mapsize') + ' \u2014 ' + t(G.mapPrefs.size === 0 ? 'map.small' : 'map.large'), 900);
}

// Held +/- ramps the range; the write to localStorage is debounced so holding
// the key does not hammer it.
let zoomAt = 0, mapSaveT = 0;
function zoomMap(dir) {
  const now = performance.now();
  if (now - zoomAt < 70) return;
  zoomAt = now;
  G.mapPrefs.range = hud.setRange(hud.range * (dir > 0 ? 1.1 : 1 / 1.1));
  if (mapSaveT) clearTimeout(mapSaveT);
  mapSaveT = setTimeout(() => { mapSaveT = 0; saveMapPrefs(G.mapPrefs); }, 400);
}

function tick(dt) {
  const v = G.veh;
  // While you are in the canoe the car sits where you parked it and the steering
  // wheel goes to the paddle.
  const inBoat = !!(G.boat && G.boat.active);
  const ctl = inBoat
    ? { steer: 0, throttle: 0, brake: 0, handbrake: true }
    : {
      steer: clamp(input.steer * G.settings.steerSens, -1, 1), throttle: input.throttle,
      brake: input.brake, handbrake: input.handbrake,
    };
  const preImpact = v.impact;
  v.update(dt, ctl, G.phys);
  if (inBoat) {
    G.boat.update(dt, { steer: input.steer, throttle: input.throttle, brake: input.brake });
  }
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
  G.signals.update(dt);
  if (G.signals.playerRanRed(v)) hud.toast('T\u2019as br\u00fbl\u00e9 un feu rouge', 1700);
  updateMission(dt);
  if (G.props) G.props.update(dt, G);
  G.time += dt;

  G.streetTimer -= dt;
  if (G.streetTimer <= 0) { G.streetTimer = 0.4; hud.setStreet(G.nav.streetName(v.x, v.z)); }
  updateRoute(dt);

  // The gearbox. rpm is not "how fast are you going out of top speed" any more:
  // it is road speed through the real ratios, and the engine note follows it —
  // including the 250 ms clutch dip on every change. See game/gearbox.js.
  const gb = G.gearbox;
  gb.update(dt, v.speedKmh, ctl.throttle, v.reversing && v.speedKmh > 1);
  const load = clamp(ctl.throttle * 0.85 + Math.min(0.2, v.speedKmh / 400), 0, 1);
  audio.engine(gb.rpm, load, v.speedKmh, ctl.throttle, gb.clutch);
  audio.skid(v.skid);
  hud.setGear(v.reversing && v.speedKmh > 1 ? 'R' : gb.gear);
  radio.update(dt, load, input.down('KeyH') || input.padHorn);

  tutorial.update(dt, {
    speedKmh: v.speedKmh, steer: input.steer, brake: ctl.brake,
    handbrake: ctl.handbrake, mapOpened: G.tutoMapOpened, jobTaken: G.tutoJobTaken,
  });
}

const mm = m4.create();
const black = new Float32Array([0, 0, 0]);
const yellow = new Float32Array([1, 0.79, 0.3]);
const white = new Float32Array([1, 1, 1]);

function render(dt) {
  const r = G.renderer, v = G.veh, cam = CAMS[G.cam];
  // The camera follows whatever the current stage put in focus — the car, or the
  // canoe. Anything with x/z/yaw/vLong/vLat/spec works.
  const f = G.focus || v;

  // Chase camera: yaw eases toward the car, and a slide swings it wide.
  const revCam = cam.name === 'hood' && !!f.reversing;   // D5: look where you're going
  const want = f.yaw + (G.lookBack || revCam ? 0 : Math.PI) - clamp(f.vLat * 0.02, -0.35, 0.35);
  G.camYaw += angleDelta(want, G.camYaw) * Math.min(1, dt * (cam.name === 'hood' || G.lookBack ? 22 : 5.5));
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
  const back = cam.dist + Math.abs(f.vLong) * 0.09;
  const cx = Math.sin(G.camYaw + Math.PI), cz = Math.cos(G.camYaw + Math.PI);
  let px, pz;
  if (cam.name === 'hood') {
    const hd = revCam ? -cam.dist - 1.7 : cam.dist;
    px = f.x + fx * hd; pz = f.z + fz * hd;
  } else {
    px = f.x - cx * back; pz = f.z - cz * back;
  }
  const py = cam.height + Math.abs(f.vLong) * 0.012;
  G.camPos[0] = lerp(G.camPos[0], px, Math.min(1, dt * 9));
  G.camPos[1] = lerp(G.camPos[1], py, Math.min(1, dt * 6));
  G.camPos[2] = lerp(G.camPos[2], pz, Math.min(1, dt * 9));

  const fov = QUALITY[G.quality].fov + cam.fovAdd + G.settings.fov
    + clamp(Math.abs(f.vLong) / f.spec.topSpeed, 0, 1) * 0.09;
  r.setEnvironment(G.env);
  r.begin(G.camPos, G.camYaw, cam.pitch, fov);

  m4.compose(mm, G.camPos[0], 0, G.camPos[2], 0, 0, 0);
  r.draw(G.sky.mesh, mm, skyOpts(G.env));
  if (G.quality !== 'low') r.draw(G.sky.clouds, cloudModel(mm, G.camPos, r.time), cloudOpts(G.env));
  m4.identity(mm);
  r.draw(G.world.distant, mm, { fogMul: 0.28 });
  G.world.draw(r, mm, f.x, f.z, QUALITY[G.quality].drawDist, dt);
  G.signals.draw(r, f.x, f.z);

  drawCar(v.spec, v.x, v.z, v.yaw, v.pitch, v.roll, v.spin, v.steer, null, v.passengers, v.y);
  const night = nightAmount(G.env);
  if (night > 0.35 && G.meshes.cones[v.spec.id]) {
    coneOpts.alpha = 0.15 * night;
    m4.compose(mm, v.x, 0, v.z, v.yaw, 0, 0);
    r.draw(G.meshes.cones[v.spec.id], mm, coneOpts);
  }
  for (const t of G.traffic.cars) {
    if (Math.hypot(t.x - v.x, t.z - v.z) > 320) continue;
    drawCar(t.spec, t.x, t.z, t.yaw, 0, 0, t.spin, 0, t.tint, 0);
  }
  for (const id of Object.keys(G.parked)) {
    const p = G.parked[id];
    if (Math.hypot(p.x - v.x, p.z - v.z) > 320) continue;
    drawCar(carById(id), p.x, p.z, p.yaw, 0, 0, 0, 0, null, 0);
  }
  if (G.props) G.props.draw(r, f);
  drawMarkers();
  if (G.fx) G.fx.render(v, G.world, G.night, G.traffic.cars);

  r.end();

  hud.setSpeed(f.speedKmh);
  hud.setDamage(v.damage);
  hud.setReverse(v.reversing);
  hud.draw({
    x: f.x, z: f.z, yaw: f.yaw,
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
    if (G.mission.target) out.push({ x: G.mission.target.x, z: G.mission.target.z, kind: 'objective' });
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

const coneOpts = { alpha: 0.15, unlit: true, colorMul: new Float32Array([1, 0.94, 0.74]) };
const cyan = new Float32Array([0.31, 0.83, 1]);
function drawMarkers() {
  const r = G.renderer, v = G.veh;
  const pulse = 0.75 + Math.sin(G.time * 3) * 0.25;
  if (G.waypoint && !G.mission) {
    m4.compose(mm, G.waypoint.x, 0, G.waypoint.z, 0, 0, 0, 6, 9 + pulse * 2, 6);
    r.draw(G.meshes.marker, mm, { alpha: 0.22, unlit: true, colorMul: cyan });
  }
  if (G.mission && G.mission.target) {
    const t = G.mission.target;
    m4.compose(mm, t.x, 0, t.z, 0, 0, 0, t.r, 7 + pulse * 2, t.r);
    r.draw(G.meshes.marker, mm, { alpha: 0.22, unlit: true, colorMul: yellow });
    m4.compose(mm, t.x, 0.09, t.z, 0, 0, 0, t.r, 1, t.r);
    r.draw(G.meshes.ring, mm, { alpha: 0.3, unlit: true, colorMul: yellow });
  } else if (!G.mission) {
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
  el.innerHTML = MISSIONS.map((d, i) => {
    const done = G.done.has(d.id), b = G.best[d.id];
    return `<div class="job${done ? ' done' : ''}" data-i="${i}"><span>${done ? '\u2713' : '\u00b7'}</span>` +
      `<span><span class="t">${d.title}</span><br><span class="w">${d.brief}</span></span>` +
      `<span class="w">${t('pause.start')}: ${PLACES[d.giver].label}</span>` +
      `<span class="b">${b != null ? fmtTime(b) : '\u2014'}</span></div>`;
  }).join('');
  // Click a job to drop a waypoint on where it starts.
  for (const row of el.querySelectorAll('.job')) {
    row.onclick = () => {
      const d = MISSIONS[+row.dataset.i];
      const p = PLACES[d.giver];
      if (!p) return;
      G.waypoint = { x: p.x, z: p.z };
      G.routeKey = '';
      pause(false);
      hud.toast('Waypoint \u2014 ' + d.title + '\n' + p.label, 1800);
      audio.blip(660, 0.1, 'triangle', 0.14);
    };
  }
  const hint = $('jobshint');
  if (hint) hint.textContent = t('pause.clickjob');
}

// ---- pause tabs --------------------------------------------------------

const TABS = [['jobs', 'pause.tab.jobs'], ['keys', 'pause.tab.keys'], ['set', 'pause.tab.set']];
let tab = 'jobs';

function showTab(which) {
  tab = which;
  for (const [id] of TABS) {
    const pane = $('tab' + id);
    if (pane) pane.classList.toggle('hidden', id !== which);
  }
  const bar = $('ptabs');
  if (bar) for (const b of bar.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === which);
  if (which === 'keys') { const el = $('tabkeys'); if (el) el.innerHTML = keyboardHTML(); }
  if (which === 'set') buildSettingsTab();
}

function buildTabBar() {
  const bar = $('ptabs');
  if (!bar) return;
  bar.innerHTML = TABS.map(([id, key]) =>
    `<button class="tab${id === tab ? ' on' : ''}" data-tab="${id}">${t(key)}</button>`).join('');
  for (const b of bar.querySelectorAll('.tab')) b.onclick = () => showTab(b.dataset.tab);
}

function buildSettingsTab() {
  const el = $('tabset');
  if (!el) return;
  el.innerHTML = settingsHTML(G.settings);
  wireSettings(el, G.settings, applySettings);
}

// One place where a settings change reaches the running game.
function applySettings(s) {
  const langChanged = s.lang !== G.settings.lang;
  G.settings = s;
  setLang(s.lang);
  G.assist = s.assist;
  if (G.veh) G.veh.assist = s.assist;
  audio.enabled = s.audio;
  const oa = $('optAssist'), ao = $('optAudio'), lo = $('optLang');
  if (oa) oa.checked = s.assist;
  if (ao) ao.checked = s.audio;
  if (lo) lo.value = s.lang;
  legend.render();
  if (langChanged) {
    applyMenuText();
    applyPauseText();
    buildTabBar();
    fillJobs();
    if (tab === 'keys') { const el2 = $('tabkeys'); if (el2) el2.innerHTML = keyboardHTML(); }
    if (!G.mission && G.mode === 'drive') hud.setObjective(t('hud.freeroam'), t('hud.freeroam.sub'));
  }
}

function applyPauseText() {
  const set = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
  set('pausetitle', t('pause.title'));
  set('resume', t('pause.resume'));
  set('mapbtn', t('pause.map'));
  set('garage', t('pause.menu'));
  set('wipe', t('pause.wipe'));
}

function pause(on) {
  if (on) {
    G.mode = 'paused';
    fillJobs();
    buildTabBar();
    applyPauseText();
    showTab(tab);
    $('pause').classList.remove('hidden');
    audio.horn(false);
    audio.engine(0, 0); audio.skid(0);
    radio.suspend();
    saveGarageNow();
  } else {
    G.mode = 'drive';
    last = performance.now();
    $('pause').classList.add('hidden');
    radio.resume();
  }
}

function toMenu() {
  pause(false);
  radio.suspend();
  audio.engine(0, 0);
  G.mode = 'menu';
  G.mission = null;
  G.introUntil = 0;
  introCard.hide();
  hud.setVisible(false);
  $('menu').classList.remove('hidden');
  $('start').textContent = t('menu.drive');
  buildMenu();
  turntable.start();
}

$('start').onclick = startGame;
$('resume').onclick = () => pause(false);
$('mapbtn').onclick = () => { pause(false); openMap(true); };
$('garage').onclick = toMenu;
$('wipe').onclick = () => {
  resetProgress(); G.done = new Set();
  clearGarage();
  garage.reset().setProgress(G.done);
  G.carId = 'ranger';
  tutorial.reset();
  if (G.wallet) G.wallet.set(START_CASH);
  hud.toast('Progression effac\u00e9e', 1600);
  pause(false);
};
$('optLang').onchange = () => {
  applySettings({ ...G.settings, lang: $('optLang').value });
  saveSettings(G.settings);
};
$('optAssist').onchange = () => {
  applySettings({ ...G.settings, assist: $('optAssist').checked });
  saveSettings(G.settings);
};
$('optAudio').onchange = () => {
  applySettings({ ...G.settings, audio: $('optAudio').checked });
  saveSettings(G.settings);
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.mode === 'paused') pause(false);
  // The legend and the language toggle work outside the drive loop too.
  if (e.code === 'Slash' && (G.mode === 'menu' || G.mode === 'paused')) legend.toggle();
});
window.addEventListener('pointerdown', () => audio.resume(), { once: true });
// Parked cars survive a reload, so make sure the last state is written down.
window.addEventListener('beforeunload', () => { if (G.veh) saveGarageNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.veh) saveGarageNow();
});

// Come back in the car you drove last time.
{
  const saved = loadGarage();
  if (saved.carId && CARS.some((c) => c.id === saved.carId)) G.carId = saved.carId;
}
$('optAssist').checked = G.settings.assist;
$('optAudio').checked = G.settings.audio;
$('optLang').value = G.settings.lang;
buildMenu();
turntable.start();
hud.setVisible(false);
requestAnimationFrame(frame);

// Debug hook: lets a console (or a test) step the sim without a live rAF.
window.AYLMER = {
  G, hud, input, garage, radio,
  step(dt = STEP) { if (G.mode === 'drive') { input.update(dt); handleKeys(); tick(dt); stepEnv(dt); input.endFrame(); } },
  render() { if (G.mode === 'drive') render(STEP); },
  teleport(x, z, yaw = 0) { G.veh.reset(x, z, yaw); },
  start: startMission,
  // Debug/screenshot hooks: force a time of day, and read back what the last
  // frame actually drew (see world.js `stats`).
  env(name = 'day') { setEnv(name, true); return name; },
  stats() {
    const w = G.world && G.world.stats;
    return w ? { ...w, drawCalls: G.renderer.stats.draws, rendererTris: G.renderer.stats.tris } : null;
  },
};
