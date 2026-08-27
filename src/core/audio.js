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
//   noise ─┬─ intake hiss ───────────┼─ bus ─ cabin peak ─┬─ dry ──┐
//          ├─ exhaust rasp ──────────┤                    └ shaper ┴─ out
//          └─ overrun pops ──────────┘
//
// Everything is built once. `engine()` only writes AudioParams — no node is
// created while you are driving.
export class Audio {
  constructor() {
    this.ok = false;
    this.enabled = true;
    this.ep = null;
    this.voice = null;
    // 0..1 each. The options screen owns the persistence; this owns the graph.
    this.vol = { master: 1, engine: 1, effects: 1, radio: 1 };
  }

  /**
   * Mixer trims, 0..1 each; pass only the ones you are changing.
   * `master` scales everything, `engine` the engine voice, `effects` the horn /
   * tyres / crashes / chimes, `radio` the deck in game/radio.js.
   */
  setVolume(v) {
    if (!v) return { ...this.vol };
    for (const k of ['master', 'engine', 'effects', 'radio']) {
      if (typeof v[k] === 'number' && isFinite(v[k])) this.vol[k] = Math.max(0, Math.min(1, v[k]));
    }
    if (this.ok) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(0.5 * this.vol.master, t, 0.05);
      this.engBus.gain.setTargetAtTime(this.vol.engine, t, 0.05);
      this.fx.gain.setTargetAtTime(this.vol.effects, t, 0.05);
      this.radioBus.gain.setTargetAtTime(this.vol.radio, t, 0.05);
    }
    return { ...this.vol };
  }
  start() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

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
    this.engBus = ctx.createGain(); this.engBus.gain.value = this.vol.engine;
    this.fx = ctx.createGain(); this.fx.gain.value = this.vol.effects;
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = this.vol.radio;
    for (const b of [this.engBus, this.fx, this.radioBus]) b.connect(this.master);

    // One noise buffer, shared by the engine voice, the tyres and the rattle.
    this.noiseBuf = makeNoise(ctx, 2);
    this.noise = ctx.createBufferSource();
    this.noise.buffer = this.noiseBuf; this.noise.loop = true;

    // Tyre noise: white noise through a bandpass.
    this.nf = ctx.createBiquadFilter();
    this.nf.type = 'bandpass'; this.nf.frequency.value = 1400; this.nf.Q.value = 1.6;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.fx);

    this.noise.start();
    this.ok = true;
    this.setEngineProfile(this.ep);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // Swap the engine's character when you swap cars. See cars.js SOUND for the
  // shape of `p`; passing nothing goes back to the generic four-cylinder.
  setEngineProfile(p) {
    this.ep = p || null;
    if (!this.ok) return;
    if (this.driver) this.driver.dispose();
    this.driver = new EngineDriver(this.ctx, this.engBus, this.ep || DEFAULT_ENGINE, this.noiseBuf);
    this.voice = this.driver.voice;
  }

  // Real engine rpm, engine load 0..1, road speed, pedal 0..1, clutch 0..1.
  // `rpm <= 1` means "engine off" — that is how the pause screen and the map
  // silence it (`audio.engine(0, 0)`).
  engine(rpm, load, kmh = 0, throttle = -1, clutch = 1) {
    if (!this.ok || !this.driver) return;
    this.driver.step(1 / 60, rpm, load, kmh, throttle, clutch,
      this.enabled ? 1 : 0, this.ctx.currentTime);
  }
  skid(amount) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.ng.gain.setTargetAtTime((this.enabled ? 1 : 0) * amount * 0.14, t, 0.05);
    this.nf.frequency.setTargetAtTime(900 + amount * 1500, t, 0.08);
  }
  blip(freq = 660, dur = 0.12, type = 'square', vol = 0.18) {
    if (!this.ok || !this.enabled) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.fx);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }
  chime(up = true) {
    const n = up ? [523, 659, 784] : [440, 330];
    n.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.16), i * 90));
  }
  horn(on) {
    if (!this.ok || !this.enabled) return;
    if (on && !this._horn) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 400;
      o2.type = 'sawtooth'; o2.frequency.value = 502;
      g.gain.value = 0.09;
      o.connect(g); o2.connect(g); g.connect(this.fx);
      o.start(); o2.start();
      this._horn = { o, o2, g };
    } else if (!on && this._horn) {
      const h = this._horn; this._horn = null;
      h.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => { h.o.stop(); h.o2.stop(); }, 120);
    }
  }
  crash(force) {
    if (!this.ok || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.setValueAtTime(150 + Math.random() * 80, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    f.type = 'lowpass'; f.frequency.value = 1100;
    g.gain.setValueAtTime(Math.min(0.35, 0.07 + force * 0.2), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(f); f.connect(g); g.connect(this.fx);
    o.start(); o.stop(t + 0.4);
  }
  // R3: somebody else's horn. Same two-saw shape as yours, pitched wherever the
  // caller likes, and it lets go on its own.
  honk(freq = 330, dur = 0.55, vol = 0.07) {
    if (!this.ok || !this.enabled) return;
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
  // The race agent: a two-tone siren. Two square oscillators an interval apart,
  // gated in alternation at 1.6 Hz through the same kind of lowpass the engine
  // uses, so it is a wail from a block away rather than a dentist's drill.
  siren(on) {
    if (!this.ok) return;
    if (on && !this._siren) {
      const t = this.ctx.currentTime;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1500;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.setValueAtTime(660, t);
      // The alternation: a slow square LFO on the pitch, hi-lo-hi-lo.
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square'; lfo.frequency.value = 1.6;
      const lg = this.ctx.createGain(); lg.gain.value = 150;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      g.gain.setTargetAtTime(this.enabled ? 0.035 : 0, t, 0.25);
      this._siren = { o, lfo, g, f };
    } else if (!on && this._siren) {
      const s = this._siren; this._siren = null;
      s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch (e) { /* already gone */ } }, 700);
    } else if (on && this._siren) {
      this._siren.g.gain.setTargetAtTime(this.enabled ? 0.035 : 0, this.ctx.currentTime, 0.2);
    }
  }

  // A landing: the thump of the springs bottoming out, plus a scuff of tyre.
  // `force` is the vertical speed killed, in m/s — about 2 for a kerb hop and
  // 9 for coming off the rail berm at 70.
  land(force) {
    if (!this.ok || !this.enabled) return;
    const f = Math.min(1, Math.max(0, force / 10));
    const t = this.ctx.currentTime;
    // body: a short filtered thud that drops in pitch
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(120 - 40 * f, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    lp.type = 'lowpass'; lp.frequency.value = 420;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03 + 0.16 * f, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20 + 0.12 * f);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(); o.stop(t + 0.36);
    // grit: a puff of filtered noise for the tyres scrubbing on touchdown
    if (this.noiseBuf) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuf; n.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900 + 700 * f; bp.Q.value = 0.7;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.006 + 0.05 * f, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      n.connect(bp); bp.connect(ng); ng.connect(this.master);
      n.start(); n.stop(t + 0.32);
    }
  }

  // Wind over the roof while the wheels are off the ground. Call it every frame
  // with 0..1; it opens and closes one long-lived noise voice rather than
  // starting a new one, so holding a jump costs nothing.
  whoosh(amount) {
    if (!this.ok || !this.enabled || !this.noiseBuf) return;
    const a = Math.min(1, Math.max(0, amount));
    if (!this._air) {
      if (a <= 0) return;
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuf; n.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.5;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      n.connect(bp); bp.connect(g); g.connect(this.master);
      n.start();
      this._air = { n, g, bp };
    }
    const t = this.ctx.currentTime;
    this._air.g.gain.setTargetAtTime(Math.max(0.0001, a * 0.075), t, 0.05);
    this._air.bp.frequency.setTargetAtTime(520 + a * 900, t, 0.08);
  }

  // R4: the cough of an engine that has been through a hedge.
  misfire() {
    if (!this.ok || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.setValueAtTime(92 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
    f.type = 'lowpass'; f.frequency.value = 620;
    g.gain.setValueAtTime(0.09, t);
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
    if (!this.ok || !this.enabled) return;
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
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.035);
    g.gain.setValueAtTime(0.20, t + 0.16);
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
    g.connect(this.master);
    o.start(); o.stop(t + 0.42);
  }

  // A prop going over. `kind` is what it is made of: 'bin' (hollow plastic),
  // 'metal' (a mailbox, a cart), 'wood' (terrasse furniture), 'glass'.
  // One noise burst shaped by a filter plus a body resonance, ~0.2 s.
  thud(kind = 'bin', vol = 1) {
    if (!this.ok || !this.enabled) return;
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
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + P.dur + 0.02);
    // The body of the thing: one decaying sine at its own note.
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(P.body * (0.92 + Math.random() * 0.16), t);
    o.frequency.exponentialRampToValueAtTime(P.body * 0.72, t + P.dur);
    og.gain.setValueAtTime(P.vol * 0.8 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.0005, t + P.dur * 1.2);
    o.connect(og); og.connect(this.master);
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
    if (!this.ok || !this.enabled) return;
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
      g.gain.setValueAtTime(0.055 * vol, at);
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
  }

  step(dt, rpm, load, kmh, throttle, clutch, gate, at) {
    const v = this.voice, e = this.p;
    if (throttle < 0) throttle = load;

    // Lumpy idle: a slow random walk of ±`lumpy` on the crank speed, faded out
    // as soon as you are on the throttle.
    this._jitT -= dt;
    if (this._jitT <= 0) {
      this._jitT = 0.09 + Math.random() * 0.11;
      this._jit = Math.random() * 2 - 1;
    }
    const idleness = clamp01(1 - (rpm - e.idle) / (e.idle * 1.6)) * (1 - clamp01(throttle) * 0.8);
    v.set(rpm * (1 + this._jit * e.lumpy * idleness), load, throttle, clutch, gate, at);

    // Overrun pops: throttle shut, still spinning. A few a second, louder the
    // faster it is turning. The node is already there; this only fires an
    // envelope on it, so nothing is allocated per frame.
    if (gate > 0 && throttle < 0.06 && rpm > e.idle * 1.9 && clutch > 0.5) {
      this._popT -= dt;
      if (this._popT <= 0) {
        this._popT = 0.12 + Math.random() * 0.30;
        const amp = 0.22 * clamp01((rpm - e.idle * 1.9) / 2200) * (e.pop || 1);
        v.popG.gain.cancelScheduledValues(at);
        v.popG.gain.setValueAtTime(amp, at);
        v.popG.gain.setTargetAtTime(0, at + 0.005, 0.022);
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
  c.threshold.value = -14;
  c.knee.value = 22;
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

  n.bus = ctx.createGain(); n.bus.gain.value = 1; n.bus.connect(n.boom);

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

    n.osc.frequency.setTargetAtTime(r / 120, at, 0.02);
    n.tick.frequency.setTargetAtTime(r / 7.5, at, 0.02);

    // Exhaust: a broad band that follows the firing note up. Low Q so the
    // fundamental is never squashed — the note IS the pulse train.
    n.exh.frequency.setTargetAtTime(Math.min(700, 55 + firing * 1.9 + load * 90), at, T);
    // Intake: hollower, higher, and only really there when you are on it.
    n.int.frequency.setTargetAtTime(p.intF0 + frac * p.intSpan + load * 500, at, T);

    // Overrun: throttle shut with the engine spinning is quieter, boomier and
    // burbly rather than hard.
    const over = throttle < 0.08 && r > idle * 1.7 ? 1 : 0;
    // Idle is a long way down from wide open, but not 35 dB down: an engine you
    // cannot hear ticking over is not an engine.
    const drive = 0.62 + load * 0.52 + frac * 0.20;

    n.exhG.gain.setTargetAtTime(cut * clutch * p.exhG * drive * (1 - over * 0.35), at, T);
    n.intG.gain.setTargetAtTime(cut * clutch * p.intG * (0.10 + load * 0.95) * (0.35 + frac * 0.9), at, T);

    // Intake hiss rises with throttle; exhaust rasp opens up above `raspFrom`.
    n.hiss.frequency.setTargetAtTime(700 + frac * 2400 + throttle * 700, at, T);
    n.hissG.gain.setTargetAtTime(clutch * p.hissG * (0.05 + throttle * 0.95) * (0.25 + frac), at, T);
    const rasp = clamp01((r - p.raspFrom) / 1400);
    n.rasp.frequency.setTargetAtTime(300 + firing * 1.2, at, T);
    n.raspG.gain.setTargetAtTime(clutch * p.raspG * rasp * (0.2 + load * 0.8), at, T);

    // Cabin boom follows the second order of the firing note into the body's
    // resonance; the peak is fixed, the drive into it is not.
    n.boom.gain.setTargetAtTime(p.boomDb * (0.45 + load * 0.55) * (1 - over * 0.2), at, 0.08);

    // Valvetrain tick: loudest at idle, buried once there is any load on it.
    n.tickG.gain.setTargetAtTime(p.tickG * (1 - frac * 0.75) * (1 - load * 0.6) * clutch, at, T);

    // Rasp waveshaper: dry below half load, gently wet at full chat.
    const wet = clamp01((load - 0.35) / 0.65) * p.rasp * (0.4 + frac * 0.6);
    n.wet.gain.setTargetAtTime(wet, at, 0.1);
    n.dry.gain.setTargetAtTime(1 - wet * 0.45, at, 0.1);

    // Master level for the voice. Sits under the toasts and the horn.
    const vol = p.gain * (0.60 + load * 0.28 + frac * 0.20) * (0.35 + clutch * 0.65) * cut;
    n.out.gain.setTargetAtTime(gate * vol * 0.40, at, 0.05);
  }

  function dispose() {
    try { n.osc.stop(); n.tick.stop(); n.noise.stop(); } catch (e) { /* already stopped */ }
    try { n.out.disconnect(); n.ratG.disconnect(); } catch (e) { /* gone */ }
  }

  return { p, nodes: n, set, popG: n.popG, out: n.out, dispose };
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

};

// What each material sounds like when a Ranger finds it.
const THUD = {
  bin:   { type: 'lowpass',  freq: 520,  q: 1.0, body: 96,  dur: 0.24, vol: 0.20 },
  metal: { type: 'bandpass', freq: 1750, q: 2.4, body: 210, dur: 0.20, vol: 0.16 },
  wood:  { type: 'bandpass', freq: 780,  q: 1.6, body: 150, dur: 0.14, vol: 0.15 },
  glass: { type: 'highpass', freq: 2600, q: 1.0, body: 640, dur: 0.26, vol: 0.12 },
};
