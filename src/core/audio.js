import { Ambience } from './ambience.js';
// Procedural audio — no files to load.
//
// The engine is not a sine at engine rpm. A four-stroke fires cyl/2 times per
// revolution, so what you actually hear is a *pulse train* at
//
//     firing = rpm / 120 * cyl        (25 Hz at 750 rpm on a four, 100 Hz at 3000)
//
// rich in harmonics, shaped by the exhaust and the intake, boomed by the body.
// So: one OscillatorNode running a PeriodicWave that holds **one whole engine
// cycle** (720°, `cyl` pulses in it) at rpm/120 Hz. Harmonic `cyl` of that wave
// is the firing note; harmonics 1..cyl-1 carry the cylinder-to-cylinder
// unevenness (every 4th pulse slightly stronger), which is what stops it
// sounding like a synth. Chrome band-limits a PeriodicWave per octave, so it
// never aliases the way a looped buffer at playbackRate 7 would.
//
// That pulse train then goes through
//
//   osc ─┬─ exhaust bandpass ─ gain ─┐
//        └─ intake  bandpass ─ gain ─┤
//   tick osc ─ 3.4 kHz bandpass ─────┤
//   noise ─┬─ intake hiss ───────────┼─ bus ─ tone LP ─ cabin peak ─┬─ dry ──┐
//          ├─ exhaust rasp ──────────┤                              └ shaper ┴─ out
//          ├─ overrun pops ──────────┤
//          ├─ decel burble ──────────┤
//          └─ driveline thunk ───────┘
//
// The `tone` lowpass is the load: an engine labouring against a hill is a
// brighter, harder noise than the same engine coasting, and nothing else in
// the graph can tell you which one you are listening to.
//
// Alongside it, and NOT part of the engine, is the road voice (RoadDriver):
//
//   noise ─┬─ tyre bandpass (surface) ─ gain(speed) ─┐
//          ├─ grit highpass (surface) ─ gain(speed) ─┤
//          └─ suspension thump lowpass ─ env ────────┼─ road out
//   whine osc ─ narrow bandpass ─ gain(speed) ───────┘
//
// which is what changes when you leave the tarmac. It is separate because it is
// a separate thing: the auditions in docs/audio/*.wav render the engine alone
// (docs/audio/ranger-road.wav renders both), and the engine measurements in
// tools/smoke_audio.mjs would be meaningless with a gravel roar over them.
//
// Everything is built once. `engine()` only writes AudioParams — no node is
// created while you are driving.

// The two ends of the cabin filter's sweep, in Hz. OPEN is above the top of
// hearing, which is the same as no filter at all; SEAT is what a 6x9 in a door
// card actually gives you with a cassette adapter in the deck.
const CABIN_OPEN = 20000;
const CABIN_SEAT = 2400;

// AUD-01: the engine bus sits 4 dB under the player's engine slider. Tom (16 Oct
// 2026): the engine was too much against everything else. One flat trim on the
// bus, so idle, cruise and redline keep their shape against each other and the
// offline auditions (docs/audio, which render the voice alone) are untouched.
export const ENGINE_TRIM = Math.pow(10, -4 / 20);   // 0.631

// AUD-01: the siren. Tom found it "pretty annoying": it was 0.12 at any range,
// a cruiser 110 m back as loud as one on the bumper. Now:
//   * SIREN_NEAR, 6 dB under the old 0.12, inside SIREN_REF metres;
//   * 1/distance past that (-6 dB per doubling: -12 dB at 80 m, so a cruiser
//     that far back is faint), never under SIREN_FLOOR (-16 dB) while a chase
//     is on, so you still hear that somebody is coming;
//   * 4 dB down (SIREN_TALK) while a voice is speaking (speechSynthesis: the
//     radio show and anybody else the game makes talk).
// There is one siren voice however many cruisers there are, and it follows the
// nearest one, so at most one siren is ever heard (the task allowed two).
export const SIREN_NEAR = 0.06, SIREN_REF = 20, SIREN_FLOOR = 0.16;
export const SIREN_TALK = Math.pow(10, -4 / 20);
// AUD-02: the ladder (references/review/redteam-2026-10-19/audio.md, finding 3,
// and docs/qa/rf/AUD-02.md). The radio is not ducked under engine load any
// more; instead the engine gives way, a little, to a voice, and both the
// engine and the radio drop out for a beat under a real crash.
//   ENGINE_TALK  engine bus under speechSynthesis (-2 dB)
//   CRASH_GAIN   crash layers (x2.5, about +8 dB: a wall is the loudest thing)
//   CRASH_DIP    engine and radio under a hit over CRASH_DIP_FORCE (-6 dB),
//                held CRASH_HOLD s, back over about 0.3 s
//   LAND_GAIN    landings (x1.6, about +4 dB)
//   MISFIRE_GAIN the damaged-engine cough (0.36 -> 0.14) and its spacing:
//                at most one every MISFIRE_GAP[0]..[1] s, never within
//                MISFIRE_AFTER_CRASH s of a crash (it sat on top of the hit)
export const ENGINE_TALK = Math.pow(10, -2 / 20);
export const CRASH_GAIN = 2.5, CRASH_DIP = 0.5, CRASH_DIP_FORCE = 0.4, CRASH_HOLD = 0.15;
export const LAND_GAIN = 1.6;
// S3-RANGER: the tyre squeal at full `squeal` (was 0.14, see skid()).
export const SKID_GAIN = 0.30;
export const MISFIRE_GAIN = 0.14, MISFIRE_GAP = [2, 5], MISFIRE_AFTER_CRASH = 1.2;

/** Siren gain for the nearest cruiser `d` metres away. Not a number = near. */
export function sirenLevel(d, talking = false) {
  const f = d > SIREN_REF ? Math.max(SIREN_FLOOR, SIREN_REF / d) : 1;
  return SIREN_NEAR * f * (talking ? SIREN_TALK : 1);
}

// A stable content key for an engine profile. Cached per object: the profile
// is a plain frozen-in-practice record, and this runs whenever economy retunes.
const PROFILE_KEYS = new WeakMap();
export function profileKey(p) {
  if (!p || typeof p !== 'object') return '';
  let k = PROFILE_KEYS.get(p);
  if (k === undefined) {
    const flat = {};
    for (const name of Object.keys(p).sort()) flat[name] = p[name];
    k = JSON.stringify(flat);
    PROFILE_KEYS.set(p, k);
  }
  return k;
}

// ---------------------------------------------------------------- B-13a
//
// Nothing is automated while the clock is stopped. Chrome only prunes an
// AudioParam's automation events once the audio clock passes them, so while the
// context is suspended (no gesture yet, a background tab, Safari's
// 'interrupted') `currentTime` is frozen and every per-frame setTargetAtTime
// joins an event list that never shrinks. Each new call then costs more than
// the last: in A-11's soak (docs/visual-wave/reports/PERF-CREEP.md) it was 90
// percent of the main thread after ten minutes. So:
//
//   * every per-frame entry point below returns early while `!this.running`,
//     and the one-shots refuse to build nodes that could never end;
//   * every state change cancels what is still queued on the long-lived params
//     (`_sweep`), and a return to 'running' re-applies the mix (`_applyMix`);
//   * every AudioParam the live context makes is tapped (`_instrument`): the tap
//     counts automation calls for the review telemetry (`automation()`), and a
//     call that arrives from outside this file while the clock is stopped first
//     cancels whatever that param has queued at or after its own time, so a
//     per-frame caller elsewhere (radio, weather) holds one event, not ten
//     thousand. Schedules in time order (envelopes) are left intact.
const AUTO_METHODS = ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'setValueCurveAtTime'];
const PARAM_KEYS = ['gain', 'frequency', 'Q', 'detune', 'playbackRate', 'delayTime', 'offset', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release'];
const FACTORIES = ['createGain', 'createBiquadFilter', 'createOscillator', 'createBufferSource', 'createDynamicsCompressor',
  'createConstantSource', 'createStereoPanner', 'createDelay'];

function tapParam(au, p, own) {
  p.__auTap = true;
  if (own) p.__auOwn = true;
  const cancel = p.cancelScheduledValues;
  for (const m of AUTO_METHODS) {
    const orig = p[m];
    if (typeof orig !== 'function') continue;
    // Every method's start or end time is its second argument.
    p[m] = function (a, b, c) {
      const A = au.auto;
      A.scheduled++;
      if (!au.running) {
        A.whileStopped++;
        if (p.__auOwn) A.pending++; else A.foreign++;
        if (typeof cancel === 'function' && typeof b === 'number' && isFinite(b)) cancel.call(p, b);
      }
      return orig.call(this, a, b, c);
    };
  }
}

export class Audio {
  constructor() {
    this.ok = false;
    this.enabled = true;
    this.ep = null;
    this.voice = null;
    this.inCab = false;
    // 0..1 each. The options screen owns the persistence; this owns the graph.
    this.vol = { master: 1, engine: 1, effects: 1, radio: 1, ambience: 0.65 };
    this.epKey = '';
    // How many times an engine driver has been built. The Node guard for the
    // silent-driveway bug (tools/smoke_engine_rebuilds.mjs) counts these.
    this.engineBuilds = 0;
    // AUD-01: metres to the nearest cruiser, from sirenRange(). NaN = not told.
    this.sirenM = NaN;
    this.stateListeners = new Set();
    // B-13a: the automation counter (see automation()) and the long-lived
    // params each part of the graph owns, by group, for _sweep().
    this.auto = { scheduled: 0, whileStopped: 0, pending: 0, foreign: 0, refused: 0, sweeps: 0, suspends: 0 };
    this._groups = new Map();
    this._collect = null;
  }

  /**
   * B-13a review telemetry. `scheduled` counts every automation call on the
   * live context; `whileStopped` the ones made while it was not running;
   * `pending` the ones of those on this file's own long-lived params that no
   * sweep has cancelled yet (0 after any suspend or resume); `foreign` calls
   * from other files while stopped, each coalesced to one queued event;
   * `refused` per-frame calls this file skipped because the clock was stopped.
   * Read it as window.AYLMER.audio.automation().
   */
  automation() {
    let tracked = 0;
    for (const list of this._groups.values()) tracked += list.length;
    return { state: this.state, running: this.running, ...this.auto, tracked };
  }
  _refuse() { this.auto.refused++; }
  _instrument(ctx) {
    const au = this;
    for (const f of FACTORIES) {
      const orig = ctx[f];
      if (typeof orig !== 'function') continue;
      ctx[f] = function (a, b, c) { const n = orig.call(ctx, a, b, c); au._tapNode(n); return n; };
    }
  }
  _tapNode(n) {
    if (!n || typeof n !== 'object' && typeof n !== 'function') return;
    const own = !!this._collect;
    for (const k of PARAM_KEYS) {
      const p = n[k];
      if (!p || typeof p.setTargetAtTime !== 'function' || p.__auTap) continue;
      tapParam(this, p, own);
      if (own) this._collect.push(p);
    }
  }
  /** Build part of the graph with every param it makes registered under `name`. */
  _own(name, build) {
    const prev = this._collect, list = [];
    this._collect = list;
    try { return build(); } finally { this._collect = prev; this._groups.set(name, list); }
  }
  /** Cancel whatever is still queued on every long-lived param. */
  _sweep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const list of this._groups.values()) {
      for (const p of list) { try { p.cancelScheduledValues(t); } catch (e) { /* gone */ } }
    }
    this.auto.sweeps++;
    this.auto.pending = 0;
  }
  /** The params that are not set every frame: written again once the clock runs. */
  _applyMix() {
    if (!this.ok || !this.running) return;
    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(this.paused ? 0 : 0.5 * this.vol.master, t);
    this.engBus.gain.setValueAtTime(this.vol.engine * ENGINE_TRIM, t);
    this.fx.gain.setValueAtTime(this.vol.effects, t);
    this.radioBus.gain.setValueAtTime(this.vol.radio, t);
    this.ambienceBus.gain.setValueAtTime(this.vol.ambience, t);
    this.cabin.frequency.setValueAtTime(this.inCab ? CABIN_SEAT : CABIN_OPEN, t);
    this.engDuck.gain.setValueAtTime(this._engBase(), t);
    this.radioDuck.gain.setValueAtTime(1, t);
  }
  _engBase() { return this.talking ? ENGINE_TALK : 1; }
  /**
   * AUD-02: called every frame by main.js with whether a voice is speaking.
   * Writes only on a change, so a quiet drive writes nothing.
   */
  speech(on) {
    on = !!on;
    if (on === !!this.talking) return;
    if (!this.ok || !this.running) { if (this.ok) this._refuse(); return; }
    this.talking = on;
    const t = this.ctx.currentTime;
    if (t < (this._dipUntil || 0)) return;   // the crash dip comes back to the new base
    this.engDuck.gain.setTargetAtTime(this._engBase(), t, 0.12);
  }

  /** 'running', 'suspended', 'interrupted', 'closed', or 'none' before start(). */
  get state() { return this.ctx ? this.ctx.state || 'running' : 'none'; }
  /** True when the context is actually producing sound (a mock with no state counts). */
  get running() { return !this.ctx || !this.ctx.state || this.ctx.state === 'running'; }
  /** Called with the context state whenever it changes. Returns an unsubscribe. */
  onStateChange(fn) { this.stateListeners.add(fn); return () => this.stateListeners.delete(fn); }
  _stateChanged() {
    const st = this.state;
    // B-13a: whichever way it went, nothing queued before the change survives
    // it. Going quiet, the clock stops and the queue would only grow; coming
    // back, the next frame sets every per-frame param again and the mix is
    // written once here.
    if (this.ok) {
      this._sweep();
      if (this.running) this._applyMix(); else this.auto.suspends++;
    }
    // Only a notification: the radio stops claiming it is playing. Waking the
    // context is left to the events below (unpause, visibility, focus, a
    // gesture), so an intentional suspend is never fought over.
    for (const fn of this.stateListeners) { try { fn(st); } catch (e) { console.warn('audio state listener', e); } }
  }
  // F2: nothing used to bring a suspended context back. These fire on the
  // events that can legally resume one; each is a no-op while it is running.
  _watchLifecycle() {
    if (this._watching || typeof window === 'undefined' || !window.addEventListener) return;
    this._watching = true;
    const kick = () => { if (!this.running && !this.paused) this.resume(); };
    for (const name of ['pointerdown', 'keydown', 'touchend', 'focus']) window.addEventListener(name, kick, true);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    }
  }

  /**
   * The driver's view puts your ears inside the cab (BACKLOG C6). Called every
   * frame with the camera's answer; only a change moves anything, and the sweep
   * takes about a fifth of a second so pressing C is a filter opening rather
   * than a click. Safe before the context exists — the graph reads `inCab` when
   * it is built.
   */
  setCabin(on) {
    on = !!on;
    if (on === this.inCab) return on;
    this.inCab = on;
    if (this.ok && this.cabin && this.running) {
      this.cabin.frequency.setTargetAtTime(on ? CABIN_SEAT : CABIN_OPEN, this.ctx.currentTime, 0.06);
    }
    return on;
  }

  /**
   * Mixer trims, 0..1 each; pass only the ones you are changing.
   * `master` scales everything, `engine` the engine voice, `effects` the horn /
   * tyres / crashes / chimes, `radio` the deck in game/radio.js.
   */
  setVolume(v) {
    if (!v) return { ...this.vol };
    for (const k of ['master', 'engine', 'effects', 'radio', 'ambience']) {
      if (typeof v[k] === 'number' && isFinite(v[k])) this.vol[k] = Math.max(0, Math.min(1, v[k]));
    }
    if (this.ok && this.running) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime((this.paused ? 0 : 0.5 * this.vol.master), t, 0.05);
      this.engBus.gain.setTargetAtTime(this.vol.engine * ENGINE_TRIM, t, 0.05);
      this.fx.gain.setTargetAtTime(this.vol.effects, t, 0.05);
      this.radioBus.gain.cancelScheduledValues(t);
      this.radioBus.gain.setValueAtTime(this.radioBus.gain.value, t);
      this.radioBus.gain.linearRampToValueAtTime(this.vol.radio, t + 0.05);
      this.ambienceBus.gain.setTargetAtTime(this.vol.ambience, t, 0.1);
    }
    return { ...this.vol };
  }
  start() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this._instrument(ctx);
    this._own('core', () => this._buildCore(ctx));
    this.noise.start();
    this.ok = true;
    ctx.onstatechange = () => this._stateChanged();
    this._watchLifecycle();
    this.setEngineProfile(this.ep, true);
  }
  _buildCore(ctx) {

    // Master: gain then a compressor, so a horn on top of a redline pull cannot
    // clip the output. Everything in the game connects to `this.master`.
    this.master = ctx.createGain();
    this.master.gain.value = 0.5 * this.vol.master;
    this.comp = makeMasterComp(ctx);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // Three trims feeding the master, so the options screen can move the
    // engine, the effects and the radio against each other. `master` itself
    // stays the sum bus everything else in the game connects to.
    this.engBus = ctx.createGain(); this.engBus.gain.value = this.vol.engine * ENGINE_TRIM;
    this.fx = ctx.createGain(); this.fx.gain.value = this.vol.effects;
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = this.vol.radio;
    this.ambienceBus = ctx.createGain(); this.ambienceBus.gain.value = this.vol.ambience;
    this.ambienceBus.connect(this.master);
    // The cabin filter sits between the radio and the master and is a flat wire
    // (20 kHz) in every camera but the driver's. From the seat you are not
    // listening to a station, you are listening to two paper door speakers in a
    // 1993 truck fed off a cassette adapter, and the top end is simply not
    // there. See setCabin(): one node, one swept frequency, no second graph.
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass';
    this.cabin.frequency.value = this.inCab ? CABIN_SEAT : CABIN_OPEN;
    this.cabin.Q.value = 0.4;
    // AUD-02: two duck gains in front of the master, one for the engine (a
    // voice, a crash) and one for the radio (a crash). Flat 1 otherwise.
    this.engDuck = ctx.createGain(); this.engDuck.gain.value = 1;
    this.radioDuck = ctx.createGain(); this.radioDuck.gain.value = 1;
    this.radioBus.connect(this.cabin);
    this.cabin.connect(this.radioDuck); this.radioDuck.connect(this.master);
    this.engBus.connect(this.engDuck); this.engDuck.connect(this.master);
    this.fx.connect(this.master);

    // One noise buffer, shared by the engine voice, the tyres and the rattle.
    this.noiseBuf = makeNoise(ctx, 2);
    this.noise = ctx.createBufferSource();
    this.noise.buffer = this.noiseBuf; this.noise.loop = true;

    // Tyre noise: white noise through a bandpass.
    this.nf = ctx.createBiquadFilter();
    this.nf.type = 'bandpass'; this.nf.frequency.value = 1400; this.nf.Q.value = 1.6;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.fx);

    // The road: tyres, grit and the axle. Built once, driven from engine().
    this.road = new RoadDriver(ctx, this.fx, this.noiseBuf);
  }
  environment(scene) {
    if (!this.ok) return;
    if (!this.running) { this._refuse(); return; }
    if (!this.ambience) this.ambience = this._own('ambience', () => new Ambience(this.ctx, this.ambienceBus, this.noiseBuf));
    this.ambience.update({ ...scene, cabin: this.inCab, enabled: this.enabled && !this.paused });
  }
  setPaused(on) {
    this.paused = !!on;
    if (!this.master || !this.ctx) return;
    // While the clock is stopped the level is written by _applyMix on resume.
    if (this.running) {
      const gain = this.master.gain, t = this.ctx.currentTime;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(this.paused ? 0 : 0.5 * this.vol.master, t);
    }
    // Unpausing is a user action, so it is allowed to wake a suspended context.
    if (!this.paused) this.resume();
  }
  /**
   * Wake the context if the browser suspended it ('suspended', or Safari's
   * 'interrupted'). Returns a promise that settles either way.
   */
  resume() {
    const ctx = this.ctx;
    if (!ctx || !ctx.resume || !(ctx.state === 'suspended' || ctx.state === 'interrupted')) return Promise.resolve(this.state);
    try {
      return Promise.resolve(ctx.resume()).then(() => this.state, () => this.state);
    } catch (e) { return Promise.resolve(this.state); }
  }

  // Swap the engine's character when you swap cars. See cars.js SOUND for the
  // shape of `p`; passing nothing goes back to the generic four-cylinder.
  // Returns true when a new driver was built.
  setEngineProfile(p, force = false) {
    const next = p || null, key = profileKey(next);
    // F4: an equivalent profile keeps the running driver, whichever object it
    // arrives in (economy rebuilds the tuned-sound object on a repaint or a
    // restore). Compared by content, never by identity.
    if (!force && this.driver && this.epKey === key) { this.ep = next; return false; }
    this.ep = next; this.epKey = key;
    if (!this.ok) return false;
    const prev = this.driver;
    this.driver = this._own('engine', () => new EngineDriver(this.ctx, this.engBus, this.ep || DEFAULT_ENGINE, this.noiseBuf));
    this.voice = this.driver.voice;
    this.engineBuilds++;
    if (prev) {
      // Hand the level over, so a genuine change (a camshaft) is a change of
      // character and not a 150 ms hole while the new voice fades up from zero.
      try { this.voice.out.gain.value = prev.voice.out.gain.value; } catch (e) { /* mock */ }
      prev.dispose();
    }
    if (this.road) this.road.setProfile(this.ep || DEFAULT_ENGINE);
    return true;
  }

  // Real engine rpm, engine load 0..1, road speed, pedal 0..1, clutch 0..1.
  // `rpm <= 1` means "engine off" — that is how the pause screen and the map
  // silence it (`audio.engine(0, 0)`).
  //
  // The road voice is stepped from here too, because this is the only call in
  // the game that arrives every frame with the player's road speed on it. What
  // is UNDER the wheels comes from CONTACT, matched on that same speed — see
  // the comment there.
  engine(rpm, load, kmh = 0, throttle = -1, clutch = 1, dt = 1 / 60) {
    if (!this.ok || !this.driver) return;
    if (!this.running) { this._refuse(); return; }
    const gate = this.enabled ? 1 : 0;
    const at = this.ctx.currentTime;
    this.driver.step(dt, rpm, load, kmh, throttle, clutch, gate, at);
    if (this.road) this.road.step(dt, kmh, load, CONTACT.find(kmh), rpm > 1 ? gate : 0, at);
  }
  // The scrub of a tyre that has given up, as opposed to the roll of one that
  // has not (that is the road voice). Gravel scrubs higher and drier than
  // tarmac, so the band follows whatever the road voice last stood on.
  skid(amount) {
    if (!this.ok) return;
    if (!this.running) { this._refuse(); return; }
    const t = this.ctx.currentTime;
    const su = (this.road && this.road.surf) || SURFACE.asphalt;
    // S3-RANGER: 0.14 to 0.30. At 0.14 the Ranger's lever slide was 0.02 of
    // gain, which is silence under an engine (feel.md 4); the input is now the
    // car's `squeal`, which stays near 0 in ordinary corners.
    this.ng.gain.setTargetAtTime((this.enabled ? 1 : 0) * amount * SKID_GAIN * su.scrub, t, 0.05);
    this.nf.frequency.setTargetAtTime(su.tyreF * 0.7 + amount * 1500, t, 0.08);
  }
  blip(freq = 660, dur = 0.12, type = 'square', vol = 0.18) {
    if (!this.ok || !this.enabled || !this.running) return;
    if ((this._blips || 0) >= 8) return;
    this._blips = (this._blips || 0) + 1;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.fx);
    o.onended = () => { this._blips--; o.disconnect(); g.disconnect(); };
    o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }
  chime(up = true) {
    const n = up ? [523, 659, 784] : [440, 330];
    n.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.16), i * 90));
  }
  horn(on) {
    if (!this.ok || !this.enabled) return;
    if (on && !this._horn) {
      // Held while the clock is stopped: it starts on the first frame it runs.
      if (!this.running) return;
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      // Two detuned saws, unless the current engine profile brought its own
      // horn along (cars.js SOUND.*.horn) — the golf cart's is a bike bell.
      const H = (this.ep && this.ep.horn) || null;
      o.type = H ? H.type : 'sawtooth'; o.frequency.value = H ? H.f : 400;
      o2.type = H ? H.type : 'sawtooth'; o2.frequency.value = H ? H.f2 : 502;
      g.gain.value = H ? H.gain : 0.09;
      o.connect(g); o2.connect(g); g.connect(this.fx);
      o.start(); o2.start();
      this._horn = { o, o2, g };
    } else if (!on && this._horn) {
      const h = this._horn; this._horn = null;
      if (this.running) h.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => { h.o.stop(); h.o2.stop(); h.o.disconnect(); h.o2.disconnect(); h.g.disconnect(); }, 120);
    }
  }
  crash(force) {
    if (!this.ok || !this.enabled || !this.running) return;
    const now = this.ctx.currentTime;
    if (now < (this._nextCrash || 0)) return;
    this._nextCrash = now + 0.14;
    this._lastCrash = now;
    fireCrash(this.ctx, this.fx, now, force, this.noiseBuf, CRASH_GAIN);
    // AUD-02: a real hit is a two-part event, the world drops out under it.
    if (force > CRASH_DIP_FORCE && this.engDuck) {
      const back = now + 0.02 + CRASH_HOLD;
      for (const [p, base] of [[this.engDuck.gain, this._engBase()], [this.radioDuck.gain, 1]]) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(base * CRASH_DIP, now + 0.02);
        p.setValueAtTime(base * CRASH_DIP, back);
        p.setTargetAtTime(base, back, 0.1);
      }
      this._dipUntil = back + 0.4;
    }
  }
  // S3-CRASH: the tail of a crash show (main.js fires it with the crash
  // slow-mo, so only a real head-on). fireCrash is the hit itself and stays
  // what audition.mjs renders; this is what comes after it: the body groaning
  // down, the glass landing in bits, a last clank. Under the same CRASH_GAIN
  // and the same AUD-02 dip as the hit, about 1.1 s long.
  crashTail(force) {
    if (!this.ok || !this.enabled || !this.running) return;
    const now = this.ctx.currentTime;
    if (now < (this._nextTail || 0)) return;
    this._nextTail = now + 1.5;
    fireCrashTail(this.ctx, this.fx, now + 0.05, force, this.noiseBuf, CRASH_GAIN);
  }
  // R3: somebody else's horn. Same two-saw shape as yours, pitched wherever the
  // caller likes, and it lets go on its own.
  honk(freq = 330, dur = 0.55, vol = 0.07) {
    if (!this.ok || !this.enabled || !this.running) return;
    if (this.ctx.currentTime < (this._nextHonk || 0)) return;
    this._nextHonk = this.ctx.currentTime + 0.12;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    o2.type = 'sawtooth'; o2.frequency.value = freq * 1.26;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, vol), t + 0.03);
    g.gain.setValueAtTime(Math.max(0.002, vol), t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g); g.connect(this.fx);
    o.start(); o2.start();
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }
  // The race agent: the cruiser's siren. A square oscillator swept as a slow
  // wail (AUD-01: it was a hi-lo square switch at 1.6 Hz, 510/810 Hz, which is
  // the part Tom found annoying) through a soft lowpass, so it is a wail from a
  // block away rather than a dentist's drill. Level: sirenLevel().
  siren(on) {
    if (!this.ok) return;
    if (!this.running) {
      // Nothing to hear and no clock to fade on: stop it outright, or wait.
      if (!on && this._siren) {
        const s = this._siren; this._siren = null; this._groups.delete('siren');
        try { s.o.stop(); s.lfo.stop(); } catch (e) { /* already gone */ }
      } else this._refuse();
      return;
    }
    if (on && !this._siren) {
      this._own('siren', () => this._buildSiren());
    } else if (!on && this._siren) {
      const s = this._siren; this._siren = null; this._groups.delete('siren');
      s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch (e) { /* already gone */ } }, 700);
    } else if (on && this._siren) {
      const s = this._siren;
      s.want = this._sirenWant();
      s.g.gain.setTargetAtTime(s.want, this.ctx.currentTime, 0.2);
    }
  }
  _sirenWant() {
    if (!this.enabled) return 0;
    const sp = typeof globalThis !== 'undefined' ? globalThis.speechSynthesis : null;
    return sirenLevel(this.sirenM, !!(sp && sp.speaking));
  }
  /**
   * AUD-01: called every frame by cops.js with the nearest driving cruiser, in
   * metres. Only remembers the number unless a siren is sounding; then it moves
   * the level, and only when the target has moved by more than about half a dB,
   * so a steady chase writes nothing at all. No allocation.
   */
  sirenRange(d) {
    this.sirenM = d;
    const s = this._siren;
    if (!this.ok || !s) return;
    if (!this.running) { this._refuse(); return; }
    const want = this._sirenWant();
    if (Math.abs(want - s.want) <= s.want * 0.06 + 1e-5) return;
    s.want = want;
    s.g.gain.setTargetAtTime(want, this.ctx.currentTime, 0.25);
  }
  _buildSiren() {
    const t = this.ctx.currentTime;
    // Q 0.5: no resonant bump at the cutoff. The top of the wail (920 Hz) is
    // about 2 dB down, its third harmonic about 11 dB, where the old 1500 Hz /
    // Q 1 filter let the third harmonic of 810 Hz through at -7 dB.
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1700; f.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.setValueAtTime(700, t);
    // The wail: a triangle LFO sweeping the pitch 480..920 Hz and back, about
    // 3.6 s a cycle. No steps, so nothing clicks at each change of note.
    const lfo = this.ctx.createOscillator();
    lfo.type = 'triangle'; lfo.frequency.value = 0.28;
    const lg = this.ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(f); f.connect(g); g.connect(this.fx);
    o.start(); lfo.start();
    const want = this._sirenWant();
    g.gain.setTargetAtTime(want, t, 0.25);
    this._siren = { o, lfo, g, f, want };
  }

  // A landing: the thump of the springs bottoming out, plus a scuff of tyre.
  // `force` is the vertical speed killed, in m/s — about 2 for a kerb hop and
  // 9 for coming off the rail berm at 70.
  land(force) {
    if (!this.ok || !this.enabled || !this.running) return;
    fireLand(this.ctx, this.fx, this.ctx.currentTime, force, this.noiseBuf,
      (this.road && this.road.surf) || SURFACE.asphalt, LAND_GAIN);
  }

  // Wind over the roof while the wheels are off the ground. Call it every frame
  // with 0..1; it opens and closes one long-lived noise voice rather than
  // starting a new one, so holding a jump costs nothing.
  whoosh(amount) {
    if (!this.ok || !this.enabled || !this.noiseBuf) return;
    if (!this.running) { this._refuse(); return; }
    const a = Math.min(1, Math.max(0, amount));
    if (!this._air) {
      if (a <= 0) return;
      this._own('air', () => this._buildAir());
    }
    const t = this.ctx.currentTime;
    this._air.g.gain.setTargetAtTime(Math.max(0.0001, a * 0.075), t, 0.05);
    this._air.bp.frequency.setTargetAtTime(520 + a * 900, t, 0.08);
  }
  _buildAir() {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf; n.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    n.connect(bp); bp.connect(g); g.connect(this.fx);
    n.start();
    this._air = { n, g, bp };
  }

  // A-06: the speed cue you hear. Above 70 km/h the air over the cab starts to
  // hiss and a low roar comes up off the road, both full by about 130. One
  // long-lived noise voice with two bands, opened and closed with gain like
  // whoosh(), so calling it every frame costs nothing. Below 70 it is silent
  // and nothing is built. `meters` holds the targets last asked for (0..1 and
  // the two gains), for the checks: tools/qa/feel_a06.mjs reads them.
  wind(kmh = 0) {
    const a = Math.min(1, Math.max(0, (Math.abs(kmh) - 70) / 60));
    const level = a * a * (3 - 2 * a);
    this.meters = this.meters || { wind: 0, windGain: 0, roarGain: 0 };
    this.meters.wind = level;
    this.meters.windGain = level * 0.06;
    this.meters.roarGain = level * 0.05;
    if (!this.ok || !this.noiseBuf) return;
    if (!this.running) { this._refuse(); return; }
    const gate = this.enabled ? 1 : 0;
    if (!this._wind) {
      if (level <= 0) return;
      this._own('wind', () => this._buildWind());
    }
    const t = this.ctx.currentTime, w = this._wind;
    w.wg.gain.setTargetAtTime(Math.max(0.0001, this.meters.windGain * gate), t, 0.12);
    w.rg.gain.setTargetAtTime(Math.max(0.0001, this.meters.roarGain * gate), t, 0.12);
    w.hp.frequency.setTargetAtTime(1200 + level * 900, t, 0.2);
    w.lp.frequency.setTargetAtTime(140 + level * 120, t, 0.2);
  }
  _buildWind() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf; n.loop = true;
    // Wind: a broad high band, the hiss at the A-pillar.
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = 1500; hp.Q.value = 0.35;
    const wg = ctx.createGain(); wg.gain.value = 0.0001;
    // Roar: the low rumble of the tyres and the body at speed.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.7;
    const rg = ctx.createGain(); rg.gain.value = 0.0001;
    n.connect(hp); hp.connect(wg); wg.connect(this.fx);
    n.connect(lp); lp.connect(rg); rg.connect(this.fx);
    n.start();
    this._wind = { n, hp, wg, lp, rg };
  }

  // R4: the cough of an engine that has been through a hedge.
  misfire() {
    if (!this.ok || !this.enabled || !this.running) return;
    const t = this.ctx.currentTime;
    // AUD-02: texture, not an event. cars.js still skips the stroke (and the
    // power) on its own timer; only what you hear is spaced out.
    if (t < (this._nextMisfire || 0) || t - (this._lastCrash ?? -1e9) < MISFIRE_AFTER_CRASH) return;
    this._nextMisfire = t + MISFIRE_GAP[0] + Math.random() * (MISFIRE_GAP[1] - MISFIRE_GAP[0]);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.setValueAtTime(92 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
    f.type = 'lowpass'; f.frequency.value = 620;
    g.gain.setValueAtTime(MISFIRE_GAIN, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(f); f.connect(g); g.connect(this.fx);
    o.start(); o.stop(t + 0.14);
  }

  // ---- the reactive world (peds.js / streetprops.js) ---------------------

  // « Heille! » — a two-formant vowel yelp, no samples. A sawtooth larynx with
  // a pitch scoop runs through two resonant bandpasses parked on F1/F2 of /ɛ/
  // gliding toward /j/, which is enough of a diphthong for the ear to hear a
  // person rather than a beep. Voices vary a little so a street of them is not
  // one man shouting forty times.
  heille() {
    if (!this.ok || !this.enabled || !this.running) return;
    const t = this.ctx.currentTime;
    const ctx = this.ctx;
    const f0 = 168 + Math.random() * 105;          // low male .. high female
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.86, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.18, t + 0.08);
    o.frequency.linearRampToValueAtTime(f0 * 0.80, t + 0.34);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.90, t + 0.035);
    g.gain.setValueAtTime(0.90, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    // F1 stays put; F2 climbs into the -ille.
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 600 + Math.random() * 90; f1.Q.value = 7;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.Q.value = 11;
    f2.frequency.setValueAtTime(1750, t);
    f2.frequency.linearRampToValueAtTime(2320, t + 0.30);
    const g2 = ctx.createGain(); g2.gain.value = 0.65;
    o.connect(f1); f1.connect(g);
    o.connect(f2); f2.connect(g2); g2.connect(g);
    g.connect(this.fx);
    o.start(); o.stop(t + 0.42);
  }

  // A prop going over. `kind` is what it is made of: 'bin' (hollow plastic),
  // 'metal' (a mailbox, a cart), 'wood' (terrasse furniture), 'glass'.
  // One noise burst shaped by a filter plus a body resonance, ~0.2 s.
  thud(kind = 'bin', vol = 1) {
    if (!this.ok || !this.enabled || !this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (!this._thudBuf) {
      const n = (ctx.sampleRate * 0.3) | 0;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      this._thudBuf = buf;
    }
    const P = THUD[kind] || THUD.bin;
    const src = ctx.createBufferSource();
    src.buffer = this._thudBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = P.type; f.frequency.value = P.freq * (0.9 + Math.random() * 0.2); f.Q.value = P.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(P.vol * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + P.dur);
    src.connect(f); f.connect(g); g.connect(this.fx);
    src.start(t); src.stop(t + P.dur + 0.02);
    // The body of the thing: one decaying sine at its own note.
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(P.body * (0.92 + Math.random() * 0.16), t);
    o.frequency.exponentialRampToValueAtTime(P.body * 0.72, t + P.dur);
    og.gain.setValueAtTime(P.vol * 0.8 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.0005, t + P.dur * 1.2);
    o.connect(og); og.connect(this.fx);
    o.start(t); o.stop(t + P.dur * 1.3);
  }

  // Options-screen fallback: the master trim alone. The mixer above owns it.
  setMaster(v) {
    return this.setVolume({ master: typeof v === 'number' && isFinite(v) ? v : 1 }).master;
  }

  // FEEL — somebody under the hood with a ratchet: two or three short metallic
  // taps at a slightly different pitch and spacing every time, so calling it on
  // a loop while a repair runs reads as work and not as a metronome.
  wrench(vol = 1) {
    if (!this.ok || !this.enabled || !this.running) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const at = t0 + i * (0.075 + Math.random() * 0.055);
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'square';
      const hz = 1250 + Math.random() * 900;
      o.frequency.setValueAtTime(hz, at);
      o.frequency.exponentialRampToValueAtTime(hz * 0.42, at + 0.05);
      f.type = 'bandpass'; f.frequency.value = 2200 + Math.random() * 700; f.Q.value = 3.2;
      g.gain.setValueAtTime(0.60 * vol, at);
      g.gain.exponentialRampToValueAtTime(0.0004, at + 0.075);
      o.connect(f); f.connect(g); g.connect(this.fx);
      o.start(at); o.stop(at + 0.09);
    }
  }
}

// ---------------------------------------------------------------- the voice

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A built engine voice plus the bits of behaviour that need to remember
 * something between frames: the lumpy idle, the overrun pops and the rattling
 * door speaker. The game drives this at `ctx.currentTime`; core/audition.js
 * drives the identical code at scheduled offline times, which is why the WAVs
 * in docs/audio are the same sound you hear while driving.
 */
export class EngineDriver {
  constructor(ctx, dest, profile, sharedNoise) {
    this.ctx = ctx;
    this.voice = buildEngineVoice(ctx, dest, profile, sharedNoise);
    this.p = this.voice.p;
    this._jit = 0; this._jitT = 0; this._popT = 0;
    this._clutch = 1;
  }

  step(dt, rpm, load, kmh, throttle, clutch, gate, at) {
    const v = this.voice, e = this.p;
    if (throttle < 0) throttle = load;

    // Lumpy idle: a slow random walk of ±`lumpy` on the crank speed, faded out
    // as soon as you are on the throttle. On a four with no balance shafts this
    // is most of what makes a standing idle sound like an engine rather than a
    // held note, so the Ranger's `lumpy` is twice anybody else's.
    this._jitT -= dt;
    if (this._jitT <= 0) {
      this._jitT = 0.09 + Math.random() * 0.11;
      this._jit = Math.random() * 2 - 1;
    }
    const idleness = clamp01(1 - (rpm - e.idle) / (e.idle * 1.6)) * (1 - clamp01(throttle) * 0.8);
    v.set(rpm * (1 + this._jit * e.lumpy * idleness), load, throttle, clutch, gate, at);

    // The gearchange, as something you hear rather than a hole in the noise.
    // The clutch dipping to zero already takes the load off the engine (set()
    // does that); this is the OTHER half — the driveline taking up again as the
    // pedal comes back, which on a truck with 200,000 km of slack in it is an
    // audible thunk under the floor. Fired on the rising edge only.
    if (gate > 0 && e.gearThunk > 0 && this._clutch < 0.35 && clutch >= 0.55) {
      v.thunkG.gain.cancelScheduledValues(at);
      v.thunkG.gain.setValueAtTime(e.gearThunk * (0.5 + clamp01(load) * 0.5), at);
      v.thunkG.gain.setTargetAtTime(0, at + 0.004, 0.030);
    }
    this._clutch = clutch;

    // Overrun pops: throttle shut, still spinning. A few a second, louder the
    // faster it is turning, and they thin out as the revs fall away — which is
    // what makes a coast down a hill sound like it is ending. The node is
    // already there; this only fires an envelope on it, so nothing is allocated
    // per frame.
    if (gate > 0 && throttle < 0.06 && rpm > e.idle * 1.7 && clutch > 0.5) {
      const heat = clamp01((rpm - e.idle * 1.7) / 2200);
      this._popT -= dt;
      if (this._popT <= 0) {
        this._popT = 0.09 + Math.random() * (0.34 - 0.18 * heat);
        const amp = 0.24 * heat * (e.pop || 1);
        // Each one comes out of a slightly different part of the tailpipe.
        v.nodes.popF.frequency.setValueAtTime(200 + Math.random() * 190, at);
        v.popG.gain.cancelScheduledValues(at);
        v.popG.gain.setValueAtTime(amp, at);
        v.popG.gain.setTargetAtTime(0, at + 0.005, 0.018 + Math.random() * 0.012);
      }
    } else this._popT = 0;

    // C5: the Sunfire's blown door speaker (and the Z24's dashboard), which
    // only buzzes once you are moving.
    const on = e.rattle > 0 && kmh > e.rattleFrom
      ? Math.min(1, (kmh - e.rattleFrom) / 25) * e.rattle : 0;
    v.nodes.ratG.gain.setTargetAtTime(gate * on * 0.055, at, 0.09);
    if (on) v.nodes.ratF.frequency.setTargetAtTime(150 + clamp01(rpm / e.redline) * 190, at, 0.12);
  }

  dispose() { this.voice.dispose(); }
}

export function makeMasterComp(ctx) {
  const c = ctx.createDynamicsCompressor();
  // AUD-02: a safety limiter, not a mix bus. It was -14 dB with a 22 dB knee,
  // so it started near -25 dBFS and a wide-open engine pumped the radio down.
  // Now it starts near -16 dBFS (-10, knee 12).
  c.threshold.value = -10;
  c.knee.value = 12;
  c.ratio.value = 5;
  c.attack.value = 0.004;
  c.release.value = 0.16;
  return c;
}

export function makeNoise(ctx, seconds = 2) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < len; i++) {
    // Slightly pink: one pole of smoothing takes the fizz off white noise.
    const w = Math.random() * 2 - 1;
    s = s * 0.35 + w * 0.65;
    d[i] = s;
  }
  return buf;
}

// One engine cycle as a PeriodicWave: `cyl` combustion pulses in 720° of crank.
// Harmonic `cyl` is the firing note; the low harmonics are the unevenness.
export function makeCycleWave(ctx, p) {
  const M = 1024, N = Math.min(p.harm || 192, M / 2 - 1);
  const cyl = p.cyl || 4;
  const f = new Float32Array(M);
  const decay = p.decay || 7;
  for (let k = 0; k < cyl; k++) {
    // Every `cyl`-th pulse (cylinder 1) is the strong one.
    const amp = k === 0 ? 1 + p.uneven : 1 - p.uneven / (cyl - 1);
    const off = (k / cyl) * M;
    for (let m = 0; m < M / cyl; m++) {
      const u = m / (M / cyl);
      const bump = Math.exp(-u * decay) - Math.exp(-u * decay * 4.2);
      f[(off + m) | 0] += amp * bump;
    }
  }
  // Zero mean, unit peak.
  let mean = 0; for (let i = 0; i < M; i++) mean += f[i];
  mean /= M;
  let peak = 1e-6;
  for (let i = 0; i < M; i++) { f[i] -= mean; peak = Math.max(peak, Math.abs(f[i])); }
  for (let i = 0; i < M; i++) f[i] /= peak;

  const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  const tilt = p.tilt == null ? 0.35 : p.tilt;          // extra roll-off on top
  for (let n = 1; n <= N; n++) {
    let a = 0, b = 0;
    for (let m = 0; m < M; m++) {
      const th = (2 * Math.PI * n * m) / M;
      a += f[m] * Math.cos(th);
      b += f[m] * Math.sin(th);
    }
    // Harmonics are numbered in *cycle* terms; n/cyl is the harmonic of the
    // firing note, which is what `tilt` should be shaped against.
    const hn = n / cyl;
    const roll = 1 / (1 + Math.pow(hn / 9, 1 + tilt));
    re[n] = (2 / M) * a * roll;
    im[n] = (2 / M) * b * roll;
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// A click train for the valvetrain: every harmonic the same, so one period is
// an impulse. Bandpassed high and kept very quiet, it is the tick-over.
function makeTickWave(ctx) {
  const N = 40;
  const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) re[n] = 1 / (1 + n * 0.04);
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

function makeShaperCurve(k = 2.4) {
  const n = 1024, c = new Float32Array(n);
  const d = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / d;
  }
  return c;
}

/**
 * Build the whole engine graph on any AudioContext-like object (a live
 * AudioContext or an OfflineAudioContext — see core/audition.js). Nothing here
 * reads `currentTime`, so the same code renders offline and plays live.
 *
 * Returns { p, set(rpm, load, throttle, clutch, gate, at), popG, dispose() }.
 */
export function buildEngineVoice(ctx, dest, profile, sharedNoise) {
  const p = Object.assign({}, DEFAULT_ENGINE, profile || {});
  const n = {};

  n.out = ctx.createGain(); n.out.gain.value = 0; n.out.connect(dest);
  n.dry = ctx.createGain(); n.dry.gain.value = 1; n.dry.connect(n.out);
  n.shaper = ctx.createWaveShaper();
  n.shaper.curve = makeShaperCurve(p.raspK || 2.6);
  n.shaper.oversample = '2x';
  n.wet = ctx.createGain(); n.wet.gain.value = 0;
  n.shaper.connect(n.wet); n.wet.connect(n.out);

  // Cabin/body resonance: one peaking filter, boosted with load. This is the
  // 100-150 Hz boom you get in third at fifty.
  n.boom = ctx.createBiquadFilter();
  n.boom.type = 'peaking';
  n.boom.frequency.value = p.boomF; n.boom.Q.value = p.boomQ; n.boom.gain.value = 0;
  n.boom.connect(n.dry); n.boom.connect(n.shaper);

  // Load timbre. One lowpass across the whole engine, swept between `toneLo`
  // (throttle shut — the engine is a long way away and behind a firewall) and
  // `toneHi` (wide open, everything in the cabin with you). It is the single
  // cheapest thing in the graph that tells you how hard the engine is working,
  // and without it a labouring engine and a coasting one differ only in level.
  n.tone = ctx.createBiquadFilter();
  n.tone.type = 'lowpass'; n.tone.frequency.value = p.toneLo; n.tone.Q.value = 0.5;
  n.tone.connect(n.boom);

  n.bus = ctx.createGain(); n.bus.gain.value = 1; n.bus.connect(n.tone);

  // The pulse train.
  n.osc = ctx.createOscillator();
  n.osc.setPeriodicWave(makeCycleWave(ctx, p));
  n.osc.frequency.value = p.idle / 120;
  n.oscG = ctx.createGain(); n.oscG.gain.value = 1;
  n.osc.connect(n.oscG);

  n.exh = ctx.createBiquadFilter();
  n.exh.type = 'bandpass'; n.exh.frequency.value = 90; n.exh.Q.value = p.exhQ;
  n.exhG = ctx.createGain(); n.exhG.gain.value = 0;
  n.oscG.connect(n.exh); n.exh.connect(n.exhG); n.exhG.connect(n.bus);

  n.int = ctx.createBiquadFilter();
  n.int.type = 'bandpass'; n.int.frequency.value = 900; n.int.Q.value = p.intQ;
  n.intG = ctx.createGain(); n.intG.gain.value = 0;
  n.oscG.connect(n.int); n.int.connect(n.intG); n.intG.connect(n.bus);

  // Valvetrain tick: rpm/60 * 8, high and quiet.
  n.tick = ctx.createOscillator();
  n.tick.setPeriodicWave(makeTickWave(ctx));
  n.tick.frequency.value = p.idle / 7.5;
  n.tickF = ctx.createBiquadFilter();
  n.tickF.type = 'bandpass'; n.tickF.frequency.value = p.tickF; n.tickF.Q.value = 3.2;
  n.tickG = ctx.createGain(); n.tickG.gain.value = 0;
  n.tick.connect(n.tickF); n.tickF.connect(n.tickG); n.tickG.connect(n.bus);

  // Noise: intake hiss, exhaust rasp, overrun pops.
  n.noise = ctx.createBufferSource();
  n.noise.buffer = sharedNoise || makeNoise(ctx, 2);
  n.noise.loop = true;

  n.hiss = ctx.createBiquadFilter();
  n.hiss.type = 'bandpass'; n.hiss.frequency.value = 1200; n.hiss.Q.value = 0.7;
  n.hissG = ctx.createGain(); n.hissG.gain.value = 0;
  n.noise.connect(n.hiss); n.hiss.connect(n.hissG); n.hissG.connect(n.bus);

  n.rasp = ctx.createBiquadFilter();
  n.rasp.type = 'bandpass'; n.rasp.frequency.value = 420; n.rasp.Q.value = 1.4;
  n.raspG = ctx.createGain(); n.raspG.gain.value = 0;
  n.noise.connect(n.rasp); n.rasp.connect(n.raspG); n.raspG.connect(n.bus);

  n.popF = ctx.createBiquadFilter();
  n.popF.type = 'bandpass'; n.popF.frequency.value = 260; n.popF.Q.value = 2.2;
  n.popG = ctx.createGain(); n.popG.gain.value = 0;
  n.noise.connect(n.popF); n.popF.connect(n.popG); n.popG.connect(n.bus);

  // Decel burble: the wet, hollow gargle a shut throttle makes between the pops
  // — lower and wider than a pop, and continuous rather than fired. Held open
  // by `over` in set(), so it exists only while the engine is being driven by
  // the road instead of the other way round.
  n.burbF = ctx.createBiquadFilter();
  n.burbF.type = 'bandpass'; n.burbF.frequency.value = 150; n.burbF.Q.value = 0.9;
  n.burbG = ctx.createGain(); n.burbG.gain.value = 0;
  n.noise.connect(n.burbF); n.burbF.connect(n.burbG); n.burbG.connect(n.bus);

  // The driveline taking up after a change. Bypasses `tone`, because a thunk
  // through the floor is not something the throttle position gets a say in.
  n.thunkF = ctx.createBiquadFilter();
  n.thunkF.type = 'lowpass'; n.thunkF.frequency.value = 260; n.thunkF.Q.value = 1.2;
  n.thunkG = ctx.createGain(); n.thunkG.gain.value = 0;
  n.noise.connect(n.thunkF); n.thunkF.connect(n.thunkG); n.thunkG.connect(n.boom);

  // The blown door speaker: narrow, low, and it bypasses the engine's own
  // level so it keeps buzzing whatever your right foot is doing.
  n.ratF = ctx.createBiquadFilter();
  n.ratF.type = 'bandpass'; n.ratF.frequency.value = 190; n.ratF.Q.value = 9;
  n.ratG = ctx.createGain(); n.ratG.gain.value = 0;
  n.noise.connect(n.ratF); n.ratF.connect(n.ratG); n.ratG.connect(dest);

  n.osc.start(); n.tick.start(); n.noise.start();

  const T = 0.045;                     // smoothing time constant for everything
  let limPhase = 0;

  function set(rpm, load, throttle, clutch, gate, at) {
    const idle = p.idle, red = p.redline;
    if (!(rpm > 1) || !(gate > 0)) {
      n.out.gain.setTargetAtTime(0, at, 0.05);
      return;
    }
    load = clamp01(load);
    throttle = clamp01(throttle);
    clutch = clamp01(clutch);
    let r = Math.max(idle * 0.55, rpm);

    // Rev limiter: it does not just stop, it stutters — spark cut at ~22 Hz.
    let cut = 1;
    if (r >= p.limiter) {
      r = p.limiter;
      limPhase = (at * 22) % 1;
      cut = limPhase < 0.45 ? 0.22 : 1;
    }
    const frac = clamp01((r - idle) / (red - idle));
    const firing = (r / 120) * p.cyl;
    // `idl` is 1 at a standing idle and gone by about a quarter of the way up
    // the rev range: it carries the idle floor, because the firing note of a
    // four at 800 rpm is 27 Hz and no laptop, phone or TV speaker plays that.
    const idl = clamp01(1 - frac * 4) * (1 - load * clutch);

    n.osc.frequency.setTargetAtTime(r / 120, at, 0.02);
    n.tick.frequency.setTargetAtTime(r / 7.5, at, 0.02);

    // Exhaust: a broad band that follows the firing note up. Low Q so the
    // fundamental is never squashed — the note IS the pulse train.
    n.exh.frequency.setTargetAtTime(Math.min(700, 55 + firing * 1.9 + load * 90 + idl * 150), at, T);
    // Intake: hollower, higher, and only really there when you are on it.
    n.int.frequency.setTargetAtTime(p.intF0 + frac * p.intSpan + load * 500, at, T);

    // Overrun. Graded, not a switch: it fades in as the pedal comes up and as
    // the revs rise above idle, so a lift at 4000 in third arrives as a shift
    // in character rather than as a click. `over` is 1 when the engine is being
    // turned by the road with nothing being asked of it.
    const over = clamp01((0.12 - throttle) / 0.12) * clamp01((r - idle * 1.30) / (idle * 0.85));
    // What the engine is actually working against, as opposed to where your
    // foot is. Mid-change the clutch is out, so it is working against nothing —
    // which is why a gearchange sounds like the engine going free and not just
    // like the volume being turned down.
    const work = load * clutch;
    // Labouring: a lot of load at not many revs. A truck pulling a hill at 2200
    // is the boomiest, hardest noise it makes, and it is nothing like the same
    // engine at 2200 coasting.
    const labour = work * (1 - frac) * (p.labour || 0);
    // Idle is a long way down from wide open, but not 35 dB down: an engine you
    // cannot hear ticking over is not an engine.
    const drive = 0.62 + work * 0.52 + frac * 0.20 + idl * 2.20;

    // The tone lowpass IS the load: shut it down to `toneLo` off the throttle,
    // open it to `toneHi` under full load. Swept a little slower than the rest
    // so a stab of throttle opens up over ~100 ms rather than snapping.
    n.tone.frequency.setTargetAtTime(
      p.toneLo + (p.toneHi - p.toneLo) * clamp01(work * 0.72 + frac * 0.34 + idl * 0.12) * (1 - over * 0.55),
      at, 0.09);

    n.exhG.gain.setTargetAtTime(cut * clutch * p.exhG * drive * (1 - over * 0.30), at, T);
    // The intake is the first thing a shut throttle takes away: there is a
    // plate across it.
    n.intG.gain.setTargetAtTime(
      cut * clutch * p.intG * (0.10 + work * 0.95 + idl * 3.00) * (0.35 + frac * 0.9) * (1 - over * 0.85), at, T);

    // Intake hiss rises with throttle; exhaust rasp opens up above `raspFrom`.
    n.hiss.frequency.setTargetAtTime(700 + frac * 2400 + throttle * 700, at, T);
    n.hissG.gain.setTargetAtTime(clutch * p.hissG * (0.05 + throttle * 0.95) * (0.25 + frac), at, T);
    const rasp = clamp01((r - p.raspFrom) / 1400);
    n.rasp.frequency.setTargetAtTime(300 + firing * 1.2, at, T);
    n.raspG.gain.setTargetAtTime(clutch * p.raspG * Math.max(rasp * (0.2 + work * 0.8), idl * 1.80, (p.midG || 0) * (0.4 + work * 0.6)), at, T);

    // The burble under a shut throttle, tracking the firing note down.
    n.burbF.frequency.setTargetAtTime(110 + firing * 0.55, at, T);
    n.burbG.gain.setTargetAtTime((p.burble || 0) * over * (0.25 + frac * 0.75) * 0.70, at, 0.06);

    // Cabin boom follows the firing note into the body's resonance; the peak is
    // fixed, the drive into it is not. A labouring engine drives it hardest.
    n.boom.gain.setTargetAtTime(
      p.boomDb * (0.45 + work * 0.55 + labour * 0.12) * (1 - over * 0.25), at, 0.08);
    // A fixed resonance parked on a steady firing harmonic is a drone. Let the
    // body note wander a few percent, slowly, so it breathes instead of hums.
    n.boom.frequency.setTargetAtTime(
      p.boomF * (1 + 0.045 * Math.sin(at * 0.9) + 0.025 * Math.sin(at * 2.3 + 1.1)), at, 0.12);

    // Valvetrain tick: loudest at idle, buried once there is any load on it.
    n.tickG.gain.setTargetAtTime(p.tickG * (1 - frac * 0.75) * (1 - work * 0.6) * clutch, at, T);

    // Rasp waveshaper: dry below half load, gently wet at full chat.
    const wet = clamp01((work - 0.35) / 0.65) * p.rasp * (0.4 + frac * 0.6);
    n.wet.gain.setTargetAtTime(wet, at, 0.1);
    n.dry.gain.setTargetAtTime(1 - wet * 0.45, at, 0.1);

    // Master level for the voice. Sits under the toasts and the horn.
    const vol = p.gain * (0.60 + work * 0.28 + frac * 0.20 + idl * 0.50) * (0.35 + clutch * 0.65) * cut;
    n.out.gain.setTargetAtTime(gate * vol * 0.40, at, 0.05);
  }

  function dispose() {
    try { n.osc.stop(); n.tick.stop(); n.noise.stop(); } catch (e) { /* already stopped */ }
    try { n.out.disconnect(); n.ratG.disconnect(); } catch (e) { /* gone */ }
  }

  return { p, nodes: n, set, popG: n.popG, thunkG: n.thunkG, out: n.out, dispose };
}

// What the engine sounds like when nobody has said otherwise: a generic,
// slightly tired four-cylinder.
export const DEFAULT_ENGINE = {
  cyl: 4,
  idle: 800, redline: 6000, limiter: 6200,
  harm: 192, decay: 7, uneven: 0.16, tilt: 0.35,
  exhQ: 0.85, exhG: 1.0,
  intF0: 850, intSpan: 1900, intQ: 1.1, intG: 0.45,
  hissG: 0.16, raspG: 0.20, raspFrom: 3500, rasp: 0.45, raspK: 2.6,
  boomF: 130, boomQ: 5.0, boomDb: 7,
  tickF: 3400, tickG: 0.030,
  lumpy: 0.012, pop: 1,
  gain: 1, rattle: 0, rattleFrom: 0,
  // Load, overrun, driveline and road — see the SOUND table in game/cars.js for
  // what each one is. The defaults are deliberately mild: a car that never
  // declared them sounds like it always did, only less flat.
  toneLo: 1200, toneHi: 4800, labour: 3.0, burble: 0.18,
  whineK: 3.0, whineG: 0.012, gearThunk: 0.035,
};

// ---------------------------------------------------------------- the road
//
// What is under the wheels, and how audio finds out.
//
// main.js hands `engine()` the player's rpm and road speed once a frame and
// nothing else; it does not hand over the Vehicle, and this file has no way to
// reach one. So game/cars.js drops each Vehicle's contact patch in here as it
// updates, tagged with the road speed that vehicle was doing — the same float
// main.js then forwards — and `find()` picks the row that matches. The tag is
// exact rather than approximate because it is the identical number out of the
// identical getter, and the ring is bigger than the number of cars that ever
// update in one frame (you, plus a race's worth of rivals), so the player's row
// is always still in it. Nothing here allocates.
const CONTACT_N = 8;
export const CONTACT = {
  rows: Array.from({ length: CONTACT_N }, () => ({ kmh: -1, kind: 'asphalt', rough: 0, air: false, bump: 0 })),
  w: 0,
  put(kmh, kind, rough, air, bump) {
    this.w = (this.w + 1) % CONTACT_N;
    const r = this.rows[this.w];
    r.kmh = kmh; r.kind = kind; r.rough = rough; r.air = air; r.bump = bump;
    return r;
  },
  find(kmh) {
    for (let i = 0; i < CONTACT_N; i++) {
      const r = this.rows[(this.w - i + CONTACT_N) % CONTACT_N];
      if (r.kmh === kmh) return r;
    }
    return null;
  },
};

/**
 * What each surface does to a rolling tyre. `tyreF`/`tyreQ` are the band the
 * roar sits in, `roar` how loud it is, `grit` how much broadband crunch rides
 * on top (gravel is nearly all grit; wet-smooth asphalt is nearly none),
 * `bump` how often the springs find something, `thumpF` how deep those thumps
 * are, and `scrub` what a sliding tyre sounds like on it. Keys are the same
 * ones game/terrain.js SURF uses.
 */
export const SURFACE = {
  asphalt:  { tyreF: 900,  tyreQ: 0.55, roar: 1.00, grit: 0.16, bump: 0.06, thumpF: 90,  scrub: 1.00 },
  concrete: { tyreF: 1150, tyreQ: 0.50, roar: 1.06, grit: 0.26, bump: 0.14, thumpF: 100, scrub: 1.05 },
  path:     { tyreF: 1300, tyreQ: 0.42, roar: 0.92, grit: 0.62, bump: 0.55, thumpF: 105, scrub: 0.80 },
  gravel:   { tyreF: 1750, tyreQ: 0.32, roar: 1.18, grit: 1.00, bump: 1.00, thumpF: 118, scrub: 0.70 },
  dirt:     { tyreF: 720,  tyreQ: 0.50, roar: 0.98, grit: 0.66, bump: 0.72, thumpF: 84,  scrub: 0.62 },
  grass:    { tyreF: 430,  tyreQ: 0.70, roar: 0.80, grit: 0.34, bump: 0.34, thumpF: 74,  scrub: 0.48 },
  sand:     { tyreF: 2300, tyreQ: 0.30, roar: 0.86, grit: 0.94, bump: 0.42, thumpF: 70,  scrub: 0.55 },
  stair:    { tyreF: 1100, tyreQ: 0.45, roar: 1.05, grit: 0.70, bump: 1.60, thumpF: 130, scrub: 0.75 },
};

/**
 * Tyres, grit, the axle and the springs. Built once on any AudioContext-like
 * object, exactly like the engine voice, so core/audition.js can render it
 * offline and hear the same thing the game plays.
 */
export function buildRoadVoice(ctx, dest, sharedNoise) {
  const n = {};
  n.out = ctx.createGain(); n.out.gain.value = 1; n.out.connect(dest);

  n.noise = ctx.createBufferSource();
  n.noise.buffer = sharedNoise || makeNoise(ctx, 2);
  n.noise.loop = true;

  // The roll: a band that moves up and gets louder with road speed.
  n.tyre = ctx.createBiquadFilter();
  n.tyre.type = 'bandpass'; n.tyre.frequency.value = 900; n.tyre.Q.value = 0.55;
  n.tyreG = ctx.createGain(); n.tyreG.gain.value = 0;
  n.noise.connect(n.tyre); n.tyre.connect(n.tyreG); n.tyreG.connect(n.out);

  // The crunch: everything above the roar. This is nearly all of what gravel
  // is, and nearly none of what tarmac is.
  n.grit = ctx.createBiquadFilter();
  n.grit.type = 'highpass'; n.grit.frequency.value = 2200; n.grit.Q.value = 0.4;
  n.gritG = ctx.createGain(); n.gritG.gain.value = 0;
  n.noise.connect(n.grit); n.grit.connect(n.gritG); n.gritG.connect(n.out);

  // Final-drive whine. A hypoid axle hums at a multiple of road speed and at
  // nothing else, which is why it stays there through a gearchange while the
  // engine note falls away — one of the small things that says "drivetrain".
  n.whine = ctx.createOscillator();
  n.whine.type = 'sawtooth'; n.whine.frequency.value = 40;
  n.whineF = ctx.createBiquadFilter();
  n.whineF.type = 'bandpass'; n.whineF.frequency.value = 400; n.whineF.Q.value = 3.5;
  n.whineG = ctx.createGain(); n.whineG.gain.value = 0;
  n.whine.connect(n.whineF); n.whineF.connect(n.whineG); n.whineG.connect(n.out);

  // The springs. One shared voice fired as an envelope, so a washboard road
  // costs nothing per bump.
  n.thumpF = ctx.createBiquadFilter();
  n.thumpF.type = 'lowpass'; n.thumpF.frequency.value = 120; n.thumpF.Q.value = 3.0;
  n.thumpG = ctx.createGain(); n.thumpG.gain.value = 0;
  n.noise.connect(n.thumpF); n.thumpF.connect(n.thumpG); n.thumpG.connect(n.out);

  n.noise.start(); n.whine.start();
  return n;
}

/**
 * Drives buildRoadVoice from road speed plus whatever CONTACT knows about the
 * surface. Holds the bump timer between frames; everything else is a parameter
 * write.
 */
export class RoadDriver {
  constructor(ctx, dest, sharedNoise) {
    this.n = buildRoadVoice(ctx, dest, sharedNoise);
    this.surf = SURFACE.asphalt;
    this.p = DEFAULT_ENGINE;
    this._bumpT = 0.1;
    this._lastBump = 0;
  }
  setProfile(p) { this.p = p || DEFAULT_ENGINE; }

  step(dt, kmh, load, contact, gate, at) {
    const n = this.n, p = this.p;
    const su = (contact && SURFACE[contact.kind]) || SURFACE.asphalt;
    this.surf = su;
    const air = !!(contact && contact.air);
    // Tyres do nothing in the air, and below walking pace there is nothing to
    // hear either. Speed^1.3 rather than ^2: road noise runs out of headroom
    // long before the car does.
    const v = clamp01(kmh / 130);
    const roll = air ? 0 : Math.pow(v, 1.3);
    const g = gate > 0 ? 1 : 0;

    n.tyre.frequency.setTargetAtTime(su.tyreF * (0.65 + v * 0.55), at, 0.10);
    n.tyre.Q.setTargetAtTime(su.tyreQ, at, 0.15);
    n.tyreG.gain.setTargetAtTime(g * roll * su.roar * 0.135, at, 0.08);

    n.grit.frequency.setTargetAtTime(1500 + su.tyreF * 0.8, at, 0.15);
    n.gritG.gain.setTargetAtTime(g * roll * su.grit * 0.085, at, 0.08);

    // Whine: Hz per km/h straight off the profile, and it needs some load on it
    // before the teeth are pressed hard enough to sing.
    n.whine.frequency.setTargetAtTime(Math.max(20, kmh * (p.whineK || 3)), at, 0.05);
    n.whineF.frequency.setTargetAtTime(Math.max(60, kmh * (p.whineK || 3) * 2), at, 0.08);
    n.whineG.gain.setTargetAtTime(g * (air ? 0 : 1) * (p.whineG || 0) * roll * (0.35 + clamp01(load) * 0.65), at, 0.10);

    // Suspension. Two sources: the surface's own texture, which arrives as a
    // stochastic patter whose rate goes up with speed, and a genuine spring
    // spike (a kerb, a driveway lip, a dock edge) big enough to feel but too
    // small for main.js to have called land() over.
    const rough = su.bump * (contact ? 0.4 + contact.rough * 2.0 : 1);
    if (g && !air && kmh > 6 && rough > 0.05) {
      this._bumpT -= dt * (0.6 + v * 3.4) * rough;
      if (this._bumpT <= 0) {
        this._bumpT = 0.10 + Math.random() * 0.22;
        this._fire(at, su, (0.35 + Math.random() * 0.65) * rough * (0.3 + v * 0.7));
      }
    }
    const spring = contact ? Math.abs(contact.bump) : 0;
    if (g && !air && spring > 0.55 && spring > this._lastBump * 1.4) {
      this._fire(at, su, Math.min(1, (spring - 0.55) * 0.9));
    }
    this._lastBump = spring;
  }

  _fire(at, su, amp) {
    const n = this.n;
    n.thumpF.frequency.setValueAtTime(su.thumpF * (0.85 + Math.random() * 0.3), at);
    n.thumpG.gain.cancelScheduledValues(at);
    n.thumpG.gain.setValueAtTime(Math.min(0.28, amp * 0.22), at);
    n.thumpG.gain.setTargetAtTime(0, at + 0.006, 0.030);
  }

  dispose() {
    try { this.n.noise.stop(); this.n.whine.stop(); } catch (e) { /* already stopped */ }
    try { this.n.out.disconnect(); } catch (e) { /* gone */ }
  }
}

// ---------------------------------------------------------------- impacts
//
// Exported and context-parameterised for the same reason the engine voice is:
// core/audition.js schedules them on an OfflineAudioContext so the crashes in
// docs/audio/ranger-road.wav are the crashes the game plays.

/**
 * Something heavy hitting something solid. `force` is 0..1.
 *
 * Three layers, because one oscillator is a beep and a car is not: the SKIN
 * (a short bright burst of bent panel and plastic), the BODY (a low, slow
 * sine that is the tonne and a half arriving), and the RATTLE (what falls off
 * afterwards). Weight is the mix: a light tap is nearly all skin and gone in
 * 120 ms, a big one is mostly body and rings for most of a second.
 */
export function fireCrash(ctx, dest, t, force, noiseBuf, gain = 1) {
  const f = Math.min(1, Math.max(0, force)), k = gain;
  const heavy = f * f;                       // the low end arrives late and fast

  // Skin: panel and bumper. Bandpassed noise, high and short.
  if (noiseBuf) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1500 - 700 * f, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(140, 480 - 260 * f), t + 0.10);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((0.05 + 0.22 * f) * k, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10 + 0.16 * f);
    n.connect(bp); bp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + 0.34 + 0.3 * f);
  }
  // Body: the mass. Lower and longer the harder it was.
  const o = ctx.createOscillator(), og = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(165 - 75 * f, t);
  o.frequency.exponentialRampToValueAtTime(38 - 12 * f, t + 0.20 + 0.25 * f);
  lp.type = 'lowpass'; lp.frequency.value = 520;
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime((0.03 + 0.26 * heavy + 0.06 * f) * k, t + 0.014);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24 + 0.55 * f);
  o.connect(lp); lp.connect(og); og.connect(dest);
  o.start(t); o.stop(t + 0.85 + 0.3 * f);
  // Rattle: trim, glass, the exhaust hanger. Only on a real one.
  if (noiseBuf && f > 0.25) {
    const n2 = ctx.createBufferSource();
    n2.buffer = noiseBuf; n2.loop = true;
    n2.playbackRate.value = 1.4 + Math.random() * 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = 2600 + Math.random() * 900; hp.Q.value = 1.2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t + 0.03);
    g2.gain.exponentialRampToValueAtTime((0.012 + 0.030 * f) * k, t + 0.06);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.30 + 0.45 * f);
    n2.connect(hp); hp.connect(g2); g2.connect(dest);
    n2.start(t + 0.03); n2.stop(t + 0.9);
  }
}

/**
 * S3-CRASH: the crunch's tail. A detuned low saw bending down (the body
 * settling), eight glass ticks spread over 0.7 s, falling in level, and one
 * late clank off whatever part hit the road last. `t` is when it starts.
 */
export function fireCrashTail(ctx, dest, t, force, noiseBuf, gain = 1) {
  const f = Math.min(1, Math.max(0, force)), k = gain;
  const o = ctx.createOscillator(), o2 = ctx.createOscillator();
  const lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'sawtooth';
  o.frequency.setValueAtTime(92, t); o.frequency.exponentialRampToValueAtTime(41, t + 0.9);
  o2.frequency.setValueAtTime(97, t); o2.frequency.exponentialRampToValueAtTime(44, t + 0.9);
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime((0.012 + 0.03 * f) * k, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest);
  o.start(t); o2.start(t); o.stop(t + 1.05); o2.stop(t + 1.05);
  if (!noiseBuf) return;
  for (let i = 0; i < 9; i++) {
    const at = t + 0.06 + i * 0.075 + Math.random() * 0.05;
    const late = i === 8;                      // the clank
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.playbackRate.value = late ? 0.7 : 1.6 + Math.random() * 0.8;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = late ? 900 : 3800 + Math.random() * 2600; bp.Q.value = late ? 3 : 4;
    const gg = ctx.createGain();
    const lvl = (late ? 0.05 : 0.026 * (1 - i / 10)) * (0.5 + 0.5 * f) * k;
    gg.gain.setValueAtTime(0.0001, at);
    gg.gain.exponentialRampToValueAtTime(Math.max(0.0002, lvl), at + 0.004);
    gg.gain.exponentialRampToValueAtTime(0.0001, at + (late ? 0.16 : 0.05));
    n.connect(bp); bp.connect(gg); gg.connect(dest);
    n.start(at); n.stop(at + 0.2);
  }
}

/**
 * A landing. `force` is the vertical speed the springs killed, in m/s — about 2
 * for a kerb hop and 9 for coming off the rail berm at 70. The bump stop is a
 * second, harder knock a few milliseconds after the spring: it is what tells
 * you the suspension ran out, and it only happens on the big ones.
 */
export function fireLand(ctx, dest, t, force, noiseBuf, su = SURFACE.asphalt, k = 1) {
  const f = Math.min(1, Math.max(0, force / 10));
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(120 - 40 * f, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
  lp.type = 'lowpass'; lp.frequency.value = 700;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime((0.30 + 0.30 * f) * k, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20 + 0.12 * f);
  o.connect(lp); lp.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.36);
  // Bump stop: rubber on steel, 25 ms behind the spring.
  if (f > 0.35) {
    const b = ctx.createOscillator(), bg = ctx.createGain(), bf = ctx.createBiquadFilter();
    const at2 = t + 0.025;
    b.type = 'square';
    b.frequency.setValueAtTime(96, at2);
    b.frequency.exponentialRampToValueAtTime(44, at2 + 0.07);
    bf.type = 'lowpass'; bf.frequency.value = 300;
    bg.gain.setValueAtTime(0.0001, at2);
    bg.gain.exponentialRampToValueAtTime((0.12 + 0.20 * f) * k, at2 + 0.006);
    bg.gain.exponentialRampToValueAtTime(0.0001, at2 + 0.13);
    b.connect(bf); bf.connect(bg); bg.connect(dest);
    b.start(at2); b.stop(at2 + 0.2);
  }
  // Grit: the tyres scrubbing on touchdown, in whatever they touched down on.
  if (noiseBuf) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = su.tyreF * 0.8 + 700 * f; bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime((0.006 + 0.05 * f) * (0.6 + su.grit * 0.8) * k, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(t + 0.32);
  }
}

// What each material sounds like when a Ranger finds it.
const THUD = {
  bin:   { type: 'lowpass',  freq: 520,  q: 1.0, body: 96,  dur: 0.24, vol: 0.60 },
  metal: { type: 'bandpass', freq: 1750, q: 2.4, body: 210, dur: 0.20, vol: 0.50 },
  wood:  { type: 'bandpass', freq: 780,  q: 1.6, body: 150, dur: 0.14, vol: 0.48 },
  glass: { type: 'highpass', freq: 2600, q: 1.0, body: 640, dur: 0.26, vol: 0.40 },
};
