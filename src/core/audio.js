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
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;
    this.nf = ctx.createBiquadFilter();
    this.nf.type = 'bandpass'; this.nf.frequency.value = 1400; this.nf.Q.value = 1.6;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.master);
    this.noise.start();
    this.ok = true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  engine(rpm01, load) {
    if (!this.ok) return;
    const g = this.enabled ? 1 : 0;
    const f = 45 + rpm01 * 210;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(f, t, 0.04);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.filt.frequency.setTargetAtTime(320 + rpm01 * 2200 + load * 900, t, 0.06);
    this.eg.gain.setTargetAtTime(g * (0.035 + load * 0.075 + rpm01 * 0.03), t, 0.06);
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
}
