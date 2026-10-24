// The opening's sound, synthesised: no samples, no licensed music (the public
// build cannot carry a 2004 song; MAIN-STORY-PROPOSAL.md "The music").
//
// Everything is SCHEDULED on the audio clock when a beat starts, because the
// first forty seconds play while buildSectors() holds the main thread for ten
// to twenty seconds: timers and rAF stop, the audio thread does not. A skip
// fades the bus that beat was scheduled on and starts the next one.
//
// It plays through the game's own master (core/audio.js), so the options
// screen's master volume and the mute both apply. Music follows the radio
// slider, the effects (phone, shutter, starter) the effects slider.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI number -> Hz
// D major, the key of a sunrise. Chords as MIDI notes, low to high.
const D = [38, 50, 57, 62, 66, 69], G = [43, 50, 55, 59, 62, 67], Bm = [35, 47, 54, 59, 62, 66], A = [45, 52, 57, 61, 64, 69];

export class Score {
  constructor(audio) {
    this.audio = audio;
    this.buses = new Set();
  }

  get ok() { return !!(this.audio && this.audio.ok && this.audio.ctx); }
  get now() { return this.audio.ctx.currentTime; }

  /** A gain bus into the master. kind 'music' follows the radio trim. */
  bus(kind = 'music', level = 1) {
    if (!this.ok) return null;
    const a = this.audio, g = a.ctx.createGain();
    const trim = kind === 'music' ? (a.vol?.radio ?? 1) : (a.vol?.effects ?? 1);
    g.gain.value = level * trim;
    g.connect(a.master);
    this.buses.add(g);
    return g;
  }

  /** Fade a bus out and let it go. */
  release(g, t = 0.6) {
    if (!g || !this.ok) return;
    const n = this.now;
    try {
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(0, n + t);
    } catch { /* already gone */ }
    setTimeout(() => { try { g.disconnect(); } catch { /* fine */ } this.buses.delete(g); }, (t + 0.2) * 1000);
  }

  stopAll(t = 0.4) { for (const g of [...this.buses]) this.release(g, t); }

  // ------------------------------------------------------------ building blocks

  noise(dest, at, dur, { type = 'bandpass', f = 1800, q = 0.7, f2 = null, peak = 0.2, attack = 0.02, release = 0.2 } = {}) {
    const c = this.audio.ctx, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.audio.noiseBuf; src.loop = true;
    flt.type = type; flt.frequency.setValueAtTime(f, at); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, Math.max(at + attack, at + dur - release));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    src.connect(flt); flt.connect(g); g.connect(dest);
    src.start(at, Math.random() * 1.5); src.stop(at + dur + 0.05);
  }

  tone(dest, at, dur, freq, { type = 'sine', peak = 0.2, attack = 0.01, release = 0.3, to = null, detune = 0 } = {}) {
    const c = this.audio.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, Math.max(at + attack, at + dur - release));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(at + dur + 0.05);
  }

  /** A sustained synth chord: detuned saws through a lowpass that opens. */
  chord(dest, at, dur, notes, { peak = 0.05, attack = 1.4, release = 1.6, cutoff = 900, open = null, type = 'sawtooth' } = {}) {
    const c = this.audio.ctx, flt = c.createBiquadFilter(), g = c.createGain();
    flt.type = 'lowpass'; flt.Q.value = 0.6;
    flt.frequency.setValueAtTime(open ? open[0] : cutoff, at);
    if (open) flt.frequency.exponentialRampToValueAtTime(open[1], at + open[2]);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, Math.max(at + attack, at + dur - release));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    flt.connect(g); g.connect(dest);
    for (const n of notes) {
      for (const det of [-7, 6]) {
        const o = c.createOscillator();
        o.type = type; o.frequency.value = NOTE(n); o.detune.value = det;
        o.connect(flt); o.start(at); o.stop(at + dur + 0.05);
      }
    }
  }

  // ------------------------------------------------------------ the cues

  /** Black screen: FM static, a tuning whine, then nothing. */
  coldOpen(dest, at) {
    this.noise(dest, at, 5.6, { f: 2400, q: 0.5, peak: 0.07, attack: 1.2, release: 1.6 });
    this.tone(dest, at + 1.4, 2.6, 1180, { type: 'sine', peak: 0.012, attack: 0.4, release: 0.8, to: 760 });
    this.tone(dest, at + 3.6, 1.2, 640, { type: 'triangle', peak: 0.01, attack: 0.1, release: 0.6, to: 900 });
  }

  /** The title hit: a big brass chord, a sub drop and a crash, then a fanfare. */
  sting(dest, at) {
    // A reverse swell into the hit, so it lands like a downbeat.
    this.noise(dest, at - 0.9, 0.95, { type: 'highpass', f: 2500, q: 0.3, peak: 0.08, attack: 0.88, release: 0.05 });
    this.chord(dest, at, 6.5, D, { peak: 0.06, attack: 0.03, release: 3.2, open: [500, 5200, 0.25] });
    this.chord(dest, at, 6.5, [26], { peak: 0.06, attack: 0.02, release: 3.0, cutoff: 260, type: 'square' });
    this.tone(dest, at, 1.6, 95, { peak: 0.5, attack: 0.005, release: 1.2, to: 34 });
    this.noise(dest, at, 3.4, { type: 'highpass', f: 5200, q: 0.2, peak: 0.12, attack: 0.005, release: 3.0 });
    // da - da - da - DAAA, on a brassy saw over the held chord.
    const lead = [[0.9, 69, 0.28], [1.2, 74, 0.28], [1.5, 76, 0.28], [1.8, 78, 2.6]];
    for (const [dt, n, d] of lead) {
      this.chord(dest, at + dt, d, [n, n - 12], { peak: 0.035, attack: 0.04, release: Math.min(0.9, d * 0.6), open: [700, 3800, 0.12] });
    }
  }

  /** Under the crawl: four warm chords, slow, then the same again softer. */
  pad(dest, at, total = 32) {
    const prog = [D, Bm, G, A];
    const len = 4;
    for (let i = 0; i * len < total; i++) {
      const notes = prog[i % prog.length].slice(1);
      this.chord(dest, at + i * len, len + 1.5, notes, { peak: 0.028, attack: 1.6, release: 1.8, cutoff: 1100, type: 'sawtooth' });
      // A plucked arpeggio on top, so it moves: root, fifth, octave, third.
      const top = prog[i % prog.length];
      const arp = [top[3], top[4] + 12, top[5], top[4]];
      for (let k = 0; k < 4; k++) this.tone(dest, at + i * len + k * 1.0, 0.9, NOTE(arp[k]), { type: 'triangle', peak: 0.018, attack: 0.008, release: 0.7 });
    }
  }

  /** The flyover: the theme again, brighter, and a slow swell into Fraser. */
  dawn(dest, at, total = 60) {
    const prog = [D, G, Bm, A, D, G, A, A];
    const len = 4.5;
    for (let i = 0; i * len < total; i++) {
      const notes = prog[i % prog.length];
      this.chord(dest, at + i * len, len + 1.8, notes.slice(1), { peak: 0.024, attack: 1.4, release: 2.0, cutoff: 1500 });
      this.chord(dest, at + i * len, len + 1.2, [notes[0]], { peak: 0.03, attack: 0.6, release: 1.4, cutoff: 300, type: 'triangle' });
      const arp = [notes[3] + 12, notes[4] + 12, notes[5] + 12, notes[4] + 12, notes[3] + 12, notes[5]];
      for (let k = 0; k < arp.length; k++) this.tone(dest, at + i * len + k * 0.75, 0.6, NOTE(arp[k]), { type: 'sine', peak: 0.014, attack: 0.006, release: 0.5 });
    }
  }

  /** Water on the breakwater, and the first birds. */
  shore(dest, at, dur = 14) {
    this.noise(dest, at, dur, { type: 'lowpass', f: 520, q: 0.4, peak: 0.05, attack: 2.5, release: 3 });
    for (let i = 0; i < 6; i++) this.bird(dest, at + 2 + i * 1.9 + Math.random() * 0.8);
  }

  bird(dest, at) {
    const f = 2100 + Math.random() * 900;
    for (let k = 0; k < 3; k++) {
      this.tone(dest, at + k * 0.11, 0.09, f * (1 + k * 0.08), { peak: 0.012, attack: 0.01, release: 0.06, to: f * 1.3 });
    }
  }

  dawnChorus(dest, at, dur = 10) { for (let t = 0; t < dur; t += 1.1 + Math.random() * 1.2) this.bird(dest, at + t); }

  /** The freeze: a whoosh into a shutter click and a low thump. */
  freeze(dest, at) {
    this.noise(dest, at - 0.18, 0.22, { type: 'bandpass', f: 900, f2: 4200, q: 0.8, peak: 0.12, attack: 0.15, release: 0.04 });
    this.noise(dest, at, 0.05, { type: 'highpass', f: 3000, q: 0.5, peak: 0.25, attack: 0.002, release: 0.04 });
    this.noise(dest, at + 0.07, 0.04, { type: 'highpass', f: 2200, q: 0.5, peak: 0.16, attack: 0.002, release: 0.03 });
    this.tone(dest, at, 0.35, 120, { peak: 0.35, attack: 0.004, release: 0.3, to: 48 });
  }

  /** A North American landline: 440 + 480 Hz, two seconds on, with a bell's tremolo. */
  ring(dest, at, rings = 2) {
    const c = this.audio.ctx;
    for (let i = 0; i < rings; i++) {
      const t0 = at + i * 3.2;
      const g = c.createGain(), trem = c.createGain(), lfo = c.createOscillator();
      lfo.frequency.value = 20; trem.gain.value = 0.5;
      lfo.connect(trem.gain); trem.connect(g);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 0.02);
      g.gain.setValueAtTime(0.09, t0 + 1.9); g.gain.linearRampToValueAtTime(0.0001, t0 + 2.0);
      g.connect(dest);
      for (const f of [440, 480]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(trem); o.start(t0); o.stop(t0 + 2.05); }
      lfo.start(t0); lfo.stop(t0 + 2.05);
    }
  }

  /** The key: the starter grinds twice, the third time it catches. */
  crank(dest, at) {
    const c = this.audio.ctx;
    const grind = (t0, d) => {
      const o = c.createOscillator(), g = c.createGain(), am = c.createOscillator(), amg = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 86;
      am.frequency.value = 11; amg.gain.value = 0.5;
      am.connect(amg.gain);
      f.type = 'lowpass'; f.frequency.value = 900;
      o.connect(f); f.connect(amg); amg.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.05);
      g.gain.setValueAtTime(0.16, t0 + d - 0.08); g.gain.linearRampToValueAtTime(0.0001, t0 + d);
      o.start(t0); am.start(t0); o.stop(t0 + d + 0.05); am.stop(t0 + d + 0.05);
      this.noise(dest, t0, d, { type: 'bandpass', f: 1400, q: 1.2, peak: 0.04, attack: 0.03, release: 0.05 });
    };
    grind(at, 0.75);
    grind(at + 1.05, 0.8);
    grind(at + 2.15, 0.45);
    // ...and it catches: a cough and a rising idle. The game's own engine voice
    // takes over from here once the drive loop runs.
    this.tone(dest, at + 2.55, 0.9, 45, { type: 'sawtooth', peak: 0.12, attack: 0.02, release: 0.6, to: 28 });
    this.noise(dest, at + 2.55, 0.35, { type: 'lowpass', f: 300, q: 0.6, peak: 0.2, attack: 0.01, release: 0.25 });
  }
}
