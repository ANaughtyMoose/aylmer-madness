// Procedural audio — no files to load. Engine note tracks RPM, tyres squeal on slip.
export class Audio {
  constructor() {
    this.ok = false;
    this.enabled = true;
  }
  start() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass whose cutoff follows revs.
    this.eg = ctx.createGain(); this.eg.gain.value = 0;
    this.filt = ctx.createBiquadFilter();
    this.filt.type = 'lowpass'; this.filt.frequency.value = 700;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.o2g = ctx.createGain(); this.o2g.gain.value = 0.35;
    this.osc1.connect(this.filt);
    this.osc2.connect(this.o2g); this.o2g.connect(this.filt);
    this.filt.connect(this.eg); this.eg.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // Tyre noise: white noise loop through a bandpass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;          // kept so land()/whoosh() can tap it too
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;
    this.nf = ctx.createBiquadFilter();
    this.nf.type = 'bandpass'; this.nf.frequency.value = 1400; this.nf.Q.value = 1.6;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.master);

    // C5: a second tap off the same noise, narrow and low — the Sunfire's blown
    // door speaker. Silent on every other car.
    this.rf = ctx.createBiquadFilter();
    this.rf.type = 'bandpass'; this.rf.frequency.value = 190; this.rf.Q.value = 9;
    this.rg = ctx.createGain(); this.rg.gain.value = 0;
    this.noise.connect(this.rf); this.rf.connect(this.rg); this.rg.connect(this.master);

    this.noise.start();
    this.ok = true;
    if (this.ep) this.setEngineProfile(this.ep);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // C5 — swap the engine's character when you swap cars. See cars.js SOUND for
  // the shape of `p`; passing nothing goes back to the generic four-cylinder.
  setEngineProfile(p) {
    this.ep = p || null;
    if (!this.ok) return;
    const e = this.ep || DEFAULT_ENGINE;
    this.osc1.type = e.type1 || 'sawtooth';
    this.osc2.type = e.type2 || 'square';
    this.o2g.gain.setTargetAtTime(e.o2g, this.ctx.currentTime, 0.05);
  }

  // `kmh` is only used by the rattle; leave it out and there simply isn't one.
  engine(rpm01, load, kmh = 0) {
    if (!this.ok) return;
    const e = this.ep || DEFAULT_ENGINE;
    const g = this.enabled ? 1 : 0;
    const f = e.f0 + rpm01 * e.span;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(f, t, 0.04);
    this.osc2.frequency.setTargetAtTime(f * e.sub, t, 0.04);
    this.filt.frequency.setTargetAtTime(e.cut0 + rpm01 * e.cutSpan + load * 900, t, 0.06);
    this.eg.gain.setTargetAtTime(g * e.gain * (0.035 + load * 0.075 + rpm01 * 0.03), t, 0.06);
    if (this.rg) {
      const on = e.rattle > 0 && kmh > e.rattleFrom
        ? Math.min(1, (kmh - e.rattleFrom) / 25) * e.rattle : 0;
      this.rg.gain.setTargetAtTime(g * on * 0.055, t, 0.09);
      if (on) this.rf.frequency.setTargetAtTime(150 + rpm01 * 190, t, 0.12);
    }
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
    o.connect(g); g.connect(this.master);
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
      o.connect(g); o2.connect(g); g.connect(this.master);
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
    o.connect(f); f.connect(g); g.connect(this.master);
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
    o.connect(g); o2.connect(g); g.connect(this.master);
    o.start(); o2.start();
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
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
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o.stop(t + 0.14);
  }
}

// What the engine sounds like when nobody has said otherwise: the note the
// game shipped with.
const DEFAULT_ENGINE = {
  f0: 45, span: 210, sub: 0.5, o2g: 0.35, cut0: 320, cutSpan: 2200, gain: 1,
  type1: 'sawtooth', type2: 'square', rattle: 0, rattleFrom: 0,
};
