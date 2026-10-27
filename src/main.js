import { buildSpare, buildSpareAnchor, buildChainLink, stepSpare, drawSpare } from './game/spare.js';
import { speedFraction } from './game/speeds.js';
import { FortierChase, installFortierMeshes, svxHome } from './game/fortier.js';
const fortier = new FortierChase();
import { fraserParking } from './game/homeparking.js';
import { remainingRoute } from './game/routeprogress.js';
import { Cinematic, missionClock } from './game/cinematic.js';
// [opening] The new-game opening: titles, crawl, the dawn flight and the name cards.
import { Opening, gateText, filmFor } from './game/intro/opening.js';
import { fraserPoint, FRASER } from './game/fraser.js';
// Aylmer Madness — boot, game loop, camera, mission runner.
import { Renderer } from './core/gl.js';
import { HOURS } from './prototype/daylight.js';
import { applyRecordedWeather } from './prototype/calendar-clock.js';
// The visual wave's seams (docs/visual-wave/PLAN.md 3.3): the environment and
// its clock, the per-frame look hooks render() and tick() call, and the flags.
import * as envc from './game/look/envcycle.js';
import { setEnv, setCycleEnv, stepEnv } from './game/look/envcycle.js';
import * as look from './game/look/frame.js';
import { lookApi } from './game/look/flags.js';
import { advLight } from './game/look/advlight.js';
import { createFpsWatch, lightPromptSuppressed, lightWatchArmed, lightOffSettings, lightKeepSettings, LightPrompt } from './game/look/lightwatch.js';   // W8-LIGHTAUTO
const VISUAL_PROTOTYPE = typeof document !== 'undefined' && document.documentElement.dataset.prototype === '2004';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { MeshBuilder, rgb } from './core/mesh.js';
import { m4, clamp, lerp, angleDelta } from './core/math.js';
import { buildHeadlights, nightAmount, HOUSE_NEAR } from './game/world.js';
import { buildSectors } from './game/sectors.js';
import { missionNotificationAllowed, landingRepairHintMuted, crashShowQuiet } from './game/mission-notifications.js';
import { installLandmarks } from './game/landmarks.js';   // landmarks hook (agent/landmarks)
import { primeSignage } from './game/signage.js';         // landmarks hook (agent/landmarks)
import { loadMaterials } from './game/materials.js';
import MATS_STUB from './game/materials_stub.js';
import { CARS, carById, carPlaces, Vehicle, buildCarBody, buildWheel, buildHead, buildShadow, DAMAGE } from './game/cars.js';
import { asBody, collideCars, driftBody, contact } from './game/collide.js';
import { DriveFx, updateRepairs, repairSpotAt, nearestRepair, repairHint, REPAIR, restoreDamage } from './game/damage.js';
import { Traffic } from './game/traffic.js';
// [vehicles] The two buses and the two bicycles. Importing this registers them
// in CARS, in the garage and in the save slots; the three call sites tagged
// [vehicles] below are everything else main.js has to know about them.
import { vehicleTick, drawVehicleExtras } from './game/vehicles.js';
// One owner table for every car, the SVX included (architecture F2).
import { homeKey, homeOf as homeOfIn, curbSpot, lotSpot, nextFreeSlot, offerFor, offerableParked } from './game/homes.js';
import { Hud } from './game/hud.js';
import { loadCarSkin } from './game/carskin.js';
import { Nav } from './game/nav.js';
import { buildSky, skyOpts, cloudOpts, cloudModel } from './game/sky.js';
import { BigMap } from './game/bigmap.js';
import { MISSIONS, ALL_MISSIONS, unlockArc, nextMission, missionAvailable, missionLockReason, availableMissions, storyProgress } from './game/missions.js';
// The restructure (29 Sept 2026): the finale id, and the quiet streets counter.
import { FINALE } from './game/campaign.js';
import { noteStreet, streetsLine } from './game/streets.js';
// ---- S4-SUMMER (begin): pacing, sleep, summer-end screen ----
import * as summer from './game/summer.js';
// ---- S4-SUMMER (end) ----
// No query string on this import. A `?v=` suffix makes the browser treat the
// file as a second, separate module: PLACES forks into two objects, only one of
// them ever meets resolvePlaces(), and every mission target silently stops being
// snapped to the road. Cache-bust index.html, never a module the game shares.
import { PLACES, resolvePlaces } from './game/places.js';
import { QUEBEC_POIS } from './game/quebec_pois.js';
import { MAP } from './game/mapdata.js';
import { t, KEYMAP } from './game/i18n.js';
import {
  loadSettings, saveSettings, loadMapPrefs, saveMapPrefs, MAP_SIZES,
} from './game/store.js';
import {
  Legend, Tutorial, Loading, keyboardHTML, slotsHTML, groupsHTML, wireSlots,
  setModal, syncModal, onModal, modalOpen,
} from './game/ui.js';
// Explicit save slots (save.js) and the options screen (options.js). Between
// them they own every localStorage key the game touches; main.js only asks.
import {
  listSlots, listGroups, readSlot, deleteSlot, deleteAllSaves,
  mostRecentSlot, continueSlot, lastSlot, saveToSlot, migrateLegacy, hasAnySave,
  fmtPlaytime, fmtWhen, carName, START_MONEY, apronSpot,
  CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, DEFAULT_TARGET,
  characterById, slotCharacter, slotNumber,
} from './game/save.js';
// Hooks the save agent's branch adds to save.js (onSaveFailure, storageHealth,
// resumeStage). Read through the namespace so this file links and runs whether
// or not they exist yet; every use below is feature-checked.
import * as saveExtras from './game/save.js';
import { QUALITY, applySettings, mountOptions, toggleFullscreen } from './game/options.js';
import { CarTurntable } from './game/turntable.js';
import { Gearbox } from './game/gearbox.js';
import { Garage } from './game/garage.js';
import { Radio } from './game/radio.js';
import { RecordedRadio } from './game/recorded-radio.js';
import { fetchLocalLibrary } from './game/radio-local.js';
import { Signals } from './game/signals.js';
// Side jobs: props, the canoe, and the extended stage model. Everything below
// hooks in through G — main.js does not know what a doughnut is.
import { Props, buildPropMeshes, ISLAND, MIKE_TREE } from './game/props.js';
// The reactive world: pedestrians, knock-over street furniture, debris.
import { Reactive } from './game/reactive.js';
// Avatars agent: the friends who are real people. See the hook in render().
import { Avatars } from './game/avatars.js';
import { Wallet } from './game/money.js';
import {
  stageTarget, stageEnter, stageExit, stageStep, stageSettle, missionCleanup,
  missionStyleBonus,
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
import { heckle, toastLive } from './game/heckle.js';
// Shell agent: the sky. weather.js owns the state machine, the rain overlay,
// the wet road and the thunder; main.js owns the four hook lines that feed it
// (tint the env, scale the spec, step it, silence it in a menu).
import { Weather } from './game/weather.js';
// ...and the written flavour: loading-screen tips, the pause screen's quiet
// line, and the achievements. All of it out of assets/text/ui.json, all of it
// optional — see game/flavour.js.
import { flavour } from './game/flavour.js';
// [w6-shortcuts] C-06: the import alone registers the gate pairs when modes.js has registerMode.
import * as shortcuts from './game/shortcuts.js';

// hangout agent: 129 Frank-Robinson after dark (see the hook block in tick()).
import { hangout } from './game/hangout.js';
// The spine (Wave 2a): the calendar, the envelope, gas, and the endings.
import * as calendar from './game/calendar.js';
import * as fuel from './game/fuel.js';
import * as tow from './game/tow.js';
import { prepareForJob, ensureOwnVehicle } from './game/jobready.js';
import { refundJob, restartCostsDay, payText, failCostsDay, courseTime } from './game/missionkit.js';
// A-03: a failed job is a gag and a free retry (game/retry.js, wired by A-06).
// [w7-replay] medals, records, une autre run (specs C-02a, C-02b).
import * as replay from './game/replay.js';
// [w7-crashnight] crash replay (C-12 small) and Crash Night (C-04).
import { crashReplay } from './game/crashreplay.js';
import { installCrashNight } from './game/crashnight.js';
import * as modesNs from './game/modes.js';
import * as ghost from './game/ghost.js';
import { jobMedalNote, resultLine as medalLine, eyebrow as medalEyebrow, thresholdsFor as medalThresholds } from './game/medals.js';
import { offerRetry, tickRetry, applyRetry, cancelRetry, loadFails, storyFail, failSpendsDay, setFailToast, failToast, clearFailToast } from './game/retry.js';
// B-09: trauma shake and a capped hitstop on an event ladder (wired by B-12a).
import { createFeel, kindForImpact } from './game/feel.js';
import { StoryOpener as EndingCards, endingCards } from './game/story.js';
// Wave 3: races that interrupt, and skills that improve with use.
import * as ambush from './game/ambush.js';
import * as skills from './game/skills.js';
import { createSpecStack } from './game/specstack.js';
// The driver's seat (BACKLOG C6). CAMS lives in there so a node suite can
// assert on the camera list without importing this file, which touches
// `document` on line one.
import { CAMS, DRIVER_NEAR, Cockpit, hasCockpit } from './game/cockpit.js';
// The boom does not go through walls any more (playtest). Pure and testable,
// so tools/smoke_camclip.mjs can drive it against a fake world.
import { makeClip, clipCamera, guardView, recordCameraFrame, camClipStats, sideView } from './game/camclip.js';

const STEP = 1 / 60;
// One complete morning -> day -> dusk -> night loop in real-time seconds.
const DAY_NIGHT_CYCLE = 10 * 60;
const DAY_KEYS = ['morning', 'day', 'dusk', 'night'];
// Not four equal quarters. A July day in the valley is mostly day, the sun goes
// down over the river in a hurry, and the night is long enough to be worth
// having headlights for. These are the fraction of the loop each phase owns.
const DAY_WEIGHT = [0.16, 0.40, 0.13, 0.31];
// The start of each phase, as a fraction of the loop. save.js stores a phase by
// NAME and the debug hook takes one, so this table is how a name becomes a time.
const DAY_PHASE = (() => {
  const out = {};
  let acc = 0;
  for (let i = 0; i < DAY_KEYS.length; i++) { out[DAY_KEYS[i]] = acc; acc += DAY_WEIGHT[i]; }
  return out;
})();
// How much of a phase is spent AT that phase's colours before the blend into
// the next one starts. Without this the cycle was a permanent crossfade and the
// sky was never once actually the daylight in TIME_OF_DAY.day.
const DAY_HOLD = 0.45;
// Turning a phase NAME into a clock reading. It lands a quarter of the way into
// the phase, not on its edge: DAY_HOLD means a quarter of the way in is still
// exactly that phase's own colours, and sitting on the boundary means one
// float's worth of rounding puts you in the phase BEFORE the one you asked for.
// (0.16 * 600 / 600 is 0.15999999999999992, which is not 0.16. It cost an
// afternoon.) save.js stores the phase by name, so this is the road back in.
function phaseClock(name) {
  if (VISUAL_PROTOTYPE) return (HOURS[name] ?? 13) / 24 * DAY_NIGHT_CYCLE;
  const i = Math.max(0, DAY_KEYS.indexOf(name));
  return (DAY_PHASE[DAY_KEYS[i]] + DAY_WEIGHT[i] * 0.25) * DAY_NIGHT_CYCLE;
}
// The QUALITY presets live in options.js now, because the options screen can
// override the numbers they seed. Everything that used to read
// QUALITY[G.quality].x each frame reads G.q.x, which applySettings maintains:
// drawDist is the chunk cutoff, fogMul thickens the fog so the cutoff hides in
// it, traffic is the car count (it takes at the next enterDrive).
// CAMS is imported from game/cockpit.js — the fifth stop is the driver's seat.
// feel agent: how long the hood cam takes to swing round when you drop it into
// reverse. Anything under about a fifth of a second reads as a glitch.
const REV_CAM_BLEND = 0.3;

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const input = new Input();
const audio = new Audio();
const hud = new Hud();

const STATS0 = { crashes: 0, dist: 0, nearMiss: 0, pedsDived: 0, propsSmashed: 0, bestStreak: 0, streak: 0, airtime: 0, jumps: 0, bigAir: 0, landings: 0, hardest: 0 };
const G = {
  mode: 'menu',
  carId: 'ranger',
  quality: 'med',
  assist: true,
  cam: 0,
  camYaw: 0, camPos: [0, 5, 0],
  env: null, envTarget: null,
  dayClock: (VISUAL_PROTOTYPE ? 6/24 : DAY_PHASE.day) * DAY_NIGHT_CYCLE,
  world: null, meshes: null, renderer: null,
  veh: null, traffic: null,
  mission: null,
  done: new Set(),            // mission ids — from the loaded save, never from localStorage
  time: 0, fps: 60,
  playtime: 0,                // seconds at the wheel in THIS save
  slot: null,                 // which save slot this session came from / F5 goes to
  // Whose summer this is. A character is not a mid-run swap: picking one starts
  // that person's story from the beginning, in their own slots (save.js).
  character: DEFAULT_CHARACTER,
  // ---- [wave/2b] persisted for 2a, who owns what they mean. `day` is the
  // 0-based index into the 73-day summer, `fuel` is litres (null = the fuel
  // system has not run yet, so the tank is full) and `target` is the envelope.
  day: 0, fuel: null, target: DEFAULT_TARGET,
  // ...and the two beats of the ending: Labour Day has played, and the envelope
  // has been full at least once.
  summerOver: false, reached: false,
  nav: null, bigmap: null,
  route: null, routeKey: '', routeTimer: 0, waypoint: null,
  parked: {},           // carId -> {x, z, yaw} for the cars you're not driving
  best: {},             // mission id -> best seconds, from the loaded save
  street: '', streetTimer: 0,
  lookBack: false,
  settings: loadSettings(),   // audio / video / controls / gameplay — see store.js
  mapPrefs: loadMapPrefs(),   // { size: index into MAP_SIZES, range: metres }
  health: {},                 // carId -> 0..100, if the damage model fills it in
  tutoMapOpened: false, tutoJobTaken: false,
  // R3/R4 (driving agent). `health` is damage 0-100 per car for the session;
  // `envKey` is the current TIME_OF_DAY key and `night` is the lights-on flag
  // other systems can read; `fx` owns steam, crumples, lamps and fallen poles.
  envKey: 'day', night: false,
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
  // Every counter lives in STATS0; enterDrive replaces this with a fresh copy.
  reactive: null, stats: { ...STATS0 },
  // race agent: the friends you are racing, the cars they borrowed, the police
  rivals: [], raceParked: {}, cops: null, ranRed: false,
  hud, audio, input,
  q: { ...QUALITY.med },      // live quality numbers; applySettings owns them
};

const legend = new Legend();
const tutorial = new Tutorial();
const loading = new Loading();
// [w6-opening] W2: the first-launch gate is up (see armGate).
let gateArmed = false;
const clearCinemaInput = () => {
  input.keys.clear(); input.pressed.clear();
  input.steer = input.throttle = input.brake = 0;
  input.handbrake = input.padHorn = false;
  G.wantStart = G.wantCycle = false;
};
const cinema = new Cinematic({ clearInput: clearCinemaInput,
  onHold: () => { audio.horn(false); audio.engine(0, 0); audio.wind(0); audio.skid(0); }
});
const story = new StoryOpener();
G.legend = legend;
// U7: while any modal owns the screen the toast queue freezes, so a message
// does not play out behind a card nobody can see past. The HUD itself is hidden
// by `body.modal` in style.css.
onModal((name) => hud.setModalOpen(!!name));
G.story = story;
G.heckle = heckle;
hud.setRange(G.mapPrefs.range);
// Whose driveway each car lives in: game/homes.js.
const homeOf = (id) => homeOfIn(PLACES, id);

const garage = new Garage(G.done, G.character);
G.garage = garage;
// The sky. Seeded, so a fresh game always opens on the same clear July morning
// and only then starts making its own weather.
const weather = new Weather({ audio, seed: 0x0a17, state: 'clear' });
// Which sheet the car drives (stock, tuned, wet, skilled): one stack, seated
// at load and swap and checked every tick (architecture review E3). The engine
// voice is set from here, once per change of tuned sheet.
const specstack = createSpecStack({
  carById,
  modsOf: (id) => (G.garage ? G.garage.rawMods(id) : null),
  setEngineProfile: (s) => audio.setEngineProfile(s),
});
G.weather = weather;
// The environment and its clock live in game/look/envcycle.js; the clock table
// above stays here (save.js stores phases by name) and is handed over.
envc.install({
  G, weather, prototype: VISUAL_PROTOTYPE,
  cycle: DAY_NIGHT_CYCLE, keys: DAY_KEYS, weight: DAY_WEIGHT, hold: DAY_HOLD,
  // The 2004 calendar: a midnight toasts the new date and autosaves; the last one ends the summer.
  onMidnight: () => { hud.toast(calendar.dayToast(G.day),2800); autosave('midnight'); },
  onEnd: () => runEnding(),
});
G.flavour = flavour;
// « SUCCÈS ». The name is French; the English half of it only shows when the
// slang gloss is on, because that is the one switch for "translate things".
flavour.onUnlock = (a) => {
  hud.toast('SUCCÈS\n' + a.name + (heckle.showGloss && a.how ? '\n' + a.how : ''), 3600);
  audio.chime(true);
};
// AUD-02: index.html plays the real recordings whenever tools/serve.mjs serves
// the private library (--audio-dir), and the synth dial otherwise (the public
// build has no recordings). prototype.html mounts its own library panel.
const localRadio = VISUAL_PROTOTYPE ? [] : await fetchLocalLibrary();
const radio = VISUAL_PROTOTYPE || localRadio.length ? new RecordedRadio(audio) : new Radio(audio);
if (!VISUAL_PROTOTYPE && localRadio.length) {
  radio.addSources(localRadio);
  radio.libraryReady = true;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => radio.persist());
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => radio.setHidden(document.hidden));
}
G.radio = radio;
radio.onChange = paintRadio;
// [opening] game/intro/opening.js owns everything on screen; main.js lends it
// the renderer, the clock, the driveway and what happens after (docs/design/OPENING.md).
const opening = new Opening({
  G, audio, radio, hud, heckle,
  render: (dt) => render(dt),
  groundY: (x, z) => (G.phys && G.phys.groundY ? G.phys.groundY(x, z) : 0),
  setHour: (h, fog) => openingHour(h, fog),
  // The prototype's day carries on from the opening's 6:30; the classic cycle
  // has no hours, so it goes back to the clock enterDrive set. A replay always does.
  restoreClock: (replay) => { if (replay || !VISUAL_PROTOTYPE) G.dayClock = openingClock0; setCycleEnv(true); },
  chasePose: () => openingChasePose(),
  doorstep: () => { const [x, z] = fraserPoint(-2, 6.6); return { x, z, yaw: FRASER.yaw }; },
  anchor: (id) => openingAnchor(id),
  onDone: (kind, o) => openingDone(kind, o),
  // [opening-v2] W1: the cast cards keep their own key (store.js 'aylmer.castseen');
  // this only mirrors the ids for the console and the QA beats (a castSeen
  // setting would be stripped by normalizeSettings).
  markCastSeen: (id) => { (G.castSeen || (G.castSeen = new Set())).add(id); },
  // [opening-v2] W1: the radio comes up at the starter, on the score's audio
  // clock (`at`), not 4 s after control. openingDone keeps a ramp only for a
  // film that never reached the crank (skipped).
  radioUp: (at, secs = 3) => openingRadioUp(at, secs),
});
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

function toggleRadio(nextStation = false) {
  // AUD-02: Shift+R on a radio that is off turns it on, on the next station.
  if (nextStation && !radio.wantOn) radio.power(true);
  const st = nextStation ? radio.nextStation() : radio.toggle();
  hud.toast(st.error || (nextStation
    ? `${st.stationName}${st.wantOn ? '' : ' · OFF'}`
    : st.wantOn ? `${st.stationName}\n${st.track || ''}` : t('radio.off')), 2000);
  paintRadio(st);
}
// Settings (audio / video / controls / language) are not part of a save: they
// apply the moment you move the slider and live in their own key. This is the
// first of the two calls that put them into effect — the other is onSettings().
onSettings(G.settings);
G.cam = G.settings.cam;
// Tab, the arrows and Space belong to the game only while it is driving (or on
// the big map); in the menus they move focus and press buttons (UX review P4).
input.captureNav = () => G.mode === 'drive' || G.mode === 'map';
// One-shot: an old localStorage (aylmer.progress / money / best / garage)
// becomes the 'auto' slot, and those keys are never read again.
migrateLegacy();

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- menu

const turntable = new CarTurntable();
// [opening] the car grid left the title screen (game/intro, opening.css #menumain).
const MENU_CARS = false;

// Deliberately spread-out new-game spawns. They use the same named,
// road-snapped places as missions and the full-screen map, so the pin shown in
// the picker is the exact place the car will appear once the world is built.
// 'sayyad' and the legacy 'steph' are the same house (75 Denise-Friend); the
// list carries the readable key, because it ends up in a data-key attribute.
// The five playable characters' front doors come first: picking a character
// moves the pin to their own house (selectCharacter below), so every one of
// them has to be a start point or the GO button would name a place the map
// cannot show. Zahra shares Sayyad's, so there are four pins for five people.
// (tools/smoke_shell.mjs reads this array out of the source text, so keep the
// commentary outside the brackets.)
const START_POINTS = [
  'home', 'sayyad', 'mike', 'abraham', 'mall', 'beach', 'marina', 'principale',
  'arena', 'deschenes', 'golf', 'heritage',
  'hulldowntown', 'hullmuseum', 'hullcasino', 'hullmall',
  'ottawa', 'chelsea',
];
// The default: your own driveway. It is pre-selected the moment the picker
// opens so the confirm button is never dead on arrival.
const DEFAULT_START = 'home';
const START_MAP_LABELS = {
  home: 'Chez nous', sayyad: 'Chez Sayyad', mike: 'Chez Mike',
  abraham: 'Chez Abraham', mall: 'Galeries d’Aylmer',
  beach: 'Plage des Cèdres',
  marina: 'Marina', principale: 'Vieux-Aylmer', arena: 'Aréna Frank-Robinson',
  deschenes: 'Deschênes', golf: 'Club de golf', heritage: 'Heritage College',
  hulldowntown: 'Vieux-Hull', hullmuseum: 'Musée de l’histoire',
  hullcasino: 'Casino du Lac-Leamy', hullmall: 'Galeries de Hull',
  ottawa: 'Colline du Parlement', chelsea: 'Chelsea',
};
// Where you are allowed to START, and what opens the rest.
//
// Thomas, 2026-09-07: « limit where you can start until you unlock the rest
// (you can still drive there) by winning missions. » Two things that sentence
// says out loud and this table must not break:
//
//   * it is about the PICKER only. Nothing here stops you driving to Chelsea
//     on day one; it stops you BEGINNING there. The GPS, the map, the missions
//     and the sector loader are all untouched.
//   * nothing new is persisted. The set is derived from the progress the save
//     slots already carry (startDone() below), so a fresh character sees the
//     open ones and a finished summer sees all of them, with no extra key.
//
// A value is a list of mission ids and ANY ONE of them opens the point. That is
// not over-engineering: Thomas asked for the beach behind « Suis Sayyad »
// (`suis`), which is Wave 3's missions agent's job and does not exist yet, and
// for Ottawa behind « the first Ottawa job, or if none exists yet, after
// highwayhull too ». Naming both means the row is already right the day the
// new job lands and is not wrong today. `null` means always open.
const START_UNLOCKS = {
  // Your own driveway, and — added at pick time, not here — whichever house the
  // character you chose actually lives in.
  home: null,
  // 75 Denise-Friend is where the poutine goes, and where the doughnuts that
  // wake him up are done. Either one puts you on Denise-Friend for real.
  sayyad: ['sayyad', 'poutine'],
  // The chemin d'Aylmer. « Poutine express » starts at the food court door;
  // « L'alternateur », the first job of the summer, sends you a few hundred
  // metres further up the same road to the Canadian Tire counter. Both have you
  // parked on that street, which is the only thing this table asks.
  mall: ['alternateur', 'arcbache', 'poutine'],
  // « Ramasser la gang » ends at the beach by way of the marina, and the Vieux
  // is the road you take to get there.
  marina: ['gang'],
  principale: ['gang'],
  // Abraham's, until Abraham has a job of his own to earn it with. Placeholder,
  // and the day Wave 3 writes him one this row takes its id.
  abraham: ['gang'],
  // « Suis Sayyad » does not exist yet; « Le canot à 45 piasses » ends on the
  // sand at des Cèdres, so today that is what opens it.
  beach: ['arcbache', 'canot', 'suis'],
  // You have been to 129 Frank-Robinson if you have put his couch in a tree.
  mike: ['divan'],
  arena: ['divan'],
  deschenes: ['curfew'],
  golf: ['golfcart'],
  // Everything across the river opens on the one job that crosses it.
  heritage: ['highwayhull'],
  hulldowntown: ['highwayhull'],
  hullmuseum: ['highwayhull'],
  hullcasino: ['highwayhull'],
  hullmall: ['highwayhull'],
  chelsea: ['chelsea'],
  // Ottawa: `ottawajob` is the id Wave 3 may give the first errand on the far
  // side; until then the 148 to Hull is what gets you there.
  ottawa: ['ottawajob', 'highwayhull'],
  parlement: ['ottawajob', 'highwayhull'],
  chateau: ['ottawajob', 'highwayhull'],
  rideau: ['ottawajob', 'highwayhull'],
  byward: ['ottawajob', 'highwayhull'],
  gallery: ['ottawajob', 'highwayhull'],
};

// The jobs this character has finished, for the picker. The picker only ever
// opens on a NEW game, so G.done is empty there — what it has to read is the
// progress that character's own slots already carry. The union across their
// four slots, because « a save with everything done shows all » should not
// depend on which of your own saves you happened to write last.
function startDone(character = pickedCharacter) {
  const done = new Set(G.done || []);
  try {
    for (const row of listSlots(character)) {
      for (const id of (row.save && row.save.progress) || []) done.add(id);
    }
  } catch { /* no localStorage, no history: everything stays locked but home */ }
  return done;
}

/** Is this start point pickable right now? */
function startOpen(key, done = startDone(), character = pickedCharacter) {
  const rule = START_UNLOCKS[key];
  if (rule === null || rule === undefined) return rule === null;   // no rule: locked, and say so
  if (key === (characterById(character).home || '')) return true;  // your own front door
  return rule.some((id) => done.has(id));
}

/** Why not, in one line, or null. Named after the job so it reads as earned. */
function startLockReason(key, done = startDone(), lang = 'fr') {
  if (startOpen(key, done)) return null;
  const rule = START_UNLOCKS[key] || [];
  // The first rule id that is a job this build actually has. A row naming only
  // jobs that do not exist yet would otherwise print an empty « Finis «  » ».
  const def = rule.map((id) => ALL_MISSIONS.find((m) => m.id === id)).find(Boolean);
  if (!def) return lang === 'en' ? 'Not yet' : 'Pas encore';
  return lang === 'en' ? `Finish “${def.title}”` : `Finis « ${def.title} »`;
}

// ---- [agent/ottawa hook] the downtown Ottawa destinations, from the same
// module that merges the sector. Same block as the addOttawaLandmarks() call
// below; both fold into places.js and main.js's own tables later.
import { addOttawaLandmarks, OTTAWA_STARTS, OTTAWA_START_LABELS } from './game/ottawa.js';
START_POINTS.push(...OTTAWA_STARTS);
Object.assign(START_MAP_LABELS, OTTAWA_START_LABELS);
// Pre-selected, so the picker's GO button is never dead on arrival. The Ottawa
// pushes above happen first, so the default is chosen from the full list.
let pickedStart = DEFAULT_START;
// Whose summer the GO button is about to start. Picking a character is never a
// mid-run swap — it starts that person's story from the beginning, in that
// person's own slots. See save.js and PLAN.md « Playable characters ».
let pickedCharacter = DEFAULT_CHARACTER;
const availableStartPoints = () => START_POINTS.filter((key) => PLACES[key]);
// The list is filtered by PLACES[key] existing, so a typo used to vanish
// silently. Say it out loud instead — once, at boot.
{
  const missing = START_POINTS.filter((key) => !PLACES[key]);
  if (missing.length) console.warn('start points with no place:', missing.join(', '));
}

function drawStartPicker() {
  const c = $('startmap'), g = c.getContext('2d');
  const done = startDone();
  const pts = availableStartPoints().map((key) => ({ key, ...PLACES[key], locked: !startOpen(key, done) }));
  const pad = 260;
  const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minZ = Math.min(...pts.map((p) => p.z)) - pad, maxZ = Math.max(...pts.map((p) => p.z)) + pad;
  const inset = 28, scale = Math.min((c.width - inset * 2) / (maxX - minX), (c.height - inset * 2) / (maxZ - minZ));
  const ox = (c.width - (maxX - minX) * scale) / 2, oz = (c.height - (maxZ - minZ) * scale) / 2;
  const sx = (x) => ox + (x - minX) * scale, sz = (z) => oz + (z - minZ) * scale;
  g.fillStyle = '#1f2a1c'; g.fillRect(0, 0, c.width, c.height);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const road of MAP.roads) {
    if (!road.pts.some(([x, z]) => x >= minX && x <= maxX && z >= minZ && z <= maxZ)) continue;
    g.beginPath(); g.moveTo(sx(road.pts[0][0]), sz(road.pts[0][1]));
    for (let i = 1; i < road.pts.length; i++) g.lineTo(sx(road.pts[i][0]), sz(road.pts[i][1]));
    g.strokeStyle = road.cls === 'primary' || road.cls === 'trunk' ? '#858590' : '#555a61';
    g.lineWidth = Math.max(1, Math.min(5, road.w * scale)); g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 12px Helvetica,Arial,sans-serif';
  pts.forEach((p, i) => {
    const selected = p.key === pickedStart;
    g.beginPath(); g.arc(sx(p.x), sz(p.z), selected ? 11 : 8, 0, Math.PI * 2);
    g.fillStyle = selected ? '#ffc94d' : p.locked ? '#5b6570' : '#e9edf2'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#10171c'; g.stroke();
    g.fillStyle = p.locked && !selected ? '#2a3138' : '#10171c';
    g.fillText(p.locked ? '\u{1F512}' : String(i + 1), sx(p.x), sz(p.z) + .5);
  });

  // Compact labels turn the overview into a readable map instead of making
  // players cross-reference every pin with the list. Try several vertical
  // offsets around crowded clusters and keep every label inside the canvas.
  const used = [];
  g.font = 'bold 10px Helvetica,Arial,sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  for (const p of pts) {
    const label = START_MAP_LABELS[p.key] || p.label;
    const px = sx(p.x), py = sz(p.z), w = Math.ceil(g.measureText(label).width) + 10, h = 16;
    const right = px < c.width * .58;
    const bx = Math.max(3, Math.min(c.width - w - 3, right ? px + 12 : px - w - 12));
    let by = Math.max(3, Math.min(c.height - h - 3, py - h / 2));
    for (const dy of [0, -18, 18, -36, 36, -54, 54, -72, 72]) {
      const candidate = Math.max(3, Math.min(c.height - h - 3, py - h / 2 + dy));
      if (!used.some((b) => bx < b.x + b.w + 3 && bx + w + 3 > b.x && candidate < b.y + b.h + 3 && candidate + h + 3 > b.y)) {
        by = candidate; break;
      }
    }
    used.push({ x: bx, y: by, w, h });
    g.strokeStyle = 'rgba(233,237,242,.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(px + (right ? 7 : -7), py); g.lineTo(right ? bx : bx + w, by + h / 2); g.stroke();
    g.fillStyle = p.key === pickedStart ? 'rgba(255,201,77,.96)'
      : p.locked ? 'rgba(10,15,18,.50)' : 'rgba(10,15,18,.84)';
    g.fillRect(bx, by, w, h);
    g.fillStyle = p.key === pickedStart ? '#10171c' : p.locked ? '#8b949d' : '#f3f5f6';
    g.fillText(label, bx + 5, by + h / 2 + .5);
  }
  c._pickerTransform = { pts, sx, sz };
}

function selectStart(key) {
  // A locked point is not pickable by any route — the list button, the map
  // click and selectCharacter's own default all come through here, so this is
  // the one place that has to hold.
  if (!startOpen(key)) return;
  pickedStart = key;
  for (const el of $('startpoints').children) el.classList.toggle('sel', el.dataset.key === key);
  // Never disabled: something is always picked. The button says where it is
  // about to put you, so pressing it is not a leap of faith.
  const btn = $('startconfirm');
  btn.disabled = false;
  btn.textContent = t('menu.go') + '  \u25b8  ' + (START_MAP_LABELS[key] || PLACES[key].label);
  drawStartPicker();
}

// index.html belongs to the shell agent, so the character strip is built here
// and slotted above the map the first time the picker opens.
function ensureCharRow() {
  if ($('startchars')) return $('startchars');
  const layout = document.querySelector('#startpicker .startlayout');
  if (!layout || !layout.parentNode) return null;
  const wrap = document.createElement('div');
  wrap.id = 'startwho';
  wrap.innerHTML = '<p class="tag">Qui joue? Chaque personnage a son propre été : sa cenne, ses jobs, son 6 septembre.</p>'
    + '<div id="startchars"></div>';
  layout.parentNode.insertBefore(wrap, layout);
  return $('startchars');
}

function selectCharacter(id) {
  pickedCharacter = CHARACTER_IDS.includes(id) ? id : DEFAULT_CHARACTER;
  const row = $('startchars');
  if (row) for (const el of row.children) el.classList.toggle('sel', el.dataset.character === pickedCharacter);
  // Whose summer this is decides which cards the menu shows as owned: Sayyad's
  // Civic is a mission reward for Tom and simply his own car for him.
  garage.setCharacter(pickedCharacter);
  // Their own vehicle, and their own front door. Both are only defaults — the
  // player can still pick any pin on the map afterwards — but opening the
  // picker as Mike and being offered 299 Chemin Fraser in a Ranger was the
  // whole of what « chaque personnage a son propre été » did NOT do.
  const who = characterById(pickedCharacter);
  if (who.car !== G.carId && garage.has(who.car, G.done)) G.carId = who.car;
  buildMenu();
  const door = PLACES[who.home] && availableStartPoints().includes(who.home) ? who.home : pickedStart;
  selectStart(door);
  // Their own front door is unconditionally open, so the list and the map have
  // to be repainted against the new character before anything else is read.
  if (!$('startpicker').classList.contains('hidden')) paintStartPoints();
}

// The list of pins, repainted whenever the answer could have changed — opening
// the picker, and picking a different character (their own front door is open
// and somebody else's is not). Returns the progress set it drew against so the
// caller does not have to compute it twice.
function paintStartPoints() {
  const done = startDone();
  $('startpoints').innerHTML = availableStartPoints().map((key, i) => {
    const why = startLockReason(key, done);
    return `<button class="startpoint${why ? ' locked' : ''}" data-key="${key}"`
      + `${why ? ' disabled aria-disabled="true"' : ''}>`
      + `<b>${why ? '\u{1F512}' : i + 1}</b><span>${PLACES[key].label}`
      + `${why ? `<i class="lockwhy">${why}</i>` : ''}</span></button>`;
  }).join('');
  for (const el of $('startpoints').children) el.onclick = () => selectStart(el.dataset.key);
  return done;
}

function openStartPicker(open) {
  $('startpicker').classList.toggle('hidden', !open);
  if (!open) return;
  $('startpicktitle').textContent = t('menu.pickstart');
  // The rule, said once, where the list is. « tu peux toujours y rouler » is
  // the important half: this locks where you BEGIN, not where you may drive.
  $('startpickhint').textContent = t('menu.pickstart.hint')
    + '\nLes autres points s\u2019ouvrent quand tu finis des jobs. Tu peux toujours y rouler.';
  $('startback').textContent = '\u2190 ' + t('menu.pickstart.back');
  const done = paintStartPoints();
  const chars = ensureCharRow();
  if (chars) {
    chars.innerHTML = CHARACTERS.map((c) =>
      `<button class="startchar" data-character="${c.id}"><b>${c.name}</b>` +
      `<span>${carName(c.car)}</span></button>`).join('');
    for (const el of chars.children) el.onclick = () => selectCharacter(el.dataset.character);
  }
  // The picker is one long panel and the GO button is at the bottom of it. On a
  // 700 px window that used to be below the fold, which is how a player ends up
  // staring at a screen that looks like it does nothing. Pin it.
  installSkin();
  // Whatever is picked has to be a point you are allowed to start from, or the
  // GO button would name somewhere the click handler refuses.
  const openKeys = availableStartPoints().filter((key) => startOpen(key, done));
  selectStart(openKeys.includes(DEFAULT_START) ? DEFAULT_START : (openKeys[0] || DEFAULT_START));
  // ...and whoever you were last, which repaints the GO label a second time.
  selectCharacter(pickedCharacter);
  $('startpicker').scrollTop = 0;
  focusFirst($('startconfirm'));
}

// Opening a dialog puts the keyboard (and the pad) on its main action, the way
// the cinematic already does (UX review P4). preventScroll: the picker pins its
// GO button and must not jump.
function focusFirst(el) {
  if (el && el.focus && !el.disabled) { try { el.focus({ preventScroll: true }); } catch { el.focus(); } }
}

// The handful of rules style.css cannot carry, because index.html and style.css
// belong to somebody else this wave: the GO bar sticks to the bottom of the
// picker, the back button stays reachable at the top of it, and the radio's HUD
// line is allowed to wrap — an ad read off assets/text/radio.json is a sentence,
// not a song title. Injected once.
let skinDone = false;
function installSkin() {
  if (skinDone || typeof document === 'undefined') return;
  skinDone = true;
  const el = document.createElement('style');
  el.id = 'shellskin';
  el.textContent = `
/* Keyboard and pad users can see where they are in a menu (UX review P4). */
#menu button:focus-visible,#startpicker button:focus-visible,#pause button:focus-visible,
#options button:focus-visible,#loadscr button:focus-visible{outline:3px solid #ffc94d;outline-offset:2px}
#radio{max-width:min(52vw,660px);flex-wrap:wrap}
#radiotrack{line-height:1.3}
#startpicker{padding-bottom:0}
.startpanel{padding-bottom:96px}
.startpanel .topbar{position:sticky;top:0;z-index:3;padding:6px 0;
  background:linear-gradient(180deg,#12212b 68%,rgba(18,33,43,0))}
#startmap{max-height:52vh}
/* The list scrolls inside its own column, as tall as the map, so the pinned GO
   bar never sits on top of the last start points (it did, on a 1440×900). */
#startpoints{max-height:52vh;overflow:auto;padding-right:4px;padding-bottom:6px;align-content:start}
#startconfirm{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);
  z-index:4;min-width:min(520px,86vw);font-size:19px;letter-spacing:1.6px;
  padding:16px 26px;box-shadow:0 10px 30px rgba(0,0,0,.55),0 0 0 3px rgba(255,201,77,.22)}
@media (max-height:760px){#startmap{max-height:44vh}#startpoints{max-height:44vh}.startpanel h2{font-size:24px;margin:2px 0}}
#startwho{margin:6px 0 10px}
#startwho .tag{margin:0 0 6px}
#startpickhint{white-space:pre-line}
/* A locked start point: a padlock, the job that opens it in grey, and nothing
   that reads as clickable. pointer-events:none is belt and braces; the
   button is disabled and selectStart() refuses the key as well. */
.startpoint.locked{opacity:.45;cursor:default;pointer-events:none}
.startpoint.locked .lockwhy{display:block;font-style:normal;font-size:11px;
  opacity:.75;letter-spacing:.2px;margin-top:1px}
#startchars{display:flex;gap:8px;flex-wrap:wrap}
.startchar{display:flex;flex-direction:column;align-items:flex-start;gap:2px;
  padding:8px 14px;border-radius:8px;border:2px solid rgba(233,237,242,.22);
  background:rgba(255,255,255,.05);color:#e9edf2;cursor:pointer;font:inherit;text-align:left}
.startchar b{font-size:15px;letter-spacing:.6px}
.startchar span{font-size:11px;opacity:.62}
.startchar.sel{border-color:#ffc94d;background:rgba(255,201,77,.14)}
.savegroups{display:flex;flex-direction:column;gap:14px}
.savegroup{border-top:1px solid rgba(233,237,242,.14);padding-top:8px}
/* The empty slots fade, never the button: starting that character's summer is
   the whole point of the block, and a dimmed button reads as disabled. */
.savegroup.unused .slots{opacity:.5}
.sghead{display:flex;align-items:baseline;gap:10px;margin:0 0 6px;text-align:left}
.sghead b{font-size:17px;letter-spacing:.6px}
.sghead span{font-size:12px;opacity:.6;flex:1}
.sghead .newgame{font-size:12px;padding:5px 12px}`;
  document.head.appendChild(el);
}

// The three words for which wheels a car drives, in the language the rest of
// the card is written in.
const DRIVETRAIN = { fwd: 'Traction', rwd: 'Propulsion', awd: 'Intégrale' };

function buildMenu() {
  const wrap = $('cars');
  wrap.innerHTML = '';
  const cards = [];
  for (const c of CARS) {
    const owned = garage.has(c.id, G.done);
    if (c.hidden && !owned) continue;
    const el = document.createElement('div');
    el.className = 'card' + (c.id === G.carId ? ' sel' : '') + (owned ? '' : ' locked');
    const hex = '#' + c.body.toString(16).padStart(6, '0');
    // The bus is off the end of every one of these scales, so clamp them.
    const bar = (label, v) => {
      const w = Math.round(Math.max(0.04, Math.min(1, v)) * 100);
      return `<div class="bar"><b>${label}</b><u><i style="width:${w}%"></i></u></div>`;
    };
    // Which wheels it drives, for the cars that have declared it (cars.js FEEL).
    // A word, not a bar: it is not more or less of anything, it is a different
    // thing to drive, and it belongs on the card for the same reason the seat
    // count does. Cars with no `feel` block say nothing rather than guess.
    const drivetrain = c.feel && DRIVETRAIN[c.feel.layout]
      ? `<div class="bar"><b>Roues</b><span>${DRIVETRAIN[c.feel.layout]}</span></div>` : '';
    // The turntable canvas replaces the paint swatch when WebGL is available;
    // the body colour stays as a thin stripe so the car is still identifiable.
    const art = turntable.ok
      ? `<canvas class="turn" width="300" height="200"></canvas>` +
        `<div class="stripe" style="background:${hex}"></div>`
      : `<div class="swatch" style="background:${hex}"></div>`;
    const lock = owned ? '' :
      `<div class="lock"><span>\u{1F512}</span>${garage.reason(c.id, G.done, G.settings.lang)}</div>`;
    el.innerHTML = art + lock +
      `<h3>${c.name}</h3><div class="who">${c.who} &middot; ${carPlaces(c)} `
      + `${t(carPlaces(c) === 1 ? 'menu.seat' : 'menu.seats')}</div>` +
      `<div class="who">${Math.round(c.topSpeed * 3.6)} km/h</div>` + bar('Vitesse', speedFraction(c)) +
      bar('Accel', (c.accel - 1.4) / 4.2) +
      bar('Grip', (c.grip - 0.60) / 0.52) +
      drivetrain +
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
  // [w6-opening] W2: on the first-launch gate the button is the one line.
  if (gateArmed) set('start', gateText(G.settings.lang));
  set('btnContinue', t('menu.continue'));
  set('btnLoad', t('menu.load'));
  set('btnOptions', t('menu.options'));
  set('btnEnglish', t('menu.english'));
  set('erratum', t('menu.erratum'));
  set('btnGarage', t('menu.garageview'));
  set('opttitle', t('opt.title'));
  set('optback', t('menu.back'));
  set('loadtitle', t('menu.load'));
  set('loadback', t('menu.back'));
  set('carshome', t('opt.resetCars'));
  // « Continuer » is only a door if there is something behind it.
  const cont = $('btnContinue'), meta = $('contmeta');
  const recent = continueSlot();
  if (cont) cont.disabled = !recent;
  // [w6-opening] W10: with a save, Enter on the menu continues it.
  if (cont && recent && G.mode === 'menu') try { $('btnContinue').focus(); } catch { /* not focusable yet */ }
  if (meta) {
    const row = recent ? listSlots(slotCharacter(recent)).find((r) => r.slot === recent) : null;
    // Three lines, each answering one question: who and when (in the summer,
    // and on the clock), where exactly, what you were doing.
    meta.textContent = row
      ? `${characterById(row.character).name} · ${calendar.label(row.day || 0)} · ${fmtWhen(row.savedAt)}`
        + ` · ${slotNumber(row.slot) === 'auto' ? t('save.autoslot') : t('save.slot') + ' ' + slotNumber(row.slot)}\n`
        + `${carName(row.carId)} · ${row.name || '?'}${row.near ? ', près de ' + row.near : ''}\n`
        + `${row.doing ? 'En cours: ' + row.doing : (row.last ? 'Après \u00ab ' + row.last + ' \u00bb' : 'Libre, pas de job en cours')}`
        + ` · ${row.jobs} ${t('save.jobs')} · ${fmtPlaytime(row.playtime)} · ${Math.round(row.money)} $`
      : t('save.none');
  }
  const lo = $('btnLoad');
  if (lo) lo.disabled = !hasAnySave();
  // [opening] the first run is one door (New Game); the other two open after it.
  {
    const en = G.settings.lang === 'en', seen = !!G.settings.storySeen || hasAnySave();
    const free = $('btnFree'), again = $('btnIntro');
    if (free) { free.hidden = !seen; free.textContent = en ? 'Free roam: start anywhere…' : 'Balade libre : pars d’où tu veux…'; }
    if (again) { again.hidden = !seen; again.textContent = en ? 'Watch the intro again' : 'Revoir l’intro'; }
    document.body.classList.toggle('menu-has-save', !!recent);
  }
  const mk = $('menukeys');
  if (mk) {
    mk.innerHTML = KEYMAP.map((k) =>
      `<div class="lrow">${k.caps.map((c) => `<kbd>${c}</kbd>`).join('')}` +
      (k.alt ? `<span class="alt">${k.alt}</span>` : '') +
      `<span class="lab">${t(k.label)}</span></div>`).join('');
  }
}

let tipTimer = 0;
// `save` is a slot's contents, or null for a new game. It is held across the
// world build so the loading screen does not have to know about it.
// Where the world has to exist first. Raw PLACES coordinates are fine for
// picking a sector; the snapping happens after the bake.
function startXZ(save, startKey) {
  const p = (save && save.parked && save.carId && save.parked[save.carId])
    || (!save && startKey && PLACES[startKey]) || PLACES.home;
  return { x: p.x, z: p.z };
}
// The renderer, made once. Returns the error if WebGL is not there.
function ensureRenderer() {
  if (!G.renderer) {
    try { G.renderer = new Renderer(canvas); } catch (e) { return e; }
  }
  G.renderer.scale = G.q.scale;
  G.renderer.maxDpr = G.q.dpr;
  return null;
}

// ---- [w6-opening] W3: the world bakes from page load ------------------------
// The bake is 7 to 24 s on an Air, and it used to start at the click, so the
// opening vamped over 2D stars waiting for it and Continue sat on the loading
// bar. It now starts as soon as the menu has painted, at the likeliest start
// (the Continue slot's car, else Tom's driveway), with the loading screen
// hidden: the stages are the same worldStages() the click used to run. A start
// that comes before it is done waits on the same promise (startGame, W4).
let prebake = null, worldBaked = false;
function runStages(stages) {
  // As Loading.run: the label first, two frames to paint it, then the work.
  let p = Promise.resolve();
  for (const [label, fn] of stages) {
    p = p.then(() => { loading.stage(label); return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); })
      .then(() => fn());
  }
  return p;
}
function prebakeWorld() {
  if (prebake || G.world) return prebake;
  if (ensureRenderer()) return null;     // no WebGL: startGame says so at the click
  const slot = gateArmed ? null : continueSlot();
  const save = slot ? readSlot(slot) : null;
  G.homeXZ = startXZ(save, null);
  prebake = runStages(worldStages()).then(() => { worldBaked = true; });
  prebake.catch((e) => console.warn('prebake:', e && e.message));
  return prebake;
}
// A start somewhere the bake did not cover (a picked start point across the
// seam, a save in Ottawa): bring that sector in before the car is put there.
function startSector() {
  const S = G.world?.sectors, p = G.homeXZ;
  if (!S || !p || S.has(S.at(p.x, p.z))) return null;
  return prepareLocation(p.x, p.z);
}
// ---- end [w6-opening] W3 ----------------------------------------------------

function startGame(save = null, startKey = null, character = null) {
  // Whose summer this is, before anything reads it. A slot knows; a new game is
  // told by the picker.
  G.character = save && save.character ? save.character
    : (CHARACTER_IDS.includes(character) ? character : (G.character || DEFAULT_CHARACTER));
  G.homeXZ = startXZ(save, startKey);
  if (gateArmed) disarmGate();
  if (save && save.carId) G.carId = save.carId;
  garage.setCharacter(G.character);
  if (!garage.has(G.carId, G.done) && !(save && save.unlocks)) G.carId = characterById(G.character).car;
  $('menu').classList.add('hidden');
  setModal('options', false);
  setModal('load', false);

  const glErr = ensureRenderer();
  if (glErr) {
    $('menuinner').innerHTML = `<h1>Ouch</h1><p class="tag">${glErr.message}</p>`;
    $('menu').classList.remove('hidden');
    return;
  }

  if (!worldBaked) {
    $('start').textContent = t('menu.building');
    turntable.stop();
    // A tip under the progress bar while the world bakes. It rotates on its own
    // timer, because the bake blocks the main thread in long stretches and
    // there is nowhere else to hang it.
    flavour.showTip(heckle.showGloss);
    if (tipTimer) clearInterval(tipTimer);
    tipTimer = setInterval(() => flavour.showTip(heckle.showGloss), 5500);
    // Each stage paints its own label before it runs, so the screen is telling
    // the truth about what is taking the time. The bar animates on the
    // compositor, so it keeps moving even while buildWorld blocks.
    // [w6-opening] W4: the bake page load started is the one we wait on; only
    // without one (no WebGL at load) does the click start it.
    if (!prebake) {
      prebake = runStages(worldStages()).then(() => { worldBaked = true; });
    }
    loading.show();
    prebake.then(() => startSector()).then(() => {
      if (tipTimer) { clearInterval(tipTimer); tipTimer = 0; }
      loading.hide();
      enterDrive(save, startKey);
    }).catch((e) => {
      if (tipTimer) { clearInterval(tipTimer); tipTimer = 0; }
      loading.hide();
      $('menuinner').innerHTML = `<h1>Ouch</h1><p class="tag">${e.message}</p>`;
      $('menu').classList.remove('hidden');
    });
    return;
  }
  turntable.stop();
  // [w6-opening] W4: baked before the click (the usual case now); a start in
  // a sector the bake did not cover brings it in first.
  const far = startSector();
  if (far) { far.then(() => enterDrive(save, startKey)).catch((e) => console.error('start sector', e)); return; }
  enterDrive(save, startKey);
}

// Pending sector meshes get a real render while the loading surface holds the
// simulation. This does not call the chase camera or publish pending queries.
const warmIdentity = m4.identity(m4.create());
function prewarmSectorMesh(mesh, kind, mats) {
  const r = G.renderer;
  // The first world is prepared before enterDrive initializes its environment.
  // Read the current clock without advancing it, then use the same environment
  // setter as a normal frame before begin reads lighting and fog.
  if (!G.env) setCycleEnv(true);
  r.setEnvironment(G.env);
  const x = (mesh.min[0] + mesh.max[0]) / 2, y = (mesh.min[1] + mesh.max[1]) / 2;
  const z = (mesh.min[2] + mesh.max[2]) / 2;
  const reach = Math.min(4000, Math.max(10, ...mesh.max.map((v, i) => v - mesh.min[i])));
  const opts = kind === 'near' || kind === 'far' ? { material: 'building', tex: mats?.tex || null }
    : kind === 'water' ? { water: true }
      : kind === 'night' ? { alpha: 0.3, unlit: true, colorMul: new Float32Array([1, 0.86, 0.63]), additive: !!r.isPrototype }
        : { material: 'world' };
  let submitted = 0, node = null, after, ended = false;
  // Three creates the node in draw and uploads its attributes in end. Its
  // after-render callback proves this mesh reached a real GPU draw, including
  // tiny meshes for which the sky's triangle count could mask a missed draw.
  try {
    r.begin([x, y, z + reach], 0, 0, Math.PI / 2);
    r.draw(mesh, warmIdentity, opts);
    node = r.isPrototype ? mesh.nodes?.[0] : null;
    after = node?.onAfterRender;
    if (node) node.onAfterRender = function (...args) { submitted++; after?.apply(this, args); };
    r.end(); ended = true;
  } finally {
    // A failed draw must still close an elapsed-time query begun by begin.
    if (!ended) { try { r.end(); } catch {} }
    if (node) node.onAfterRender = after;
  }
  if (!r.isPrototype) submitted = r.stats.draws;
  if (!submitted) throw new Error(`Sector ${kind} prewarm did not submit its mesh`);
  return { submitted, triangles: mesh.count / 3 };
}

// Loading.run awaits each stage, including the CPU Worker and admitted uploads.
function worldStages() {
  const r = G.renderer;
  return [
    // The atlas is one 2048² PNG off the network, so this stage is a promise —
    // Loading.run waits for it. If it does not turn up the houses fall back to
    // flat vertex colours and the game still runs.
    [t('load.mats'), () => loadMaterials(r).then((m) => { G.mats = m; }).catch((e) => {
      console.warn('materials: atlas failed to load, falling back to vertex colours:', e.message);
      G.mats = MATS_STUB;
    })],
    [t('load.world'), async () => {
      // One sector — the one the start point is in — is baked here; the
      // others arrive as you drive (sectorTick below).
      G.world = buildSectors(r, G.mats || MATS_STUB, G.homeXZ, { worker: true, prewarm: prewarmSectorMesh });
      await G.world.ready;
      // ---- landmarks hook (agent/landmarks) -------------------------------
      // The hero buildings — Philemon Wright, Heritage, the schools, the two
      // stone inns, the marina, 129 Frank-Robinson — are baked and hung off the
      // world here. installLandmarks wraps world.draw and world.querySegments,
      // so it MUST run before G.phys captures them just below.
      installLandmarks(G.world, r, G.mats || MATS_STUB, { say: (s) => hud.toast(s, 4200) });
      // The 120 hand-written storefront names live in assets/text/, which is a
      // fetch; buildWorld is synchronous, so signage bakes once with the
      // fallback names and this swaps the real atlas in a frame or two later.
      primeSignage(r, G.world.signage);
      // ---- end landmarks hook ---------------------------------------------
      G.phys = {
        roadAt: (x, z) => G.world.roadAt(x, z),
        querySegments: (x, z, rad) => G.world.querySegments(x, z, rad),
        waterAt: (x, z) => G.world.waterAt(x, z),
        queryPoles: (x, z, rad) => G.world.queryPoles(x, z, rad),
        snapPole: (p, ux, uz, speed) => G.world.snapPole(p, ux, uz, speed),
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
        G.meshes.cars[c.id] = r.upload((c.buildBody || buildCarBody)(c));
        G.meshes.wheels[c.id] = r.upload((c.buildWheel || buildWheel)(c));
        G.meshes.cones[c.id] = buildHeadlights(r, c);
      }
      G.meshes.spare={tire:r.upload(buildSpare()),anchor:r.upload(buildSpareAnchor()),link:r.upload(buildChainLink())};
      G.meshes.head = r.upload(buildHead());
      // Photo skins load in the background and replace the lofted models when present.
      G.meshes.skins = {};
      for (const c of CARS) {
        loadCarSkin(r, c).then((skin) => {
          if (skin) { G.meshes.skins[c.id] = skin; console.log(`skin: ${c.id} (${skin.tris} tris)`); }
        }).catch((e) => console.warn('skin failed', c.id, e));
      }
      G.meshes.shadow = r.upload(buildShadow());
      installCopMeshes(r, G.meshes);
      installFortierMeshes(r, G.meshes);          // the cruiser + its two light-bar pods
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
      crashReplay.init({ groundY: (x, z) => G.phys.groundY(x, z) });   // [w7-crashnight]
    }],
    [t('load.ready'), () => {}],
  ];
}

// The one door into the world. `save` is a slot's contents; without one this is
// a new game: every car at its owner's curb, eighty bucks, nothing done.
// Nothing else in the game decides where a car is — that is the whole point of
// the save slots, and why the old aylmer.garage auto-restore is gone.
function enterDrive(save = null, startKey = null) {
  // A load or a new game replaces whatever job was running. Close it first,
  // while G.veh is still the car that job knows about.
  closeMission('quit');
  // A load or a new game starts clean: the old job's toasts (golf night's
  // « Ton Ranger », its narrator line) and shake do not play in the new one
  // (code-review-B1 B-01a).
  hud.clearToasts(); clearFailToast(); G.feelFx.clear();
  G.offer = null; G.wantStart = false; G.wantCycle = false;
  G.lastDone = '';
  fortier.stop();
  fortier.pending=true;
  if (save && save.character) G.character = save.character;
  if (!CHARACTER_IDS.includes(G.character)) G.character = DEFAULT_CHARACTER;
  const who = characterById(G.character);
  // A new game starts in the character's own vehicle. A slot knows better —
  // it remembers what they were driving when they saved.
  if (save && save.carId) G.carId = save.carId;
  else G.carId = who.car;
  garage.setCharacter(G.character);
  const spec = carById(G.carId);
  G.veh = new Vehicle(spec);
  G.veh.carId = spec.id;
  G.veh.assist = G.assist;
  // Unlocks first — which cars exist at all depends on them — then every car
  // goes to its home spot unless the save says otherwise.
  G.done = new Set(save ? save.progress : []);
  G.streets = new Set(save && save.streets ? save.streets : []);
  // A save with no unlocks record is a fresh garage, not whatever the last
  // session left in memory (save review SR-04, belt and braces).
  if (!save || !save.unlocks) garage.reset();
  else try { garage.restore(save.unlocks); } catch (e) { console.warn('unlocks', e); }
  garage.setProgress(G.done);
  // The garage is per-character now, so this is the net that catches a
  // hand-edited save or a character whose car got renamed — never the normal
  // path. Falling back to THEIR car rather than to the Ranger matters: Zahra
  // has no licence and must not be dropped into a pickup truck.
  if (!garage.has(spec.id, G.done)) { G.carId = garage.has(who.car, G.done) ? who.car : 'ranger'; }
  const home = homeParked(G.carId);
  G.parked = {};
  for (const c of CARS) {
    if (c.id === G.carId) continue;
    const p = (save && save.parked && save.parked[c.id]) || home[c.id];
    if (p) G.parked[c.id] = { x: p.x, z: p.z, yaw: p.yaw };
  }
  if (G.parked.dbike && home.dbike && Math.hypot(G.parked.dbike.x-PLACES.home.x, G.parked.dbike.z-PLACES.home.z)<22) {
    G.parked.dbike = { ...home.dbike };
  }
  G.gearbox = new Gearbox(spec.drive);
  // Where the summer starts. The picker's pin wins if there is one (it is
  // pre-set to this character's own house); without one — the debug API, a
  // test, anything that calls enterDrive directly — it is their front door,
  // and only then the car's own parking table.
  const chosenPlace = !save && startKey && PLACES[startKey];
  const chosen = chosenPlace && (startKey === 'home' && spec.id === 'ranger' ? home.ranger
    : { x: chosenPlace.x, z: chosenPlace.z, yaw: chosenPlace.a || 0 });
  const doorstep = !save && (who.home === 'home' && home[spec.id] || (PLACES[who.home] && curbSpot(PLACES[who.home], 0)));
  const start = chosen || (save && save.parked && save.parked[spec.id]) || doorstep
    || home[spec.id] || homeSpot(spec.id);
  G.veh.reset(start.x, start.z, start.yaw, spawnY(start.x, start.z));
  // W8-BUGS: the first-drive « S pour reculer » is for the 299 Fraser driveway only (ui.js DRIVEWAY_R).
  { const d = home.ranger; G.tutoDrive = d && Math.hypot(start.x - d.x, start.z - d.z) < 6 ? { x: start.x, z: start.z } : null; }
  G.health = save ? { ...save.health } : {};
  restoreDamage(G.veh, G.health[spec.id] || 0);
  G.repair.t = 0; G.towed = false;
  settleAfterPlacing();
  // The spec stack puts the fitted parts on and sets the engine voice, once
  // (tuned or stock), before the first tick (audio review; F3.b).
  specstack.seat(G.veh);
  // Jobs, records, money, playtime, unlocks: all of it comes out of the save.
  G.done = new Set(save ? save.progress : []);
  G.streets = new Set(save && save.streets ? save.streets : []);
  G.lastNight = false;
  G.best = save ? { ...save.best } : {};
  G.bestLegacy = save ? { ...(save.bestLegacy || {}) } : {};   // [w7-polish] old grid-inclusive course bests
  G.playtime = save ? save.playtime : 0;
  // Every counter the systems keep (distance, near misses, streaks, airtime...),
  // zeroed for a new game and overlaid with whatever the save recorded.
  G.stats = { ...STATS0, ...((save && save.stats) || {}) };
  // The economy's memory (save.js normalizes both; an old save gets empties).
  G.replayPaid = save && save.replayPaid ? { ...save.replayPaid } : {};
  G.dadCalls = save && save.dadCalls
    ? { n: save.dadCalls.n | 0, week: save.dadCalls.week ?? null, log: [...(save.dadCalls.log || [])] }
    : { n: 0, week: null, log: [] };
  G.slot = save ? (save.slot || null) : null;
  // 2a's three, straight off the slot. A new game starts on day 0 with a tank
  // nobody has metered yet and the envelope on the kitchen table.
  G.day = save ? save.day : 0;
  G.fuel = save ? save.fuel : null;
  G.target = save ? save.target : DEFAULT_TARGET;
  G.summerOver = save ? save.summerOver : false;
  G.reached = save ? save.reached : false;
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
  const savedTime = save && DAY_PHASE[save.timeOfDay] != null ? save.timeOfDay : 'day';
  G.dayClock = phaseClock(savedTime);
  setCycleEnv(true);
  G.boat = null; G.focus = null;
  G.rivals = []; G.raceParked = {}; G.ranRed = false;
  G.ambush = null; G.ambushHeld = null; skills.reset();   // [w7-polish] ambushHeld
  if (!G.cops) G.cops = new Cops(); else G.cops.reset();
  hud.setStars(0);
  if (!G.wallet) G.wallet = new Wallet($('money'));
  // Straight onto the field, not through Wallet.set(): the wallet's own
  // localStorage key is legacy scratch now, the save slot is the truth.
  G.wallet.value = save ? save.money : START_MONEY;
  G.wallet.render();
  // The spine: 73 days, a target, a tank. save.js carries day/fuel/target
  // (Wave 2b); a save without them starts the summer fresh at the first day.
  // NOT `G.character = save.character || 'tom'`: that line stamped every new
  // game back to Tom fifty lines after the picker had said otherwise, so
  // choosing Zahra started Tom's summer with Zahra's name on the menu. The
  // character was settled at the top of this function; leave it alone.
  calendar.restoreSummer(G, save);
  if (VISUAL_PROTOTYPE) {
    if (!save) { G.day=calendar.diff(G).firstDay; G.dayClock=6/24*DAY_NIGHT_CYCLE; }   // hard starts on its own day (P12)
    else G.day=Math.floor(G.day);
    applyRecordedWeather(weather,calendar.dayInfo(G.day),calendar.iso(G.day),true);
    setCycleEnv(true);
  }
  fuel.initFuel(G, save);
  if (G.props) {
    G.props.clear();
    // Permanent scenery the map data has no idea about.
    G.props.add({ id: 'island', mesh: 'island', x: ISLAND.x, z: ISLAND.z, yaw: ISLAND.yaw, far: 2200 });
    // On the lawn, not at sea level: Frank-Robinson is ~19 m up the hill, and the
    // limbs and couch landmarks.js hangs on this maple are lifted by the same
    // ground height (world.landmarks.ground 'mike'). Without it the tree was buried.
    G.props.add({ id: 'miketree', mesh: 'bigtree', x: MIKE_TREE.x, z: MIKE_TREE.z, far: 500,
      y: G.world?.landmarks?.ground?.get('mike') ?? (G.phys?.groundY ? G.phys.groundY(MIKE_TREE.x, MIKE_TREE.z) : 0) });
    // ---- [agent/ottawa hook] downtown Ottawa. One block; fold into the owned
    // files later. game/ottawa.js merges the sector into MAP, rolls the whole
    // map back to 2004 and registers its PLACES at import time; this line is
    // only the hero landmark geometry, which needs G.renderer and G.props.
    addOttawaLandmarks(G);
  }
  G.mode = 'drive';
  $('menu').classList.add('hidden');
  // U7: whichever overlay was up, it is not up now.
  for (const m of ['pause', 'options', 'load', 'story', 'intro', 'seam']) setModal(m, false);
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
  // AUD-02: the radio is on when you get in (Options > Audio can turn that off).
  if (G.settings.radioAuto !== false && !radio.wantOn) radio.power(true);
  radio.resume();
  radio.loadTape().then(() => paintRadio()).catch(() => {});
  paintRadio();
  applySettings(G, G.settings);   // hud size, legend, volumes, fps counter
  setPhotocopy(G.settings.lang);
  // Story agent: the town gets its voice back, and a brand new game gets the
  // four opening cards — once ever, then only from Options > Jeu.
  heckle.bind(G);
  heckle.reset();
  story.hide();
  G.stuck = null;
  // [opening] a New Game from the menu is mid-opening: it takes the world from here.
  if (!save) { if (opening.active) { openingClock0 = G.dayClock; opening.worldReady(); } else playStory(); }
  // Playtest #11: a slot carries the job you were in the middle of. Last,
  // because it needs the car, the wallet, the HUD and the stats to exist.
  if (save && save.mission) resumeMission(save.mission);
  // Mission restoration sets its authored start time; restore the exact visual
  // clock afterwards so loading an in-progress job does not jump back to dawn.
  if (VISUAL_PROTOTYPE && Number.isFinite(save?.visualHour)) {
    G.dayClock = save.visualHour / 24 * DAY_NIGHT_CYCLE;
    setCycleEnv(true);
  }
}

// ---------------------------------------------------------------- story

// The opener. It owns the keyboard while it is up (see handleKeys), and when it
// is done it drops a waypoint on the nearest job so the very first thing the
// player sees is a blue line going somewhere.
// ---------------------------------------------------------------- [opening]
// The hooks game/intro/opening.js runs on. Nothing here draws or decides a shot.
let openingClock0 = 0;
// The dawn clock: an hour in, the sky out. The prototype's clock IS the hour;
// the classic cycle has no hours, so 5:00 to 6:30 maps onto the end of its
// night phase and the start of its morning (DAY_WEIGHT above).
function openingHour(h, fog = 1) {
  G.dayClock = VISUAL_PROTOTYPE ? (h / 24) * DAY_NIGHT_CYCLE
    : ((((0.9 + (h - 5) / 1.5 * 0.16) % 1) + 1) % 1) * DAY_NIGHT_CYCLE;
  setCycleEnv(true);
  if (fog !== 1 && G.env) G.env.fogDensity *= fog;
}
// Where the chase camera will be on the first frame of play, as an opening key
// (heights above the ground), so the hand-off is a continuation and not a cut.
function openingChasePose() {
  const v = G.veh;
  if (!v || !G.phys) return null;
  const cam = CAMS[G.cam] && CAMS[G.cam].name !== 'hood' && CAMS[G.cam].name !== 'driver' ? CAMS[G.cam] : CAMS[0];
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const dist = cam.dist * clamp((v.spec ? v.spec.len : 4.5) / 4.5, 0.62, 1.25);
  const x = v.x - fx * dist, z = v.z - fz * dist, y = (v.bodyY || 0) + cam.height;
  const ahead = dist + 24, lx = x + fx * ahead, lz = z + fz * ahead;
  const gy = G.phys.groundY;
  return { x, z, agl: y - gy(x, z), lx, lz, lagl: y + Math.tan(cam.pitch) * ahead - gy(lx, lz),
    fov: G.q.fov + cam.fovAdd + G.settings.fov };
}
// Whose head a speech bubble points at.
function openingAnchor(id) {
  const gy = (x, z) => (G.phys ? G.phys.groundY(x, z) : 0);
  if (id === 'sayyad') return { x: PLACES.sayyad.x, y: gy(PLACES.sayyad.x, PLACES.sayyad.z) + 4.6, z: PLACES.sayyad.z };
  const s = G.avatars && G.avatars.spotFor(id);
  return s ? { x: s.x, y: gy(s.x, s.z) + (id === 'zahra' ? 1.55 : 1.8), z: s.z } : null;
}
// A replay from a game in progress: the Ranger goes back in its driveway for the
// length of the film, and comes back out exactly where it was.
let openingStaged = null;
function openingStage() {
  const spot = homeParked('ranger').ranger || homeSpot('ranger');
  openingStaged = { veh: G.veh, pose: G.veh ? { x: G.veh.x, z: G.veh.z, yaw: G.veh.yaw } : null, focus: G.focus };
  if (!G.veh || G.veh.spec.id !== 'ranger') {
    const spec = carById('ranger');
    G.veh = new Vehicle(spec);
    G.veh.carId = spec.id;
  }
  G.veh.reset(spot.x, spot.z, spot.yaw, spawnY(spot.x, spot.z));
}
function openingUnstage() {
  const s = openingStaged;
  openingStaged = null;
  if (!s) return;
  if (s.veh) {
    G.veh = s.veh;
    if (s.pose) G.veh.reset(s.pose.x, s.pose.z, s.pose.yaw, spawnY(s.pose.x, s.pose.z));
  }
  G.focus = s.focus || null;
}
// [opening-v2] W1: the radio at the starter. `at` is on audio.ctx's clock (the
// score schedules there); 0 when there is no audio, and then there is nothing to ramp.
function openingRadioUp(at, secs) {
  if (opening.replay) return;
  if (G.settings.radioAuto !== false && !radio.wantOn) radio.power(true);
  radio.resume();
  if (audio.ok && audio.radioBus && audio.running) {
    const t0 = audio.ctx.currentTime, t = Math.max(t0, at || 0), g = audio.radioBus.gain;
    g.cancelScheduledValues(t0); g.setValueAtTime(0.0001, t0); g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(audio.vol.radio, t + Math.max(0.5, secs || 3));
  }
  paintRadio();
}
// [opening-v2] W5: which film New Game plays. opening.js's filmFor reads
// storySeen and the ?intro= switches; a machine with a save is a returning
// player too (the same test as the gate and buildMenu), so it gets the quick
// driveway settle, unless ?intro=1 asks for the first film.
function newGameFilm() {
  const v = filmFor(G);
  return v === 'first' && hasAnySave() && !/[?&]intro=1\b/.test(location.search) ? 'quick' : v;
}
// What New Game does now: Tom's summer, from his own driveway, through the opening.
// The start picker is « Balade libre » on the menu (offered once it has been seen).
function newGame() {
  if (opening.active) return;
  if (gateArmed) disarmGate();
  pickedCharacter = DEFAULT_CHARACTER;
  opening.begin({ variant: newGameFilm() });
  startGame(null, DEFAULT_START, DEFAULT_CHARACTER);
}
// « Revoir l'intro »: the same film, then back to the menu, no save touched.
function replayOpening() {
  if (opening.active) return;
  opening.begin({ replay: true });
  if (G.world && G.veh) {
    $('menu').classList.add('hidden');
    turntable.stop();
    openingStage();
    openingClock0 = G.dayClock;
    opening.worldReady();
    return;
  }
  startGame(null, DEFAULT_START, DEFAULT_CHARACTER);
}
function openingDone(kind, o = {}) {
  if (!o.worldOk) return;
  if (kind === 'replay') { openingUnstage(); toMenu(); return; }
  G.mode = 'drive';
  last = performance.now();
  hud.setVisible(G.settings.showHud);
  // The radio was on when he parked it: it comes up with the engine.
  if (G.settings.radioAuto !== false && !radio.wantOn) radio.power(true);
  radio.resume();
  // B-13a: no automation while the clock is stopped; _applyMix on resume
  // replaces the fade. [opening-v2] W1: the film's crank already brought it up
  // (openingRadioUp); this ramp is only for a film skipped before the crank.
  if (opening.stats?.radioUpAt == null && audio.ok && audio.radioBus && audio.running) {
    const t = audio.ctx.currentTime, g = audio.radioBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(audio.vol.radio, t + 4);
  }
  paintRadio();
  if (!G.settings.storySeen) onSettings(saveSettings({ ...G.settings, storySeen: true }));
  // [w6-opening] W6: no brief card after the opening, skipped or not.
  // W8-BUGS: marked autoStarted, so a mode picked from M before the player has
  // done anything in it closes it quietly instead of being refused.
  if (!G.mission && !G.done.has('alternateur')) { startMission(ALL_MISSIONS.find((d) => d.id === 'alternateur'), { card: false }); if (G.mission && G.mission.def && G.mission.def.id === 'alternateur') G.mission.autoStarted = true; }
  else refreshFreeRoam();
  // [w6-opening] W6: the cast cards at control (opening.js also calls it; a second call is a no-op).
  { const ids = opening.cast.afterOpening({ skipped: !!o.skipped });
    if (opening.stats && opening.v2 && opening.stats.cards) for (const id of ids) if (!opening.stats.cards.includes(id)) opening.stats.cards.push(id); }
}

function playStory() {
  cinema.show({ title: 'Été 2004',
    body: 'T’es Tom. Le Ranger est à toi : ton père te l’a donné, pis astheure c’est toi qui paies le gaz pis les pièces.\n\nTu restes au sous-sol, chez ta mère. L’été commence le 22 juin pis finit à la fête du Travail. Le gaz pis les pièces, c’est toi. Première étape : ton alternateur, au Canadian Tire des Galeries d’Aylmer.',
    task: '299, chemin Fraser, chez ta mère\nUne première commission. Tout un été devant toi.',
    art: 'home', button: G.settings.lang === 'en' ? 'Get in →' : 'Embarquer →',
    onDone: () => {
    if (!G.settings.storySeen) onSettings(saveSettings({ ...G.settings, storySeen: true }));
    if (!G.mission && !G.done.has('alternateur')) {
      startMission(ALL_MISSIONS.find(d => d.id === 'alternateur'), { card: false });   // the Été 2004 card already names the job: no second card in a row (bar 1)
      if (G.mission && G.mission.def && G.mission.def.id === 'alternateur') G.mission.autoStarted = true;   // W8-BUGS: see yieldsToMode
      return;
    }
    const j = nearestJob(G);
    // Only worth a waypoint if it is somewhere else; updateRoute() eats one you
    // are already standing on, and the toast pair reads like a bug.
    if (j && j.dist > 40) {
      G.waypoint = { x: j.place.x, z: j.place.z };
      G.routeKey = '';
      hud.toast('Waypoint : ' + j.def.title + '\n' + j.place.label, 2600);
      audio.blip(660, 0.1, 'triangle', 0.14);
    }
    refreshFreeRoam();
  }});
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
  const l = freeRoamLines(offerView(), garage);
  // ---- S4-SUMMER (begin): parked at home, Z sleeps ----
  const z = VISUAL_PROTOTYPE ? '' : summer.sleepHint(G);
  if (z && !/\bZ\b/.test(l.sub || '')) l.sub = (l.sub ? l.sub + '   ·   ' : '') + z;
  // ---- S4-SUMMER (end) ----
  hud.setObjective(l.text, l.sub);
}

// ---- S4-SUMMER finale (begin) ----
// « Le dernier soir », stage 1: the places not seen yet tonight, lit on the
// maps (arc.js finaleTodo). No GPS line; the lights are the list.
function finalePins() {
  const m = G.mission;
  return m && m.def && m.def.id === 'arcdernier' && m.idx === 0 && m.fin && Array.isArray(m.fin.todo) ? m.fin.todo : [];
}
// ---- S4-SUMMER finale (end) ----

// ---- S4-SUMMER sleep (begin) ----
// Z, stopped at 299 Fraser with no job: a card, then the morning of the next
// day something opens (summer.js). The day toast and the autosave are a
// midnight's; Labour Day arriving opens the finale like any last day.
function trySleep() {
  // W7-BUGS: nothing else may own the screen (no sleep card over a job's end
  // card, the ending, a menu or the meal), and a day a failed job owes is in
  // the plan, paid by the nights, not wiped by them.
  const card = cinema.active || story.active || !!(endingCard && endingCard.active)
    || !!modalOpen() || !!G.seamHold || !!G.mealShift || G.mode !== 'drive';
  const why = summer.sleepBlock(G, { card });
  if (why) { if (!summer.SLEEP_SILENT.has(why)) hud.toast(why, 1800); return false; }
  const plan = summer.planSleep(G);
  const en = G.settings.lang === 'en';
  cinema.show({
    eyebrow: '299 CHEMIN FRASER',
    title: plan.title, body: plan.body, task: plan.task,
    art: 'home@night', button: en ? 'Get up →' : 'Debout →',
    onDone: () => {
      if (!summer.applySleep(G, plan)) return;
      cancelRetry(G);   // the R offer goes; its owed day was paid in plan.to
      G.dayClock = phaseClock('morning');
      setCycleEnv(true);
      hud.toast(calendar.dayToast(G.day), 2800);
      autosave('midnight');
      if (calendar.isOver(G.day) && !G.summerOver) runEnding();
      freeRoamT = 0; refreshFreeRoam();
    },
  });
  return true;
}
// ---- S4-SUMMER sleep (end) ----

// story.js's freeRoamLines() finds the nearest parked car and, if you do not
// have it, offers to sell it — at garage.cost(), which is 0 for a car that is
// not for sale. Margaret's Saturn is locked AND parked beside the spawn, so a
// new game opened on « E — acheter la Saturn · 0 $ ». It only ever sees the
// cars E can actually do something with (homes.js offerFor).
function offerView() {
  const view = Object.create(G);
  view.parked = offerableParked(G.parked, garage, G.done);
  return view;
}

// Two or three lines from whoever's job this is, as bubbles so the name is in
// bold and they stay out of the mission toast's way. They are said while the
// mission card (start) or the end card is still up; heckle.js queues them and
// plays them one at a time once the card has closed and the game clock runs.
// Tagged 'friend' so closeMission() and a completed stage can cut them.
function sayFriend(def, which) {
  if (!def) return 0;
  const lines = friendLines(def.id, which);
  for (const [who, text] of lines) heckle.line(who, text, 3000, { group: 'friend' });
  return lines.length;
}

// lotSpot() and curbSpot() live in game/homes.js with the owner table.

// Every car's home spot: the ones you have at their owner's kerb (several at one
// address get their own slot along the street, the car you are in first), the
// unsold beaters nose-to-tail on the lot. The save system and « Remettre les
// chars chez eux » both start from this.
function homeParked(currentId = G.carId) {
  const out = {}, slots = {};
  const ids = [currentId, ...CARS.map((c) => c.id).filter((id) => id !== currentId)];
  for (const id of ids) {
    if (id === 'svx') { out[id] = svxHome(); continue; }
    if (!carById(id) || (!garage.has(id, G.done) && id !== 'saturn')) continue;
    const k = homeKey(id);
    const slot = (slots[k] = (slots[k] || 0) + 1) - 1;
    // The cart parks on the clubhouse apron, not at the kerb — see save.js.
    out[id] = (['ranger', 'saturn', 'dbike'].includes(id) && k === 'home'
      ? fraserParking(G.world, PLACES.home, carById(id), id === 'saturn' ? 1 : 0) : null)
      || (carById(id).park === 'building' ? apronSpot(PLACES[k], carById(id).parkBack ?? 12, carById(id).parkSide ?? 0) : curbSpot(PLACES[k], slot));
  }
  const sale = garage.forSale();
  for (let i = 0; i < sale.length; i++) if (!out[sale[i]]) out[sale[i]] = lotSpot(PLACES.usedlot, i);
  return out;
}
function homeSpot(id) { return homeParked()[id] || curbSpot(PLACES.home, 0); }

// The ground under a parking spot. Every one of the tables above is a flat
// (x, z, yaw) — the terrain is what says how high that is — so every place that
// puts a car down feeds this to `reset`. Before the load step that builds
// G.phys there is no height field yet, and 0 is what the old flat town was.
function spawnY(x, z) { return G.phys && G.phys.groundY ? G.phys.groundY(x, z) : 0; }

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
    G.veh.reset(h.x, h.z, h.yaw, spawnY(h.x, h.z));
    G.veh.repair();
    G.repair.t = 0; G.towed = false;
  }
  if (!quiet) hud.toast(t('toast.cars.home'), 1800);
  return G.parked;
}

// Getting unstuck is free; getting fixed is not. Both live in game/tow.js;
// these three only turn its records into toasts.
let towUI = null;
// A-06: T is for getting unstuck, not a teleport you can use at 90 km/h. It
// only does anything while the stuck watch in tow.js says you are stuck.
function canReset() { return !!(towUI && towUI.stuck); }
function doReset() {
  if (!canReset()) return;
  const r = tow.freeReset(G);
  if (!r.ok) { hud.toast("Pas de place libre trouvée sur le chemin. Essaie ailleurs.", 2400); return; }
  if (G.feelFx) G.feelFx.clear();
  hud.toast(r.name ? `Remis sur ${r.name}` : 'Remis sur la route', 1400);
}
function doTow() {
  // B-01a: Y in a borrowed vehicle (the cart, a bike, a friend's car) brings
  // your own back. While a job is live it stays the plain flatbed: a swap
  // mid-job would drop the riders and run stages built for the other car's
  // seats (code-review-B1 B-01a major).
  const live = G.mission && !G.mission.failed;
  const r = live ? tow.callTow(G) : tow.returnToOwnVehicle(G, 'tow');
  if (G.feelFx) G.feelFx.clear();
  if (!r.ok) { hud.toast("Pas de place libre pour la dépanneuse. Rien de chargé.", 2400); return; }
  hud.toast(tow.towLine(r), 3000);
  hud.setRepairHint(null); hud.setRepairPrompt(null);
  audio.chime(true);
}
// ---------------------------------------------------------------- A-06 feel
// The crash and the big jump are the show, so they get a beat of slow motion
// and a camera punch. `G.slowmo.left` is real seconds; frame() runs the sim at
// `scale` of real time while it lasts and eases back over the last third.
// AYLMER.step() (the harness, the checks) never stretches its own dt, so a
// scripted run takes the same number of steps it always did; it only counts
// the slow-mo down, and G.feel keeps the tally the checks read.
const SLOWMO = {
  // S3-CRASH: 0.9 s at 0.25x, back to speed over the last third (was 0.4 s at
  // 0.3x). With the 0.1 s headOn hitstop in front of it that is 1.0 s of the
  // world going slow, under the 1.2 s cap on losing the truck (CRASH_CAM).
  crash: { dur: 0.9, scale: 0.25, punch: 1, shake: 0.55 },
  jump: { dur: 0.5, scale: 0.35, punch: 0.6, shake: 0 },
  cooldown: 2.5,          // real seconds before another one can fire
  crashForce: 0.6,        // v.impact, 0..1 (cars.js hit(): closing / 18 m/s)
  crashKmh: 40,           // road speed just before the hit
  jumpAir: 1.6,           // seconds off the ground
};
G.slowmo = { left: 0, dur: 0, scale: 1, kind: null, cool: 0 };
G.feel = { crash: 0, jump: 0, last: null, speedFov: 0 };
// B-09: the sink makes AYLMER.feel() carry feel.offset and feel.hitstops.
G.feelFx = createFeel({ sink: G.feel });
const FEEL_EYE = [0, 0, 0];   // B-09: this frame's shaken eye, reused
G.camPunch = 0;
function fireSlowmo(kind) {
  const s = G.slowmo, cfg = SLOWMO[kind];
  if (!cfg || s.cool > 0 || G.mode !== 'drive') return false;
  s.left = s.dur = cfg.dur; s.scale = cfg.scale; s.kind = kind; s.cool = SLOWMO.cooldown;
  G.camPunch = Math.max(G.camPunch, cfg.punch);
  if (cfg.shake) G.camShake = Math.min(1, G.camShake + cfg.shake);
  G.feel[kind]++; G.feel.last = kind;
  return true;
}
// ---- S3-CRASH crash cam (begin) ----
// Burnout's Impact Time, small: for as long as the crash slow-mo runs, the
// picture cuts to a fixed eye about 6 m off to the side of the impact and
// 1.2 m up, looking at the truck, then cuts back to the chase cam (which kept
// smoothing underneath, so it comes back where it would have been). The eye
// comes from camclip's sideView, the side with the room, and every frame it
// is guarded like the chase boom, so it never sits in a wall. Never longer
// than CRASH_CAM.max real seconds; never from the driver's seat, the dev cam
// or a cinematic rail.
const CRASH_CAM = { dist: 6, up: 1.2, look: 0.8, max: 1.2 };
G.crashCam = null;
const CRASH_EYE = [0, 0, 0];
function startCrashCam(v, kmh) {
  G.crashCam = { at: performance.now(), x: v.x, z: v.z, yaw: v.yaw, eye: null, side: null, clip: makeClip(), frames: 0 };
  G.feel.crashCam = (G.feel.crashCam || 0) + 1;
  G.feel.crashKmh = Math.round(kmh);
  // The show plus its hitstop, and a second after: see crashShowQuiet.
  G.crashQuietUntil = G.crashCam.at + (SLOWMO.crash.dur + 0.1 + 1.0) * 1000;
}
function crashCamView(f) {
  const cc = G.crashCam;
  if (!cc) return null;
  const done = G.slowmo.kind !== 'crash' || performance.now() - cc.at > CRASH_CAM.max * 1000;
  if (done) { G.feel.crashCamLast = { side: cc.side, frames: cc.frames, ms: Math.round(performance.now() - cc.at) }; G.crashCam = null; return null; }
  const fy = (f.bodyY || 0);
  if (!cc.eye) {
    const s = sideView(G.world, cc.x, fy + CRASH_CAM.up, cc.z, cc.yaw, CRASH_CAM.dist, 0, cameraGroundY);
    if (!s) { G.crashCam = null; return null; }
    cc.eye = [s.x, s.y, s.z]; cc.side = s.side;
  }
  CRASH_EYE[0] = cc.eye[0]; CRASH_EYE[1] = cc.eye[1]; CRASH_EYE[2] = cc.eye[2];
  if (G.world?.queryCameraBlocks) guardView(cc.clip, G.world, f.x, fy + CRASH_CAM.up, f.z, CRASH_EYE, cameraGroundY);
  const dx = f.x - CRASH_EYE[0], dz = f.z - CRASH_EYE[2];
  cc.frames++;
  return { eye: CRASH_EYE, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(fy + CRASH_CAM.look - CRASH_EYE[1], Math.hypot(dx, dz)) };
}
// ---- S3-CRASH crash cam (end) ----

// Called once per real frame (or per scripted step) with real seconds; returns
// how fast the sim should run this frame.
function slowmoScale(realDt) {
  const s = G.slowmo;
  if (s.cool > 0) s.cool = Math.max(0, s.cool - realDt);
  if (s.left <= 0) return 1;
  s.left = Math.max(0, s.left - realDt);
  const k = s.left / s.dur;             // 1 at the start, 0 at the end
  const ease = k > 1 / 3 ? 1 : k * 3;   // full slow for two thirds, then back
  const scale = 1 - (1 - s.scale) * ease;
  if (s.left <= 0) s.kind = null;
  return scale;
}

// A-01 hook: the giver patches the truck before a job (game/jobready.js).
// Loaded lazily so this branch runs before A-01 lands; prepareForJob is
// idempotent (a patched truck is at 0), so a second call is a no-op.
const jobHooks = { prepareForJob: null };
import('./game/jobready.js').then((m) => { jobHooks.prepareForJob = m.prepareForJob || null; }).catch(() => {});

// The truth on the brief card's footer: a race is against somebody, and a job
// with no clock says so. Narrator French; the English HUD when the game is set
// to English.
function cardNote(def, clocks, en) {
  const rivals = Array.isArray(def.rivals) ? def.rivals.filter(Boolean) : [];
  const who = rivals.length > 1 ? rivals.slice(0, -1).join(', ') + (en ? ' and ' : ' pis ') + rivals.at(-1) : rivals[0];
  const timed = clocks ? (en ? 'Timed stages: ' : 'Étapes chronométrées : ') + clocks.map(fmtTime).join(' · ') : null;
  if (def.race && who) {
    const head = en ? `Race against ${who}.` : `Course contre ${who}.`;
    return head + ' ' + (timed || (en ? 'No clock: get there first.' : 'Pas de chrono : arrive le premier.'));
  }
  return timed || (en ? 'No timer. Take your time.' : 'Aucun chrono. Prends ton temps.');
}

// A save can put the car inside a house (the autosave caught you on the lawn,
// and the footprint under it is from the assessment roll). Move it out, free.
function settleAfterPlacing(allowOffRoad = false) {
  const s = tow.settleSpawn(G, {allowOffRoad});
  if (s.moved) hud.toast(s.reason === 'water' ? 'Le char était dans l’eau. Remis sur la route, gratis.'
    : 'Le char était pogné. Remis sur la route, gratis.', 3000);
}

function swapCar(id) {
  if (G.veh && G.veh.spec && carById(id)) fuel.onSwap(G, G.veh.baseSpec || G.veh.spec, carById(id));
  const v = G.veh, spot = G.parked[id];
  if (!spot) return;
  G.health[v.spec.id] = v.damage;
  G.parked[v.spec.id] = { x: v.x, z: v.z, yaw: v.yaw };
  delete G.parked[id];
  const spec = carById(id);
  G.carId = id;
  G.veh = new Vehicle(spec);
  G.veh.carId = spec.id;
  G.veh.assist = G.assist;
  G.veh.reset(spot.x, spot.z, spot.yaw, spawnY(spot.x, spot.z));
  restoreDamage(G.veh, G.health[id]);
  settleAfterPlacing(true);
  specstack.seat(G.veh);
  G.gearbox = new Gearbox(spec.drive);
  G.repair.t = 0;
  hud.setCar(spec.name);
  hud.toast(id === 'svx' ? 'Tu prends la SVX de Sara.' : `${spec.who === 'Yours' ? 'Ton' : spec.who.replace("'s", '') + ' te passe son'} ${spec.name}`, 1800);
  audio.blip(520, 0.12, 'triangle', 0.15);
  if (id === 'svx') fortier.start(G);
}
// A job that has to put you in one particular car (golfjob.js) uses the same
// swap the E-prompt does, so the car you arrived in stays exactly where it was.
G.swapCar = swapCar;

// ---------------------------------------------------------------- environment
// cloneEnv, setEnv, cycleEnv, setCycleEnv and stepEnv live in
// game/look/envcycle.js (V0-03). What is left here is the call on the fixed
// step: the 2004 calendar's midnight toast, autosave and ending ride in on the
// callbacks handed to envc.install() above.
function updateDayNight(dt) {
  envc.advance(dt);
}

// ---------------------------------------------------------------- missions

// `opts.card: false` [opening]: the opening has just told this job's story (Dad
// on the phone), so the first job starts without its brief card.
function startMission(def, opts = {}) {
  if (!def || !missionAvailable(G,def)) {
    // The real reason: the hour, the date, or the job that comes first (P1/P2).
    hud.toast(missionLockReason(G,def) || 'Job indisponible',2500);
    return false;
  }
  // A-03: a retry still on offer is dropped (and its deferred day settled).
  // B-07: cancelRetry also empties the fail card, so no line from the last
  // job sits over this one's brief.
  cancelRetry(G);
  // One job at a time: a job started over another one closes it properly.
  if (G.mission) closeMission('quit');
  // B-01b: a timed, cargo or race job is not started in the cart, a bike or a
  // loaner. After closeMission, so a set piece that lent the cart gets it back
  // first (code-review-B1 B-01b), and before def.build, so the stages get the
  // seats of the vehicle you actually drive.
  const own = ensureOwnVehicle(def, G);
  if (own && own.action === 'refuse') {
    hud.toast(own.line, 3200);
    if (own.gps) G.waypoint = own.gps;
    return false;
  }
  if (own && own.action === 'swap') hud.toast(own.line, 3000);
  if (G.feelFx) G.feelFx.clear();
  const spec = G.veh.spec;
  const stages = def.build({
    carId: spec.id, carName: spec.name, seats: spec.seats, places: carPlaces(spec),
    money: G.wallet ? G.wallet.value : 0,
  });
  G.mission = {
    def, stages, idx: 0, timeLeft: null, failed: false, elapsed: 0,
    styleStart: { stats: { ...G.stats }, damage: G.veh.damage || 0 },
  };
  // A-01: past cosmetic damage, the giver patches the car before the job.
  const ready = def.keepDamage ? { patched: false } : prepareForJob(G.veh, G.mission, G);   // [w7-crashnight] keepDamage
  if (ready.patched) hud.toast(ready.line, 3000);
  G.waypoint = null;
  G.veh.passengers = 0;
  setEnv(def.timeOfDay);
  audio.chime(true);
  applyStage();
  // Two seconds of title / brief / clock / route preview before the clock runs.
  const first = G.mission.target;
  const route = G.nav ? G.nav.route(G.veh.x, G.veh.z, first.x, first.z) : null;
  if (route) { G.route = route; G.routeKey = `${Math.round(first.x)},${Math.round(first.z)}`; }
  const clocks = missionClock(stages, G.timerScale || 1);
  const en = G.settings.lang === 'en';
  // [opening-v2] W7: a person's live name card comes after the brief card
  // (or at once with no card), and their start lines wait for it.
  const castThenLines = () => {
    if (!G.mission || G.mission.def !== def) return;
    opening.cast.queueForJob(def.id);
    opening.cast.active ? opening.cast.onIdle(() => sayFriend(def, 'start')) : sayFriend(def, 'start');
  };
  if (opts.card !== false) cinema.show({ title: def.title, body: def.brief,
    // B-10: the card is graded to the job's hour and weather (cinematic.js
    // cardArt); alternateur keeps its own painting.
    job: def,
    task: stages[0].text,
    note: [cardNote(def, clocks, en), jobMedalNote(def, stages, en)].filter(Boolean).join('\n'),   // [w7-replay]
    button: en ? 'Start the job →' : 'Commencer la job →',
    onDone: castThenLines,
  });
  else castThenLines();
  G.tutoJobTaken = true;
  G.stuck = null;
  // A-01: the giver does not send you out in a wreck.
  if (jobHooks.prepareForJob && !def.keepDamage) {   // [w7-crashnight] keepDamage
    try {
      const ready = jobHooks.prepareForJob(G.veh, G.mission, G);
      if (ready && ready.patched && ready.line) hud.toast(ready.line, 3000);
    } catch (e) { console.warn('prepareForJob', e); }
  }
}

// Playtest #11: put a saved job back on its feet.
//
// The def is the only thing worth persisting — everything a stage owns is
// rebuilt by def.build() and the stage's own onEnter, so this restarts the
// stage you were in rather than pretending to freeze it mid-drop. The clock
// comes back off the save; whatever scalar the stage was counting comes back
// on top. A def that no longer exists (a job pulled out of the build) is
// dropped out loud, because silently landing in free roam is exactly the bug.
function resumeMission(saved) {
  if (!saved || !saved.id) return false;
  const def = ALL_MISSIONS.find((d) => d.id === saved.id);
  if (!def) {
    if (resumeModeSave(G, saved.id)) return false;   // [w7-polish] a course or Crash Night: free roam, no false loss
    hud.toast('Job perdue\nElle existe plus dans c\u2019te version-l\u00e0. T\u2019es en balade.', 3200);
    return false;
  }
  const spec = G.veh.spec;
  const stages = def.build({
    carId: spec.id, carName: spec.name, seats: spec.seats, places: carPlaces(spec),
    money: G.wallet ? G.wallet.value : 0,
  });
  if (!stages || !stages.length) return false;
  const at = Math.max(0, Math.min(stages.length - 1, saved.stage | 0));
  // A job saved mid-race restarts at the grid, not in the middle of the lap
  // (save review SR-10; save.js resumeStage, when it exists).
  const idx = typeof saveExtras.resumeStage === 'function' ? saveExtras.resumeStage(def, stages, at) : at;
  G.mission = {
    def, stages, idx, timeLeft: null, failed: false, elapsed: saved.elapsed || 0,
    styleStart: { stats: { ...G.stats }, damage: G.veh.damage || 0 },
  };
  G.veh.passengers = Math.min(spec.seats || 1, saved.passengers || 0);
  G.waypoint = null;
  setEnv(def.timeOfDay);
  applyStage();
  // A stage we rewound to starts clean: the saved counters belong to a later one.
  if (idx === at) {
    Object.assign(G.mission, saved.state || {});
    if (saved.timeLeft != null) G.mission.timeLeft = saved.timeLeft;
  }
  hud.setTimer(G.mission.timeLeft);
  // No intro card: you have already read the brief, you were doing the job.
  G.tutoJobTaken = true;
  G.stuck = null;
  hud.toast('Job reprise: ' + def.title + '\n' + (stages[idx].text || ''), 3200);
  return true;
}

function applyStage() {
  const m = G.mission;
  const st = m.stages[m.idx];
  hud.setObjective(st.text, st.sub || '');
  m.timeLeft = st.time != null ? Math.max(1, Math.round(st.time * (G.timerScale || 1))) : null;
  m.target = stageTarget(G, m, st);
  G.routeKey = '';
  stageEnter(G, m, st);
  replay.stageStart(G, m);   // [w7-replay]
}

// Every job and every race costs a day (calendar.js). When the day that
// arrives is Labour Day, the summer is over and the father counts the envelope.
// A course (def.mode) costs its day once: running it again on the day that
// first run brought you to is free, so « une autre run » stays a retry, not a
// week of the summer. Any other job spending a day ends the free reruns.
function endOfJob(def = null) {
  if (VISUAL_PROTOTYPE) return;
  const course = def && def.mode ? def.id : null;
  if (course && G.courseDay && G.courseDay[course] === Math.floor(G.day)) return;
  calendar.spendDay(G, hud);
  if (course) G.courseDay = { [course]: Math.floor(G.day) };
  else G.courseDay = null;
  if (calendar.isOver(G.day) && !G.summerOver) runEnding();
}
// « 4/10 » : the main story, not a count of every errand.
function storyLine() {
  const p = storyProgress(G);
  return p.finale ? 'L’été est fait' : `Histoire : ${p.done}/${p.total}`;
}
let endingCard = null;
// The ending cannot be failed (restructure, 29 Sept 2026). Labour Day arriving
// before « Le dernier soir » is played does not end anything: it opens the
// finale, whatever else is left, and the cards come when it is done.
function runEnding() {
  if (!G.done.has(FINALE) && ALL_MISSIONS.some((d) => d.id === FINALE)) {
    if (!G.lastNight) {
      G.lastNight = true;
      hud.toast(G.settings.lang === 'en' ? 'Labour Day.\nThe last night is waiting at 299 Fraser.'
        : 'La fête du Travail.\nLe dernier soir t’attend au 299 Fraser.', 5200);
      autosave('job');
    }
    return;
  }
  G.summerOver = true;
  G.stats.ending = 'waterloo';
  if (!endingCard) endingCard = new EndingCards();
  endingCard.cards = endingCards({ streets: streetsLine(G) });
  // ---- S4-SUMMER (begin): the summer-end screen after the last card, then free roam ----
  endingCard.show(() => { autosave('job'); showSummerEnd(); });
}
async function showSummerEnd() {
  let courseBests = {}, courseName = null;
  try {
    const M = await import('./game/modes.js');
    courseBests = M.loadModeBests();
    courseName = (id) => { const c = M.COURSES.find((x) => x.id === id); return c ? M.courseName(c) : id; };
  } catch { /* the courses are optional here */ }
  const card = summer.summerSummary(G, { courseBests, courseName });
  G.summerSummary = card.lines;
  cinema.show({ eyebrow: card.eyebrow, title: card.title, body: card.body, task: card.task, note: card.note,
    button: card.button, art: 'home@night', onDone: () => { freeRoamT = 0; refreshFreeRoam(); } });
}
// ---- S4-SUMMER (end) ----
function failMission(why) {
  const m = G.mission;
  // The money press, closed: a job that ends badly hands back what it paid.
  // And a job you actually started costs the day whether or not it worked —
  // Backspace inside the first minute is reading the brief, not a wasted day.
  const back = refundJob(G, m);
  // A-03: the fail card is a gag line and R to retry; the first retry is free
  // (the day is deferred, not spent, and retry.js says so on the card).
  // B-07: retry.js owns the fail card (offerRetry has already set it); the HUD
  // only shows what failToast() says, and a new card clears it.
  const offer = m ? offerRetry({ G, mission: m, why, refunded: back }) : null;
  // [w7-replay] a real fail (not an abandon) says how far was left, as an estimate.
  if (offer) { const fl = replay.failLine(G, m, G.settings.lang === 'en'); const ft = failToast(); if (fl && ft) ft.text += '\n' + fl; }
  if (!offer) setFailToast('RATÉ\n' + why + (back > 0 ? `\n(− ${Math.round(back)} $ : la paye s’en va avec)` : ''), 3000, m && m.def ? m.def.id : null);
  hud.failCard(failToast());
  audio.chime(false);
  // B-07: a main story fail never spends the day; paid jobs and races do.
  if (failSpendsDay(m) && !(offer && offer.deferred)) endOfJob(m && m.def);
  closeMission('fail');
}

// The one way a job ends (architecture review F1). Finished, failed, restarted,
// quit to the menu, replaced by a load or a new game, or replaced by another
// job: every path runs the stage's onExit and the def's cleanup, so nothing a
// job put on screen or into G outlives it. Quitting to the menu (or loading a
// slot) during the St. Vincent meal used to skip missionCleanup, leave
// G.mealShift set, and the next drive was stuck in the meal overlay until the
// page was reloaded. The day cost, the autosave, the toasts and the friends'
// lines stay with the callers, because those differ on purpose.
//   outcome: 'done' | 'fail' | 'restart' | 'quit'
function closeMission(outcome) {
  const m = G.mission;
  // Whatever the friends were still saying about this job is moot now. A job
  // that failed or was dropped takes every story line with it; a finished one
  // only the start lines (its last stage may still have something to say).
  heckle.cancel?.(outcome === 'done' ? 'friend' : null);
  // [opening-v2] start lines still waiting on a name card go with the job.
  opening.cast.dropIdle();
  if (m) {
    if (outcome !== 'done') refundJob(G, m);
    missionCleanup(G, m, outcome !== 'done');
  }
  G.mission = null;
  // Defensive: a def with no onExit, or an overlay left by an older build.
  closeMealShift();
  if (!m) return null;
  hud.prompt(null);
  hud.setTimer(null);
  G.stuck = null;
  if (G.veh) G.veh.passengers = 0;
  if (outcome !== 'done') cinema.hide();
  setCycleEnv();
  refreshFreeRoam();
  return m;
}
function closeMealShift() {
  if (G.mealShift) { try { G.mealShift.close?.(); } catch (e) { console.warn('meal shift', e); } }
  G.mealShift = null;
  if (typeof document !== 'undefined') document.getElementById('mealshift')?.remove();
}

// cops.js writes a ticket and takes the job with it.
G.failMission = failMission;

function updateMission(dt) {
  if (!G.mission && !G.ambush && fortier.interact(G, garage)) {
    if (G.carId !== 'svx') hud.setObjective('La SVX de Sara Fortier', 'E : prendre le char');
    return;
  }
  const m = G.mission;
  const v = G.veh;
  if (!m) {
    refreshFreeRoam(dt);
    // A challenge is standing (ambush.js): it owns the prompt and E for the
    // next few seconds, so the job pillar under the truck does not.
    if (G.ambush) { G.wantStart = false; return; }
    // Several missions share a start marker, so offer one and let Tab cycle.
    const near = availableMissions(G).filter((d) => {
      const p = PLACES[d.giver];
      return Math.hypot(v.x - p.x, v.z - p.z) < 12;
    });
    if (!near.length) {
      G.offer = null;
      // A friend's car parked nearby? Take it.
      // Only a car E can take or buy: a locked car that is not for sale (the
      // Saturn before « Ramasser la gang ») offers nothing.
      let carId = null, cd = 6.5;
      for (const id of Object.keys(G.parked)) {
        if (!offerFor(garage, id, G.done)) continue;
        const d = Math.hypot(G.parked[id].x - v.x, G.parked[id].z - v.z);
        if (d < cd) { cd = d; carId = id; }
      }
      // feel agent: a garage in range owns E, so don't offer the swap over it.
      if (carId && Math.abs(v.vLong) < 3 && !G.repairOffer) {
        const c = carById(carId);
        if (offerFor(garage, carId, G.done) === 'buy') {
          // On the lot: the same hold/cost shape the yard sale uses, except the
          // thing you are buying drives away.
          const cost = garage.cost(carId);
          const can = garage.canBuy(carId, G.wallet, G.done);
          hud.prompt(`E  :  acheter ${carArticle(carId)} ${shortCarName(carId, c)}   \u00b7   ${cost} $`
            + (can.ok ? '' : `   (${can.why})`));
          if (G.wantStart) {
            G.wantStart = false;
            const r = garage.buy(carId, G.wallet, G.done);
            if (r.ok) {
              hud.prompt(null);
              hud.toast(`Vendu.\n${c.name} : ${cost} $`, 2600);
              audio.chime(true);
              swapCar(carId);
            } else hud.toast(r.why, 2400, true);
          }
        } else {
          // Short, gendered car names (story agent) + a spec's own possessive
          // (`whoDe`, qa agent: « Cart de golf du Club » needs none).
          const art = c.who === 'Yours' ? 'ton' : carArticle(carId);
          const de = c.who === 'Yours' ? ''
            : c.whoDe !== undefined ? (c.whoDe ? ' ' + c.whoDe : '')
            : (c.who === 'Le lot' ? '' : ' de ' + c.who.replace("'s", ''));
          hud.prompt(`E  :  prendre ${art} ${shortCarName(carId, c)}${de}`);
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

  // Twenty seconds without twenty metres: the stage's hint comes back and the
  // objective line flashes. It is the same text that has been on screen all
  // along — the point is that you look at it again.
  // QA F2: not while a story/friend bubble or a card is up, and not before the
  // player has first rolled a few metres in this job (Margaret's start lines
  // play while he sits in the driveway). The « Psst » stage hint waits on the
  // same hold (missionkit.js hintTime).
  G.hintHold = heckle.storyBusy() || !!modalOpen();
  if (updateStuck(G, dt, null, { hold: G.hintHold, requireMove: true })) hud.pulseObjective?.();

  m.elapsed += dt;
  const st = m.stages[m.idx];
  if (m.timeLeft != null) {
    // [opening-v2] W8: the job clock holds while a live name card is up.
    if (!opening.cast.active) m.timeLeft -= dt;
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
  // Pay first, then say it: the toast names the real payout (QA F7).
  const paidBefore = m.paid || 0;
  stageSettle(G, m, st);
  const stageToast = payText(st.toast, st.money, (m.paid || 0) - paidBefore);
  // W8-BUGS: the last stage's toast is the end card's body. Toasted as well, it
  // waited under the card and came up again once it closed (St. Vincent, cloud
  // run 27 Oct: the end text twice). If the card does not show after all (the
  // summer ended on this job), the toast goes out at the end instead.
  const toastOnCard = !!stageToast && m.idx >= m.stages.length - 1 && !m.def.result && !m.def.mode && !G.summerOver;
  if (stageToast && !toastOnCard) hud.toast(stageToast, 2400);
  // B-08: a stage toast pushed while a scene holds the street quiet (nuittim,
  // the finale) keeps it quiet until that toast is off the screen.
  if (stageToast && !toastOnCard && heckle.hushed) heckle.hushWhile('stage:' + stageToast, () => toastLive(hud, stageToast));
  audio.blip(880, 0.14, 'triangle', 0.2);
  // [w7-replay] a timed run just closed: medal or the gap to the next one.
  const medal = replay.stageDone(G, m);
  const medalEn = G.settings.lang === 'en';
  if (medal && m.def.mode) medal.rerun = offerRerun(G, m.def.id);
  const ghostLine = m.idx >= m.stages.length - 1 ? ghost.finishLine(G, m, medalEn) : '';
  if (medal && m.idx < m.stages.length - 1) hud.toast(medalEyebrow(medal, medalEn) + '\n' + medalLine(medal, medalEn), 3600);
  stageExit(G, m, st);
  m.idx++;
  if (m.idx >= m.stages.length) {
    const def = m.def;
    // [w7-crashnight] a score mode ends on its own result toast: no day, no card, no G.done.
    if (def.result) { closeMission('done'); const res = def.result(G, m); if (res && res.toast) hud.toast(res.toast, 5200); audio.chime(true); return; }
    G.done.add(def.id);
    audio.chime(true);
    // Somebody may just have decided to lend you their car.
    garage.setProgress(G.done);
    for (const u of garage.newlyUnlocked(G.done)) {
      if (u.toast) hud.toast(u.toast, 3600);
      if (u.id !== G.carId && !G.parked[u.id]) {
        // Next free slot at that address (your own car counts if it lives there).
        G.parked[u.id] = curbSpot(homeOf(u.id), nextFreeSlot(G.parked, G.carId, u.id));
      }
    }
    const runT = def.course ? courseTime(m) : m.elapsed;   // [w7-polish] a course is timed from GO, like its medals
    const prev = G.best[def.id];
    const record = prev == null || runT < prev;
    if (record) G.best[def.id] = runT;
    const style = missionStyleBonus(m.styleStart, G.stats, v.damage);
    if (style.money) style.money = Math.min(15, style.money);   // the budget table caps it
    if (style.money && G.wallet) G.wallet.add(style.money);
    hud.toast('FINI : ' + def.title + '\n' + (medal ? medalEyebrow(medal, medalEn) + '  ' + medalLine(medal, medalEn) + (ghostLine ? '\n' + ghostLine : '')   // [w7-replay]
      : fmtTime(runT) + (record ? '  NOUVEAU RECORD' : '  (record ' + fmtTime(prev) + ')'))
      + (style.money ? `\nSTYLE +${style.money} $  ·  ${style.text}` : '')
      + '\n' + storyLine(), 4600);
    // Cleanup runs before endOfJob(), as it always has.
    closeMission('done');
    // [opening-v2] W7b: a card due at the end (Sayyad's) comes before the end lines.
    { const n = opening.cast.queueForJob(def.id, 'end'); n ? opening.cast.onIdle(() => sayFriend(def, 'end')) : sayFriend(def, 'end'); }
    endOfJob(def);     // the day is spent (a course rerun is free); Labour Day may have arrived
    // « Le dernier soir » is the ending, in both builds (the prototype spends
    // no day on a job, so endOfJob() alone would never get there).
    if (def.id === FINALE && !G.summerOver) runEnding();
    G.lastDone = def.title;
    autosave('job');   // one of exactly two events that write without being asked
    // B-08: no rival's challenge line over a scene that holds the street.
    const followUp = () => { if (!heckle.hushed) ambush.holdAfterJob(G, def); };   // [w7-polish] offered once the friends' end lines are done (ambush.tick)
    // [w7-replay] a course ends on its 4.6 s toast, not the card, so R works at once.
    if (!G.summerOver && !def.mode) cinema.show({
      eyebrow: medal ? medalEyebrow(medal, medalEn) : (G.settings.lang === 'en' ? 'JOB COMPLETE' : 'JOB TERMINÉE'),
      title: def.title,
      // The story's own last line (for the alternateur, the solenoid twist:
      // missions.js), never a hard-coded one that hides it.
      body: (stageToast || 'Une autre job de faite.')
        + (def.id === 'alternateur' ? '\n\nLe reste de l’été commence ici.' : ''),
      task: (medal ? medalLine(medal, medalEn) + (ghostLine ? '  ·  ' + ghostLine : '') + '\n' : '') + `${fmtTime(m.elapsed)}  ·  ${storyLine()}`
        + (m.paid ? `\nPaye : ${Math.round(m.paid)} $` : '')
        + (style.money ? `\nStyle +${style.money} $` : '')
        // ---- S4-SUMMER (begin): when the story comes back ----
        + (VISUAL_PROTOTYPE ? '' : (summer.nextStoryNote(G) ? '\n' + summer.nextStoryNote(G) : '')),
        // ---- S4-SUMMER (end) ----
      art: 'home', onDone: followUp,
    });
    else { if (toastOnCard) hud.toast(stageToast, 2400); followUp(); }
    return;
  }
  // The job moved on: the start lines about the stage just done are stale.
  heckle.cancel('friend');
  applyStage();
  if (m.def.id === 'alternateur' && m.idx === 1) cinema.show({
    eyebrow: 'CANADIAN TIRE · COMMANDE RAMASSÉE', title: 'C’est dans la boîte.',
    body: 'L’alternateur, le reçu, pis un peu d’argent Canadian Tire. Tout est là.\n\nReste à ramener la boîte au 299 Fraser. Tu prépares la prochaine réparation du Ranger.',
    task: m.stages[1].text, note: 'Aucun chrono. Prends ton temps.',
    art: 'alternateur', button: G.settings.lang === 'en' ? 'Head home →' : 'On rentre →',
  });
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
  G.route = remainingRoute(G.route, v.x, v.z);
}

function openMap(on) {
  if (on) {
    G.mode = 'map';
    G.tutoMapOpened = true;
    const f = G.focus || G.veh;
    G.bigmap.open(f.x, f.z);
    $('bigmap').classList.remove('hidden');
    setModal('pause', false);
    audio.engine(0, 0); audio.wind(0); audio.skid(0); audio.horn(false);
    weather.suspend();
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
    missions: G.mission ? finalePins().map((p) => ({ x: p.x, z: p.z, title: p.label, place: '', done: false })) : availableMissions(G).map((d) => ({ x: PLACES[d.giver].x, z: PLACES[d.giver].z, title: d.title, place: PLACES[d.giver].label, done: G.done.has(d.id) })),
    parked: Object.keys(G.parked).filter(id => !carById(id).hidden || garage.has(id,G.done)).map((id) => ({ x: G.parked[id].x, z: G.parked[id].z, name: carById(id).name })),
    rivals: G.rivals.map((rv) => ({ x: rv.x, z: rv.z, name: rv.name })),
    cops: [...G.cops.units.map((u) => ({ x: u.x, z: u.z })), ...G.cops.blocks.map((b) => ({ x: b.x, z: b.z }))],
    places: [
      ...Object.values(PLACES).filter((p) => p.label && !/Chemin Fraser|Denise|Bancroft|Vanier/.test(p.label)),
      ...QUEBEC_POIS,
    ],
    // feel agent: once it needs fixing, the nearest garage gets a wrench.
    repairs: G.veh && G.veh.damage >= DAMAGE.COSMETIC
      ? [nearestRepair(G.veh, PLACES)].filter(Boolean) : [],
    shortcuts: shortcuts.mapLines(G),   // [w6-shortcuts] the cuts you have found
  };
}

// ---------------------------------------------------------------- loop

let last = performance.now();
// The economy's once-a-frame duties (the shop prompt, jump feats, famous-car
// claims, closing a shop when the car rolls). They used to run in economy.js's
// own requestAnimationFrame, registered after main's, so they ran after
// frame() in every display frame whatever frame() did; they still do, from
// here. Set once installEconomy() has run, at the end of this file.
let economyPulse = null;
function runEconomyPulse() {
  if (economyPulse) try { economyPulse(); } catch (e) { console.warn('economy', e); }
}

// W8-LIGHTAUTO (Tom, 27 Oct): Advanced lighting is on by default; under 50 fps
// for ~8 s of real driving, a small card offers to turn it off (once a session,
// never under QA, perf or a harness). game/look/lightwatch.js has the rules.
const lightWatch = createFpsWatch();
const lightQuiet = lightPromptSuppressed();
const lightPrompt = new LightPrompt({
  t,
  disable: () => { G.settings = saveSettings(lightOffSettings(G.settings)); },
  keep: () => { G.settings = saveSettings(lightKeepSettings(G.settings)); },
  // Autosave through the one autosave path, then start the page over. A save
  // that did not happen (autosave off, storage refused) never reloads.
  relaunch: () => { if (!autosave('light')) return false; location.reload(); return true; },
  toast: (text, ms) => hud.toast(text, ms),
});
let lightLast = 0;
function lightWatchFrame(now) {
  if (lightWatch.fired && !lightPrompt.open) return;
  const dt = lightLast ? (now - lightLast) / 1000 : 0;
  lightLast = now;
  // Driving: in the drive, nothing over it (film, cards, menus, pause, map,
  // replay, sector card, meal shift), the tab visible. Anything else resets the
  // window and restarts the ~10 s grace.
  const driving = G.mode === 'drive' && !opening.active && !cinema.active && !story.active && !G.seamHold
    && !crashReplay.playing && !(endingCard && endingCard.active) && !G.mealShift && !modalOpen()
    && document.visibilityState !== 'hidden';
  if (lightPrompt.open) { lightPrompt.frame(dt, driving); return; }
  if (lightQuiet || !lightWatchArmed(G.settings)) return;
  const fps = lightWatch.frame(dt, driving);
  if (fps) lightPrompt.show(fps);
}

// The main animation loop. frame() is the game; the economy pulse follows it.
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  try { frame(now); } finally { runEconomyPulse(); }
  lightWatchFrame(now);   // W8-LIGHTAUTO: after the game frame and its pulse
}

function frame(now) {
  // U7. setModal() is the door and covers everything opened from this file,
  // but the story card and the mission intro card are shown by their own
  // modules through their own classes, so the truth about what is on screen is
  // read back once a frame. It is seven getElementById lookups and seven class
  // checks; it never force-closes anything.
  syncModal();
  // B-07: retry.js owns the fail card and the HUD shows only what it says. A
  // card (a brief, a job done, the story, the ending) clears the last job's
  // fail line, so it never sits over the next card.
  if (failToast() && (cinema.active || story.active || (endingCard && endingCard.active))) clearFailToast();
  hud.failCard(failToast());
  input.pollPad();
  // [opening] it runs its own frame loop; the game does not tick under it.
  if (opening.active) {
    if (input.hit('PadA')) opening.pad('A');
    else if (input.hit('PadB', 'PadStart')) opening.pad('B');
    last = now;
    input.endFrame();
    return;
  }
  let dt = (now - last) / 1000;
  last = now;
  // Unpausing and closing the map set `last = performance.now()`, which can be
  // later than the next rAF timestamp: a negative dt, one step backwards, and
  // with S held that stopped the car dead and put fuel back (driving review A8).
  if (!(dt > 0)) dt = 0;
  // A hitch longer than eight sub-steps is dropped, not stretched: at most 8
  // steps of at most 1/60 s. The old 0.25 s cap over 8 steps handed cars.js
  // 31 ms steps on a long hitch, twice what its integrators are tuned for.
  if (dt > 0.1333) dt = 0.1333;
  G.fps = lerp(G.fps, 1 / Math.max(dt, 1e-4), 0.05);
  if (padOutsideDrive()) { input.endFrame(); return; }

  if (G.mode === 'map') {
    if (input.hit('Tab', 'Escape', 'PadBack', 'PadB')) openMap(false);
    else { G.bigmap.update(dt, input); G.bigmap.draw(mapState()); }
    input.endFrame();
    return;
  }
  if (G.mode !== 'drive') { input.endFrame(); return; }
  // A sector card is up: nothing moves, nothing ages, until it lifts.
  if (G.seamHold || cinema.active) { input.endFrame(); return; }

  input.update(dt);
  if (crashReplayFrame(dt)) { input.endFrame(); return; }   // [w7-crashnight]
  if (G.mealShift) {
    if(input.hit('Escape')){G.mealShift.hide();pause(true);}
    else if(input.hit('Backspace'))failMission('Service quitté.');
    else {
      audio.engine(0, 0); audio.wind(0);audio.skid(0);audio.horn(false);
      G.mealShift.state.step(dt, {
        x:Number(input.down('KeyD','ArrowRight'))-Number(input.down('KeyA','ArrowLeft')),
        y:Number(input.down('KeyS','ArrowDown'))-Number(input.down('KeyW','ArrowUp')),
        feed:input.hit('Space','KeyE'),
      });
      G.mealShift.draw();updateMission(dt);
    }
    input.endFrame();return;
  }
  lightPrompt.keys(input);   // W8-LIGHTAUTO: 1 / 2, LB / RB, before the game reads them; never a driving key
  handleKeys();
  if (G.mode !== 'drive' || cinema.active || crashReplay.playing) { input.endFrame(); return; }   // [w7-crashnight] V starts the replay: no tick under it

  // Simulated time equals displayed time, always. This used to be a fixed
  // 1/60 accumulator: whatever was left over waited for the next frame, so on a
  // 60 Hz display a frame drew the truck after zero, one or two physics steps
  // depending on where the remainder sat, and on a 120 Hz MacBook it alternated
  // zero and one every frame. At 40 m/s a step is 0.67 m — that was the
  // "jitter at speed", and it was never in the physics (measured: the
  // suspension, pitch and camera are perfectly still at 146 km/h in fixed
  // steps). Sub-stepping the real frame time keeps every integrator at or
  // below the 1/60 it was tuned for, with nothing left over to alias.
  // A-06: slow-mo stretches the sim, not the frame. Real dt counts it down.
  // From here on dt is sim seconds (never longer than the real frame).
  // B-09: a hitstop holds the sim (dt 0: no ticks, the frame still renders)
  // and holds the slow-mo clock too, so the two never overlap.
  G.feelFx.update(dt);
  dt *= G.feelFx.holdsSlowmo() ? 0 : slowmoScale(dt);
  const n = Math.min(8, Math.max(1, Math.ceil(dt / STEP)));
  const h = dt / n;
  if (dt > 0) for (let i = 0; i < n; i++) tick(h);

  if (G.seamHold) { input.endFrame(); return; }
  stepEnv(dt);
  render(dt);
  input.endFrame();
}

// The pad outside the drive loop (UX review P5): A (or Start) turns a
// cinematic's page, Start/B resume from pause, and the d-pad walks the buttons
// of whatever menu is up with A to press one. Returns true when it acted and
// the rest of the frame should be skipped.
const PAD_SCREENS = ['pause', 'options', 'loadscr', 'startpicker', 'menu'];
function padOutsideDrive() {
  if (!input.pad) return false;
  if (cinema.active) {
    if (input.hit('PadA', 'PadStart')) { cinema.finish(); return true; }
    return false;
  }
  if (G.mode === 'paused' && input.hit('PadStart', 'PadB')) { pause(false); return true; }
  if (G.mode !== 'paused' && G.mode !== 'menu') return false;
  // [w6-opening] W2: on the first-launch gate, A or Start is New Game.
  if (gateLive() && input.hit('PadA', 'PadStart')) { newGame(); return true; }
  const root = PAD_SCREENS.map((id) => $(id)).find((el) => el && !el.classList.contains('hidden'));
  if (!root) return false;
  if (input.hit('PadUp', 'PadDown', 'PadLeft', 'PadRight')) {
    const list = [...root.querySelectorAll('button,select,input')]
      .filter((b) => !b.disabled && b.getClientRects().length > 0);
    if (!list.length) return true;
    const at = list.indexOf(document.activeElement);
    const dir = input.hit('PadUp', 'PadLeft') ? -1 : 1;
    focusFirst(list[at < 0 ? 0 : (at + dir + list.length) % list.length]);
    return true;
  }
  if (input.hit('PadA')) {
    const el = document.activeElement;
    if (el && root.contains(el) && el.click) el.click();
    else focusFirst(root.querySelector('button:not([disabled])'));
    return true;
  }
  return false;
}

function handleKeys() {
  // The story opener owns the keyboard while it is up: E / Enter / Espace turn
  // the page, Escape skips the rest of it. The pad: A turns, Start skips.
  const card = story.active ? story : (endingCard && endingCard.active ? endingCard : null);
  if (card) {
    if (input.hit('Escape', 'PadStart')) card.finish();
    else if (input.hit('Enter', 'KeyE', 'Space', 'PadA')) card.advance();
    G.wantStart = false;
    return;
  }
  if (input.hit('Escape', 'PadStart')) { pause(true); return; }
  if (input.hit('Tab', 'PadBack')) { openMap(true); return; }
  if (input.hit('KeyC', 'PadRB')) {
    G.cam = (G.cam + 1) % CAMS.length;
    // Remembered like N's map size is, so the next session and the Options
    // select agree with what you are looking through (UX review P9).
    G.settings = saveSettings({ ...G.settings, cam: G.cam });
  }
  if (input.hit('Backspace') && G.mission) { failMission('Abandonné.'); }
  // The input layer resolves the Shift+R chord before either reader runs.
  if (G.settings.lookBackToggle) {
    if (input.hit('LookBackToggle')) G.lookBack = !G.lookBack;
  } else G.lookBack = input.down('ShiftLeft', 'ShiftRight') && !input.radioShiftConsumed;
  // Shift+R changes the station. In hold mode that Shift is not a look back;
  // in toggle mode it must not cancel one you latched (UX review J3).
  if (input.hit('RadioNext')) { if (!G.settings.lookBackToggle) G.lookBack = false; toggleRadio(true); }
  // R is the radio (it is 2004 and the deck still matters); T is the get-me-out-of-here.
  if (input.hit('KeyT')) {
    if (!fuel.jerrycan(G, G.veh.baseSpec || G.veh.spec)) doReset();
  }
  // Y is the flatbed: same road, but the car comes back fixed and you pay for it.
  if (input.hit('KeyY')) doTow();
  // A-03: R takes a retry while one is on offer (tickRetry consumes KeyR), so
  // it reaches the radio only when there is nothing to retry.
  {
    const rdt = G.retryDt || 0;
    const rr = tickRetry(G, rdt, input);
    G.retryDt = 0;
    // [w7-replay] a course goes back on its line (resumeMission does not know courses).
    if (rr && rr.take) { if (!restartRun(G, rr.take.saved.id)) resumeMission(rr.take.saved); applyRetry(G, rr.take); }
    tickRerun(G, rdt, input);   // [w7-replay] R after a course finish: une autre run
    if (rr && rr.expired && calendar.isOver(G.day) && !G.summerOver) runEnding();
  }
  if (input.hit('KeyR', 'PadLB') && !input.hit('RadioNext')) toggleRadio();
  // G is the slang gloss. Tapping it latches the English under every bubble;
  // holding it also puts the last three lines back up with the joke explained.
  // The MENUS stay in French — this translates the town, not the interface.
  if (input.hit('KeyG')) {
    hud.toast(heckle.toggleGloss() ? t('toast.slang.on') : t('toast.slang.off'), 1600);
  }
  heckle.hold(input.down('KeyG'));
  // V pushes the sky on to the next front and says what it is now. The weather
  // makes its own decisions the rest of the time; this is for when you want to
  // go and stand in a thunderstorm instead of waiting ten minutes for one.
  //
  // This was K until the merge. Two agents working in parallel both claimed K —
  // the sky here, and the Kijiji classifieds in economy.js — and neither could
  // see the other, so one press did both. No suite catches it: nothing imports
  // main.js, and the two live in different modules. Kijiji keeps K, which it
  // documented claiming along with U for the garage.
  if (input.hit('KeyV') && crashReplay.offered(G)) { crashReplay.play(G, { blocked: crashReplayBlocked() }); }   // [w7-crashnight] V : revoir, only while offered
  else if (input.hit('KeyV')) {
    if (!VISUAL_PROTOTYPE) weather.advance();
    hud.toast('MÉTÉO\n' + weather.label + (weather.wet > 0.1 ? '  ·  chaussée mouillée' : ''), 1800);
  }
  // feel agent: while a garage is offering an E, that key is the garage's and
  // Enter still takes the job — otherwise E is what it always was.
  // Pad: A is the handbrake while driving, so Y takes the job.
  if (input.hit('Enter') || (input.hit('KeyE', 'PadY') && !G.repairOffer)) G.wantStart = true;
  if (input.hit('KeyQ')) G.wantCycle = true;
  // ---- S4-SUMMER sleep (begin): Z at 299 Fraser passes the days ----
  if (input.hit('KeyZ') && !VISUAL_PROTOTYPE) trySleep();
  // ---- S4-SUMMER sleep (end) ----
  // Mute moved off M so N can cycle the minimap size.
  if (input.hit('Digit0', 'Numpad0', 'F9')) {
    onSettings(saveSettings({ ...G.settings, audio: !G.settings.audio }));
    hud.toast(G.settings.audio ? t('toast.mute.on') : t('toast.mute.off'), 900);
  }
  if (input.hit('KeyN')) cycleMapSize();
  if (input.down('Equal', 'NumpadAdd')) zoomMap(-1);
  else if (input.down('Minus', 'NumpadSubtract')) zoomMap(1);
  // 'Legend' is whatever key types « ? » (core/input.js), not the US slash.
  if (input.hit('Legend')) legend.toggle();
  audio.horn(input.down('KeyH') || input.padHorn);
  if (G.traffic) G.traffic.playerHorn = !!(input.down('KeyH') || input.padHorn);   // S3-CRASH: traffic swerves for it
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
  // QA F6: not on the tick the car dies. The flatbed below tows and repairs it
  // in this same tick, so « va le faire réparer » would land right after
  // « Remorquage… pis réparé » with the damage already back at 0.
  const dying = v.damage >= DAMAGE.DEAD && !G.towed && !G.mission?.def?.ownsWreck;   // [w7-crashnight] ownsWreck
  // S3-CRASH: quiet during the crash show. [s3-cops] the repair banner keeps quiet while a chase is on (held, not spent).
  const hint = landingRepairHintMuted(G, v) || crashShowQuiet(G) ? { toast: null, hint: null } : repairHint(G.repairHints, v.damage, { quiet: !!(G.cops && G.cops.chasing) });
  // [/s3-cops]
  if (hint.toast && !dying) hud.toast(hint.toast, 3400);
  hud.setRepairHint(hint.hint);

  // Dead: the job is gone and so is the car, until the flatbed drops it home.
  if (v.damage >= DAMAGE.DEAD && !G.towed && !G.mission?.def?.ownsWreck) {   // [w7-crashnight] the mode owns its wreck
    G.towed = true;
    // The flatbed is not a charity. If the wallet can stand it, it costs.
    // tow.towHome charges, places the car on a checked road spot at its
    // owner's (homes.js knows every owner, the SVX included) and resets the
    // repair state; it cannot throw on a car with no home.
    // Tow first, then fail the job: a job's cleanup may hand you back your own
    // car (golfjob), and it is the wreck that goes on the flatbed.
    const r = tow.towHome(G, homeOf(v.spec.id), { fee: REPAIR.TOW });
    if (G.mission) failMission('Le char est fini. Remorqué.');
    else {
      hud.toast(tow.towLine(r, { wreck: true }), 3200);
      audio.chime(false);
    }
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
  hud.toast(t('toast.mapsize') + ' : ' + t(G.mapPrefs.size === 0 ? 'map.small' : 'map.large'), 900);
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

// ---- [wave/1-memory] sector gating ------------------------------------------
// Which slices of the map are resident is decided here, twice a second, from
// where the truck is (game/sectors.js). Geometry is baked by a Worker while
// uploads and their first draws are admitted on the main thread.
// The sim is HELD while the card is up (frame() returns early) — held, not
// reset: the clock, the weather and the radio carry straight on when it lifts.
// Unloading is silent; nobody misses a sector they are 2.6 km away from.
const SEAM_MIN_MS = 1800;
let sectorT = 0;
let seamSequence = 0;
let destinationSequence = 0;
const seamSchedule = requestAnimationFrame.bind(window);
const seamFrame = () => new Promise((resolve) => seamSchedule(resolve));
async function sectorTransition(id, work) {
  const sequence = ++seamSequence;
  G.seamHold = true; showSeamCard(id);
  const start = performance.now();
  try {
    await seamFrame(); await seamFrame();
    if (sequence !== seamSequence) return false;
    await work();
    if (sequence !== seamSequence) return false;
    const at = performance.now(); refreshReactive();
    G.world.sectors.lastReactiveMs = performance.now() - at;
    await seamFrame();
    return sequence === seamSequence;
  } finally {
    if (sequence === seamSequence) {
      const left = Math.max(0, SEAM_MIN_MS - (performance.now() - start));
      if (left) await new Promise((resolve) => setTimeout(resolve, left));
      if (sequence === seamSequence) { hideSeamCard(); G.seamHold = false; }
    }
  }
}
async function prepareLocation(x, z) {
  const S = G.world?.sectors;
  if (!S) return;
  const want = S.plan(x, z);
  if (!want.load.length && !want.unload.length) return;
  return sectorTransition(S.at(x, z), () => S.update(x, z));
}
function teleportTo(x, z, yaw = 0) {
  const destination = ++destinationSequence;
  // Invalidate even a queued transition that has not created its Worker yet.
  ++seamSequence;
  const S = G.world?.sectors;
  S?.cancel();
  if (G.seamHold) {
    // Cancellation may follow an eviction, so refresh the remaining views.
    refreshReactive(); hideSeamCard(); G.seamHold = false;
  }
  const place = () => {
    if (destination !== destinationSequence) return { cancelled: true };
    G.veh.reset(x, z, yaw, spawnY(x, z));
    return { cancelled: false };
  };
  if (!S || S.has(S.at(x, z))) return Promise.resolve(place());
  return prepareLocation(x, z).then(place).catch((error) => {
    if (error.name === 'AbortError') return { cancelled: true };
    throw error;
  });
}
function currentSectorReady(v) {
  if (G.seamHold) return false;
  const S = G.world?.sectors;
  if (!S || !v || S.has(S.at(v.x, v.z))) return true;
  // Tow, restored saves and mission handoffs can reset the vehicle directly.
  // Hold their first physics/render entry until the destination is prepared.
  // sectorTransition sets seamHold synchronously, so following frames join
  // the hold instead of starting competing Worker requests.
  prepareLocation(v.x, v.z).catch((error) => {
    if (error.name !== 'AbortError') console.error('sector destination', error);
  });
  return false;
}
function sectorTick(dt, v) {
  if (G.seamHold) return;
  sectorT += dt;
  if (sectorT < 0.5) return;
  sectorT = 0;
  const S = G.world.sectors;
  const want = S.plan(v.x, v.z);
  if (!want.load.length && !want.unload.length) return;
  for (const id of want.unload) S.unload(id);
  if (!want.load.length) { refreshReactive(); return; }
  const id = want.load[0];          // one per tick; a second one waits half a second
  sectorTransition(id, () => S.load(id)).catch((e) => { if (e.name !== 'AbortError') console.error('sector', id, e); });
}
// The reactive world bakes its props from world.propSpots and its peds walk
// world.walks by index, and both lists just changed under it. Rebuild it,
// carrying the streak across so a seam does not zero the scoreboard, and give
// the old bake's buffers back.
function refreshReactive() {
  if (!G.reactive) return;
  const old = G.reactive, r = G.renderer;
  const nu = new Reactive(r, G.world);
  for (const k of ['streak', 'streakT', 'streakKind', 'streakStep', 'prevDamage']) nu[k] = old[k];
  nu.bind(G);
  G.reactive = nu;
  if (!r.free) return;
  // The kind meshes are shared with old.debris, but belong to this one bake.
  // Return them and the three particle meshes as well as chunks and people.
  const retired = new Set();
  for (const c of old.props?.chunks || []) if (c.mesh) retired.add(c.mesh);
  for (const m of Object.values(old.props?.meshes || {})) if (m) retired.add(m);
  for (const arr of Object.values(old.peds?.mesh || {})) for (const m of arr) if (m) retired.add(m);
  for (const key of ['puffMesh', 'sparkMesh', 'glassMesh']) if (old.debris?.[key]) retired.add(old.debris[key]);
  for (const m of retired) r.free(m);
}
function showSeamCard(id) {
  const el = $('seam');
  if (!el) return;
  el.querySelector('.skicker').textContent = t(`seam.${id}.kicker`);
  el.querySelector('.sname').textContent = t(`seam.${id}.name`);
  el.querySelector('.scap').textContent = t(`seam.${id}.cap`);
  setModal('seam', true);
}
function hideSeamCard() { setModal('seam', false); }
// ---- end sector gating -------------------------------------------------------

let dryTank = false;
function tick(dt) {
  if (!currentSectorReady(G.veh)) return;
  G.retryDt = (G.retryDt || 0) + dt;   // A-03: the retry window, read in handleKeys
  if (cinema.active || story.active || endingCard?.active) return;
  const v = G.veh;
  if (G.world.sectors) sectorTick(dt, v);
  if (G.seamHold) return;
  // The sky first: the environment, the wet road and the puddle the front wheel
  // is about to find all have to be settled before the car is integrated.
  weather.update(dt, G);
  // cars.js reads grip and brake straight off the spec sheet and that file is
  // not ours to edit, so a wet road is applied by handing the Vehicle a clone of
  // its own spec with the numbers scaled. `baseSpec` is the tuned dry sheet;
  // the spec stack seats it (and the engine voice) whenever it changes, and
  // lays weather then skills over it, so weather's cache still sees the base.
  v.spec = specstack.driveSpec(G, v, { weather, skills });
  {
    // Gas: burned off the metres just driven, filled when you sit on the
    // Petro-Canada forecourt (the same spot the repairs use). A dry tank hands
    // the Vehicle a sheet with no engine on it, and it coasts.
    // On the forecourt: 24 m of the Petro-Canada pillar, like the repairs
    // (repairSpotAt only answers when there is damage to fix, so it cannot be
    // the test here).
    const gp = PLACES.gas;
    const atPump = !!gp && Math.hypot(v.x - gp.x, v.z - gp.z) < 24;
    const dry = fuel.tickFuel(G, dt, v, input.throttle, atPump);
    if (dry) v.spec = dry;
    dryTank = !!dry;
    // The HUD gauge and the needle on the dash read the same two numbers, so
    // the tank size is parked on G rather than recomputed in the renderer.
    G.fuelTank = fuel.tankOf(v.baseSpec);
    hud.setFuel(G.fuel, G.fuelTank);
    if (!towUI) towUI = tow.installButtons(G, doReset, doTow);
    if (towUI) towUI.update(v.damage, G.settings.lang);
    const env = calendar.envelopeText(G);
    // The headline is the days left in the summer, not a dollar goal.
    hud.setEnvelope(env.amount, env.day, false);
  }
  updateDayNight(dt);
  look.tick(dt);   // the visual wave's per-step features (game/look/frame.js)
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
  // [vehicles] A bicycle has legs instead of an engine and a bunny-hop instead
  // of a handbrake, so it gets at the controls before the vehicle does. It is
  // a no-op in anything with a motor.
  vehicleTick(G, ctl, dt);
  const preImpact = v.impact;
  const preKmh = Math.abs(v.speedKmh || 0);
  v.damageSensitivity = G.settings.damageSensitivity;
  v.update(dt, ctl, G.phys);
  if(v.spec.id==='ranger')stepSpare(v,dt);
  // Air and landings. `v.landed` is the vertical speed the springs killed, set
  // for exactly one tick; `v.lastAir` is how long the flight that ended it was.
  if (v.inAir) G.stats.airtime += dt;
  // A-06: a long flight gets its slow-mo while it is still in the air.
  G.airT = v.inAir ? (G.airT || 0) + dt : 0;
  if (v.inAir && G.airT >= SLOWMO.jumpAir && G.airT - dt < SLOWMO.jumpAir) fireSlowmo('jump');
  audio.whoosh(v.inAir ? clamp(v.clearance / 2.2, 0, 1) : 0);
  if (v.landed > 0) {
    // What that landing was, for the achievement rules: how long the flight was
    // and whether the thing you came down in was the Ottawa river.
    landEvent = {
      air: v.lastAir, force: v.landed,
      // A bridge deck is not the river, whatever the water polygon says.
      landedInWater: !!(G.phys.waterAt && G.phys.waterAt(v.x, v.z) && !G.phys.roadAt(v.x, v.z)),
      x: v.x, z: v.z,
    };
    G.stats.landings++;
    if (v.landed > G.stats.hardest) G.stats.hardest = v.landed;
    audio.land(v.landed);
    G.camShake = Math.min(1, G.camShake + v.landed * 0.09);
    // jumps.js owns what counts as a jump. This used to be its own 0.8, which
    // meant the stats counter and the money disagreed about what had happened.
    if (v.lastAir > AIR.minAir && !crashShowQuiet(G)) {   // S3-CRASH: a crash bounce is not a jump
      G.stats.jumps++;
      if (v.lastAir > G.stats.bigAir) G.stats.bigAir = v.lastAir;
      // [S3-JUMPS] One landing readout: jumps.js's board says the air, the
      // metres and the money, so main.js's own airtime toast that
      // printed on top of it is gone. Somebody still saw that.
      // (assets/text/heckles.json, trigger `bigair`.)
      // [s3-ranger] a kerb hop under 1 s is not a stunt: no heckle either.
      if (missionNotificationAllowed(G, 'stunt') && v.lastAir > 1.1 && !(v.kerbAir && v.lastAir < 1.0)) heckle.say(null, 'bigair');
      // [/S3-JUMPS]
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
  const preCopHit = v.lastHit || 0;
  G.cops.update(dt, G);
  // B-09: a hit() inside the police update was a cop contact.
  const copHit = (v.lastHit || 0) > preCopHit;
  fortier.update(dt, G);

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
      // A low-speed tap on Margaret's Saturn (the stray W at the very start of a
      // new game, nose-in at 299) is a joke, not a repair bill: no damage at
      // all (refine A-07: first-drive damage 0), and Margaret says so once.
      const tap = id === 'saturn' && closing < 4;
      v.hit(closing, contact.nx, contact.nz, tap ? 0 : 1); v.syncFrame();
      if (tap) margaretBump();
      else if (closing > 1.4) heckle.say('Voisin', 'parked');    // MON CHAR!
    }
  }
  // Walls, poles, traffic and parked cars have all had their say by now.
  if (v.impact > preImpact + 0.08) {
    audio.crash(v.impact);
    // B-09: the rung comes from hit() only (walls, poles, traffic, parked
    // cars, cops: v.lastHit), never from a kerb, a driveway lip or a landing,
    // which raise v.impact too (code-review-B1 B-09). Before fireSlowmo, so
    // the crash gets its hitstop and the slow-mo follows it.
    const hitF = v.lastHit || 0;
    if (hitF > 0 && !(v.landed > 0)) {
      const kind = kindForImpact(hitF, { cop: copHit });
      if (kind) G.feelFx.event(kind, { slowmo: G.slowmo.left > 0 });
    }
    // A-06: a real hit at speed is the show, not only the bill.
    if (v.impact > SLOWMO.crashForce && preKmh > SLOWMO.crashKmh && fireSlowmo('crash')) {
      // ---- S3-CRASH crash show (begin) ----
      // Same threshold as the slow-mo (a real impact, not a bump): the side
      // camera, the parts off the car and the crunch's tail.
      startCrashCam(v, preKmh);
      G.stats.crashes = (G.stats.crashes || 0) + 1;   // S4-SUMMER: the summer-end screen counts them
      if (G.reactive) G.reactive.crashShow(v, preKmh / 3.6);
      audio.crashTail(v.impact);
      // ---- S3-CRASH crash show (end) ----
    }
  }
  // B-09: the small rungs. Read-only on traffic (drainNearMisses stays free
  // for the style chain); feel.js rate-limits each kind.
  if (G.traffic.nearMisses.length) G.feelFx.event('nearMiss', { slowmo: G.slowmo.left > 0 });
  {
    const smashed = (G.stats && G.stats.propsSmashed) || 0;
    if (smashed > (G.feelProps || 0)) G.feelFx.event('mailbox', { slowmo: G.slowmo.left > 0 });
    G.feelProps = smashed;
  }
  if ((v.kind === 'gravel' || v.kind === 'dirt') && !v.inAir && preKmh > 20) G.feelFx.event('gravel', { k: Math.min(1, preKmh / 60) });
  driveHooks(dt, v);
  skills.tick(G, dt, v, ctl, hud);
  G.signals.update(dt);
  if (G.signals.playerRanRed(v)) {
    G.ranRed = true;
    hud.toast('T\u2019as br\u00fbl\u00e9 un feu rouge', 1700);
    heckle.say('Chauffeur', 'red');
  }
  ambush.tick(G, dt, hud);
  updateMission(dt);
  ghost.update(G);   // [w7-replay] records the run, plays back the best
  heckleTriggers(dt, v);
  // ---- hangout agent hook (the only lines this file owns for the porch) ----
  // Mike's place is not a job, so it runs after the mission runner and takes
  // the HUD prompt off it when you are actually in the driveway. It needs two
  // things main.js has and hangout.js does not: a tick, and the ability to hand
  // a job back — a friend offering you work from the porch starts an ordinary
  // mission. Everything else (props, dialogue, the bins) lives in hangout.js.
  if (!G.startMission) G.startMission = startMission;
  hangout.update(dt, G);
  // The summer's five beats arrive in order (game/arc.js): unlockArc pushes the
  // next one onto MISSIONS when its gate opens, which is why this file needs no
  // idea that an arc exists — the marker just turns up.
  unlockArc(G);
  // ---- end hangout hook ---------------------------------------------------
  heckle.update(dt, G);
  // The achievements out of assets/text/ui.json. `landEvent` is the one-shot
  // bag; everything else the rules need is already on G.
  flavour.update(dt, G, landEvent);
  landEvent = null;
  // [w6-shortcuts] « Raccourci trouvé! n/4 »: once per cut per summer, saved with the summer.
  { const sc = shortcuts.tick(G, dt, v); if (sc && sc.text) hud.toast(sc.text, 2600); }

  updateRepairSpot(dt, v);                 // feel agent: after the mission runner
  if (G.props) G.props.update(dt, G);
  if (G.reactive) G.reactive.update(dt, G);
  G.time += dt;
  crashReplay.record(G, dt);   // [w7-crashnight]
  G.playtime += dt;                       // saved, unlike G.time
  G.stats.dist += Math.abs(v.vLong) * dt;

  G.streetTimer -= dt;
  if (G.streetTimer <= 0) {
    G.streetTimer = 0.4;
    G.street = G.nav.streetName(v.x, v.z);
    hud.setStreet(G.street);
    // « Rues d'Aylmer que tu connais »: driven on, not just passed near.
    if (Math.abs(v.vLong) > 2) noteStreet(G, G.street);
  }
  updateRoute(dt);

  // The gearbox. rpm is not "how fast are you going out of top speed" any more:
  // it is road speed through the real ratios, and the engine note follows it —
  // including the 250 ms clutch dip on every change. See game/gearbox.js.
  // In R the pedal that is driving is S, not W, and reverse is a real gear with
  // its own (very short) ratio — which is what makes backing up whine.
  const gb = G.gearbox;
  // A dry tank coasts (fuel.js hands the Vehicle a sheet with no engine), and
  // it must sound like it: flooring W on « Panne sèche » used to rev and load
  // the engine note exactly as if it were pulling (driving review A5).
  const drivePedal = dryTank ? 0 : (v.reversing ? ctl.brake : ctl.throttle);
  gb.update(dt, v.speedKmh, drivePedal, v.reversing);
  const load = clamp(drivePedal * 0.85 + Math.min(0.2, v.speedKmh / 400), 0, 1);
  audio.engine(gb.rpm, load, v.speedKmh, drivePedal, gb.clutch, dt);
  audio.wind(v.speedKmh);   // A-06: wind and road roar above 70 km/h
  // [s3-ranger] the squeal reads the car's `squeal` (slip angle plus the lever), not `skid`.
  audio.skid(v.squeal != null ? v.squeal : v.skid);
  // The driver's head. It reads measured acceleration and the gearbox's rpm, so
  // it belongs on the fixed step with them and not in render(): off the frame
  // clock the dip would be a different size at 60 Hz and at 144, and a headless
  // run that steps the sim five hundred times and draws once would never see a
  // dive at all. (It did not. That is how this was found.)
  if (G.cockpit) G.cockpit.update(dt, G);
  hud.setGear(v.reversing ? 'R' : gb.gear);
  hud.setGaugeTop(v.spec.topSpeed * 3.6);   // [s3-ranger] the speedo fits the car you are in
  // Where the car is, so the Ottawa signal (CHEZ 106) can fade the further west
  // you get. The five local stations ignore it.
  radio.setPos(v.x, v.z);
  // AUD-02: the ambience bed plays on both entries (index.html had none).
  audio.environment({ rain: weather.rain, night: G.envKey === 'night', speed: v.speedKmh,
    waterfront: Math.max(0, 1 - Math.hypot(v.x - PLACES.marina.x, v.z - PLACES.marina.z) / 350) });
  // ...and what the sky is doing, so the DJ has something to talk about. A
  // storm, a hot hazy afternoon, the middle of the night: radio_extra.json has
  // lines for all three, per station.
  radio.setScene(weather.rain > 0.25 || weather.dark > 0.6, weather.haze > 0.5, G.envKey === 'night');
  const speaking = !!globalThis.speechSynthesis?.speaking;
  radio.update(dt, load, input.down('KeyH') || input.padHorn, speaking);
  audio.speech(speaking);   // AUD-02: the engine gives way 2 dB to a voice

  tutorial.update(dt, {
    speedKmh: v.speedKmh, steer: input.steer, brake: ctl.brake,
    handbrake: ctl.handbrake, mapOpened: G.tutoMapOpened, jobTaken: G.tutoJobTaken,
    drivewayM: G.tutoDrive ? Math.hypot(v.x - G.tutoDrive.x, v.z - G.tutoDrive.z) : Infinity,   // W8-BUGS
  });
}

// Margaret, from the kitchen window. Once per game, English, deadpan.
const MARGARET_LINES = ['Tom. That’s my car.', 'Reverse is the other letter.', 'Tom. Mirrors. Use them.'];
function margaretBump() {
  if (G.margaretBumped) return;
  G.margaretBumped = true;
  hud.toast('Margaret: « ' + MARGARET_LINES[Math.floor(Math.random() * MARGARET_LINES.length)] + ' »', 2600);
}

// ---------------------------------------------------------------- heckles
//
// assets/text/heckles.json carries twelve triggers. Five of them arrive through
// heckle.js's own alias table because peds.js, traffic.js, cops.js and the
// red-light check were already firing them (nearmiss, honked, hitcar, ranred,
// cops). The other seven are conditions nobody was watching for, so main.js
// watches for them here — one place, one timer each, all of them deliberately
// slow to fire so the town does not turn into a slot machine. The limiter in
// heckle.js still has the last word: one line every four seconds, whatever.
// The last landing, handed to flavour.update() for one tick and then dropped.
let landEvent = null;
const HK = {
  speedT: 0, revT: 0, wrongT: 0, stillT: 0, walkT: 0, props: 0, saidStuck: false, rolled: false,
};
// Under this, you are stopped rather than stuck.
const STUCK_KMH = 3, STUCK_AFTER = 14;
// The speed at which a residential street starts shouting.
const SPEED_KMH = 95, SPEED_AFTER = 2.5;

function heckleTriggers(dt, v) {
  const kmh = v.speedKmh;

  // Doing 95 through a town where the limit is 50.
  HK.speedT = kmh > SPEED_KMH ? HK.speedT + dt : 0;
  if (HK.speedT > SPEED_AFTER) { HK.speedT = 0; heckle.say(null, 'speeding'); }

  // A long way in reverse is a thing people comment on.
  HK.revT = (v.reversing && Math.abs(v.vLong) > 6) ? HK.revT + dt : 0;
  if (HK.revT > 3) { HK.revT = 0; heckle.say(null, 'reversing'); }

  // Parked in the middle of nowhere, going nowhere, for a quarter of a minute.
  // QA F2: never while a story line or a card is up, and never before the
  // player has driven at all this session (sitting at spawn is not stuck).
  if (kmh > 12) HK.rolled = true;
  const quiet = !HK.rolled || heckle.storyBusy() || heckle.hushed || !!modalOpen();
  HK.stillT = (kmh < STUCK_KMH && !quiet) ? HK.stillT + dt : 0;
  if (HK.stillT > STUCK_AFTER && !HK.saidStuck) { HK.saidStuck = true; heckle.say(null, 'stuck'); }
  if (kmh > 12) HK.saidStuck = false;

  // Something the reactive world knocked over. It keeps the count; we only have
  // to notice that it went up.
  const smashed = (G.stats && G.stats.propsSmashed) || 0;
  if (smashed > HK.props) { HK.props = smashed; heckle.say(null, 'hitprop'); }
  else HK.props = smashed;

  // The road you are on, which way it runs, and which side of it you are on.
  const rc = roadContext(v);
  // Off the asphalt but right beside it, with your foot in it: the sidewalk.
  HK.walkT = (rc && !rc.onRoad && rc.dist < 9 && kmh > 14) ? HK.walkT + dt : 0;
  if (HK.walkT > 1.2) { HK.walkT = 0; heckle.say(null, 'sidewalk'); }

  // Wrong side of a two-way street. Needs to be sustained: overtaking, a
  // three-point turn and a wide corner all put you over the line for a second.
  HK.wrongT = (rc && rc.onRoad && rc.twoWay && rc.side < -2.2 && kmh > 25) ? HK.wrongT + dt : 0;
  if (HK.wrongT > 2.2) { HK.wrongT = 0; heckle.say(null, 'wrongway'); }
}

// Nearest drivable road edge to the car, out of the Nav graph's own spatial
// hash — the same nine cells streetName() walks, so this costs nothing. Returns
// how far off the centreline you are, whether the street runs both ways, and
// which side of it you are on (negative is the wrong one, in Québec).
const roadCtx = { onRoad: false, dist: Infinity, twoWay: false, side: 0 };
let roadCtxT = 0;
function roadContext(v) {
  roadCtxT -= 1 / 60;
  if (roadCtxT > 0) return roadCtx;
  roadCtxT = 0.25;
  const nav = G.nav;
  if (!nav || !nav.grid) return null;
  const cell = nav.cell, x = v.x, z = v.z;
  let bd = 60 * 60, bn = null, be = null;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = nav.grid.get(((x / cell | 0) + i) * 100000 + ((z / cell | 0) + j));
    if (!list) continue;
    for (const n of list) for (const e of n.edges) {
      if (e.cls === 'service') continue;
      const ex = e.to.x - n.x, ez = e.to.z - n.z, l2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - n.x) * ex + (z - n.z) * ez) / l2, 0, 1);
      const d = (n.x + ex * t - x) ** 2 + (n.z + ez * t - z) ** 2;
      if (d < bd) { bd = d; bn = n; be = e; }
    }
  }
  if (!be) return null;
  roadCtx.dist = Math.sqrt(bd);
  roadCtx.onRoad = !!G.world.roadAt(x, z);
  // A one-way street only got one edge built for it (see nav.js), so the way to
  // ask is whether the far node has an edge coming back.
  roadCtx.twoWay = be.to.edges.some((e2) => e2.to === bn);
  // Which side. Forward is (sin yaw, cos yaw); the right of a heading (dx,dz)
  // is (dz,-dx). Take the road's direction the way YOU are going down it, and
  // a positive number means you are on the right-hand side, where you belong.
  let dx = be.to.x - bn.x, dz = be.to.z - bn.z;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const sgn = (fx * dx + fz * dz) >= 0 ? 1 : -1;
  const px = bn.x + dx * clamp(((x - bn.x) * dx + (z - bn.z) * dz), 0, dl);
  const pz = bn.z + dz * clamp(((x - bn.x) * dx + (z - bn.z) * dz), 0, dl);
  roadCtx.side = ((x - px) * (dz * sgn) - (z - pz) * (dx * sgn));
  return roadCtx;
}

const mm = m4.create();
// The player car's model matrix, built once a frame before anything is drawn:
// the driver's camera is composed onto it (it is a point INSIDE the car, not an
// offset from it), and the cab and the mirrors are drawn with it. Sharing one
// matrix is what stops the dash and the body disagreeing by a frame.
const carModel = m4.create();
const camWorld = m4.create();
let fpsAt = 0;
const yellow = new Float32Array([1, 0.79, 0.3]);
const white = new Float32Array([1, 1, 1]);
const cameraGroundY = (x, z) => G.phys?.groundY ? G.phys.groundY(x, z) : 0;

// [s3-ranger] chase camera feel: slide swing per m/s of slip, steering lean
// (rad at full lock and speed), brake dip (m).
const CAM_SLIDE = 0.05, CAM_LEAN = 0.12, CAM_DIP = 0.30;

function render(dt) {
  const r = G.renderer, v = G.veh, cam = CAMS[G.cam];
  if (G.seamHold || (G.mode === 'drive' && !currentSectorReady(v))) return;
  // The camera follows whatever the current stage put in focus — the car, or the
  // canoe. Anything with x/z/yaw/vLong/vLat/spec works.
  const f = G.focus || v;
  const chase = cam.name !== 'hood' && cam.name !== 'driver' && !G.devCam && !G.cineCam;

  // The driver's seat (BACKLOG C6). It is only a camera when the thing in focus
  // is the car you are sitting in and that car HAS a cab: a bicycle, the golf
  // cart and the canoe fall back to the hood cam's framing rather than putting
  // the eye inside a bicycle.
  if (!G.cockpit) G.cockpit = new Cockpit(r);
  const inCab = cam.name === 'driver' && f === v && hasCockpit(v.spec);
  // (The head itself is stepped in tick(), on the fixed clock, with the physics
  // it reads.)
  // From the seat the radio is two paper door speakers and a cassette adapter,
  // not a station. audio.setCabin only does work on a change.
  audio.setCabin(inCab);

  // Chase camera: yaw eases toward the car, and a slide swings it wide.
  // D5: look where you're going. The flip is blended over REV_CAM_BLEND seconds
  // (feel agent) — snapping the hood cam through 180° was the jarring bit.
  const revWant = cam.name === 'hood' && !!f.reversing ? 1 : 0;
  const rate = dt / REV_CAM_BLEND;
  G.revBlend = clamp(G.revBlend + clamp(revWant - G.revBlend, -rate, rate), 0, 1);
  const back = G.settings.invertLook ? !G.lookBack : G.lookBack;   // option: look back by default
  // [s3-ranger] begin: the slide swing went 0.02 to 0.05 rad per m/s of slip
  // (a 2.2 m/s lever slide was 2.5 degrees, invisible; now 6.3), and the chase
  // cams lean into the corner with the steering (0.12 rad at full speed
  // fraction, eased at 3/s) and dip 0.3 m under the brakes. feel.md 4 and 6.
  const camChase = chase;   // the three third-person cams; hood and seat keep 0.02
  const leanK = clamp(Math.abs(f.vLong || 0) / 25, 0, 1);
  const leanWant = camChase && f === v && !back ? -clamp(input.steer || 0, -1, 1) * CAM_LEAN * leanK : 0;
  G.camLean = (G.camLean || 0) + (leanWant - (G.camLean || 0)) * (1 - Math.exp(-3 * dt));
  const dipWant = camChase && f.braking && Math.abs(f.vLong || 0) > 3 && !f.inAir ? CAM_DIP : 0;
  G.camDip = (G.camDip || 0) + (dipWant - (G.camDip || 0)) * (1 - Math.exp(-(dipWant > (G.camDip || 0) ? 5 : 3) * dt));
  const slideSwing = clamp((f.vLat || 0) * (camChase ? CAM_SLIDE : 0.02), -0.35, 0.35);
  G.feel.camLean = G.camLean; G.feel.camDip = G.camDip; G.feel.camSlide = slideSwing;
  const want = f.yaw + (back ? 0 : Math.PI * (1 - (cam.name === 'hood' ? G.revBlend : 0)))
    - slideSwing + G.camLean;
  // [s3-ranger] end
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
  let py = (f.bodyY || 0) + cam.height + Math.abs(f.vLong) * 0.012 - (G.camDip || 0);   // [s3-ranger] brake dip
  // ...and it does not ride inside a house. Only the three third-person cams
  // have a boom to shorten: the hood cam sits on the bonnet and the driver's
  // eye is a point in the car's own frame, so neither can be occluded by
  // anything the car is not already touching. See game/camclip.js.
  if (chase && G.world?.queryCameraBlocks) {
    if (!G.camClip) G.camClip = makeClip();
    const c = clipCamera(G.camClip, G.world, f.x, (f.bodyY || 0) + 1.2, f.z, px, py, pz, dt);
    px = c.x; py = c.y; pz = c.z;
  }
  if (G.phys && G.phys.groundY) py = Math.max(py, G.phys.groundY(px, pz) + 1.1);
  if (chase && G.camClip?.teleported) {
    G.camPos[0] = px; G.camPos[1] = py; G.camPos[2] = pz;
  }
  // Frame-rate-independent smoothing: the same lag at 60 and 120 Hz, and no
  // per-frame wobble when dt varies (min(1, dt*k) only approximates this).
  const kxz = 1 - Math.exp(-9 * dt), ky = 1 - Math.exp(-6 * dt);
  if (cam.name === 'hood') {
    // The hood cam is bolted to the bonnet. Fed through the chase cam's
    // low-pass it sat v/9 m behind its mount: 3 m back at 100 km/h, about the
    // tailgate (driving review A3). Only the height keeps its easing.
    G.camPos[0] = px;
    G.camPos[2] = pz;
  } else {
    G.camPos[0] = lerp(G.camPos[0], px, kxz);
    G.camPos[2] = lerp(G.camPos[2], pz, kxz);
  }
  G.camPos[1] = lerp(G.camPos[1], py, ky);
  if (chase && G.camClip) guardView(G.camClip, G.world, f.x, (f.bodyY || 0) + 1.2, f.z, G.camPos, cameraGroundY);

  // Speed FOV, off absolute speed rather than a fraction of this car's top.
  // The fraction version quietly got weaker the day cars.js started solving real
  // terminal speeds: 100 km/h used to be 0.9 of the Ranger's stated top and is
  // now 0.67 of it, so the fastest thing in the game gave the smallest cue.
  // Metres per second is what the eye is actually reading. Widening the frame is
  // the cheapest, calmest way to say "fast" — the edges stretch, nothing shakes.
  //
  // A-06: at 94-108 km/h that alone still looked calm (Max, Jen), so a second
  // stretch comes in from 70 to 130 km/h, 0.26 rad of it, eased. At 100 km/h
  // the two together are about 0.22 rad. A crash or a big jump punches the
  // frame in a little, and that springs back in about a third of a second.
  const absV = Math.abs(f.vLong);
  const hiK = clamp((absV * 3.6 - 70) / 60, 0, 1);
  const speedFov = clamp((absV - 8) / 34, 0, 1) * 0.16 + hiK * hiK * (3 - 2 * hiK) * 0.26;
  G.feel.speedFov = speedFov;
  G.camPunch *= Math.exp(-7 * dt);
  if (G.camPunch < 0.002) G.camPunch = 0;
  const fov = G.q.fov + cam.fovAdd + G.settings.fov + speedFov - G.camPunch * 0.12;
  // In the air the chase cam leans with the nose, and every landing rattles the
  // hood cam for a moment. Both are small on purpose — they read, they don't spin.
  let camPitch = cam.pitch;
  let shakePitch = 0, shakeYaw = 0;
  if (f.inAir) camPitch += clamp(-f.pitch * 0.45, -0.22, 0.22);
  if (G.camShake > 0.002) {
    // This was one sine at 61 rad/s — about 9.7 Hz — straight onto pitch. That
    // is the frequency the eye reads as flicker rather than as motion, and on a
    // 60 Hz display it beats against the frame rate as well. It said "broken",
    // not "fast".
    //
    // Two slow sines at an irrational ratio never repeat, so it reads as the
    // truck moving rather than the picture vibrating, and a little of it goes to
    // yaw so the world sways instead of nodding. Half the amplitude, a fifth of
    // the frequency; the speed cue lives in the FOV above, where it belongs.
    const k = G.camShake * (cam.name === 'hood' ? 0.055 : 0.024) * G.settings.shake;
    shakePitch = (Math.sin(G.time * 11.7) * 0.65 + Math.sin(G.time * 7.3) * 0.35) * k;
    camPitch += shakePitch;
    // An offset for this frame only. It used to be added into G.camYaw once
    // per render, so a 144 Hz display got 2.4x the yaw of a 60 Hz one and the
    // chase ease had to wind the drift back out (driving review A7).
    shakeYaw = Math.sin(G.time * 9.1) * k * 0.5;
  }
  // A-06: a light speed shake above 70 km/h. Slow and small, the road under a
  // stiff truck rather than a vibrating picture, and it follows the shake
  // setting like the landing rattle does.
  if (hiK > 0 && !f.inAir) {
    const ks = hiK * (cam.name === 'hood' ? 0.0045 : 0.0028) * G.settings.shake;
    const sp = (Math.sin(G.time * 5.3) * 0.6 + Math.sin(G.time * 8.7 + 1.3) * 0.4) * ks;
    camPitch += sp; shakePitch += sp;
    shakeYaw += Math.sin(G.time * 4.1 + 0.7) * ks * 0.6;
  }
  // DEV-ONLY free camera for tools/aylmer-compare (window.AYLMER.devCam). Inert in play: G.devCam is never set.
  const dc = G.devCam;
  // [opening] the opening's camera rail (game/intro/opening.js). Unlike devCam it still draws the truck.
  const oc = !dc && G.cineCam;
  // B-09: the trauma shake. Angles go on top of the shakes above; the
  // position offset goes on a copy of the eye (FEEL_EYE), never into
  // G.camPos, which is the chase cam's smoothing state (code-review-B1
  // B-09). No translation from the cab, or while camclip is guarding the
  // boom against a wall.
  let eye = G.camPos;
  if (!dc && !oc) {
    const o = G.feelFx.cameraOffset(G.settings.shake * (cam.name === 'hood' ? 0.4 : 1));
    if (o.len > 0 || o.pitch !== 0 || o.yaw !== 0) {
      camPitch += o.pitch; shakePitch += o.pitch; shakeYaw += o.yaw;
      const guarded = chase && G.camClip && (G.camClip.guarded || G.camClip.alternate);
      if (!inCab && !guarded && o.len > 0) {
        const sy = Math.sin(G.camYaw), cy = Math.cos(G.camYaw);
        FEEL_EYE[0] = G.camPos[0] + cy * o.x + sy * o.z;
        FEEL_EYE[1] = G.camPos[1] + o.y;
        FEEL_EYE[2] = G.camPos[2] - sy * o.x + cy * o.z;
        eye = FEEL_EYE;
      }
    }
  }
  if (oc) { G.camPos[0] = oc.x; G.camPos[1] = oc.y; G.camPos[2] = oc.z; G.camYaw = oc.yaw; camPitch = oc.pitch; shakeYaw = 0; shakePitch = 0; }
  if (dc) { G.camPos[0] = dc.x; G.camPos[1] = dc.y; G.camPos[2] = dc.z; G.camYaw = dc.yaw; camPitch = dc.pitch; shakeYaw = 0; }
  let viewYaw = G.camYaw + shakeYaw;
  if (chase && G.camClip) {
    const st = G.camClip, wantAim = st.alternate || st.guarded ? 1 : clamp((1 - st.frac) * 3, 0, 1);
    st.aim = Math.max(wantAim, (st.aim || 0) * Math.exp(-2.4 * dt));
    if (st.aim < 0.001) st.aim = 0;
    const dx = G.camPos[0] - f.x, dz = G.camPos[2] - f.z;
    const pitch = Math.atan2((f.bodyY || 0) + 1.2 - G.camPos[1], Math.hypot(dx, dz));
    viewYaw += angleDelta(Math.atan2(dx, dz), viewYaw) * st.aim;
    camPitch = lerp(camPitch, pitch, st.aim);
  }
  // ---- S3-CRASH crash cam (begin) ----
  if (G.crashCam && !dc && !oc && !inCab && f === v) {
    const cc = crashCamView(f);
    if (cc) { eye = cc.eye; viewYaw = cc.yaw + shakeYaw; camPitch = cc.pitch + shakePitch; }
  }
  // ---- S3-CRASH crash cam (end) ----
  r.setGameState?.(G);
  r.setEnvironment(G.env);
  // The player's car, one matrix, before anything is drawn: the driver's camera
  // hangs off it and so do the cab and the mirrors.
  m4.compose(carModel, v.x, v.bodyY, v.z, v.yaw, v.pitch, v.roll);
  if (inCab && !dc) {
    // Not the chase path's smoothed position and not its Euler angles: the eye
    // is composed onto the car's own frame, so it inherits the body's pitch and
    // roll exactly (a lag of even one frame and the dash swims), and the head's
    // dip and turn are the only motion added. `cam.pitch` rather than `camPitch`
    // because the in-air lean is already in the body this camera is riding in.
    G.cockpit.view(camWorld, G.camPos, carModel, v.spec, cam.pitch + shakePitch);
    r.begin(G.camPos, G.camYaw + shakeYaw, camPitch, fov, { near: DRIVER_NEAR, world: camWorld });
  } else {
    r.begin(eye, viewYaw, camPitch, dc ? dc.fov : oc ? oc.fov : fov);
  }
  if (chase && G.camClip) recordCameraFrame(G.camClip, G.world, f.x, (f.bodyY || 0) + 1.2, f.z, r.eye, r.vp, dt, viewYaw, camPitch);

  look.beforeSky(r, G);
  m4.compose(mm, G.camPos[0], 0, G.camPos[2], 0, 0, 0);
  r.draw(G.sky.mesh, mm, skyOpts(G.env));
  if (G.quality !== 'low') r.draw(G.sky.clouds, cloudModel(mm, G.camPos, r.time), cloudOpts(G.env));
  m4.identity(mm);
  r.draw(G.world.distant, mm, { fogMul: 0.28 });
  G.world.draw(r, mm, f.x, f.z, G.q.drawDist, dt);
  G.signals.draw(r, f.x, f.z);
  look.afterWorld(r, G);

  if (!dc) drawCar(v.spec, v.x, v.z, v.yaw, v.pitch, v.roll, v.spin, v.steer, null, v.passengers, v.bodyY, v.gh);
  // The mirrors, the wipers, the proud hood hinge and the rust on the cowl seam
  // belong to the truck in EVERY camera — otherwise the thing you look at out
  // of the side window from the seat is not the thing the chase cam draws.
  if (!dc) G.cockpit.drawExtras(carModel, v.spec, null);
  // ...and the cab itself, only from inside it: the body loft is one-sided, so
  // without this the seat is in a convertible made of sky.
  if (inCab && !dc) G.cockpit.draw(G, carModel, v.spec, null);
  const night = nightAmount(G.env);
  // The light cones are two translucent wedges hanging off the nose. From the
  // hood camera the eye sits INSIDE them, so they wash the whole screen warm —
  // which nobody has ever seen from the driver's seat of a real car. Storms
  // made this obvious by turning the lights on in the middle of the afternoon.
  // The driver's seat is inside them too, and more so.
  if (!VISUAL_PROTOTYPE && night > 0.35 && cam.name !== 'hood' && !inCab && !dc && G.meshes.cones[v.spec.id]) {
    coneOpts.alpha = 0.15 * night;
    m4.compose(mm, v.x, v.bodyY, v.z, v.yaw, 0, 0);
    r.draw(G.meshes.cones[v.spec.id], mm, coneOpts);
  }
  for (const t of G.traffic.cars) {
    if (Math.hypot(t.x - v.x, t.z - v.z) > 320) continue;
    drawCar(t.spec, t.x, t.z, t.yaw, 0, 0, t.spin, 0, t.tint, 0, t.y || 0, t.y || 0);
  }
  for (const id of Object.keys(G.parked)) {
    const p = G.parked[id];
    if (Math.hypot(p.x - v.x, p.z - v.z) > 320) continue;
    drawCar(carById(id), p.x, p.z, p.yaw, 0, 0, 0, 0, null, 0, G.phys.groundY(p.x, p.z), G.phys.groundY(p.x, p.z));
  }
  for (const rv of G.rivals) {                     // race agent: the friends
    const c = rv.veh;
    if (Math.hypot(c.x - v.x, c.z - v.z) > 400) continue;
    drawCar(rv.spec, c.x, c.z, c.yaw, c.pitch, c.roll, c.spin, c.steer, null, 1, c.y, c.gh);
  }
  ghost.draw(r, G, carById);   // [w7-replay] the ghost of your best run
  G.cops.draw(G, drawCar);
  fortier.draw(G, drawCar);                          // ...and the police
  if (G.props) G.props.draw(r, f);
  if (G.reactive) G.reactive.draw(r, f, QUALITY[G.quality].drawDist);
  // --- avatars agent hook ------------------------------------------------
  // Four of the people in this town are real people. Sayyad waits on the lawn
  // at 75 Denise-Friend with his sister Zahra, Margaret at 299 Fraser, Mike at
  // 129 Frank-Robinson, and once they are aboard they ride as themselves
  // instead of as the anonymous head above. Built on the first frame that has
  // a renderer; avatars.js owns everything else.
  if (!G.avatars) G.avatars = new Avatars(r);
  G.avatars.draw(r, f, G, dt);
  // -----------------------------------------------------------------------
  drawMarkers();
  if (G.fx) G.fx.render(v, G.world, G.night, G.traffic.cars);
  look.afterTransparent(r, G);

  r.end();
  look.post(r, G);

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
    search: G.cops.searchCircle(),   // [w6-escape] C-16 red circle
    hides: G.cops.hideSpotsNear(f.x, f.z, hud.range),   // [w6-escape] C-16 hide spots, while wanted
    pois: QUEBEC_POIS,
    route: G.route,
  });
}

function drawCar(spec, x, z, yaw, pitch, roll, spin, steer, tint, passengers, y = 0, gy = 0) {
  const r = G.renderer;
  // [vehicles] Two-wheelers: the fork and bars that turn with the steering, and
  // the rider, who pedals and leans. Nothing happens here for a car.
  drawVehicleExtras(G, spec, x, z, yaw, roll, spin, steer, y);
  const skin = G.meshes.skins[spec.id];
  const opts = tint ? { colorMul: tint } : {};
  if (VISUAL_PROTOTYPE) opts.material = 'car';
  if (skin) opts.tex = skin.tex;
  look.paint(G, spec, opts);
  m4.compose(mm, x, y, z, yaw, pitch, roll);
  r.draw(skin ? skin.mesh : G.meshes.cars[spec.id], mm, opts);
  if(spec.id==='ranger' && G.meshes.spare)drawSpare(r,G.meshes.spare,mm,
    spec===G.veh.spec && Math.hypot(x-G.veh.x,z-G.veh.z)<0.1 ? G.veh.spareLift || 0 : 0);

  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const hx = spec.track / 2;
  const wheelR = skin ? skin.wheelR : spec.wheelR;
  const wopts = tint ? { colorMul: tint } : undefined;
  for (const sz of [1, -1]) for (const sx of (spec.twoWheel ? [0] : [-1, 1])) {
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

  // The blob shadow, and whatever else the look draws per car (game/look/carshadow.js).
  look.perCar(r, G, spec, x, z, yaw, y, gy);
}

function markerList() {
  const out = [];
  if (G.mission) {
    if (G.mission.target) out.push({ x: G.mission.target.x, z: G.mission.target.z, kind: 'objective' });
    for (const p of finalePins()) out.push({ x: p.x, z: p.z, kind: 'mission' });   // S4-SUMMER: the summer's places, tonight
  } else {
    for (const def of availableMissions(G)) {
      const p = PLACES[def.giver];
      out.push({ x: p.x, z: p.z, kind: 'mission' });
    }
    for (const id of Object.keys(G.parked).filter(id => !carById(id).hidden || garage.has(id,G.done))) out.push({ x: G.parked[id].x, z: G.parked[id].z, kind: 'car' });
  }
  if (G.waypoint) out.push({ x: G.waypoint.x, z: G.waypoint.z, kind: G.mission ? 'mission' : 'objective' });
  return out;
}

const coneOpts = { alpha: 0.15, unlit: true, colorMul: new Float32Array([1, 0.94, 0.74]) };
const cyan = new Float32Array([0.31, 0.83, 1]);
function drawMarkers() {
  // [opening] no job pillars in the film: from inside one it is a ghostly slab.
  if (G.cineCam) return;
  const r = G.renderer, v = G.veh;
  const pulse = 0.75 + Math.sin(G.time * 3) * 0.25;
  if (G.waypoint && !G.mission) {
    m4.compose(mm, G.waypoint.x, spawnY(G.waypoint.x, G.waypoint.z), G.waypoint.z, 0, 0, 0, 6, 9 + pulse * 2, 6);
    r.draw(G.meshes.marker, mm, { alpha: 0.22, unlit: true, colorMul: cyan });
  }
  if (G.mission && G.mission.target) {
    const t = G.mission.target;
    m4.compose(mm, t.x, spawnY(t.x, t.z), t.z, 0, 0, 0, t.r, 7 + pulse * 2, t.r);
    r.draw(G.meshes.marker, mm, { alpha: 0.22, unlit: true, colorMul: yellow });
    m4.compose(mm, t.x, spawnY(t.x, t.z) + 0.09, t.z, 0, 0, 0, t.r, 1, t.r);
    r.draw(G.meshes.ring, mm, { alpha: 0.3, unlit: true, colorMul: yellow });
  } else if (!G.mission) {
    for (const def of availableMissions(G)) {
      const p = PLACES[def.giver];
      if (Math.hypot(p.x - v.x, p.z - v.z) > 600) continue;
      const c = G.done.has(def.id) ? white : yellow;
      m4.compose(mm, p.x, spawnY(p.x, p.z), p.z, 0, 0, 0, 8, 6 + pulse, 8);
      r.draw(G.meshes.marker, mm, { alpha: G.done.has(def.id) ? 0.1 : 0.2, unlit: true, colorMul: c });
    }
  }
}

// ---------------------------------------------------------------- pause / wiring

function fillJobs() {
  const el=$('jobs'),en=G.settings.lang==='en',next=nextMission(G);
  el.replaceChildren();
  const current=G.mission?.def || next;
  $('pausemission').textContent=current?.title || (G.summerOver ? (en?'Summer complete':'Été terminé') : (en?'All jobs done':'Toutes les jobs faites'));
  $('pausebrief').textContent=G.mission?.stages[G.mission.idx]?.text || current?.brief || '';
  $('pause').style.setProperty('--pause-art', 'url("'+(current?.id==='alternateur'?'assets/cinema/alternateur.png':'assets/cinema/fraser-2004.png')+'")');
  $('restartmission').hidden=!G.mission;
  $('restartmission').textContent=en?'Restart mission':'Recommencer la job';
  $('abandonmission').hidden=!G.mission;
  $('abandonmission').textContent=en?'Abandon mission':'Abandonner la job';
  const add=(parent,d)=>{
    const done=G.done.has(d.id),allowed=missionAvailable(G,d);
    const row=document.createElement('button');row.className='job'+(done?' done':'')+(!allowed?' locked':'');
    row.disabled=!allowed || !!G.mission;
    const title=document.createElement('strong');title.textContent=(done?'✓ ':allowed?'→ ':'🔒 ')+d.title;
    const note=document.createElement('span');note.className='w';
    note.textContent=allowed ? PLACES[d.giver]?.label || '' : missionLockReason(G,d);
    row.append(title,note);parent.append(row);
    row.onclick=()=>{if(!missionAvailable(G,d)||G.mission)return;const p=PLACES[d.giver];if(!p)return;
      G.waypoint={x:p.x,z:p.z};G.routeKey='';pause(false);
    };
  };
  if(next)add(el,next);
  for(const [done,label] of [[true,en?'Completed missions':'Jobs terminées'],[false,en?'Upcoming missions':'Prochaines jobs']]) {
    const defs=ALL_MISSIONS.filter(d=>G.done.has(d.id)===done && d.id!==next?.id && d.id!==G.mission?.def.id);
    if(!defs.length)continue;
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=label+' ('+defs.length+')';details.append(summary);el.append(details);
    defs.forEach(d=>add(details,d));
  }
  $('jobshint').textContent=(G.mission ? (en?'Your mission resumes where you paused.':'Ta job reprend où tu l’as laissée.')
    : (en?'Complete the next mission to continue the story.':'Termine la prochaine job pour continuer l’histoire.'))
    + '  ·  ' + storyLine() + '  ·  ' + streetsLine(G)
    + (shortcuts.countLine(G, en) ? '  ·  ' + shortcuts.countLine(G, en) : '');   // [w6-shortcuts]
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
  // The pause menu writes into the summer you are playing, and only that one.
  el.innerHTML = slotsHTML(listSlots(G.character), 'save');
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
// ...and the rest of « where was I »: the nearest named place, if one is
// within a short walk, and the job you were in the middle of.
function nearPlaceLabel() {
  const v = G.veh;
  if (!v) return '';
  let best = '', bd = 90 * 90;
  for (const k of Object.keys(PLACES)) {
    const p = PLACES[k];
    if (!p || !p.label) continue;
    const dx = p.x - v.x, dz = p.z - v.z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = p.label; }
  }
  return best;
}
function saveOpts() {
  return {
    name: saveName(),
    near: nearPlaceLabel(),
    doing: G.mission && G.mission.def ? (G.mission.def.title || '') : '',
  };
}

function saveInto(slot) {
  const snap = saveToSlot(G, slot, saveOpts());
  if (!snap) { hud.toast(t('save.failed'), 1600); return null; }
  G.slot = slot;
  const n = slotNumber(slot);
  // The old warning about the job in progress not being kept is gone: it is
  // kept now, and the load says « Job reprise: … ».
  hud.toast(t('save.saved') + '\n' + (n === 'auto' ? t('save.autoslot') : t('save.slot') + ' ' + n)
    + (G.mission ? '\navec la job en cours' : ''), G.mission ? 2200 : 1500);
  audio.blip(720, 0.12, 'triangle', 0.16);
  return snap;
}

// F5: into the slot you used last (never the autosave), '1' the first time.
// ---- [w7-crashnight] crash replay frame (begin) ----
// While the replay plays the world holds (no tick, no stepEnv): the radio plays
// on, the car sounds are cut, and render() draws the recorded poses, swapped
// in and straight back out. Outside playback this only feeds the « V : revoir »
// prompt, which crashreplay.js keeps quiet during the crash show.
function crashReplayBlocked() {
  return !!(story.active || (endingCard && endingCard.active) || cinema.active || G.mealShift);
}
function crashReplayFrame(dt, draw = true) {
  if (!crashReplay.playing) {
    hud.setPrompt('replay', crashReplay.offerText(G, dt, crashReplayBlocked()));
    return false;
  }
  hud.setPrompt('replay', null);
  hud.setVisible(false);
  if (input.hit('KeyV', 'KeyE', 'Enter', 'Space', 'PadA', 'Escape', 'Backspace', 'PadB', 'PadStart')) {
    input.consume('Escape', 'Backspace');
    crashReplay.stop(G);
  }
  audio.engine(0, 0); audio.wind(0); audio.skid(0); audio.horn(false);
  const s = crashReplay.playing ? crashReplay.step(G, dt) : null;
  if (s && s.cut) audio.blip(1760, 0.05, 'square', 0.05);
  if (s && s.crash) audio.crash(s.crash);
  if (!s || !s.playing) { crashReplay.stop(G); hud.setVisible(true); return true; }
  if (draw) { crashReplay.applyPoses(G); try { render(dt); } finally { crashReplay.restorePoses(G); } }
  return true;
}
// ---- [w7-crashnight] crash replay frame (end) ----
function quickSave() {
  if (crashReplay.playing) return null;   // [w7-crashnight]
  const mine = G.slot && slotCharacter(G.slot) === G.character && slotNumber(G.slot) !== 'auto' ? G.slot : null;
  const slot = mine || lastSlot(G.character) || `${G.character}.1`;
  const snap = saveInto(slot);
  if (snap && G.mode === 'paused') buildSaveTab();
  return snap;
}

// Autosave writes ONE slot and only on the events the options screen promises:
// a job finished, and a car bought / unlocked (PROGRESS calls G.autosave).
function autosave(reason) {
  if (!G.settings.autosave || !G.veh || G.mode === 'menu') return null;
  // The autosave belongs to the summer you are playing. A bare 'auto' qualifies
  // to Tom's, which as Zahra would quietly overwrite his.
  const snap = saveToSlot(G, `${G.character}.auto`, { ...saveOpts(), last: G.lastDone || '' });
  if (snap) console.log('autosave:', reason);
  return snap;
}
G.autosave = autosave;
// A save the browser refused says so, once (save review SR-07). save.js raises
// 'aylmer:save-failed' with detail { slot, reason }.
{
  const warn = (e) => {
    if (G._saveWarned) return;
    G._saveWarned = true;
    hud.toast(e && e.reason === 'newer'
      ? 'Sauvegarde bloquée\ncette partie vient d’une version plus récente'
      : t('save.failed') + '\nle navigateur refuse d’enregistrer', 3600);
  };
  window.addEventListener('aylmer:save-failed', (ev) => warn(ev && ev.detail));
  try {
    if (typeof saveExtras.storageHealth === 'function' && !saveExtras.storageHealth().ok) {
      hud.toast('Stockage bloqué: rien ne sera gardé', 4000);
    }
  } catch (e) { console.warn('storage health', e); }
}

function loadIntoGame(slot) {
  const save = readSlot(slot);
  if (!save) return null;
  save.slot = save.slot || slot;
  setModal('load', false);
  cancelRetry(G);   // A-03: a load drops any retry on offer
  // [w6-opening] W3: a world still baking from page load is not a world yet.
  if (!worldBaked) { startGame(save); return save; }
  pause(false);
  enterDrive(save);
  return save;
}

// The main menu's « Charger » screen: the same rows, grouped by character —
// five separate summers — read-only plus Delete, plus « Nouvelle partie » for
// whoever you feel like being, which starts THAT character from the beginning
// and touches nobody else's slots.
function openLoadScreen(on) {
  const scr = $('loadscr');
  if (!scr) return;
  if (!on) { setModal('load', false); return; }
  const body = $('loadbody');
  const draw = () => {
    body.innerHTML = groupsHTML(listGroups(), 'load');
    wireSlots(body, {
      load: (slot) => loadIntoGame(slot),
      del: (slot) => { deleteSlot(slot); draw(); applyMenuText(); },
      fresh: (character) => {
        setModal('load', false);
        pickedCharacter = CHARACTER_IDS.includes(character) ? character : DEFAULT_CHARACTER;
        openStartPicker(true);
      },
    });
  };
  draw();
  setModal('load', true);
  focusFirst($('loadback'));
}

// ---- options -----------------------------------------------------------

// Everything the options panel is allowed to do to the game, in one object, so
// the main-menu copy and the pause-menu copy behave identically.
function optionsCtx() {
  return {
    get: () => G.settings,
    onChange: onSettings,
    // Switches that are not settings keys, because store.js keeps a closed list
    // and these belong to the module that persists them.
    flags: {
      get: (name) => (name === 'slangGloss' ? heckle.glossOn : false),
      set: (name, on) => { if (name === 'slangGloss') heckle.setGloss(on); },
    },
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
        flavour.reset();          // the achievements go with the saves
        G.slot = null;
        // Mid-game, the in-memory garage, hangout and race records would
        // write their keys straight back on their next event (save review
        // SR-08). A wipe from pause ends the summer: start the page over.
        if (G.mode !== 'menu') { location.reload(); return; }
        hud.toast(t('toast.wiped'), 1600);
        applyMenuText();
        if (G.mode === 'paused') buildSaveTab();
      },
    },
  };
}

// One place where a settings change reaches the running game. applySettings()
// does the renderer / audio / hud half; the rest is this file's own chrome.
// The English version used to be a departmental photocopy (style.css
// `.photocopy` does the paper, the blur and the toner streaks). Tom, 20 Oct
// 2026: the English setting gets real, readable controls, so the paper filter
// never goes on. The class and its CSS stay for an opt-in of its own, if ever.
function setPhotocopy(lang) {
  if (typeof document === 'undefined') return;
  void lang;
  document.documentElement.classList.remove('photocopy');
}
function onSettings(s) {
  const { langChanged } = applySettings(G, s);
  if (langChanged) setPhotocopy(s.lang);
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
  if (!on) { setModal('options', false); return; }
  mountOptions($('optbody'), optionsCtx());
  setModal('options', true);
  focusFirst($('optback'));
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
    opening.cast.interrupt();   // [opening-v2] W9: a live name card leaves with the pause
    fortier.cancelVoice();
    if (fortier.subtitle) fortier.subtitle.hidden=true;
    G.mode = 'paused';
    if ($('reactstats')) $('reactstats').style.display = 'none';
    audio.setPaused(true);
    fillJobs();
    buildTabBar();
    applyPauseText();
    flavour.showPause();
    showTab(tab);
    setModal('pause', true);
    focusFirst($('resume'));
    audio.horn(false);
    audio.engine(0, 0); audio.wind(0); audio.skid(0);
    radio.suspend();
    weather.suspend();          // the rain stops at the pause screen too
  } else {
    G.mode = 'drive';
    audio.setPaused(false);
    last = performance.now();
    // A pause button that kept focus would take the next Space or Enter.
    if ($('pause')?.contains(document.activeElement)) document.activeElement.blur();
    setModal('pause', false);
    radio.resume();
    hud.setVisible(G.settings.showHud);
  }
}

function toMenu() {
  // Before anything else: the job's own cleanup may still need the car and the
  // HUD (golfjob hands you back your own car; the meal shift has an overlay).
  closeMission('quit');
  opening.cast.interrupt();   // [opening-v2] W9: and with the menu
  cancelRetry(G);   // A-03: the menu drops any retry on offer
  hud.clearToasts(); G.feelFx.clear();
  audio.siren(false);
  fortier.stop();
  pause(false);
  radio.suspend();
  weather.suspend();
  audio.engine(0, 0); audio.wind(0);
  G.mode = 'menu';
  cinema.hide();
  hud.setVisible(false);
  heckle.clear();              // no bubble or queued line survives into the menu
  hud.setRepairPrompt(null); hud.setRepairHint(null);   // feel agent: they live outside #hud
  $('menu').classList.remove('hidden');
  buildMenu();
  applyMenuText();
  // [opening] the title screen no longer shows the car grid (opening.css), so
  // its second WebGL context stays off: a MacBook Air has better things to do.
  if (MENU_CARS) turntable.start();
}

// [opening-v2] B-11's W-list is wired: W1 to W10 (smoke_opening check 9 is hard).
// ---- [w6-opening] W2: the first-launch gate --------------------------------
// The very first time (nothing seen, no save, no ?menu in the address), the
// title screen is the 299 Fraser painting, the logo and « Appuie sur une
// touche »: any key, click or pad A is New Game, and the world has been baking
// since the page loaded (W3). The other doors open after the first film. The
// English toggle stays a toggle. The look is in opening.css (body.first-launch).
const GATE_IGNORE = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'Fn', 'F5', 'F12']);
function gateLive() {
  return gateArmed && G.mode === 'menu' && !opening.active
    && ['startpicker', 'options', 'loadscr'].every((id) => !$(id) || $(id).classList.contains('hidden'));
}
function onGate(e) {
  if (!gateLive()) return;
  if (e.type === 'keydown' && (e.repeat || e.metaKey || e.ctrlKey || e.altKey || GATE_IGNORE.has(e.key))) return;
  if (e.target && e.target.closest && e.target.closest('#btnEnglish')) return;
  if (e.type === 'keydown' && document.activeElement && document.activeElement.id === 'btnEnglish'
    && (e.key === 'Enter' || e.key === ' ')) return;
  if (e.type === 'keydown') e.preventDefault();
  newGame();
}
function armGate() {
  gateArmed = true;
  document.body.classList.add('first-launch');
  window.addEventListener('keydown', onGate);
  window.addEventListener('pointerdown', onGate);
  applyMenuText();
}
function disarmGate() {
  gateArmed = false;
  document.body.classList.remove('first-launch');
  window.removeEventListener('keydown', onGate);
  window.removeEventListener('pointerdown', onGate);
  applyMenuText();
}
// ---- end [w6-opening] W2 ----------------------------------------------------

// ---- wiring ------------------------------------------------------------

// [opening] New Game plays the opening into Tom's driveway. The picker moved to
// « Balade libre », and the opening can be watched again from the menu.
$('start').onclick = () => newGame();
if ($('btnFree')) $('btnFree').onclick = () => openStartPicker(true);
if ($('btnIntro')) $('btnIntro').onclick = () => replayOpening();
$('startback').onclick = () => openStartPicker(false);
$('startconfirm').onclick = () => { if (pickedStart && !opening.active) { openStartPicker(false); startGame(null, pickedStart, pickedCharacter); } };
$('startmap').addEventListener('click', (e) => {
  const tr = $('startmap')._pickerTransform;
  if (!tr) return;
  const box = $('startmap').getBoundingClientRect();
  const x = (e.clientX - box.left) * $('startmap').width / box.width;
  const y = (e.clientY - box.top) * $('startmap').height / box.height;
  let best = null, distance = 22;
  for (const p of tr.pts) {
    const d = Math.hypot(x - tr.sx(p.x), y - tr.sz(p.z));
    if (d < distance) { best = p.key; distance = d; }
  }
  if (best) selectStart(best);        // selectStart itself refuses a locked one
});
$('btnContinue').onclick = () => {
  const slot = continueSlot();
  if (slot) loadIntoGame(slot);
};
$('btnLoad').onclick = () => { if ($('btnLoad').disabled) return; openLoadScreen(true); };
$('loadback').onclick = () => openLoadScreen(false);
$('loadback2').onclick = () => openLoadScreen(false);
$('btnOptions').onclick = () => openOptions(true);
// One click for the English copy, one click back to the original.
$('btnEnglish').onclick = () => {
  // applySettings() reads the old language off G.settings to know it changed,
  // so G.settings must NOT be assigned here first.
  const s = { ...G.settings, lang: G.settings.lang === 'en' ? 'fr' : 'en' };
  saveSettings(s);
  onSettings(s);
};
$('optback').onclick = () => openOptions(false);
$('optback2').onclick = () => openOptions(false);
$('restartmission').onclick = () => {
  const def = G.mission?.def; if (!def) return;
  // A restart is a failure you chose: past the first stage or 45 s in, it
  // costs the day a failure costs (P7; endOfJob is a no-op in the prototype).
  // B-07: a main story job never spends a day on a fail, so neither does its
  // restart (a Backspace quit is already free; code-review-B1 B-07).
  const costsDay = restartCostsDay(G.mission) && !storyFail(G.mission);
  closeMission('restart');
  G.wantStart = false; G.offer = null;
  if (costsDay) endOfJob(def);
  pause(false); if (!G.summerOver) startMission(def);
};
// QA F4: drop a job you do not want. Same close path as a failure: no reward,
// the pay refunded (refundJob), and in index.html the same day cost a restart
// pays once you are past the first stage or 45 s (the prototype's endOfJob is
// a no-op).
function abandonMission() {
  if (!G.mission) return false;
  const costsDay = restartCostsDay(G.mission) && !storyFail(G.mission);   // B-07, as Restart
  const def = G.mission.def;
  closeMission('quit');
  G.wantStart = false; G.offer = null;
  if (costsDay) endOfJob(def);
  return true;
}
$('abandonmission').onclick = () => { abandonMission(); pause(false); };
$('resume').onclick = () => pause(false);
$('mapbtn').onclick = () => { pause(false); openMap(true); };
$('garage').onclick = toMenu;
$('carshome').onclick = () => { resetCarLocations(); pause(false); };
window.addEventListener('keydown', (e) => {
  // Escape is read in two places — here, and in handleKeys() once we are back
  // in 'drive'. Whoever acts on it has to consume it, or the next frame sees
  // the same press and puts the menu straight back up.
  if (e.code === 'Escape' && G.mode === 'paused') { pause(false); input.consume('Escape'); }
  if (e.code === 'Escape' && !$('startpicker').classList.contains('hidden')) { openStartPicker(false); input.consume('Escape'); }
  if (e.code === 'Escape' && !$('options').classList.contains('hidden')) { openOptions(false); input.consume('Escape'); }
  if (e.code === 'Escape' && !$('loadscr').classList.contains('hidden')) { openLoadScreen(false); input.consume('Escape'); }
  // F5 is a quick save, not a reload — the browser's own F5 is in the way.
  // One save per press: holding F5 used to write on every auto-repeat.
  if (e.code === 'F5' && (G.mode === 'drive' || G.mode === 'paused')) { e.preventDefault(); if (!e.repeat) quickSave(); }
  // The legend and the language toggle work outside the drive loop too.
  if (!e.repeat && (e.key === '?' || e.key === '/') && (G.mode === 'menu' || G.mode === 'paused')) legend.toggle();
  // The economy screens (the garage, Volkov, Kijiji, the « CHAR DÉBLOQUÉ » card)
  // close on their own keys and consume them in game/economy.js (releaseSim and
  // the moment handler), so the Escape that closed Kijiji does not also open
  // pause, and E / Space do not leak into take-job or the handbrake (UX P1, P2).
});
window.addEventListener('pointerdown', () => audio.resume(), { once: true });

// Come back as whoever you were, in the car that save was in, so the menu and
// the start picker both open on the summer you were last playing.
{
  const recent = mostRecentSlot();
  const save = recent ? readSlot(recent) : null;
  if (save) {
    if (CARS.some((c) => c.id === save.carId)) G.carId = save.carId;
    if (CHARACTER_IDS.includes(save.character)) { G.character = save.character; pickedCharacter = save.character; }
  }
}
buildMenu();
applyMenuText();
// [w6-opening] W2 and W3: the first launch is one key, and the world bakes
// from here, behind the menu, whichever launch this is.
{
  let menuAsked = false;
  try { menuAsked = new URLSearchParams(location.search).has('menu'); } catch { /* no URL */ }
  if (!G.settings.storySeen && !hasAnySave() && !menuAsked) armGate();
}
installSkin();
if (MENU_CARS && !gateArmed) turntable.start();
hud.setVisible(false);
prebakeWorld();
// The written content, pulled in once at boot: 300 heckles with their English
// glosses (assets/text/heckles.json) and six stations' worth of idents, DJ
// patter, local ads, news stingers and contests (assets/text/radio.json). Both
// loaders fail quietly and leave the built-in fallbacks in place, so the game
// runs off a file:// URL or a checkout with assets/text/ missing.
heckle.load().catch(() => {});
loadFails().catch(() => {});
// ...and if the loading screen is already up when ui.json lands, replace the
// fallback tip it is showing with a real one.
flavour.load().then(() => { if (tipTimer) flavour.showTip(heckle.showGloss); }).catch(() => {});
// The real summer of 2004, day by day (Environment Canada via Gemini): the date
// toast gets the weather. Optional; absent is silent.
if (!VISUAL_PROTOTYPE) calendar.loadSummer().catch(() => {});
radio.loadText()
  .then(() => radio.loadExtras())
  .then(() => {
    // Le Droit's headlines read as loading-screen trivia as well as they read
    // as the talk station's news, so they do both.
    flavour.addTrivia(radio.headlines);
    paintRadio();
  })
  .catch(() => {});
requestAnimationFrame(frameLoop);

// ---- [wave/1-memory] dev chauffeur: index.html?drive=ottawa ------------------
// Twenty minutes of real driving for the Safari memory test, with no way to
// script Safari from outside. Inert without the query string.
{
  const q = new URLSearchParams(location.search).get('drive');
  if (q) import('./game/autopilot.js').then((m) => m.start(window.AYLMER, PLACES, q)).catch((e) => console.warn('autopilot', e));
}

// Debug hook: lets a console (or a test) step the sim without a live rAF.
window.AYLMER = {
  G, hud, input, garage, radio, cinema, pause, audio, // audio: the Dr Morin tooth's « tink » (toothhud.js)
  camClipStats,
  visualClock(hour) {
    if (!VISUAL_PROTOTYPE) return null;
    if (Number.isFinite(hour)) { G.dayClock = ((hour % 24 + 24) % 24) / 24 * DAY_NIGHT_CYCLE; setCycleEnv(true); }
    return G.dayClock / DAY_NIGHT_CYCLE * 24;
  },
  step(dt = STEP) { if (G.mode === 'drive' && !cinema.active) { G.feelFx.update(dt); if (!G.feelFx.holdsSlowmo()) slowmoScale(dt); input.update(dt); if (!crashReplayFrame(dt, false)) { handleKeys(); if (!crashReplay.playing) { tick(dt); stepEnv(dt); } } input.endFrame(); } runEconomyPulse(); },   // [w7-crashnight] no tick under a replay
  // A-06: the feel tallies (slow-mo count by kind, the last speed FOV delta)
  // and the wind meters, for tools/qa/feel_a06.mjs.
  feel: () => ({ ...G.feel, slowmo: { ...G.slowmo }, camPunch: G.camPunch, wind: { ...(audio.meters || {}) }, stuck: canReset() }),
  // QA F11: a clean way out of a job for checks, through closeMission.
  abandon() { return abandonMission(); },
  // B-12a: the fail path for checks (failMission, what Backspace calls) and
  // the fail card retry.js holds now (null when none).
  fail: (why = 'Abandonné.') => { if (G.mission) failMission(why); return failToast(); },
  failCard: () => failToast(),
  render() { if (G.mode === 'drive') render(STEP); },
  teleport: teleportTo,
  start: (def) => startMission(typeof def === 'string' ? ALL_MISSIONS.find(m=>m.id===def) : def),
  // Save-system hooks, so a test (or a console) can drive the slots without
  // reaching into the DOM. The buttons call exactly the same functions.
  save: (slot) => saveInto(slot),
  quickSave,
  load: (slot) => loadIntoGame(slot),
  slots: (character) => (character ? listSlots(character) : listGroups().flatMap((g) => g.rows))
    .map(({ save, ...row }) => row),
  // Who you are playing. Reading is free; setting one only takes effect from
  // the menu, because a character is a fresh summer, not a mid-run swap.
  character: (id) => { if (id && CHARACTER_IDS.includes(id)) pickedCharacter = id; return G.character; },
  characters: () => CHARACTERS.map((c) => ({ ...c })),
  // Playtest #11, for the browser check: what job is running, and where in it.
  job: () => (G.mission ? { id: G.mission.def.id, stage: G.mission.idx, timeLeft: G.mission.timeLeft } : null),
  fortier: () => ({active:!!fortier.unit, x:fortier.unit?.x, z:fortier.unit?.z, unseen:fortier.unseen}),
  resetCars: () => resetCarLocations(),
  settings: (patch) => { onSettings(saveSettings({ ...G.settings, ...(patch || {}) })); return G.settings; },
  // Debug/screenshot hooks: force a time of day, and read back what the last
  // frame actually drew (see world.js `stats`).
  env(name = 'day') {
    const key = DAY_PHASE[name] == null ? 'day' : name;
    G.dayClock = phaseClock(key);
    setCycleEnv(true);
    return G.envKey;
  },
  // Shell agent: the sky. `weather()` reads it, `weather(name)` forces one of
  // clear / cloudy / haze / overcast / rain / storm, so a screenshot of a
  // thunderstorm does not depend on waiting for one.
  weather(name) {
    if (name) weather.set(name, true);
    return {
      key: weather.key, label: weather.label, rain: weather.rain,
      wet: weather.wet, grip: weather.gripMul, brake: weather.brakeMul,
    };
  },
  // Story agent: the opener, the guidance line and the heckles.
  story, heckle,
  // ...and the slang gloss on G, for the tests.
  slang: (on) => (on == null ? heckle.showGloss : heckle.setGloss(on)),
  freeRoam: () => freeRoamLines(offerView(), garage),
  playStory,
  // [opening] the director, for the checks (tools/smoke_opening.mjs, the frame capture).
  opening, newGame, replayOpening,
  // Race agent: what the tests poke at.
  cops: () => G.cops,
  rivals: () => G.rivals,
  heat(v) { if (v != null) G.cops.heat = v; return G.cops.heat; },
  // DEV-ONLY (tools/aylmer-compare): free camera {x,y,z,yaw,pitch,fov} in radians, null to release;
  // hideHud(true) hides every overlay but the game canvas. Neither is called by the game.
  devCam(o) { G.devCam = o ? { x: o.x, y: o.y, z: o.z, yaw: o.yaw, pitch: o.pitch || 0, fov: o.fov || 1.0 } : null; return G.devCam; },
  hideHud(on = true) { for (const el of document.body.children) if (el.id !== 'gl') el.style.visibility = on ? 'hidden' : ''; },
  // Visual wave (game/look/): time(hour) pins the clock at an hour in both
  // entries (time(null) lets it run, time() reads it); look({flag: bool}) sets
  // look flags, look() reads them all. With weather(name) a capture can ask for
  // any environment in docs/visual-wave/PLAN.md section 4.
  time(hour) {
    if (hour === null) envc.pinHour(null);
    else if (hour !== undefined) envc.pinHour(Number(hour));
    return envc.hourNow();
  },
  look: lookApi,
  lightAuto: { watch: lightWatch, prompt: lightPrompt, quiet: lightQuiet },   // W8-LIGHTAUTO: the slow-frame card (cloud checks)
  advLight,   // W8-LIGHT: AYLMER.advLight() reads the session's « Éclairage avancé » (read only)
  stats() {
    const w = G.world && G.world.stats;
    return w ? { ...w, drawCalls: G.renderer.stats.draws, rendererTris: G.renderer.stats.tris } : null;
  },
};

// ==================================================================== modes agent
// The three Midtown modes (game/modes.js) and the jump set (game/jumps.js). Both
// reach in through G and neither draws or steps anything of its own: the mode
// picker hands its courses to startMission() above, and the per-tick half of
// both rides in on race.js's updateRivals(), which tick() already calls.
//
// installJumps() must run BEFORE buildWorld(), which it does — this is module
// scope and the world is not built until somebody presses EMBARQUE.
import { installJumps, JUMPS, resetJumps, AIR } from './game/jumps.js';
import { installModes, openModes, startCourse, COURSES, MODES, restartRun, offerRerun, tickRerun, resumeModeSave } from './game/modes.js';
import { loadRacingText, TEXT } from './game/racingtext.js';
installJumps();
installModes(G, { startMission });
// ---- [w7-crashnight] (begin) ----
const crashNight = installCrashNight(G, { startMission }, modesNs);
Object.assign(window.AYLMER, {
  crashNight,
  crashReplay: {
    stats: () => crashReplay.stats(), offered: () => crashReplay.offered(G),
    press: () => crashReplay.play(G, { blocked: crashReplayBlocked() }), stop: () => crashReplay.stop(G),
  },
});
// ---- [w7-crashnight] (end) ----
// The written copy for the races, the jumps and the police radio. Nothing waits
// on it: every pool has a fallback, so a slow or missing fetch costs flavour and
// never a frame.
loadRacingText().catch((e) => console.warn('racing text:', e.message));
Object.assign(window.AYLMER, {
  modes: MODES, courses: COURSES, jumps: JUMPS, text: TEXT,
  openModes: (on = true) => openModes(G, on),
  course: (id) => { const c = COURSES.find((x) => x.id === id); return c ? startCourse(G, c) : false; },
  air: () => G.air,
  medal: () => replay.lastResult(), ghost: () => ghost.ghostState(), thresholds: (id) => medalThresholds(id),   // [w7-replay]
  resetJumps,
  shortcuts: () => shortcuts.debug(G),   // [w6-shortcuts] metric bag for the C-06 beat
});
// ================================================================ end modes agent

// ---------------------------------------------------------------- economy agent
// ONE hook, on purpose: three other agents are editing this file this wave.
// Everything the money loop does — the mechanic's screen (U at a garage), the
// Kijiji classifieds (K), the upgrade modifier layer that puts the parts you
// bought onto whatever Vehicle enterDrive/swapCar most recently built, and the
// watcher that hands over a famous car the moment you have earned it — lives in
// game/economy.js and the three modules it pulls in. Nothing below this line
// reads or writes anything main.js owns except the objects handed to it here.
import { installEconomy } from './game/economy.js';
economyPulse = installEconomy({ G, hud, audio, PLACES, carById, curbSpot, specstack, api: window.AYLMER }).pulse;

function pauseOnFocusLoss() {
  clearCinemaInput();
  if (G.mode === 'drive' && !cinema.active && !story.active && !endingCard?.active && !G.seamHold) pause(true);
}
window.addEventListener('blur', pauseOnFocusLoss);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnFocusLoss(); });
