// The silent-driveway guard, in plain node:  node tools/smoke_engine_rebuilds.mjs
//
// The bug: economy's retune() compared the spec weather and skills derive every
// tick against the upgrade sheet, decided the car had changed, and rebuilt the
// engine driver every frame, so the voice gain never rose from zero. The fix
// compares the stable baseSpec. Since architecture review E3 that comparison is
// game/specstack.js's seat(), called from main.js's tick; this drives the real
// spec stack (as main.js's tick calls it), the real installEconomy() pulse and
// the real Audio class (against a stub AudioContext) through 120 wet, skilled,
// upgraded frames and counts driver builds. No browser, no timing.
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- stubs
const param = () => ({ value: 0,
  setValueAtTime(v) { this.value = v; return this; }, setTargetAtTime(v) { this.value = v; return this; },
  linearRampToValueAtTime(v) { this.value = v; return this; }, exponentialRampToValueAtTime(v) { this.value = v; return this; },
  cancelScheduledValues() { return this; }, setValueCurveAtTime() { return this; } });
const node = () => new Proxy({ connect() {}, disconnect() {}, start() {}, stop() {}, setPeriodicWave() {} }, {
  get(t, k) { if (!(k in t) && typeof k === 'string' && k !== 'then') t[k] = param(); return t[k]; },
});
function FakeContext() {
  const base = { currentTime: 0, sampleRate: 48000, state: 'running', destination: node(),
    createBuffer: (ch, len, rate) => ({ length: len, duration: len / rate, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    createPeriodicWave: () => ({}), resume() { this.state = 'running'; return Promise.resolve(); } };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : String(k).startsWith('create') ? node : undefined) });
}
const el = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => true }, style: {},
  appendChild() {}, append() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }, {
  get(t, k) { return k in t ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });
const byId = new Map();
globalThis.document = { hidden: false, head: el(), body: el(), addEventListener() {},
  getElementById: (id) => byId.get(id) || null, createElement: () => el() };
globalThis.window = { AudioContext: FakeContext, addEventListener() {} };

const { Audio, profileKey } = await import('../src/core/audio.js');
const { installEconomy } = await import('../src/game/economy.js');
const { carById } = await import('../src/game/cars.js');
const { Vehicle } = await import('../src/game/cars.js');
const { Weather } = await import('../src/game/weather.js');
const skills = await import('../src/game/skills.js');
const { Garage } = await import('../src/game/garage.js');
const { createSpecStack } = await import('../src/game/specstack.js');

// ---------------------------------------------------------------- the game
const audio = new Audio();
audio.start();
assert.equal(audio.ok, true, 'stub context starts');
const spec = carById('ranger');
const garage = new Garage();
garage.setMods('ranger', { moteur: 2 });
const G = { carId: 'ranger', garage, mode: 'drive', done: new Set(), stats: { skBrake: 1, skCorner: 1, skLaunch: 1 },
  wallet: { value: 0, can: () => false }, parked: {}, health: {} };
G.veh = new Vehicle(spec);
G.veh.reset(0, 0, 0, 0);
// Begin with a sounding stock engine, then let the first tick seat the upgrade.
audio.setEngineProfile(spec.sound);
const weather = new Weather();
weather.wet = 1;
const hud = new Proxy({}, { get: () => () => {} });
// main.js's tick: layer weather and skills over the stable base, then step.
let derived = 0, calls = 0;
const setProfile = audio.setEngineProfile.bind(audio);
audio.setEngineProfile = (...a) => { calls++; return setProfile(...a); };
const specstack = createSpecStack({ carById, modsOf: (id) => G.garage.rawMods(id), setEngineProfile: (s) => audio.setEngineProfile(s) });
let econ = null;
const api = { step(dt) {
  const v = G.veh;
  v.spec = specstack.driveSpec(G, v, { weather, skills });
  if (v.spec !== v.baseSpec) derived++;
  audio.engine(800, 0.1, 0, 0, 1, dt);
  econ.pulse();                           // what AYLMER.step() does after its tick
} };
econ = installEconomy({ G, hud, audio, PLACES: {}, OWNER: {}, carById, curbSpot: () => ({ x: 0, z: 0, yaw: 0 }), specstack, api });

let fail = 0;
const ok = (cond, name, extra = '') => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fail++; };

const start = audio.engineBuilds;
api.step(1 / 60);                         // first tick seats the camshaft
ok(audio.engineBuilds === start + 1, 'first frame applies the upgraded sound once', `builds ${audio.engineBuilds - start}`);
const settled = audio.engineBuilds, driver = audio.driver;
derived = 0; calls = 0;
for (let i = 0; i < 120; i++) api.step(1 / 60);
ok(derived === 120, 'all 120 frames drove a derived (wet + skilled) spec', `derived ${derived}`);
ok(calls === 0, 'the stack asked for a new engine profile 0 times in 120 frames', `calls ${calls}`);
ok(audio.engineBuilds === settled, '120 wet, skilled, upgraded frames rebuild the engine 0 times', `rebuilds ${audio.engineBuilds - settled}`);
ok(audio.driver === driver, 'the same driver survives');
ok(audio.voice.out.gain.value > 0.01, 'the voice gain rose off zero (no silent driveway)', audio.voice.out.gain.value.toFixed(4));

// A mods change is a real change: exactly one build.
garage.setMods('ranger', { moteur: 3 });
for (let i = 0; i < 30; i++) api.step(1 / 60);
ok(audio.engineBuilds === settled + 1, 'a mods change rebuilds exactly once over 30 frames', `rebuilds ${audio.engineBuilds - settled}`);

// F4: content, not identity.
const before = audio.engineBuilds;
ok(audio.setEngineProfile({ ...audio.ep }) === false && audio.engineBuilds === before, 'an equal profile in a new object keeps the driver');
ok(profileKey({ a: 1, b: 2 }) === profileKey({ b: 2, a: 1 }), 'profile key ignores key order');
const loud = audio.voice.out.gain.value;
audio.setEngineProfile(spec.sound);
ok(audio.engineBuilds === before + 1, 'a different profile rebuilds once');
ok(Math.abs(audio.voice.out.gain.value - loud) < 1e-9, 'a rebuild hands the running level over (no gap from zero)');

// F2: a suspended (or Safari 'interrupted') context is resumed on unpause.
audio.ctx.state = 'interrupted';
ok(audio.running === false, 'interrupted context reports not running');
audio.setPaused(true); audio.setPaused(false);
await Promise.resolve();
ok(audio.ctx.state === 'running', 'unpause resumes an interrupted context');
let seen = null; audio.onStateChange((s) => { seen = s; });
audio.ctx.state = 'suspended'; audio.ctx.onstatechange();
ok(seen === 'suspended' && !audio.running, 'statechange notifies listeners that the context stopped');
audio.setPaused(true); audio.setPaused(false);
await Promise.resolve();
ok(audio.ctx.state === 'running', 'and the next unpause brings it back');
void econ;

console.log(fail ? `FAIL: ${fail} engine rebuild checks` : 'PASS: engine rebuild guard (silent driveway), profile equivalence and context recovery');
process.exit(fail ? 1 : 0);
