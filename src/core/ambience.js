// Procedural, quiet outdoor beds. No sample downloads and no per-frame nodes.
export function ambienceLevels({ rain = 0, night = false, waterfront = 0, speed = 0, cabin = false, enabled = true } = {}) {
  const wet = Math.max(0, Math.min(1, rain));
  const shore = Math.max(0, Math.min(1, waterfront));
  const inside = cabin ? 0.24 : 1;
  const gate = enabled ? inside : 0;
  return {
    // AUD-02: the air bed plays on index.html too now, about 5 dB up (0.009 -> 0.016)
    // so a red light in Aylmer is not a silent test level.
    air: gate * (night ? 0.009 : 0.016) * (1 + Math.min(1, Math.abs(speed) / 90) * 0.6),
    water: gate * shore * 0.032,
    birds: enabled && !cabin && !night && wet < 0.2,
  };
}
export class Ambience {
  constructor(ctx, destination, noise) {
    this.ctx = ctx; this.destination = destination; this.nodes = []; this.birdAt = ctx.currentTime + 9;
    this.source = ctx.createBufferSource(); this.source.buffer = noise; this.source.loop = true;
    for (const [name, type, frequency, q] of [['air','lowpass',430,0.3],['water','bandpass',620,0.4]]) {
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      filter.type = type; filter.frequency.value = frequency; filter.Q.value = q; gain.gain.value = 0;
      this.source.connect(filter); filter.connect(gain); gain.connect(destination);
      this[name] = gain; this.nodes.push(filter,gain);
    }
    this.source.start(); this.birds = new Set();
  }
  /** B-13a: false while the audio clock is stopped; nothing is scheduled then. */
  get running() { const st = this.ctx.state; return !st || st === 'running'; }
  update(scene) {
    // A frozen clock never passes an event, so every write would only queue.
    if (!this.running) return false;
    const levels = ambienceLevels(scene), t = this.ctx.currentTime;
    for (const key of ['air','water']) {
      const wave = key === 'water' ? 0.8 + Math.sin(t * 0.65) * 0.2 : 1;
      this[key].gain.setTargetAtTime(levels[key] * wave, t, 0.8);
    }
    if (t >= this.birdAt) {
      this.birdAt = t + 15 + Math.random() * 20;
      if (levels.birds) this.bird(t);
    }
    if (!levels.birds) for (const b of this.birds) b.gain.gain.setTargetAtTime(0,t,0.05);
    return true;
  }
  bird(t) {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    const f = 1800 + Math.random() * 900;
    osc.type='sine'; osc.frequency.setValueAtTime(f,t); osc.frequency.exponentialRampToValueAtTime(f*1.32,t+0.06); osc.frequency.exponentialRampToValueAtTime(f*0.92,t+0.2);
    gain.gain.setValueAtTime(0.0001,t); gain.gain.exponentialRampToValueAtTime(0.012,t+0.025); gain.gain.exponentialRampToValueAtTime(0.0001,t+0.23);
    osc.connect(gain); gain.connect(this.destination); const bird={osc,gain}; this.birds.add(bird);
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.birds.delete(bird);};osc.start(t);osc.stop(t+0.25);
  }
  dispose() { this.source.stop(); this.source.disconnect(); for(const n of this.nodes)n.disconnect();for(const b of this.birds)b.osc.stop(); }
}
