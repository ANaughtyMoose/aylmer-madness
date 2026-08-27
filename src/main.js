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
import { DriveFx, updateRepairs, repairSpotAt, nearestRepair, repairHint, REPAIR, restoreDamage } from './game/damage.js';
import { Traffic } from './game/traffic.js';
import { Hud } from './game/hud.js';
import { loadCarSkin } from './game/carskin.js';
import { Nav, routeLength } from './game/nav.js';
import { buildSky, skyOpts, cloudOpts, cloudModel } from './game/sky.js';
import { BigMap } from './game/bigmap.js';
import { MISSIONS, TIME_OF_DAY } from './game/missions.js';
import { PLACES, resolvePlaces } from './game/places.js';
import { t, KEYMAP } from './game/i18n.js';
import {
  loadSettings, saveSettings, loadMapPrefs, saveMapPrefs, MAP_SIZES,
} from './game/store.js';
import {
  Legend, Tutorial, Loading, IntroCard, keyboardHTML, slotsHTML, wireSlots,
} from './game/ui.js';
// Explicit save slots (save.js) and the options screen (options.js). Between
// them they own every localStorage key the game touches; main.js only asks.
import {
  listSlots, readSlot, deleteSlot, deleteAllSaves,
  mostRecentSlot, lastSlot, saveToSlot, migrateLegacy, hasAnySave,
  fmtPlaytime, fmtWhen, carName, START_MONEY, apronSpot,
} from './game/save.js';
import { QUALITY, applySettings, mountOptions, toggleFullscreen } from './game/options.js';
import { CarTurntable } from './game/turntable.js';
import { Gearbox } from './game/gearbox.js';
import { Garage } from './game/garage.js';
import { Radio } from './game/radio.js';
import { Signals } from './game/signals.js';
// Side jobs: props, the canoe, and the extended stage model. Everything below
// hooks in through G — main.js does not know what a doughnut is.
import { Props, buildPropMeshes, ISLAND, MIKE_TREE } from './game/props.js';
// The reactive world: pedestrians, knock-over street furniture, debris.
import { Reactive } from './game/reactive.js';
import { Wallet } from './game/money.js';
import {
  stageTarget, stageEnter, stageExit, stageStep, stageSettle, missionCleanup,
} from './game/missionkit.js';
// Race agent: AI rivals (race.js), the four races (racejobs.js) and the police
// (cops.js). All three reach in through G; main.js only owns the hook lines.
import { updateRivals } from './game/race.js';
import { Cops, installCopMeshes } from './game/cops.js';
// Story agent: the new-game opener, the always-on guidance lines, the stuck
// detector and the friends' dialogue (story.js), plus the town's opinion of how
// you drive (heckle.js). main.js owns the hook lines; neither file draws or
// steps anything of its own.
import {
  StoryOpener, freeRoamLines, nearestJob, updateStuck, friendLines,
  shortCarName, carArticle,
} from './game/story.js';
import { heckle } from './game/heckle.js';

const STEP = 1 / 60;
// The QUALITY presets live in options.js now, because the options screen can
// override the numbers they seed. Everything that used to read
// QUALITY[G.quality].x each frame reads G.q.x, which applySettings maintains:
// drawDist is the chunk cutoff, fogMul thickens the fog so the cutoff hides in
// it, traffic is the car count (it takes at the next enterDrive).
const CAMS = [
  { name: 'chase', dist: 9.2, height: 3.7, pitch: -0.17, fovAdd: 0 },
  { name: 'close', dist: 6.4, height: 2.9, pitch: -0.15, fovAdd: 0.03 },
  { name: 'far',   dist: 14.5, height: 6.4, pitch: -0.26, fovAdd: -0.03 },
  { name: 'hood',  dist: -0.2, height: 1.55, pitch: -0.04, fovAdd: 0.06 },
];
// feel agent: how long the hood cam takes to swing round when you drop it into
// reverse. Anything under about a fifth of a second reads as a glitch.
const REV_CAM_BLEND = 0.3;

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const input = new Input();
const audio = new Audio();
const hud = new Hud();

const STATS0 = { dist: 0, nearMiss: 0, pedsDived: 0, propsSmashed: 0, bestStreak: 0, streak: 0, airtime: 0, jumps: 0, bigAir: 0, landings: 0, hardest: 0 };
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
  done: new Set(),            // mission ids — from the loaded save, never from localStorage
  time: 0, fps: 60,
  playtime: 0,                // seconds at the wheel in THIS save
  stats: { dist: 0 },
  slot: null,                 // which save slot this session came from / F5 goes to
  nav: null, bigmap: null,
  route: null, routeKey: '', routeTimer: 0, waypoint: null,
  parked: {},           // carId -> {x, z, yaw} for the cars you're not driving
  best: {},             // mission id -> best seconds, from the loaded save
  street: '', streetTimer: 0,
  lookBack: false,
  settings: loadSettings(),   // audio / video / controls / gameplay — see store.js
  mapPrefs: loadMapPrefs(),   // { size: index into MAP_SIZES, range: metres }
  health: {},                 // carId -> 0..100, if the damage model fills it in
  introUntil: 0,              // G.time before which the mission clock is held
  tutoMapOpened: false, tutoJobTaken: false,
  // R3/R4 (driving agent). `health` is damage 0-100 per car for the session;
  // `envKey` is the current TIME_OF_DAY key and `night` is the lights-on flag
  // other systems can read; `fx` owns steam, crumples, lamps and fallen poles.
  envKey: 'day', night: false,
  // Counters other systems may read with optional chaining (G.stats?.airtime).
  stats: { airtime: 0, jumps: 0, bigAir: 0, landings: 0, hardest: 0 },
  camShake: 0,               // hood-cam rattle, decays after a landing
  // feel agent: `repair` is which garage you are sitting in and how long for,
  // `repairHints` remembers which "go get it fixed" toast you have already had,
  // `repairOffer` is the spot offering you an E right now (it owns that key
  // while it is set) and `revBlend` eases the hood cam round into reverse.
  fx: null, repair: { t: 0, key: null }, repairHints: { h25: false, h60: false },
  repairOffer: null, wrenchT: 0, revBlend: 0, towed: false,
  // side-job state: hand-placed props, the canoe, who the camera follows, cash
  props: null, boat: null, focus: null, wallet: null,
  // Progression + the deck. `gearbox` turns road speed into rpm for the engine
  // note (game/gearbox.js); `garage` says which cars you are allowed to drive.
  gearbox: null, garage: null, radio: null,
  // What the reactive world (peds/streetprops/debris) is keeping score of.
  reactive: null, stats: { nearMiss: 0, pedsDived: 0, propsSmashed: 0, bestStreak: 0, streak: 0 },
  // race agent: the friends you are racing, the cars they borrowed, the police
  rivals: [], raceParked: {}, cops: null, ranRed: false,
  hud, audio, input,
  q: { ...QUALITY.med },      // live quality numbers; applySettings owns them
};

const legend = new Legend();
const tutorial = new Tutorial();
const loading = new Loading();
const introCard = new IntroCard();
const story = new StoryOpener();
G.legend = legend;
G.story = story;
G.heckle = heckle;
hud.setRange(G.mapPrefs.range);
// Whose driveway each car lives in.
// Margaret's Saturn lives in the same driveway as your Ranger at 299 Fraser.
const OWNER = {
  ranger: 'home', saturn: 'home', civic: 'steph', sunfire: 'dave',
  // The four beaters live on the lot until somebody buys them, and after that
  // they live in your driveway with everything else.
  cutlass: 'usedlot', cavalier: 'usedlot', caravan: 'usedlot', bus: 'usedlot',
  // The Club's cart. It stays at the golf course whatever you do with it.
  cart: 'golf',
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
// Settings (audio / video / controls / language) are not part of a save: they
// apply the moment you move the slider and live in their own key. This is the
// first of the two calls that put them into effect — the other is onSettings().
onSettings(G.settings);
G.cam = G.settings.cam;
// One-shot: an old localStorage (aylmer.progress / money / best / garage)
// becomes the 'auto' slot, and those keys are never read again.
migrateLegacy();

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
  set('carspick', t('menu.pick'));
  set('start', t('menu.new'));
  set('btnContinue', t('menu.continue'));
  set('btnLoad', t('menu.load'));
  set('btnOptions', t('menu.options'));
  set('btnGarage', t('menu.garageview'));
  set('opttitle', t('opt.title'));
  set('optback', t('menu.back'));
  set('loadtitle', t('menu.load'));
  set('loadback', t('menu.back'));
  set('carshome', t('opt.resetCars'));
  // « Continuer » is only a door if there is something behind it.
  const cont = $('btnContinue'), meta = $('contmeta');
  const recent = mostRecentSlot();
  if (cont) cont.disabled = !recent;
  if (meta) {
    const row = recent ? listSlots().find((r) => r.slot === recent) : null;
    meta.textContent = row
      ? `${row.name || t('save.slot') + ' ' + row.slot} · ${fmtWhen(row.savedAt)}\n` +
        `${carName(row.carId)} · ${row.jobs} ${t('save.jobs')} · ${fmtPlaytime(row.playtime)}`
      : t('save.none');
  }
  const lo = $('btnLoad');
  if (lo) lo.disabled = !hasAnySave();
  const mk = $('menukeys');
  if (mk) {
    mk.innerHTML = KEYMAP.map((k) =>
      `<div class="lrow">${k.caps.map((c) => `<kbd>${c}</kbd>`).join('')}` +
      (k.alt ? `<span class="alt">${k.alt}</span>` : '') +
      `<span class="lab">${t(k.label)}</span></div>`).join('');
  }
}

// `save` is a slot's contents, or null for a new game. It is held across the
// world build so the loading screen does not have to know about it.
function startGame(save = null) {
  if (save && save.carId) G.carId = save.carId;
  if (!garage.has(G.carId, G.done) && !(save && save.unlocks)) G.carId = 'ranger';
  $('menu').classList.add('hidden');
  $('options').classList.add('hidden');
  $('loadscr').classList.add('hidden');

  if (!G.renderer) {
    try {
      G.renderer = new Renderer(canvas);
    } catch (e) {
      $('menuinner').innerHTML = `<h1>Ouch</h1><p class="tag">${e.message}</p>`;
      $('menu').classList.remove('hidden');
      return;
    }
  }
  G.renderer.scale = G.q.scale;
  G.renderer.maxDpr = G.q.dpr;

  if (!G.world) {
    $('start').textContent = t('menu.building');
    turntable.stop();
    // Each stage paints its own label before it runs, so the screen is telling
    // the truth about what is taking the time. The bar animates on the
    // compositor, so it keeps moving even while buildWorld blocks.
    loading.run(worldStages()).then(() => enterDrive(save)).catch((e) => {
      $('menuinner').innerHTML = `<h1>Ouch</h1><p class="tag">${e.message}</p>`;
      $('menu').classList.remove('hidden');
    });
    return;
  }
  turntable.stop();
  enterDrive(save);
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
        // The height field. Hands back a SHARED record { h, nx, ny, nz, kind } —
        // read what you need before calling it again. Anything that only wants
        // the height (traffic, props, the camera) should use groundY.
        groundAt: (x, z) => G.world.groundAt(x, z),
        groundY: (x, z) => G.world.groundAt(x, z).h,
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
      installCopMeshes(r, G.meshes);          // the cruiser + its two light-bar pods
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
      G.reactive = new Reactive(r, G.world);
    }],
    [t('load.ready'), () => {}],
  ];
}

// The one door into the world. `save` is a slot's contents; without one this is
// a new game: every car at its owner's curb, eighty bucks, nothing done.
// Nothing else in the game decides where a car is — that is the whole point of
// the save slots, and why the old aylmer.garage auto-restore is gone.
function enterDrive(save = null) {
  if (save && save.carId) G.carId = save.carId;
  const spec = carById(G.carId);
  G.veh = new Vehicle(spec);
  G.veh.assist = G.assist;
  // Unlocks first — which cars exist at all depends on them — then every car
  // goes to its home spot unless the save says otherwise.
  G.done = new Set(save ? save.progress : []);
  if (!save) garage.reset();
  try { if (save && save.unlocks) garage.restore(save.unlocks); } catch (e) { console.warn('unlocks', e); }
  garage.setProgress(G.done);
  if (!garage.has(spec.id, G.done)) { G.carId = 'ranger'; }
  const home = homeParked(G.carId);
  G.parked = {};
  for (const c of CARS) {
    if (c.id === G.carId) continue;
    const p = (save && save.parked && save.parked[c.id]) || home[c.id];
    if (p) G.parked[c.id] = { x: p.x, z: p.z, yaw: p.yaw };
  }
  G.gearbox = new Gearbox(spec.drive);
  const start = (save && save.parked && save.parked[spec.id]) || home[spec.id] || homeSpot(spec.id);
  G.veh.reset(start.x, start.z, start.yaw);
  G.health = save ? { ...save.health } : {};
  restoreDamage(G.veh, G.health[spec.id] || 0);
  G.repair.t = 0; G.towed = false;
  audio.setEngineProfile(spec.sound);
  // Jobs, records, money, playtime, unlocks: all of it comes out of the save.
  G.done = new Set(save ? save.progress : []);
  G.best = save ? { ...save.best } : {};
  G.playtime = save ? save.playtime : 0;
  // Every counter the systems keep (distance, near misses, streaks, airtime...),
  // zeroed for a new game and overlaid with whatever the save recorded.
  G.stats = { ...STATS0, ...((save && save.stats) || {}) };
  G.slot = save ? (save.slot || null) : null;
  try { if (save && save.unlocks) G.garage?.restore?.(save.unlocks); } catch (e) { console.warn('unlocks', e); }
  G.waypoint = null; G.route = null; G.routeKey = '';
  G.traffic = new Traffic(G.q.traffic);
  G.traffic.signals = G.signals;
  G.traffic.phys = G.phys;          // so ambient cars sit on the height field too
  // Detailed houses reach HOUSE_NEAR normally; 'low' pulls them in to 140 m,
  // where its thicker fog has already eaten most of the difference.
  G.world.setHouseNear(G.quality === 'low' ? 140 : HOUSE_NEAR);
  G.camYaw = G.veh.yaw + Math.PI;
  G.camPos = [G.veh.x, 4, G.veh.z];
  setEnv(save ? save.timeOfDay : 'day', true);
  G.mission = null;
  G.boat = null; G.focus = null;
  G.rivals = []; G.raceParked = {}; G.ranRed = false;
  if (!G.cops) G.cops = new Cops(); else G.cops.reset();
  hud.setStars(0);
  if (!G.wallet) G.wallet = new Wallet($('money'));
  // Straight onto the field, not through Wallet.set(): the wallet's own
  // localStorage key is legacy scratch now, the save slot is the truth.
  G.wallet.value = save ? save.money : START_MONEY;
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
  $('options').classList.add('hidden');
  $('loadscr').classList.add('hidden');
  hud.setVisible(G.settings.showHud);
  hud.setCar(spec.name);
  hud.setSize(MAP_SIZES[G.settings.mapSize]);
  hud.setRange(G.mapPrefs.range);
  refreshFreeRoam();
  hud.setTimer(null);
  hud.setGear(1);
  hud.toast(save
    ? t('save.loaded') + '\n' + (save.name || '')
    : 'AYLMER, QUÉBEC\nprends ton temps', 2600);
  legend.render();
  G.tutoMapOpened = false; G.tutoJobTaken = false;
  audio.start(); audio.resume();
  radio.resume();
  radio.loadTape().then(() => paintRadio()).catch(() => {});
  paintRadio();
  applySettings(G, G.settings);   // hud size, legend, volumes, fps counter
  // Story agent: the town gets its voice back, and a brand new game gets the
  // four opening cards — once ever, then only from Options > Jeu.
  heckle.bind(G);
  heckle.reset();
  story.hide();
  G.stuck = null;
  if (!save && !G.settings.storySeen) playStory();
}

// ---------------------------------------------------------------- story

// The opener. It owns the keyboard while it is up (see handleKeys), and when it
// is done it drops a waypoint on the nearest job so the very first thing the
// player sees is a blue line going somewhere.
function playStory() {
  story.show(() => {
    if (!G.settings.storySeen) onSettings(saveSettings({ ...G.settings, storySeen: true }));
    const j = nearestJob(G);
    // Only worth a waypoint if it is somewhere else; updateRoute() eats one you
    // are already standing on, and the toast pair reads like a bug.
    if (j && j.dist > 40) {
      G.waypoint = { x: j.place.x, z: j.place.z };
      G.routeKey = '';
      hud.toast('Waypoint \u2014 ' + j.def.title + '\n' + j.place.label, 2600);
      audio.blip(660, 0.1, 'triangle', 0.14);
    }
    refreshFreeRoam();
  });
}

// GOAL A rule: the objective line is NEVER « Free roam ». Off a job it is the
// nearest job you have not done, how far it is and which key takes it — or, if
// you are standing beside a friend's car, that car and the key that takes it.
let freeRoamT = 0;
function refreshFreeRoam(dt = 0) {
  if (!G.veh || G.mission) return;
  freeRoamT -= dt;
  if (dt > 0 && freeRoamT > 0) return;
  freeRoamT = 0.3;
  const l = freeRoamLines(G, garage);
  hud.setObjective(l.text, l.sub);
}

// Two or three lines from whoever's job this is, as bubbles so the name is in
// bold and they stay out of the mission toast's way.
function sayFriend(def, which) {
  if (!def) return 0;
  const lines = friendLines(def.id, which);
  for (const [who, text] of lines) heckle.line(who, text, 3000);
  return lines.length;
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

// Every car's home spot: the ones you have at their owner's kerb (several at one
// address get their own slot along the street, the car you are in first), the
// unsold beaters nose-to-tail on the lot. The save system and « Remettre les
// chars chez eux » both start from this.
function homeParked(currentId = G.carId) {
  const out = {}, slots = {};
  const ids = [currentId, ...CARS.map((c) => c.id).filter((id) => id !== currentId)];
  for (const id of ids) {
    if (!carById(id) || !garage.has(id, G.done)) continue;
    const k = homeKey(id);
    const slot = (slots[k] = (slots[k] || 0) + 1) - 1;
    // The cart parks on the clubhouse apron, not at the kerb — see save.js.
    out[id] = carById(id).park === 'building' ? apronSpot(PLACES[k]) : curbSpot(PLACES[k], slot);
  }
  const sale = garage.forSale();
  for (let i = 0; i < sale.length; i++) if (!out[sale[i]]) out[sale[i]] = lotSpot(PLACES.usedlot, i);
  return out;
}
function homeSpot(id) { return homeParked()[id] || curbSpot(PLACES.home, 0); }

// « Remettre les chars chez eux ». Every car goes back to its owner's curb and
// gets repaired; jobs, money, records and the clock are untouched. This is the
// undo for a night of leaving the Civic in the river.
function resetCarLocations(quiet = false) {
  const home = homeParked();
  G.parked = {};
  for (const c of CARS) {
    if (G.veh && c.id === G.veh.spec.id) continue;
    if (home[c.id]) G.parked[c.id] = { ...home[c.id] };   // cars not lent/bought yet have no spot
  }
  G.health = {};
  if (G.veh) {
    const h = home[G.veh.spec.id] || homeSpot(G.veh.spec.id);
    G.veh.reset(h.x, h.z, h.yaw);
    G.veh.repair();
    G.repair.t = 0; G.towed = false;
  }
  if (!quiet) hud.toast(t('toast.cars.home'), 1800);
  return G.parked;
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
}
// A job that has to put you in one particular car (golfjob.js) uses the same
// swap the E-prompt does, so the car you arrived in stays exactly where it was.
G.swapCar = swapCar;

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
  if (instant || !G.env) { G.env = cloneEnv(t); G.env.fogDensity *= G.q.fogMul; }
}
function stepEnv(dt) {
  const a = G.env, b = G.envTarget, k = Math.min(1, dt * 0.9);
  for (const f of ['sky', 'ground', 'sun', 'lightDir', 'fog']) {
    for (let i = 0; i < a[f].length; i++) a[f][i] = lerp(a[f][i], b[f][i], k);
  }
  a.fogDensity = lerp(a.fogDensity, b.fogDensity * G.q.fogMul, k);
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
  G.stuck = null;
  sayFriend(def, 'start');
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
  G.stuck = null;
  refreshFreeRoam();
}

// cops.js writes a ticket and takes the job with it.
G.failMission = failMission;

function updateMission(dt) {
  const m = G.mission;
  const v = G.veh;
  if (!m) {
    refreshFreeRoam(dt);
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
      // feel agent: a garage in range owns E, so don't offer the swap over it.
      if (carId && Math.abs(v.vLong) < 3 && !G.repairOffer) {
        const c = carById(carId);
        if (!garage.has(carId, G.done)) {
          // On the lot: the same hold/cost shape the yard sale uses, except the
          // thing you are buying drives away.
          const cost = garage.cost(carId);
          const can = garage.canBuy(carId, G.wallet, G.done);
          hud.prompt(`E  \u2014  acheter ${carArticle(carId)} ${shortCarName(carId, c)}   \u00b7   ${cost} $`
            + (can.ok ? '' : `   (${can.why})`));
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
          // Short, gendered car names (story agent) + a spec's own possessive
          // (`whoDe`, qa agent: « Cart de golf du Club » needs none).
          const art = c.who === 'Yours' ? 'ton' : carArticle(carId);
          const de = c.who === 'Yours' ? ''
            : c.whoDe !== undefined ? (c.whoDe ? ' ' + c.whoDe : '')
            : (c.who === 'Le lot' ? '' : ' de ' + c.who.replace("'s", ''));
          hud.prompt(`E  —  prendre ${art} ${shortCarName(carId, c)}${de}`);
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

  // Twenty seconds without twenty metres: the stage's hint comes back and the
  // objective line flashes. It is the same text that has been on screen all
  // along — the point is that you look at it again.
  updateStuck(G, dt, hud);

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
    G.done.add(def.id);
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
    if (record) G.best[def.id] = m.elapsed;
    hud.toast('FINI — ' + def.title + '\n' + fmtTime(m.elapsed) + (record ? '  NOUVEAU RECORD' : '  (record ' + fmtTime(prev) + ')')
      + '\n' + G.done.size + '/' + MISSIONS.length + ' jobs faites', 3800);
    missionCleanup(G, m, false);
    G.mission = null;
    G.introUntil = 0;
    v.passengers = 0;
    setEnv('day');
    hud.setTimer(null);
    G.stuck = null;
    sayFriend(def, 'end');
    refreshFreeRoam();
    autosave('job');   // one of exactly two events that write without being asked
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
    rivals: G.rivals.map((rv) => ({ x: rv.x, z: rv.z, name: rv.name })),
    cops: [...G.cops.units.map((u) => ({ x: u.x, z: u.z })), ...G.cops.blocks.map((b) => ({ x: b.x, z: b.z }))],
    places: Object.values(PLACES).filter((p) => p.label && !/Chemin Fraser|Denise|Bancroft|Vanier/.test(p.label)),
    // feel agent: once it needs fixing, the nearest garage gets a wrench.
    repairs: G.veh && G.veh.damage >= DAMAGE.COSMETIC
      ? [nearestRepair(G.veh, PLACES)].filter(Boolean) : [],
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
  // The story opener owns the keyboard while it is up: E / Enter / Espace turn
  // the page, Escape skips the rest of it.
  if (story.active) {
    if (input.hit('Escape')) story.finish();
    else if (input.hit('Enter', 'KeyE', 'Space')) story.advance();
    G.wantStart = false;
    return;
  }
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
  // R is the radio (it is 2004 and the deck still matters); T is the get-me-out-of-here.
  if (input.hit('KeyT')) { G.veh.recover(); hud.toast('Remis sur le chemin', 1200); }
  if (input.hit('KeyR')) toggleRadio();
  // feel agent: while a garage is offering an E, that key is the garage's and
  // Enter still takes the job — otherwise E is what it always was.
  if (input.hit('Enter') || (input.hit('KeyE') && !G.repairOffer)) G.wantStart = true;
  if (input.hit('KeyQ')) G.wantCycle = true;
  // Mute moved off M so N can cycle the minimap size.
  if (input.hit('Digit0', 'Numpad0', 'F9')) {
    onSettings(saveSettings({ ...G.settings, audio: !G.settings.audio }));
    hud.toast(G.settings.audio ? t('toast.mute.on') : t('toast.mute.off'), 900);
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
  if (v.lastHit > 0.12 && G.settings.rumble) input.rumble(v.lastHit, 90 + v.lastHit * 200);
  v.lastHit = 0;
  G.fx.tick(dt, v, G.world);
  G.health[v.spec.id] = v.damage;

  // feel agent: the clunk when the box drops into R. One tick only.
  if (v.gearClunk) audio.blip(126, 0.085, 'square', 0.20);

  // feel agent: is a garage offering us an E this tick? Computed here, before
  // updateMission runs, because the parked-car swap has to know to keep out of
  // the way and handleKeys has to know not to hand E to the mission runner.
  G.repairOffer = G.mission ? null : repairSpotAt(v, PLACES);

  // ...and the "your car is a mess, here is where they fix it" nagging.
  const hint = repairHint(G.repairHints, v.damage);
  if (hint.toast) hud.toast(hint.toast, 3400);
  hud.setRepairHint(hint.hint);

  // Dead: the job is gone and so is the car, until the flatbed drops it home.
  if (v.damage >= DAMAGE.DEAD && !G.towed) {
    G.towed = true;
    const home = PLACES[OWNER[v.spec.id]];
    // The flatbed is not a charity. If the wallet can stand it, it costs.
    const paid = G.wallet && G.wallet.can(REPAIR.TOW) ? (G.wallet.spend(REPAIR.TOW), true) : false;
    if (G.mission) failMission('Le char est fini. Remorqué.');
    else {
      hud.toast('LE CHAR EST FINI\nRemorquage: ' + REPAIR.TOW + ' $'
        + (paid ? ', pis réparé' : ' — t’es cassé, on te le passe'), 3200);
      audio.chime(false);
    }
    v.reset(home.x, home.z, home.a);
    v.repair();
    G.health[v.spec.id] = 0;
    G.repair.t = 0; G.repair.key = null;
    G.repairHints.h25 = false; G.repairHints.h60 = false;
    hud.setRepairHint(null); hud.setRepairPrompt(null);
  } else if (v.damage < DAMAGE.DEAD) G.towed = false;
}

// feel agent — the three garages: your own driveway (free, ten seconds) and the
// Petro-Canada / Canadian Tire (four seconds, 20 % of the damage in dollars).
// Runs AFTER updateMission so it can see what the mission runner decided, and
// it talks to its own prompt line so it never takes #prompt off anyone.
function updateRepairSpot(dt, v) {
  const press = !!G.repairOffer && input.hit('KeyE');
  const r = updateRepairs(G.repair, dt, v, { places: PLACES, press, wallet: G.wallet });
  hud.setRepairPrompt(G.mission ? null : r.prompt);
  if (r.working) {
    G.wrenchT -= dt;
    if (G.wrenchT <= 0) { G.wrenchT = 0.5 + Math.random() * 0.25; audio.wrench(); }
  } else G.wrenchT = 0;
  if (r.done) {
    v.repair();
    G.health[v.spec.id] = 0;
    G.repairHints.h25 = false; G.repairHints.h60 = false;
    hud.setRepairHint(null);
    hud.toast(r.toast, 2600);
    audio.blip(760, 0.16, 'triangle', 0.18);
  }
}

// Small corner map <-> large corner map. Tab is the third size (full screen).
function cycleMapSize() {
  G.mapPrefs.size = (G.mapPrefs.size + 1) % MAP_SIZES.length;
  hud.setSize(MAP_SIZES[G.mapPrefs.size]);
  saveMapPrefs(G.mapPrefs);
  // The N key and the minimap-size option are one setting.
  G.settings = saveSettings({ ...G.settings, mapSize: G.mapPrefs.size });
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
  // The cart's contactor: it clunks in when the pedal picks up, and that is the
  // only noise an electric drivetrain makes that is not the whine.
  if (v.spec.relay) {
    if (ctl.throttle > 0.05 && !G.relayOn) { G.relayOn = true; audio.blip(v.spec.relay, 0.035, 'square', 0.05); }
    else if (ctl.throttle <= 0.05) G.relayOn = false;
  }
  const preImpact = v.impact;
  v.update(dt, ctl, G.phys);
  // Air and landings. `v.landed` is the vertical speed the springs killed, set
  // for exactly one tick; `v.lastAir` is how long the flight that ended it was.
  if (v.inAir) G.stats.airtime += dt;
  audio.whoosh(v.inAir ? clamp(v.clearance / 2.2, 0, 1) : 0);
  if (v.landed > 0) {
    G.stats.landings++;
    if (v.landed > G.stats.hardest) G.stats.hardest = v.landed;
    audio.land(v.landed);
    G.camShake = Math.min(1, G.camShake + v.landed * 0.09);
    if (v.lastAir > 0.8) {
      G.stats.jumps++;
      if (v.lastAir > G.stats.bigAir) G.stats.bigAir = v.lastAir;
      hud.toast(`${v.lastAir.toFixed(1)} s dans les airs!`, 1500);
    }
  }
  G.camShake *= Math.exp(-4.5 * dt);
  if (inBoat) {
    G.boat.update(dt, { steer: input.steer, throttle: input.throttle, brake: input.brake });
  }
  G.traffic.update(dt, v);
  // Race agent: the friends first (they are ordinary cars), then the police,
  // which read G.traffic.crash from the line above and G.ranRed from last tick.
  updateRivals(G, dt);
  G.cops.update(dt, G);

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
    if (closing > 0) {
      v.hit(closing, contact.nx, contact.nz); v.syncFrame();
      if (closing > 1.4) heckle.say('Voisin', 'parked');    // MON CHAR!
    }
  }
  // Walls, poles, traffic and parked cars have all had their say by now.
  if (v.impact > preImpact + 0.08) audio.crash(v.impact);
  driveHooks(dt, v);
  G.signals.update(dt);
  if (G.signals.playerRanRed(v)) {
    G.ranRed = true;
    hud.toast('T\u2019as br\u00fbl\u00e9 un feu rouge', 1700);
    heckle.say('Chauffeur', 'red');
  }
  updateMission(dt);
  heckle.update(dt, G);

  updateRepairSpot(dt, v);                 // feel agent: after the mission runner
  if (G.props) G.props.update(dt, G);
  if (G.reactive) G.reactive.update(dt, G);
  G.time += dt;
  G.playtime += dt;                       // saved, unlike G.time
  G.stats.dist += Math.abs(v.vLong) * dt;

  G.streetTimer -= dt;
  if (G.streetTimer <= 0) {
    G.streetTimer = 0.4;
    G.street = G.nav.streetName(v.x, v.z);
    hud.setStreet(G.street);
  }
  updateRoute(dt);

  // The gearbox. rpm is not "how fast are you going out of top speed" any more:
  // it is road speed through the real ratios, and the engine note follows it —
  // including the 250 ms clutch dip on every change. See game/gearbox.js.
  // In R the pedal that is driving is S, not W, and reverse is a real gear with
  // its own (very short) ratio — which is what makes backing up whine.
  const gb = G.gearbox;
  const drivePedal = v.reversing ? ctl.brake : ctl.throttle;
  gb.update(dt, v.speedKmh, drivePedal, v.reversing);
  const load = clamp(drivePedal * 0.85 + Math.min(0.2, v.speedKmh / 400), 0, 1);
  audio.engine(gb.rpm, load, v.speedKmh, drivePedal, gb.clutch);
  audio.skid(v.skid);
  hud.setGear(v.reversing ? 'R' : gb.gear);
  radio.update(dt, load, input.down('KeyH') || input.padHorn);

  tutorial.update(dt, {
    speedKmh: v.speedKmh, steer: input.steer, brake: ctl.brake,
    handbrake: ctl.handbrake, mapOpened: G.tutoMapOpened, jobTaken: G.tutoJobTaken,
  });
}

const mm = m4.create();
let fpsAt = 0;
const black = new Float32Array([0, 0, 0]);
const yellow = new Float32Array([1, 0.79, 0.3]);
const white = new Float32Array([1, 1, 1]);

function render(dt) {
  const r = G.renderer, v = G.veh, cam = CAMS[G.cam];
  // The camera follows whatever the current stage put in focus — the car, or the
  // canoe. Anything with x/z/yaw/vLong/vLat/spec works.
  const f = G.focus || v;

  // Chase camera: yaw eases toward the car, and a slide swings it wide.
  // D5: look where you're going. The flip is blended over REV_CAM_BLEND seconds
  // (feel agent) — snapping the hood cam through 180° was the jarring bit.
  const revWant = cam.name === 'hood' && !!f.reversing ? 1 : 0;
  const rate = dt / REV_CAM_BLEND;
  G.revBlend = clamp(G.revBlend + clamp(revWant - G.revBlend, -rate, rate), 0, 1);
  const back = G.settings.invertLook ? !G.lookBack : G.lookBack;   // option: look back by default
  const want = f.yaw + (back ? 0 : Math.PI * (1 - (cam.name === 'hood' ? G.revBlend : 0)))
    - clamp(f.vLat * 0.02, -0.35, 0.35);
  G.camYaw += angleDelta(want, G.camYaw) * Math.min(1, dt * (cam.name === 'hood' || G.lookBack ? 22 : 5.5));
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
  // Short vehicles (the golf cart) get a closer chase cam; long ones (the bus) a farther one.
  const dist = cam.dist * clamp((f.spec ? f.spec.len : 4.5) / 4.5, 0.62, 1.25) + Math.abs(f.vLong) * 0.09;
  const cx = Math.sin(G.camYaw + Math.PI), cz = Math.cos(G.camYaw + Math.PI);
  let px, pz;
  if (cam.name === 'hood') {
    const hd = lerp(cam.dist, -cam.dist - 1.7, G.revBlend);
    px = f.x + fx * hd; pz = f.z + fz * hd;
  } else {
    px = f.x - cx * dist; pz = f.z - cz * dist;
  }
  // The camera rides at the car's own height and never sinks into a berm.
  let py = (f.bodyY || 0) + cam.height + Math.abs(f.vLong) * 0.012;
  if (G.phys && G.phys.groundY) py = Math.max(py, G.phys.groundY(px, pz) + 1.1);
  G.camPos[0] = lerp(G.camPos[0], px, Math.min(1, dt * 9));
  G.camPos[1] = lerp(G.camPos[1], py, Math.min(1, dt * 6));
  G.camPos[2] = lerp(G.camPos[2], pz, Math.min(1, dt * 9));

  const fov = G.q.fov + cam.fovAdd + G.settings.fov
    + clamp(Math.abs(f.vLong) / f.spec.topSpeed, 0, 1) * 0.09;
  // In the air the chase cam leans with the nose, and every landing rattles the
  // hood cam for a moment. Both are small on purpose — they read, they don't spin.
  let camPitch = cam.pitch;
  if (f.inAir) camPitch += clamp(-f.pitch * 0.45, -0.22, 0.22);
  if (G.camShake > 0.002) {
    const k = G.camShake * (cam.name === 'hood' ? 0.10 : 0.045);
    camPitch += Math.sin(G.time * 61) * k;
  }
  r.setEnvironment(G.env);
  r.begin(G.camPos, G.camYaw, camPitch, fov);

  m4.compose(mm, G.camPos[0], 0, G.camPos[2], 0, 0, 0);
  r.draw(G.sky.mesh, mm, skyOpts(G.env));
  if (G.quality !== 'low') r.draw(G.sky.clouds, cloudModel(mm, G.camPos, r.time), cloudOpts(G.env));
  m4.identity(mm);
  r.draw(G.world.distant, mm, { fogMul: 0.28 });
  G.world.draw(r, mm, f.x, f.z, G.q.drawDist, dt);
  G.signals.draw(r, f.x, f.z);

  drawCar(v.spec, v.x, v.z, v.yaw, v.pitch, v.roll, v.spin, v.steer, null, v.passengers, v.bodyY, v.gh);
  const night = nightAmount(G.env);
  if (night > 0.35 && G.meshes.cones[v.spec.id]) {
    coneOpts.alpha = 0.15 * night;
    m4.compose(mm, v.x, v.bodyY, v.z, v.yaw, 0, 0);
    r.draw(G.meshes.cones[v.spec.id], mm, coneOpts);
  }
  for (const t of G.traffic.cars) {
    if (Math.hypot(t.x - v.x, t.z - v.z) > 320) continue;
    drawCar(t.spec, t.x, t.z, t.yaw, 0, 0, t.spin, 0, t.tint, t.y || 0, t.y || 0);
  }
  for (const id of Object.keys(G.parked)) {
    const p = G.parked[id];
    if (Math.hypot(p.x - v.x, p.z - v.z) > 320) continue;
    drawCar(carById(id), p.x, p.z, p.yaw, 0, 0, 0, 0, null, 0, G.phys.groundY(p.x, p.z), G.phys.groundY(p.x, p.z));
  }
  for (const rv of G.rivals) {                     // race agent: the friends
    const c = rv.veh;
    if (Math.hypot(c.x - v.x, c.z - v.z) > 400) continue;
    drawCar(rv.spec, c.x, c.z, c.yaw, c.pitch, c.roll, c.spin, c.steer, null, 1, c.y);
  }
  G.cops.draw(G, drawCar);                          // ...and the police
  if (G.props) G.props.draw(r, f);
  if (G.reactive) G.reactive.draw(r, f, QUALITY[G.quality].drawDist);
  drawMarkers();
  if (G.fx) G.fx.render(v, G.world, G.night, G.traffic.cars);

  r.end();

  if (G.settings.showFps) {
    fpsAt -= dt;
    if (fpsAt <= 0) { fpsAt = 0.25; const e = $('fps'); if (e) e.textContent = Math.round(G.fps) + ' fps'; }
  }
  hud.setSpeed(f.speedKmh);
  hud.setDamage(v.damage);
  hud.setReverse(v.reversing);
  hud.draw({
    x: f.x, z: f.z, yaw: f.yaw,
    targets: markerList(),
    traffic: G.traffic.cars,
    rivals: G.rivals,
    cops: G.cops.units,
    route: G.route,
  });
}

function drawCar(spec, x, z, yaw, pitch, roll, spin, steer, tint, passengers, y = 0, gy = 0) {
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

  // The blob shadow stays on the ground and spreads out as the car climbs away
  // from it, which is most of what sells a jump.
  const lift = clamp(y - gy, 0, 4);
  const k = 1 + lift * 0.13;
  m4.compose(mm, x, gy + 0.06, z, yaw, 0, 0, (spec.wid + 0.5) * k, 1, (spec.len + 0.4) * k);
  r.draw(G.meshes.shadow, mm, { alpha: 0.3 * (1 - lift / 5), unlit: true, colorMul: black });
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

const TABS = [
  ['jobs', 'pause.tab.jobs'], ['save', 'pause.tab.save'],
  ['opt', 'pause.tab.opt'], ['keys', 'pause.tab.keys'],
];
let tab = 'jobs';
let pauseOpts = null;   // the mounted options panel inside the pause menu

function showTab(which) {
  tab = which;
  for (const [id] of TABS) {
    const pane = $('tab' + id);
    if (pane) pane.classList.toggle('hidden', id !== which);
  }
  const bar = $('ptabs');
  if (bar) for (const b of bar.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === which);
  if (which === 'keys') { const el = $('tabkeys'); if (el) el.innerHTML = keyboardHTML(); }
  if (which === 'save') buildSaveTab();
  if (which === 'opt') pauseOpts = mountOptions($('tabopt'), optionsCtx());
}

function buildTabBar() {
  const bar = $('ptabs');
  if (!bar) return;
  bar.innerHTML = TABS.map(([id, key]) =>
    `<button class="tab${id === tab ? ' on' : ''}" data-tab="${id}">${t(key)}</button>`).join('');
  for (const b of bar.querySelectorAll('.tab')) b.onclick = () => showTab(b.dataset.tab);
}

// ---- saves -------------------------------------------------------------

// The pause menu's Sauvegarde tab: write into 1/2/3, load or delete any of the
// four. This is the only thing in the game that writes a save on purpose,
// besides F5 and the two autosave events.
function buildSaveTab() {
  const el = $('tabsave');
  if (!el) return;
  el.innerHTML = slotsHTML(listSlots(), 'save');
  wireSlots(el, {
    save: (slot) => { saveInto(slot); buildSaveTab(); },
    load: (slot) => loadIntoGame(slot),
    del: (slot) => { deleteSlot(slot); hud.toast(t('save.deleted'), 1200); buildSaveTab(); },
  });
}

// A name you can recognise in the list: the street you stopped on.
function saveName() {
  return (G.street || carName(G.carId) || '').toString().slice(0, 40);
}

function saveInto(slot) {
  const snap = saveToSlot(G, slot, { name: saveName() });
  if (!snap) { hud.toast(t('save.failed'), 1600); return null; }
  G.slot = slot;
  hud.toast(t('save.saved') + '\n' + (slot === 'auto' ? t('save.autoslot') : t('save.slot') + ' ' + slot)
    // A slot carries jobs FINISHED, not a job in progress. Saying so beats
    // finding out after the load, which is how it used to go.
    + (G.mission ? '\n(la job en cours est pas sauvegardée)' : ''), G.mission ? 2600 : 1500);
  audio.blip(720, 0.12, 'triangle', 0.16);
  return snap;
}

// F5: into the slot you used last (never the autosave), '1' the first time.
function quickSave() {
  const slot = (G.slot && G.slot !== 'auto') ? G.slot : (lastSlot() || '1');
  const snap = saveInto(slot);
  if (snap && G.mode === 'paused') buildSaveTab();
  return snap;
}

// Autosave writes ONE slot and only on the events the options screen promises:
// a job finished, and a car bought / unlocked (PROGRESS calls G.autosave).
function autosave(reason) {
  if (!G.settings.autosave || !G.veh || G.mode === 'menu') return null;
  const snap = saveToSlot(G, 'auto', { name: saveName() });
  if (snap) console.log('autosave:', reason);
  return snap;
}
G.autosave = autosave;

function loadIntoGame(slot) {
  const save = readSlot(slot);
  if (!save) return null;
  save.slot = slot;
  $('loadscr').classList.add('hidden');
  if (!G.world) { startGame(save); return save; }
  pause(false);
  enterDrive(save);
  return save;
}

// The main menu's « Charger » screen: same rows, read-only plus Delete.
function openLoadScreen(on) {
  const scr = $('loadscr');
  if (!scr) return;
  if (!on) { scr.classList.add('hidden'); return; }
  const body = $('loadbody');
  const draw = () => {
    body.innerHTML = slotsHTML(listSlots(), 'load');
    wireSlots(body, {
      load: (slot) => loadIntoGame(slot),
      del: (slot) => { deleteSlot(slot); draw(); applyMenuText(); },
    });
  };
  draw();
  scr.classList.remove('hidden');
}

// ---- options -----------------------------------------------------------

// Everything the options panel is allowed to do to the game, in one object, so
// the main-menu copy and the pause-menu copy behave identically.
function optionsCtx() {
  return {
    get: () => G.settings,
    onChange: onSettings,
    actions: {
      fullscreen: () => toggleFullscreen(),
      tutorial: () => { tutorial.reset(); hud.toast(t('toast.tutorial'), 1400); },
      story: () => {
        openOptions(false);
        if (G.mode === 'paused') pause(false);
        if (G.mode === 'drive') playStory();
      },
      resetCars: () => { if (G.veh) resetCarLocations(); },
      wipeSaves: () => {
        deleteAllSaves();
        G.slot = null;
        hud.toast(t('toast.wiped'), 1600);
        applyMenuText();
        if (G.mode === 'paused') buildSaveTab();
      },
    },
  };
}

// One place where a settings change reaches the running game. applySettings()
// does the renderer / audio / hud half; the rest is this file's own chrome.
function onSettings(s) {
  const { langChanged } = applySettings(G, s);
  if (G.world) G.world.setHouseNear(s.quality === 'low' ? 140 : HOUSE_NEAR);
  if (langChanged) {
    applyMenuText();
    applyPauseText();
    if (G.mode === 'menu') buildMenu();
    if (G.mode === 'paused') {
      buildTabBar();
      fillJobs();
      if (tab === 'keys') { const el2 = $('tabkeys'); if (el2) el2.innerHTML = keyboardHTML(); }
      if (tab === 'save') buildSaveTab();
    }
    legend.render();
    if (!G.mission && G.mode === 'drive') refreshFreeRoam();
  }
}

function openOptions(on) {
  const scr = $('options');
  if (!scr) return;
  if (!on) { scr.classList.add('hidden'); return; }
  mountOptions($('optbody'), optionsCtx());
  scr.classList.remove('hidden');
}

function applyPauseText() {
  const set = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
  set('pausetitle', t('pause.title'));
  set('resume', t('pause.resume'));
  set('mapbtn', t('pause.map'));
  set('garage', t('pause.menu'));
  set('carshome', t('opt.resetCars'));
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
  } else {
    G.mode = 'drive';
    last = performance.now();
    $('pause').classList.add('hidden');
    radio.resume();
    hud.setVisible(G.settings.showHud);
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
  hud.setRepairPrompt(null); hud.setRepairHint(null);   // feel agent: they live outside #hud
  $('menu').classList.remove('hidden');
  buildMenu();
  applyMenuText();
  turntable.start();
}

// ---- wiring ------------------------------------------------------------

$('start').onclick = () => startGame(null);                 // a new game: everybody home, $80
$('btnContinue').onclick = () => {
  const slot = mostRecentSlot();
  if (slot) loadIntoGame(slot);
};
$('btnLoad').onclick = () => { if ($('btnLoad').disabled) return; openLoadScreen(true); };
$('loadback').onclick = () => openLoadScreen(false);
$('loadback2').onclick = () => openLoadScreen(false);
$('btnOptions').onclick = () => openOptions(true);
$('optback').onclick = () => openOptions(false);
$('optback2').onclick = () => openOptions(false);
$('resume').onclick = () => pause(false);
$('mapbtn').onclick = () => { pause(false); openMap(true); };
$('garage').onclick = toMenu;
$('carshome').onclick = () => { resetCarLocations(); pause(false); };
window.addEventListener('keydown', (e) => {
  // Escape is read in two places — here, and in handleKeys() once we are back
  // in 'drive'. Whoever acts on it has to consume it, or the next frame sees
  // the same press and puts the menu straight back up.
  if (e.code === 'Escape' && G.mode === 'paused') { pause(false); input.consume('Escape'); }
  if (e.code === 'Escape' && !$('options').classList.contains('hidden')) { openOptions(false); input.consume('Escape'); }
  if (e.code === 'Escape' && !$('loadscr').classList.contains('hidden')) { openLoadScreen(false); input.consume('Escape'); }
  // F5 is a quick save, not a reload — the browser's own F5 is in the way.
  if (e.code === 'F5' && (G.mode === 'drive' || G.mode === 'paused')) { e.preventDefault(); quickSave(); }
  // The legend and the language toggle work outside the drive loop too.
  if (e.code === 'Slash' && (G.mode === 'menu' || G.mode === 'paused')) legend.toggle();
});
window.addEventListener('pointerdown', () => audio.resume(), { once: true });

// Come back in the car the most recent save was in, so the menu highlights it.
{
  const recent = mostRecentSlot();
  const save = recent ? readSlot(recent) : null;
  if (save && CARS.some((c) => c.id === save.carId)) G.carId = save.carId;
}
buildMenu();
applyMenuText();
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
  // Save-system hooks, so a test (or a console) can drive the slots without
  // reaching into the DOM. The buttons call exactly the same functions.
  save: (slot) => saveInto(slot),
  quickSave,
  load: (slot) => loadIntoGame(slot),
  slots: () => listSlots().map(({ save, ...row }) => row),
  resetCars: () => resetCarLocations(),
  settings: (patch) => { onSettings(saveSettings({ ...G.settings, ...(patch || {}) })); return G.settings; },
  // Debug/screenshot hooks: force a time of day, and read back what the last
  // frame actually drew (see world.js `stats`).
  env(name = 'day') { setEnv(name, true); return name; },
  // Story agent: the opener, the guidance line and the heckles.
  story, heckle,
  freeRoam: () => freeRoamLines(G, garage),
  playStory,
  // Race agent: what the tests poke at.
  cops: () => G.cops,
  rivals: () => G.rivals,
  heat(v) { if (v != null) G.cops.heat = v; return G.cops.heat; },
  stats() {
    const w = G.world && G.world.stats;
    return w ? { ...w, drawCalls: G.renderer.stats.draws, rendererTris: G.renderer.stats.tris } : null;
  },
};
