// Summer weather over the Outaouais valley.
//
// July in Aylmer is four things: blue and hot, hazy and hotter, flat grey, and
// then at four in the afternoon the sky goes green-grey over the Ottawa river
// and drops everything it has for twenty minutes. This file is all four, and it
// is deliberately cheap, because the world already bakes 3.6 M triangles and
// holds a quarter of a gigabyte of vertex buffers. Nothing here uploads a mesh,
// nothing here allocates per frame, and the whole rain effect is one
// screen-space 2D canvas sitting between the WebGL canvas and the HUD.
//
// What it owns:
//
//   * a state machine — clear / nuageux / brume de chaleur / couvert / pluie /
//     orage — with dwell times and a transition blend, so the sky is never the
//     same for long and never snaps
//   * `tintEnv(env)`: the ONLY thing it does to the 3D. It leans the sky, the
//     fog colour and the fog density of the environment main.js was going to
//     use anyway. A storm sky is dark enough that world.js's own nightAmount()
//     turns the headlights on, which is exactly right
//   * wetness, which is not rain: the road stays slick for twenty seconds after
//     the last drop. `gripMul` / `brakeMul` fall out of it
//   * `specFor(spec)`: cars.js reads grip and brake straight off the car's spec
//     sheet and that file is not ours to edit, so the wet road is applied by
//     handing the Vehicle a CLONE of its spec with the numbers scaled. Cached
//     per car and per 5 % of wetness, so it is one object every few seconds
//   * puddles, which are a hash of the coordinate rather than geometry: stand
//     water collects in the same places every time, and hitting one at speed
//     throws a sheet and costs you a moment of grip
//   * the overlay: rain streaks, beads on the glass, wipers when you are behind
//     the windscreen (hood camera), spray off the tyres, and lightning
//   * the sound: rain hiss, tyre spray, thunder, splashes — all WebAudio, built
//     once, on the effects bus so the volume slider owns it
//
// Everything is safe with no document and no AudioContext, which is how
// tools/smoke_weather.mjs drives the whole thing under plain node.
import { clamp, lerp, mulberry32 } from '../core/math.js';

// ---------------------------------------------------------------- the states

// `cloud` thickens the fog, `dark` drains the sky toward storm grey-green,
// `rain` is how hard it is coming down, `haze` is the hot-day milk in the air.
// `wind` is the slant on the rain. The four numbers are what everything else
// blends; nothing outside this table decides what a storm looks like.
export const STATES = {
  clear:    { label: 'Beau temps',        cloud: 0.00, dark: 0.00, rain: 0, haze: 0.05, wind: 0.10, dwell: [90, 200] },
  cloudy:   { label: 'Nuageux',           cloud: 0.35, dark: 0.16, rain: 0, haze: 0.10, wind: 0.20, dwell: [60, 140] },
  haze:     { label: 'Brume de chaleur',  cloud: 0.20, dark: 0.05, rain: 0, haze: 0.85, wind: 0.05, dwell: [70, 150] },
  overcast: { label: 'Couvert',           cloud: 0.70, dark: 0.42, rain: 0, haze: 0.25, wind: 0.30, dwell: [60, 120] },
  rain:     { label: 'Pluie',             cloud: 0.85, dark: 0.55, rain: 0.55, haze: 0.20, wind: 0.45, dwell: [50, 110] },
  storm:    { label: 'Orage',             cloud: 1.00, dark: 1.00, rain: 1.00, haze: 0.10, wind: 0.85, dwell: [35, 80] },
};
export const STATE_KEYS = Object.keys(STATES);

// Where the sky goes in a storm: the green-grey the valley turns just before it
// lets go. Blended in by `dark`.
// Green in it, not blue: that is the colour that makes people bring the chairs
// in. The blend weight has to be this high or the daylight blue survives it.
const STORM_SKY = [0.17, 0.215, 0.175];
const STORM_FOG = [0.33, 0.37, 0.34];
const STORM_SUN = [0.55, 0.60, 0.58];
// ...and where it goes on a hazy afternoon: white milk, sun still in it.
const HAZE_FOG = [0.86, 0.86, 0.82];

// What can follow what, and how likely. Storms build out of an overcast
// afternoon and blow themselves out into one; nothing goes from blue to
// lightning in one step, because that is not how a valley works.
const NEXT = {
  clear:    [['cloudy', 5], ['haze', 3], ['clear', 2]],
  cloudy:   [['clear', 4], ['overcast', 3], ['haze', 1], ['rain', 2]],
  haze:     [['cloudy', 5], ['clear', 3], ['overcast', 2]],
  overcast: [['rain', 4], ['cloudy', 4], ['storm', 3]],
  rain:     [['overcast', 5], ['storm', 2], ['cloudy', 3]],
  storm:    [['rain', 6], ['overcast', 4]],
};

// Seconds to slide from one state to the next. A storm arrives faster than it
// leaves, which is the whole character of the thing.
const TRANS_IN = 9, TRANS_STORM = 5;

// Wetness: how fast the road takes water on, and how slowly it gives it back.
const WET_UP = 0.30, WET_DOWN = 0.045;
// What a soaked road costs. 24 % of the lateral grip is enough that the back
// end steps out on a corner you took dry ten minutes ago, and not so much that
// the car is undriveable.
export const WET_GRIP = 0.24, WET_BRAKE = 0.20;
// A puddle taken at speed: a moment of aquaplaning on top of the wet-road loss.
export const PUDDLE_GRIP = 0.30, PUDDLE_HOLD = 0.55;

// ---------------------------------------------------------------- puddles

// Standing water is a hash of the coordinate, not a mesh: the same dips fill up
// every storm, they cost nothing to "place", and there are as many of them as
// the town has square metres. 14 m grid, roughly one cell in seven holds water.
const PUD = 14;
export function puddleAt(x, z, wet = 1) {
  if (wet < 0.30) return 0;
  const cx = Math.floor(x / PUD), cz = Math.floor(z / PUD);
  let h = (cx * 374761393 + cz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  const r = h / 4294967296;
  if (r > 0.14) return 0;
  // Deeper the wetter, and the deepest ones only fill in a real storm.
  return clamp((0.14 - r) / 0.14 * wet * 1.6, 0, 1);
}

// ---------------------------------------------------------------- the weather

export class Weather {
  /**
   * @param {object} opts { seed, audio, state } — `audio` is core/audio.js's
   * Audio (may be unstarted, may be absent), `state` forces a first sky.
   */
  constructor(opts = {}) {
    this.rnd = mulberry32(opts.seed == null ? 0x0a17 : opts.seed);
    this.audio = opts.audio || null;
    this.enabled = true;
    // A new game opens on a clear July morning. It does not stay one.
    this.state = STATES[opts.state] ? opts.state : 'clear';
    this.next = this.state;
    this.blend = 1;             // 0 = fully in `state`, 1 = arrived at `next`
    this.transT = TRANS_IN;
    this.hold = this._dwell(this.state);
    // The four blended numbers. Everything reads these, never the table.
    this.cloud = STATES[this.state].cloud;
    this.dark = STATES[this.state].dark;
    this.rain = STATES[this.state].rain;
    this.haze = STATES[this.state].haze;
    this.wind = STATES[this.state].wind;
    this.wet = 0;               // road wetness, lags the rain both ways
    this.t = 0;
    // Lightning: `flash` is the screen-white right now, `strikeIn` is the clock.
    this.flash = 0;
    this.strikeIn = 6 + this.rnd() * 10;
    this.thunders = [];         // pending rumbles, {in, power}
    this.puddleT = 0;           // seconds left of the last puddle's grip loss
    this.lastPuddle = '';       // which cell, so one puddle fires once
    this.splash = 0;            // overlay burst
    // Wet spec cache: one clone per car spec per 5 % of wetness.
    this._spec = new Map();
    this.view = null;           // the overlay, built on first update with a DOM
    this.snd = null;            // the audio chain, built on first update
  }

  _dwell(key) {
    const [a, b] = STATES[key].dwell;
    return a + this.rnd() * (b - a);
  }

  /** The name a player would use for what is out the window. */
  get label() { return STATES[this.blend > 0.5 ? this.next : this.state].label; }
  /** The state key the sky is closest to. Tests and the HUD read this. */
  get key() { return this.blend > 0.5 ? this.next : this.state; }
  /** True while there is water falling out of the sky. */
  get raining() { return this.rain > 0.05; }

  /** Force a sky. `instant` skips the blend — the debug hook and the tests. */
  set(key, instant = true) {
    if (!STATES[key]) return this.key;
    this.state = this.next = key;
    this.blend = 1;
    this.hold = this._dwell(key);
    const s = STATES[key];
    if (instant) {
      this.cloud = s.cloud; this.dark = s.dark; this.rain = s.rain;
      this.haze = s.haze; this.wind = s.wind;
      this.wet = s.rain > 0 ? clamp(s.rain, 0, 1) : 0;
    }
    return this.key;
  }

  /**
   * Move it along by hand — the K key, so you can go and look at a storm
   * without waiting for one. It walks the table in order and it BLENDS, so
   * pressing it four times is a front rolling in, not four jump cuts.
   */
  advance() {
    const keys = STATE_KEYS;
    return this._begin(keys[(keys.indexOf(this.key) + 1) % keys.length]);
  }

  _begin(key) {
    this.state = this.key;
    this.next = key;
    this.blend = 0;
    this.transT = key === 'storm' || this.state === 'storm' ? TRANS_STORM : TRANS_IN;
    this.hold = this._dwell(key);
    return key;
  }

  _pick() {
    const table = NEXT[this.key] || NEXT.clear;
    let total = 0;
    for (const [, w] of table) total += w;
    let r = this.rnd() * total;
    for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
    return table[table.length - 1][0];
  }

  // ---- per-frame --------------------------------------------------------

  /**
   * One tick. `G` is the game object; everything read off it is optional, so
   * this runs under node with `update(dt)` and nothing else.
   */
  update(dt, G = null) {
    const d = Number.isFinite(dt) ? Math.min(dt, 0.25) : 0;
    this.t += d;
    this._march(d);
    this._water(d, G);
    this._lightning(d);
    this._sound(d, G);
    this._draw(d, G);
    return this;
  }

  // The state machine and the four blended numbers.
  _march(dt) {
    if (this.blend >= 1) {
      this.hold -= dt;
      if (this.hold <= 0) this._begin(this._pick());
    } else {
      this.blend = Math.min(1, this.blend + dt / this.transT);
    }
    const a = STATES[this.state], b = STATES[this.next];
    // smoothstep, so a front arrives and leaves without a corner in it
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    this.cloud = lerp(a.cloud, b.cloud, k);
    this.dark = lerp(a.dark, b.dark, k);
    this.rain = lerp(a.rain, b.rain, k);
    this.haze = lerp(a.haze, b.haze, k);
    this.wind = lerp(a.wind, b.wind, k);
  }

  // Wetness, puddles and what they cost you.
  _water(dt, G) {
    const want = this.rain;
    if (want > this.wet) this.wet = Math.min(want, this.wet + WET_UP * dt);
    else this.wet = Math.max(want, this.wet - WET_DOWN * dt);
    if (this.puddleT > 0) this.puddleT = Math.max(0, this.puddleT - dt);
    this.splash = Math.max(0, this.splash - dt * 3);

    const v = G && G.veh;
    if (!v || this.wet < 0.30) return;
    // Only on the road: the ditch is already grass and already slow.
    const onRoad = G.phys && G.phys.roadAt ? G.phys.roadAt(v.x, v.z) : true;
    if (!onRoad || Math.abs(v.vLong) < 6) return;
    const cell = Math.floor(v.x / PUD) + ',' + Math.floor(v.z / PUD);
    if (cell === this.lastPuddle) return;
    this.lastPuddle = cell;
    const deep = puddleAt(v.x, v.z, this.wet);
    if (deep <= 0) return;
    this.puddleT = PUDDLE_HOLD * deep;
    this.splash = Math.min(1, deep * clamp(Math.abs(v.vLong) / 22, 0.3, 1.3));
    this._playSplash(this.splash);
  }

  // Strikes come in bunches, the way they actually do, and the thunder arrives
  // late by however far away the flash was.
  _lightning(dt) {
    this.flash = Math.max(0, this.flash - dt * 6);
    for (let i = this.thunders.length - 1; i >= 0; i--) {
      const th = this.thunders[i];
      th.in -= dt;
      if (th.in <= 0) { this.thunders.splice(i, 1); this._playThunder(th.power); }
    }
    const storm = clamp((this.dark - 0.55) / 0.45, 0, 1) * clamp(this.rain / 0.6, 0, 1);
    if (storm <= 0.02) { this.strikeIn = 4 + this.rnd() * 10; return; }
    this.strikeIn -= dt * (0.35 + storm);
    if (this.strikeIn > 0) return;
    this.strikeIn = (3.5 + this.rnd() * 13) / (0.4 + storm);
    // How far off it is decides both how bright and how late the noise is.
    const far = this.rnd();
    this.flash = 1 - far * 0.55;
    this.thunders.push({ in: 0.3 + far * far * 7, power: 1 - far * 0.6 });
    // A second and third stroke on the same bolt, most of the time.
    if (this.rnd() < 0.6) this.thunders.push({ in: 0.42 + far * far * 7, power: (1 - far * 0.6) * 0.5 });
  }

  // ---- what the rest of the game asks it --------------------------------

  /** Lateral-grip multiplier: wet road, plus a puddle if you just hit one. */
  get gripMul() {
    const wet = 1 - WET_GRIP * this.wet;
    const pud = this.puddleT > 0 ? 1 - PUDDLE_GRIP * (this.puddleT / PUDDLE_HOLD) : 1;
    return wet * pud;
  }
  /** Braking multiplier. Stopping distance is where wet roads bite hardest. */
  get brakeMul() { return 1 - WET_BRAKE * this.wet; }

  /**
   * The spec cars.js should drive this frame. Dry, that is the spec it was
   * handed; wet, a cached clone with grip and brake scaled — cars.js reads
   * `spec.grip` directly and that file is read-only to this one.
   */
  specFor(spec) {
    if (!spec) return spec;
    const g = this.gripMul, b = this.brakeMul;
    if (g > 0.995 && b > 0.995) return spec;
    // 5 % buckets: one allocation every few seconds instead of sixty a second.
    const bucket = Math.round(g * 20) * 32 + Math.round(b * 20);
    let hit = this._spec.get(spec.id);
    if (hit && hit.bucket === bucket && hit.base === spec) return hit.spec;
    const wetSpec = { ...spec, grip: spec.grip * g, brake: spec.brake * b };
    hit = { bucket, base: spec, spec: wetSpec };
    this._spec.set(spec.id, hit);
    return wetSpec;
  }

  /**
   * Lean an environment toward the weather. Called with the env main.js was
   * about to use, BEFORE it decides whether it is dark enough for headlights —
   * a real storm should turn them on, and this is what makes that happen.
   */
  tintEnv(env) {
    if (!env) return env;
    const dark = this.dark, haze = this.haze;
    for (let i = 0; i < 3; i++) {
      env.sky[i] = lerp(env.sky[i], STORM_SKY[i], dark * 0.94);
      env.fog[i] = lerp(lerp(env.fog[i], HAZE_FOG[i], haze * 0.45), STORM_FOG[i], dark * 0.80);
      env.sun[i] = lerp(env.sun[i], STORM_SUN[i], dark * 0.75);
      env.ground[i] = lerp(env.ground[i], env.ground[i] * 0.62, this.wet);   // wet asphalt is dark
    }
    // Haze is thick air you can see through; rain is thick air you cannot.
    env.fogDensity *= 1 + haze * 2.6 + this.cloud * 0.55 + this.rain * 2.2;
    return env;
  }

  // ---- the overlay ------------------------------------------------------

  // One 2D canvas between #gl and #hud. Built on the first frame that has a
  // document; if there is none (node), everything below is a no-op.
  _mount() {
    if (this.view !== null) return this.view;
    this.view = false;
    if (typeof document === 'undefined' || !document.body) return false;
    const c = document.createElement('canvas');
    c.id = 'weather';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
    // Before #hud in the DOM, so the speedo and the toasts stay on top of the
    // rain. Both are z-index:auto, so document order is the whole rule.
    const hud = document.getElementById('hud');
    if (hud && hud.parentNode) hud.parentNode.insertBefore(c, hud);
    else document.body.appendChild(c);
    const g = c.getContext && c.getContext('2d');
    if (!g) return false;
    this.view = {
      c, g, w: 0, h: 0,
      drops: [], beads: [],
      wiper: 0, wiperDir: 1, wiperOn: false,
    };
    // The rain is a fixed pool of streaks, recycled forever: 260 objects, made
    // once. Nothing in the draw path allocates.
    for (let i = 0; i < 260; i++) {
      this.view.drops.push({ x: this.rnd(), y: this.rnd(), v: 0.9 + this.rnd() * 0.7, len: 0.5 + this.rnd() * 0.8, a: 0.25 + this.rnd() * 0.5 });
    }
    for (let i = 0; i < 46; i++) {
      this.view.beads.push({ x: this.rnd(), y: this.rnd(), r: 1.2 + this.rnd() * 3.4, life: 0 });
    }
    return this.view;
  }

  _draw(dt, G) {
    const v = this._mount();
    if (!v) return;
    const on = this.enabled && (this.rain > 0.02 || this.flash > 0.01 || this.wet > 0.02);
    const drive = !G || G.mode === 'drive';
    if (!on || !drive) { if (v.w) { v.g.clearRect(0, 0, v.w, v.h); v.w = 0; } return; }
    // The overlay runs at CSS pixels, never at devicePixelRatio: it is rain, it
    // does not need to be sharp, and half the pixels is half the fill.
    const w = Math.max(1, Math.round((globalThis.innerWidth || 1280) * 0.5));
    const h = Math.max(1, Math.round((globalThis.innerHeight || 800) * 0.5));
    if (v.w !== w || v.h !== h) { v.c.width = w; v.c.height = h; v.w = w; v.h = h; }
    const g = v.g;
    g.clearRect(0, 0, w, h);

    const rain = this.rain;
    const kmh = G && G.veh ? Math.abs(G.veh.speedKmh || 0) : 0;
    const speed = clamp(kmh / 90, 0, 1);
    // Slant: the wind gives it a lean, your own speed pulls it back past you.
    const slant = -this.wind * 0.55 - speed * 0.35;

    if (rain > 0.02) {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(198,214,224,0.75)';
      const n = Math.round(30 + rain * 230);
      const fall = (0.75 + speed * 1.5) * dt;
      for (let i = 0; i < n; i++) {
        const d = v.drops[i];
        d.y += d.v * fall;
        d.x += slant * d.v * fall * 0.55;
        if (d.y > 1) { d.y -= 1.05; d.x = this.rnd(); }
        if (d.x < -0.1) d.x += 1.2; else if (d.x > 1.1) d.x -= 1.2;
        const len = (0.035 + d.len * 0.05) * (0.6 + rain * 0.6) * (1 + speed * 1.1) * h;
        const x = d.x * w, y = d.y * h;
        g.globalAlpha = d.a * (0.35 + rain * 0.65);
        g.lineWidth = 0.8 + d.len * 0.9;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + slant * len, y + len);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // Beads on the glass. They grow while it rains and are taken off by the
    // wipers when you are actually behind a windscreen (the hood camera);
    // otherwise they just run off on their own.
    const hood = !!(G && G.cam === 3);
    v.wiperOn = hood && rain > 0.08;
    if (v.wiperOn) {
      const rate = 0.55 + rain * 1.15;      // intermittent -> fast, like the stalk
      v.wiper += v.wiperDir * rate * dt;
      if (v.wiper > 1) { v.wiper = 1; v.wiperDir = -1; }
      else if (v.wiper < 0) { v.wiper = 0; v.wiperDir = 1; }
    }
    if (rain > 0.05 || v.beads.some((b) => b.life > 0)) {
      g.fillStyle = 'rgba(214,228,238,0.5)';
      for (const b of v.beads) {
        if (b.life <= 0 && rain > 0.05 && this.rnd() < rain * dt * 2.2) {
          b.life = 1; b.x = this.rnd(); b.y = this.rnd() * 0.9;
        }
        if (b.life <= 0) continue;
        b.life -= dt * (0.10 + speed * 0.5);
        b.y += dt * (0.02 + speed * 0.06);            // it runs down the glass
        // The blade takes everything it passes over.
        if (v.wiperOn && Math.abs(b.x - v.wiper) < 0.05) b.life = 0;
        if (b.y > 1) b.life = 0;
        if (b.life <= 0) continue;
        g.globalAlpha = clamp(b.life, 0, 1) * 0.7;
        g.beginPath();
        g.arc(b.x * w, b.y * h, b.r * (0.5 + b.life * 0.6), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    if (v.wiperOn) this._wipers(g, w, h, v.wiper);

    // Spray: the sheet the tyres throw up, and the burst off a puddle. Both are
    // a soft band across the bottom of the screen, which is where they belong
    // whatever the camera is doing.
    const spray = clamp(this.wet * speed * 1.25, 0, 1) * 0.5 + this.splash * 0.85;
    if (spray > 0.01) {
      const grad = g.createLinearGradient(0, h, 0, h * (0.58 - this.splash * 0.15));
      grad.addColorStop(0, `rgba(226,236,242,${0.30 * spray})`);
      grad.addColorStop(1, 'rgba(226,236,242,0)');
      g.fillStyle = grad;
      g.fillRect(0, h * 0.55, w, h * 0.45);
    }

    // The strike. Two frames of nearly-white, then it is gone.
    if (this.flash > 0.01) {
      g.fillStyle = `rgba(226,236,255,${Math.min(0.72, this.flash * 0.72)})`;
      g.fillRect(0, 0, w, h);
    }
  }

  // Two blades sweeping the bottom two-thirds of the glass. Drawn as a wedge of
  // clean glass plus the arm, which is all a wiper reads as at this size.
  _wipers(g, w, h, phase) {
    const sweep = Math.sin(phase * Math.PI - Math.PI / 2) * 0.5 + 0.5;
    g.save();
    g.lineCap = 'round';
    for (const side of [0, 1]) {
      const px = side ? w * 0.72 : w * 0.28;
      const py = h * 1.06;
      const a = (-0.62 + sweep * 1.05) * (side ? 1 : 1) + (side ? 0.10 : -0.10);
      const len = h * 0.92;
      const tipX = px + Math.sin(a) * len, tipY = py - Math.cos(a) * len;
      g.globalAlpha = 0.30;
      g.strokeStyle = '#0d1114';
      g.lineWidth = Math.max(2, h * 0.012);
      g.beginPath(); g.moveTo(px, py); g.lineTo(tipX, tipY); g.stroke();
      g.globalAlpha = 0.55;
      g.lineWidth = Math.max(3, h * 0.020);
      g.beginPath();
      g.moveTo(px + Math.sin(a) * len * 0.28, py - Math.cos(a) * len * 0.28);
      g.lineTo(tipX, tipY);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // ---- the sound --------------------------------------------------------

  // Rain is broadband hiss with a low bed under it; spray off the tyres is the
  // same hiss an octave up, gated on speed. Two sources, four gains, built once
  // and never touched again except through their gain params.
  _buildSound() {
    if (this.snd !== null) return this.snd;
    this.snd = false;
    const a = this.audio;
    if (!a || !a.ok || !a.ctx) { this.snd = null; return null; }   // try again later
    const ctx = a.ctx, dest = a.fx || a.master;
    if (!dest) { this.snd = null; return null; }
    const buf = a.noiseBuf || makeNoise(ctx, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;

    const rainF = ctx.createBiquadFilter();
    rainF.type = 'bandpass'; rainF.frequency.value = 2200; rainF.Q.value = 0.55;
    const rainG = ctx.createGain(); rainG.gain.value = 0;
    src.connect(rainF); rainF.connect(rainG); rainG.connect(dest);

    // The drumming on the roof: the same noise, low-passed hard.
    const roofF = ctx.createBiquadFilter();
    roofF.type = 'lowpass'; roofF.frequency.value = 320; roofF.Q.value = 0.9;
    const roofG = ctx.createGain(); roofG.gain.value = 0;
    src.connect(roofF); roofF.connect(roofG); roofG.connect(dest);

    const sprayF = ctx.createBiquadFilter();
    sprayF.type = 'highpass'; sprayF.frequency.value = 3800;
    const sprayG = ctx.createGain(); sprayG.gain.value = 0;
    src.connect(sprayF); sprayF.connect(sprayG); sprayG.connect(dest);

    src.start();
    this.snd = { ctx, dest, buf, src, rainG, rainF, roofG, sprayG, sprayF };
    return this.snd;
  }

  _sound(dt, G) {
    const s = this._buildSound();
    if (!s) return;
    const a = this.audio;
    const gate = a.enabled && this.enabled && (!G || G.mode === 'drive') ? 1 : 0;
    const t = s.ctx.currentTime;
    const kmh = G && G.veh ? Math.abs(G.veh.speedKmh || 0) : 0;
    s.rainG.gain.setTargetAtTime(gate * this.rain * 0.085, t, 0.35);
    s.roofG.gain.setTargetAtTime(gate * this.rain * 0.055, t, 0.35);
    s.sprayG.gain.setTargetAtTime(gate * this.wet * clamp(kmh / 80, 0, 1) * 0.05, t, 0.20);
    s.rainF.frequency.setTargetAtTime(1700 + this.rain * 1400, t, 0.5);
  }

  // A long low roll. Noise through a sliding lowpass plus a sub sweep — the two
  // halves of thunder, the crack and the rumble that follows it downriver.
  _playThunder(power = 1) {
    const s = this._buildSound();
    const a = this.audio;
    if (!s || !a || !a.enabled) return;
    const ctx = s.ctx, t = ctx.currentTime;
    const dur = 1.6 + power * 2.6;
    const src = ctx.createBufferSource();
    src.buffer = s.buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900 * power + 140, t);
    f.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.30 * power, t + 0.05 + (1 - power) * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(s.dest);
    src.start(t); src.stop(t + dur + 0.1);
    // The sub under it, so it is felt as well as heard.
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(58 + power * 22, t);
    o.frequency.exponentialRampToValueAtTime(28, t + dur * 0.8);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.16 * power, t + 0.08);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
    o.connect(og); og.connect(s.dest);
    o.start(t); o.stop(t + dur);
  }

  // One puddle, one sheet of water off the wheel arch.
  _playSplash(power = 1) {
    const s = this._buildSound();
    const a = this.audio;
    if (!s || !a || !a.enabled) return;
    const ctx = s.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.30);
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * power, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(f); f.connect(g); g.connect(s.dest);
    src.start(t); src.stop(t + 0.5);
  }

  /** Leaving drive mode: silence the sky without forgetting it. */
  suspend() {
    if (!this.snd) return;
    const t = this.snd.ctx.currentTime;
    for (const g of [this.snd.rainG, this.snd.roofG, this.snd.sprayG]) {
      g.gain.setTargetAtTime(0, t, 0.12);
    }
  }
}

// A local noise buffer, for the case where the Audio object has not built its
// own yet. Same shape as core/audio.js's makeNoise; two seconds is plenty.
function makeNoise(ctx, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export default Weather;
