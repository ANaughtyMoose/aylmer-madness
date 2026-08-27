// The radio, and there are no audio files in this repo.
//
// Two stations:
//
//   0  CKOI 102.1 — everything is synthesised. Four styles (Québec synth-pop,
//      hair metal, boom bap, a folk two-step), each rendered ONCE as an eight-bar
//      loop into an AudioBuffer on an OfflineAudioContext and then looped by a
//      single BufferSource. That keeps the running graph at four nodes no matter
//      how long the song is, and nothing is scheduled per frame. The "DJ" is a
//      three-note station sting plus a line of text on the HUD — there is no
//      speech synthesis anywhere near this.
//
//   1  Cassette — whatever the player dropped in assets/radio/ and listed in
//      assets/radio/playlist.json. Played through <audio> elements routed into
//      the same Web Audio graph, so the ducking and the volume work the same.
//
// The deck lives on the Audio object's master, ducks under the engine and the
// horn, and keeps playing across car swaps because nothing recreates it.
import { loadRadio, saveRadio } from './store.js';

// ---------------------------------------------------------------- the music

// Seeded, so "CKOI at 14h07" is the same song every time you drive past.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMI = (n) => 440 * Math.pow(2, n / 12);
// Scale degrees as semitones from A, for the four styles' key centres.
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const STYLES = [
  { id: 'pop',   bpm: 118, name: 'synthé-pop' },
  { id: 'metal', bpm: 148, name: 'métal' },
  { id: 'boom',  bpm: 92,  name: 'boom bap' },
  { id: 'folk',  bpm: 126, name: 'trad' },
];

// The playlist CKOI works through. Titles are the joke; the seed is the song.
export const CKOI_TRACKS = [
  { style: 'pop',   seed: 1999, title: 'Toute la nuit',            artist: 'Les Mardis Soir', seconds: 108 },
  { style: 'metal', seed: 8801, title: 'Chrome et Asphalte',       artist: 'Bourrasque',      seconds: 96 },
  { style: 'boom',  seed: 4242, title: 'Deux Piastres',            artist: 'DJ Vanier',       seconds: 114 },
  { style: 'folk',  seed: 1717, title: 'La Reel du Chemin d’Aylmer', artist: 'La Sacoche',    seconds: 92 },
  { style: 'pop',   seed: 2703, title: 'Été 2004',                  artist: 'Marie-Pier',      seconds: 120 },
  { style: 'metal', seed: 6161, title: 'Le Dernier Party',         artist: 'Bourrasque',      seconds: 100 },
];

export const STATION_NAMES = ['CKOI 102.1', 'Cassette'];
export const CKOI_SLOGAN = 'Toute la musique que j’aime';

// ---- little offline instruments ------------------------------------------
// Every one of these schedules its notes into an OfflineAudioContext and then
// goes away; nothing here ever runs while you are driving.

function env(ctx, node, t, a, d, peak) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.linearRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(ctx, dest, type, freq, t, dur, vol, cut, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.value = cut || 4000; f.Q.value = 0.7;
  env(ctx, g, t, Math.min(0.02, dur * 0.2), dur, vol);
  o.connect(f); f.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBuf(ctx, sec, rnd) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return b;
}

function hit(ctx, dest, buf, t, dur, vol, type, freq, q) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = buf;
  f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  env(ctx, g, t, 0.002, dur, vol);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t); s.stop(t + dur + 0.05);
}

function kick(ctx, dest, t, vol = 0.9) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.32);
}

/**
 * Render one eight-bar loop of `style` into an AudioBuffer. Deterministic for a
 * given seed. This is the only expensive thing the radio does, it happens once
 * per track, and it happens off the main graph.
 */
export async function renderLoop(style, seed, sampleRate = 22050) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) throw new Error('no OfflineAudioContext');
  const st = STYLES.find((s) => s.id === style) || STYLES[0];
  const beat = 60 / st.bpm, bar = beat * 4, bars = 8;
  const seconds = bar * bars;
  const ctx = new OAC(1, Math.ceil(seconds * sampleRate), sampleRate);
  const rnd = mulberry32(seed);

  const out = ctx.createGain(); out.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 4; comp.knee.value = 18;
  out.connect(comp); comp.connect(ctx.destination);

  const nz = noiseBuf(ctx, 1.0, rnd);
  const root = -3 + Math.floor(rnd() * 5);              // key, semitones from A
  const scale = style === 'folk' || style === 'pop' ? MAJOR : MINOR;
  const prog = [0, 5, 3, 4].map((d) => scale[d % 7] + root);

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = prog[b % prog.length];
    const bassF = SEMI(chord - 24);
    const fill = b % 4 === 3;

    if (style === 'pop') {
      // Straight four, a fat synth bass on eighths, and a chord stab on 2 and 4.
      for (let k = 0; k < 4; k++) kick(ctx, out, t0 + k * beat, 0.85);
      for (let k = 0; k < 8; k++) {
        hit(ctx, out, nz, t0 + k * beat / 2, 0.045, 0.12, 'highpass', 7000, 0.7);
      }
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.16, 0.42, 'bandpass', 1900, 1.1);
      for (let k = 0; k < 8; k++) {
        tone(ctx, out, 'sawtooth', bassF * (k % 4 === 3 ? 1.5 : 1), t0 + k * beat / 2, beat * 0.42, 0.34, 620);
      }
      for (const k of [1, 3]) {
        for (const iv of [0, 3, 7]) {
          tone(ctx, out, 'square', SEMI(chord + iv), t0 + k * beat, beat * 0.55, 0.10, 2600, rnd() * 8 - 4);
        }
      }
      // A little four-note hook over the top, same every bar of the phrase.
      const hook = [0, 7, 5, 7];
      for (let k = 0; k < 4; k++) {
        tone(ctx, out, 'triangle', SEMI(chord + 12 + hook[k]), t0 + k * beat + beat * 0.5, beat * 0.35, 0.14, 5000);
      }
    } else if (style === 'metal') {
      // Palm-muted eighths on the root, crash on the one, double-time snare.
      for (let k = 0; k < 8; k++) {
        const f = SEMI(chord - 12) * (k === 6 && fill ? 1.122 : 1);
        tone(ctx, out, 'sawtooth', f, t0 + k * beat / 2, beat * 0.30, 0.30, 2400, -6);
        tone(ctx, out, 'sawtooth', f * 1.4983, t0 + k * beat / 2, beat * 0.30, 0.16, 2600, 6);   // fifth
        kick(ctx, out, t0 + k * beat / 2, k % 2 === 0 ? 0.8 : 0.35);
      }
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.20, 0.55, 'bandpass', 2400, 0.9);
      hit(ctx, out, nz, t0, 0.55, 0.24, 'highpass', 5200, 0.7);
      // A wailing lead every other bar.
      if (b % 2 === 1) {
        const notes = [12, 15, 19, 22];
        for (let k = 0; k < 4; k++) {
          tone(ctx, out, 'square', SEMI(chord + notes[(k + b) % 4]), t0 + k * beat, beat * 0.8, 0.13, 5200);
        }
      }
    } else if (style === 'boom') {
      // Kick on 1 and the and-of-2, snare on 2 and 4, swung hats, walking bass.
      kick(ctx, out, t0, 0.95);
      kick(ctx, out, t0 + beat * 1.5, 0.7);
      kick(ctx, out, t0 + beat * 2.75, 0.55);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.22, 0.62, 'bandpass', 1500, 0.8);
      for (let k = 0; k < 8; k++) {
        const swing = k % 2 ? 0.06 * beat : 0;
        hit(ctx, out, nz, t0 + k * beat / 2 + swing, 0.05, 0.10, 'highpass', 6500, 0.7);
      }
      const walk = [0, 0, 7, 5];
      for (let k = 0; k < 4; k++) {
        tone(ctx, out, 'triangle', SEMI(chord - 24 + walk[k]), t0 + k * beat, beat * 0.75, 0.42, 420);
      }
      // A dusty two-chord loop up top, filtered like a sampled record.
      for (const k of [0, 2]) {
        for (const iv of [0, 3, 7, 10]) {
          tone(ctx, out, 'sawtooth', SEMI(chord + iv), t0 + k * beat, beat * 0.9, 0.075, 1500, rnd() * 10 - 5);
        }
      }
    } else {
      // Folk: a two-step, a bellows drone, and a reel of eighth notes.
      for (let k = 0; k < 4; k++) kick(ctx, out, t0 + k * beat, k % 2 === 0 ? 0.7 : 0.4);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.10, 0.28, 'bandpass', 2600, 1.4);
      tone(ctx, out, 'sawtooth', SEMI(root - 24), t0, bar * 0.95, 0.26, 380);
      // The "accordion": two square waves a beat apart in tuning, slow attack.
      for (const iv of [0, 4, 7]) {
        for (const det of [-9, 9]) {
          tone(ctx, out, 'square', SEMI(chord + iv), t0, bar * 0.9, 0.055, 2100, det);
        }
      }
      const reel = [0, 2, 4, 7, 9, 7, 4, 2];
      for (let k = 0; k < 8; k++) {
        const d = scale[(reel[k] + b) % 7] + root + 12;
        tone(ctx, out, 'triangle', SEMI(d), t0 + k * beat / 2, beat * 0.40, 0.17, 5200);
      }
    }
  }

  const buf = await ctx.startRendering();
  return buf;
}

// ---------------------------------------------------------------- the deck

export class Radio {
  /** @param audio the core/audio.js Audio instance (started or not). */
  constructor(audio) {
    this.audio = audio;
    const saved = loadRadio();
    this.station = saved.station;             // 0 CKOI, 1 cassette
    this.volume = saved.volume;
    this.wantOn = saved.on;                   // the deck only runs while driving
    this.on = false;
    this.trackIdx = 0;
    this.trackT = 0;
    this.built = false;
    this.loops = new Map();                   // 'style:seed' -> AudioBuffer
    this.src = null;
    this.tape = null;                         // { list, idx, el, node }
    this.tapeReady = false;
    this.duck = 1;
    this.line = '';
    this.onChange = null;                     // main.js repaints the HUD line
    this.rendering = false;
  }

  // ---- graph ----------------------------------------------------------
  _build() {
    const a = this.audio;
    if (this.built || !a || !a.ok) return false;
    const ctx = a.ctx;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.duckG = ctx.createGain();
    this.duckG.gain.value = 1;
    this.tone = ctx.createBiquadFilter();     // a car speaker is not a monitor
    this.tone.type = 'bandpass';
    this.tone.frequency.value = 900;
    this.tone.Q.value = 0.35;
    this.out.connect(this.duckG);
    this.duckG.connect(this.tone);
    this.tone.connect(a.radioBus || a.master);
    this.built = true;
    return true;
  }

  // ---- public API -----------------------------------------------------

  /** Off -> CKOI -> cassette (if there is one) -> off. */
  toggle() {
    if (!this.wantOn) { this.wantOn = true; this.station = 0; }
    else if (this.station === 0 && this.tapeReady) this.station = 1;
    else this.wantOn = false;
    this._restart();
    this._persist();
    return this.state();
  }

  /** Explicit power, for the missions ("elle amène le radio pis les cassettes"). */
  power(on) {
    if (!!on === this.wantOn) return this.state();
    this.wantOn = !!on;
    this._restart();
    this._persist();
    return this.state();
  }

  next() {
    if (this.station === 1 && this.tape) this.tape.idx = (this.tape.idx + 1) % Math.max(1, this.tape.list.length);
    else this.trackIdx = (this.trackIdx + 1) % CKOI_TRACKS.length;
    this.trackT = 0;
    this._restart();
    return this.state();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    this._persist();
    return this.volume;
  }

  state() {
    const t = this.station === 1 ? this._tapeTrack() : CKOI_TRACKS[this.trackIdx];
    return {
      on: this.on, wantOn: this.wantOn, station: this.station,
      stationName: STATION_NAMES[this.station] || '',
      slogan: this.station === 0 ? CKOI_SLOGAN : '',
      track: t ? (t.artist ? `${t.artist} — ${t.title}` : t.title) : '',
      volume: this.volume, tape: this.tapeReady,
    };
  }

  /** Called by main.js when the game leaves drive mode. */
  suspend() { this._stopSource(); this.on = false; this._emit(); }

  /** ...and when it comes back. Picks up where the deck left off. */
  resume() { if (this.wantOn) this._restart(); else this._emit(); }

  /** Look for assets/radio/playlist.json. Safe to call once at boot. */
  async loadTape(base = 'assets/radio/') {
    try {
      const res = await fetch(base + 'playlist.json', { cache: 'no-cache' });
      if (!res.ok) return false;
      const j = await res.json();
      const list = (Array.isArray(j) ? j : j.tracks || [])
        .map((t) => (typeof t === 'string' ? { file: t, title: t.replace(/\.[^.]+$/, '') } : t))
        .filter((t) => t && typeof t.file === 'string');
      if (!list.length) return false;
      this.tape = { list, idx: 0, base, el: null, node: null };
      this.tapeReady = true;
      this._emit();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- per-frame ------------------------------------------------------

  /**
   * `load` is engine load 0..1, `horn` whether you are leaning on it. One gain
   * write per frame; nothing is created here.
   */
  update(dt, load = 0, horn = false) {
    if (!this.built) return;
    const t = this.ctx.currentTime;
    const want = horn ? 0.28 : 1 - Math.min(0.42, load * 0.42);
    this.duck += (want - this.duck) * Math.min(1, dt * 6);
    this.duckG.gain.setTargetAtTime(this.duck, t, 0.08);
    const g = this.on && this.audio.enabled ? this.volume * 0.30 : 0;
    this.out.gain.setTargetAtTime(g, t, 0.15);

    if (!this.on) return;
    this.trackT += dt;
    const len = this.station === 1 ? Infinity : (CKOI_TRACKS[this.trackIdx].seconds || 100);
    if (this.trackT >= len) { this.trackT = 0; this._sting(); this.next(); }
  }

  // ---- internals ------------------------------------------------------

  _persist() { saveRadio({ on: this.wantOn, station: this.station, volume: this.volume }); }

  _emit() { if (this.onChange) this.onChange(this.state()); }

  _tapeTrack() {
    if (!this.tape || !this.tape.list.length) return null;
    return this.tape.list[this.tape.idx % this.tape.list.length];
  }

  _stopSource() {
    if (this.src) {
      try { this.src.stop(); } catch (e) { /* already done */ }
      try { this.src.disconnect(); } catch (e) { /* gone */ }
      this.src = null;
    }
    if (this.tape && this.tape.el) { try { this.tape.el.pause(); } catch (e) { /* fine */ } }
  }

  _restart() {
    if (!this._build()) { this.on = false; this._emit(); return; }
    this._stopSource();
    if (!this.wantOn) { this.on = false; this._emit(); return; }
    if (this.station === 1) this._playTape();
    else this._playCkoi();
    this._emit();
  }

  _playCkoi() {
    const t = CKOI_TRACKS[this.trackIdx];
    const key = `${t.style}:${t.seed}`;
    const buf = this.loops.get(key);
    if (!buf) {
      if (this.rendering) return;
      this.rendering = true;
      renderLoop(t.style, t.seed, Math.min(22050, this.ctx.sampleRate)).then((b) => {
        this.rendering = false;
        // Two loops in the cache is plenty; anything older is cheap to rebuild.
        if (this.loops.size > 2) this.loops.delete(this.loops.keys().next().value);
        this.loops.set(key, b);
        if (this.wantOn && this.station === 0 && CKOI_TRACKS[this.trackIdx] === t) this._playCkoi();
      }).catch((e) => { this.rendering = false; console.warn('radio: loop render failed', e); });
      this.on = true;
      this._sting();
      return;
    }
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(this.out);
    s.start(0, this.trackT % buf.duration);
    this.src = s;
    this.on = true;
  }

  _playTape() {
    const t = this._tapeTrack();
    if (!t) { this.station = 0; this._playCkoi(); return; }
    if (!this.tape.el) {
      const el = new globalThis.Audio();
      el.crossOrigin = 'anonymous';
      el.loop = false;
      el.addEventListener('ended', () => { if (this.wantOn && this.station === 1) this.next(); });
      this.tape.el = el;
      this.tape.node = this.ctx.createMediaElementSource(el);
      this.tape.node.connect(this.out);
    }
    const url = this.tape.base + t.file;
    if (!this.tape.el.src.endsWith(encodeURI(t.file))) this.tape.el.src = url;
    const p = this.tape.el.play();
    if (p && p.catch) p.catch(() => { /* autoplay policy; the next E will do it */ });
    this.on = true;
  }

  // The station sting: three notes and a swoosh. This is the "DJ" — the words
  // go on the HUD line, because a game about 2004 Aylmer does not get to depend
  // on the browser's speech synthesiser.
  _sting() {
    const a = this.audio;
    if (!a || !a.ok || !a.enabled) return;
    const base = this.station === 0 ? [784, 988, 1319] : [523, 659];
    base.forEach((f, i) => setTimeout(() => a.blip(f, 0.18, 'triangle', 0.10), i * 110));
  }
}
