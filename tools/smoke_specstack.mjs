// The spec stack (architecture review E3):  node tools/smoke_specstack.mjs
//
// E3 moved the "tuned sheet" layer out of economy.js's own animation loop and
// into game/specstack.js, called from main.js's tick. It was meant to change
// nothing a player can see or hear, so this suite runs the OLD pipeline (a
// verbatim copy of economy.js's wanted()/retune() at af9a48f, run once per
// display frame after main's ticks, plus main's old tick block) beside the NEW
// one (specstack.driveSpec per tick, seat() at load/swap/fit/paint) through
// the same script, and requires the same sheet on the car at the end of every
// frame and the same engine-voice calls, in the same order.
//
// Then the review's own E3 checks: the tuned base on the first tick after a
// swap, the same object on repeated calls, one voice change per swap, and a
// Vehicle never wearing another car's parts.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  - ' + extra : '')); }
};

const { carById, Vehicle } = await import('../src/game/cars.js');
const { tuned, tunedSound } = await import('../src/game/upgrades.js');
const { Weather } = await import('../src/game/weather.js');
const skills = await import('../src/game/skills.js');
const { tickFuel } = await import('../src/game/fuel.js');
const { Garage } = await import('../src/game/garage.js');
const { createSpecStack } = await import('../src/game/specstack.js');

const STEP = 1 / 60;
const FIELDS = ['accel', 'grip', 'brake', 'dirBrake', 'topSpeed', 'mass', 'steerMax', 'vPow'];
const sheet = (s) => FIELDS.map((k) => s[k]).join(',') + (s.dry ? ',dry' : '');
const voiceKey = (s) => JSON.stringify(s);

// ---------------------------------------------------------------- old pipeline
// economy.js wanted()/retune() and main.js tick lines, as they were at af9a48f.
function oldPipeline() {
  const G = { carId: 'ranger', garage: new Garage(), stats: { skBrake: 0.5, skCorner: 0.3, skLaunch: 0.7 }, fuel: 40, fuelT: 0, fuelBy: {}, wallet: { value: 0, can: () => false } };
  const weather = new Weather();
  const voices = [];
  const audio = { setEngineProfile: (s) => voices.push(voiceKey(s)) };
  let cache = { key: '', spec: null, sound: null };
  function wanted() {
    const base = carById(G.carId);
    const mods = G.garage ? G.garage.rawMods(G.carId) : null;
    const key = G.carId + ':' + JSON.stringify(mods);
    if (cache.key !== key) {
      cache = { key, spec: tuned(base, mods), sound: tunedSound(base.sound, mods) };
    }
    return cache;
  }
  function retune() {
    if (!G.veh) return false;
    const w = wanted();
    if (G.veh.baseSpec === w.spec) return false;
    G.veh.baseSpec = w.spec;
    G.veh.spec = w.spec;
    if (audio && audio.setEngineProfile) audio.setEngineProfile(w.sound);
    return true;
  }
  function tick(dt) {
    const v = G.veh;
    if (!v.baseSpec) v.baseSpec = v.spec;
    v.spec = skills.specFor(weather.specFor(v.baseSpec), G);
    const dry = tickFuel(G, dt, v, 0.5, false);
    if (dry) v.spec = dry;
  }
  return {
    G, weather, voices,
    load(id) { G.carId = id; const spec = carById(id); G.veh = new Vehicle(spec); if (!retune()) audio.setEngineProfile(spec.sound); },
    swap(id) { const spec = carById(id); G.carId = id; G.veh = new Vehicle(spec); if (!retune()) audio.setEngineProfile(spec.sound); },
    fit(part, lv) { const mods = G.garage.modsFor(G.carId); mods[part] = lv; G.garage.setMods(G.carId, mods); retune(); },
    paint(hex) { const mods = G.garage.modsFor(G.carId); mods.paint = hex; G.garage.setMods(G.carId, mods); cache.key = ''; retune(); },
    // One display frame: main's frame() sub-steps, then economy's rAF pulse retunes.
    frame(n = 2) { for (let i = 0; i < n; i++) tick(STEP); retune(); },
  };
}

// ---------------------------------------------------------------- new pipeline
// main.js's tick and enterDrive/swapCar, economy's fit/paint, through specstack.
function newPipeline() {
  const G = { carId: 'ranger', garage: new Garage(), stats: { skBrake: 0.5, skCorner: 0.3, skLaunch: 0.7 }, fuel: 40, fuelT: 0, fuelBy: {}, wallet: { value: 0, can: () => false } };
  const weather = new Weather();
  const voices = [];
  const stack = createSpecStack({ carById, modsOf: (id) => (G.garage ? G.garage.rawMods(id) : null), setEngineProfile: (s) => voices.push(voiceKey(s)) });
  function tick(dt) {
    const v = G.veh;
    v.spec = stack.driveSpec(G, v, { weather, skills });
    const dry = tickFuel(G, dt, v, 0.5, false);
    if (dry) v.spec = dry;
  }
  const build = (id) => { const spec = carById(id); G.carId = id; G.veh = new Vehicle(spec); G.veh.carId = spec.id; stack.seat(G.veh); };
  return {
    G, weather, voices, stack,
    load: build, swap: build,
    fit(part, lv) { const mods = G.garage.modsFor(G.carId); mods[part] = lv; G.garage.setMods(G.carId, mods); stack.seat(G.veh); },
    paint(hex) { const mods = G.garage.modsFor(G.carId); mods.paint = hex; G.garage.setMods(G.carId, mods); stack.invalidate(); stack.seat(G.veh); },
    frame(n = 2) { for (let i = 0; i < n; i++) tick(STEP); },
  };
}

console.log('old and new pipelines drive the same sheet, frame by frame');
{
  const A = oldPipeline(), B = newPipeline();
  const script = [
    ['load', 'ranger'], ['frames', 5],
    ['fit', 'moteur', 2], ['frames', 3],
    ['wet', 1], ['frames', 4],
    ['fit', 'freins', 1], ['frames', 2],
    ['swap', 'saturn'], ['frames', 3],
    ['paint', 0x2a4d8f], ['frames', 2],
    ['swap', 'ranger'], ['frames', 3],
    ['wet', 0], ['frames', 2],
    ['empty'], ['frames', 3],
    ['swap', 'civic'], ['frames', 2],
  ];
  let frames = 0, same = 0, dryFrames = 0;
  const mismatches = [];
  for (const [op, a, b] of script) {
    for (const P of [A, B]) {
      if (op === 'load') P.load(a);
      else if (op === 'swap') P.swap(a);
      else if (op === 'fit') P.fit(a, b);
      else if (op === 'paint') P.paint(a);
      else if (op === 'wet') P.weather.wet = a;
      else if (op === 'empty') P.G.fuel = 0;
    }
    if (op !== 'frames') continue;
    for (let f = 0; f < a; f++) {
      A.frame(); B.frame(); frames++;
      const sa = sheet(A.G.veh.spec), sb = sheet(B.G.veh.spec);
      const ba = sheet(A.G.veh.baseSpec), bb = sheet(B.G.veh.baseSpec);
      if (sa === sb && ba === bb) same++;
      else mismatches.push(`frame ${frames}: ${sa} vs ${sb}`);
      if (A.G.veh.spec.dry && B.G.veh.spec.dry) dryFrames++;
    }
  }
  ok(same === frames, `the car's sheet matches at the end of all ${frames} frames`, mismatches.slice(0, 3).join(' | '));
  ok(A.voices.length === B.voices.length && A.voices.every((v, i) => v === B.voices[i]),
    `the same ${A.voices.length} engine-voice calls in the same order`, `old ${A.voices.length}, new ${B.voices.length}`);
  ok(A.G.fuel === B.G.fuel, 'the same fuel burned (the dry-tank layer sees the same sheets)', `${A.G.fuel} vs ${B.G.fuel}`);
  ok(dryFrames > 0, `the script reached the dry-tank layer (${dryFrames} frames)`);
}

console.log('the E3 checks');
{
  const B = newPipeline();
  B.G.garage.setMods('ranger', { moteur: 3 });
  B.load('ranger');
  const want = B.stack.tunedFor('ranger').spec;
  ok(B.G.veh.baseSpec === want && want.accel > carById('ranger').accel, 'a fresh Vehicle drives its tuned sheet before the first tick');
  B.swap('saturn'); B.swap('ranger');
  const before = B.voices.length;
  B.frame(1);
  const tunedNow = B.stack.tunedFor('ranger').spec;
  ok(B.G.veh.baseSpec === tunedNow && tunedNow.accel === want.accel, 'the first tick after a swap drives the tuned base (no stock frame)');
  const s1 = B.stack.driveSpec(B.G, B.G.veh, { weather: B.weather, skills });
  const s2 = B.stack.driveSpec(B.G, B.G.veh, { weather: B.weather, skills });
  ok(s1 === s2 && B.G.veh.baseSpec === tunedNow, 'repeated calls hand back the same objects (no allocation, weather/skills caches hold)');
  B.frame(120);
  ok(B.voices.length === before, '120 more frames set the engine voice 0 times');
  const n0 = B.voices.length;
  B.swap('saturn');
  B.frame(10);
  ok(B.voices.length === n0 + 1, 'a swap sets the engine voice exactly once');
  // F3.c: the tune is keyed on the Vehicle's own car, not on G.carId.
  B.G.carId = 'civic';
  B.G.veh.baseSpec = null;
  B.frame(1);
  ok(B.G.veh.baseSpec.id === 'saturn', 'a Vehicle never wears another car\'s sheet when G.carId disagrees with it');
  // A paint changes the sheet object; invalidate + seat picks it up once.
  B.G.carId = 'saturn';
  const n1 = B.voices.length;
  B.paint(0x112233);
  ok(B.G.veh.baseSpec === B.stack.tunedFor('saturn').spec && B.voices.length === n1 + 1, 'a repaint re-seats the sheet once');
}

console.log('Wave A compatibility through the real economy and job patch');
{
  const el = () => ({ classList: { add() {}, remove() {}, toggle() {}, contains: () => true }, style: {},
    appendChild() {}, append() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  globalThis.document = { hidden: false, head: el(), body: el(), addEventListener() {},
    getElementById: () => null, createElement: el };
  globalThis.window = { addEventListener() {} };
  let scheduled = 0;
  globalThis.requestAnimationFrame = () => ++scheduled;
  const { installEconomy } = await import('../src/game/economy.js');
  const { prepareForJob } = await import('../src/game/jobready.js');
  const { Wallet } = await import('../src/game/money.js');
  const G = { carId: 'ranger', garage: new Garage(), mode: 'drive', done: new Set(), stats: {},
    wallet: new Wallet(), parked: {}, health: { ranger: 70 }, repair: { t: 2, key: 'norm' },
    repairHints: { h25: true, h60: true }, mission: { def: { giver: 'sayyad' }, styleStart: { damage: 70 } } };
  G.veh = new Vehicle(carById('ranger'));
  G.veh.carId = 'ranger';
  G.wallet.set(10000);
  let voices = 0;
  const stack = createSpecStack({ carById, modsOf: (id) => G.garage.rawMods(id), setEngineProfile: () => voices++ });
  stack.seat(G.veh);
  const step = () => {};
  const api = { step };
  const hud = new Proxy({}, { get: () => () => {} });
  const econ = installEconomy({ G, hud, audio: {}, PLACES: {}, carById,
    curbSpot: () => ({ x: 0, z: 0, yaw: 0 }), specstack: stack, api });
  ok(scheduled === 0 && api.step === step, 'installing economy schedules no loop and leaves the step function intact');
  const price = econ.price('moteur'), money = G.wallet.value, voiceBefore = voices;
  const fitted = econ.fit('moteur');
  const upgraded = G.veh.baseSpec;
  ok(fitted.ok && G.wallet.value === money - price && upgraded.accel > carById('ranger').accel,
    'the real fit API charges once and immediately seats the engine upgrade');
  ok(voices === voiceBefore + 1 && econ.retune() === false, 'the fit changes the engine voice once');
  G.veh.damage = 70;
  const paid = G.wallet.value, patchVoice = voices;
  const patch = prepareForJob(G.veh, G.mission, G);
  ok(patch.patched && G.veh.damage === 0 && G.health.ranger === 0 && G.wallet.value === paid,
    'a damaged upgraded car gets the free job patch and its saved health follows');
  const weather = new Weather(); weather.wet = 1;
  G.veh.spec = stack.driveSpec(G, G.veh, { weather, skills });
  econ.pulse();
  ok(G.veh.baseSpec === upgraded && voices === patchVoice && G.veh.spec.grip < upgraded.grip,
    'the patch keeps the upgrade, applies wet grip and does not rebuild the engine voice');
  ok(G.repair.t === 0 && G.repair.key === null && G.mission.styleStart.damage === 0,
    'the free patch still clears garage and mission damage bookkeeping');
  G.towDebt = 60;
  G.wallet.add(40);
  econ.pulse();
  ok(G.wallet.value === paid + 20 && G.towDebt === 40,
    'the main-loop pulse takes half of the next payout for Wave A tow debt');
  econ.pulse();
  ok(G.wallet.value === paid + 20 && G.towDebt === 40, 'a second pulse never charges that payout twice');
  G.mode = 'menu'; econ.pulse();
  G.wallet.set(500); G.mode = 'drive'; econ.pulse();
  ok(G.wallet.value === 500 && G.towDebt === 40, 'loading a wallet from the menu is still not counted as a payout');
}

console.log('the wiring');
{
  const MAIN = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const ECON = readFileSync(new URL('../src/game/economy.js', import.meta.url), 'utf8');
  ok(!/requestAnimationFrame\(/.test(ECON), 'economy.js has no animation loop of its own');
  ok(!/G\.veh\.baseSpec\s*=|G\.veh\.spec\s*=/.test(ECON), 'economy.js does not write the car\'s spec');
  ok(!/env\.api\.step\s*=/.test(ECON), 'economy.js no longer monkey-patches AYLMER.step');
  ok(/specstack\.driveSpec\(G, v, \{ weather, skills \}\)/.test(MAIN), 'main.js tick drives the spec through the stack');
  ok(!/if \(!v\.baseSpec\) v\.baseSpec = v\.spec/.test(MAIN), 'main.js no longer captures the stock sheet as the base');
  ok((MAIN.match(/\.carId = spec\.id/g) || []).length === 3, 'load, swap and opening replay stamp v.carId');
  ok(/try \{ frame\(now\); \} finally \{ runEconomyPulse\(\); \}/.test(MAIN), 'main.js runs the economy pulse from its own frame');
  ok(/step\(dt = STEP\) \{[^\n]*runEconomyPulse\(\); \}/.test(MAIN), 'AYLMER.step() runs the pulse after its tick, as the old patch did');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
